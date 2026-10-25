// Three.js renderer: a side-on 3D cliff (boulders, sky, water, foliage) with climbers posed from Net snapshots.
// Physics stays 2D on the server: x/y map straight to world x/y, the climbing plane is z = 0 and the
// wall sits just behind it. Mode comes from the page: body.phone -> follows you, body.screen -> frames everyone.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createAlpineCharacter } from './alpine-character.js';
import { createAlpineSection } from './alpine-section.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const mode = document.body.classList.contains('screen') ? 'screen' : 'phone';
const HI = mode === 'screen';
const X0 = 6;                      // physics x is 0..12, world x is centered on 0
const wx = (x) => x - X0;

// ---------------------------------------------------------------- tiny seeded noise
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s >>>= 0) / 4294967296)); }
function hash(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

// ---------------------------------------------------------------- renderer + scene
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, HI ? 2 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(HI ? 38 : 50, innerWidth / innerHeight, 0.1, 3000);
camera.position.set(0, 4, 18);

// physically based sky; also baked into an environment map so rock and water pick up its light
const sky = new Sky();
sky.scale.setScalar(2500);
// sun in front of the cliff, up and to the right, so climbers throw shadows across the rock
const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-48));
sky.material.uniforms.turbidity.value = 4;
sky.material.uniforms.rayleigh.value = 1.4;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.8;
sky.material.uniforms.sunPosition.value.copy(sun);
scene.add(sky);
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(100);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = sky.material.uniforms[k].value;
  s2.material.uniforms.sunPosition.value.copy(sun); envScene.add(s2);
  scene.environment = pm.fromScene(envScene).texture;
  scene.environmentIntensity = 0.3;
}
scene.fog = new THREE.Fog(0xa9c4dc, 45, 190);

const hemi = new THREE.HemisphereLight(0xb6dbff, 0x6b6280, 1.1);
scene.add(hemi);
const rimLight = new THREE.DirectionalLight(0xaddfff, 1.7);
rimLight.position.set(12, 18, -8); scene.add(rimLight);
const sunLight = new THREE.DirectionalLight(0xffdfb2, 2.7);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(HI ? 2048 : 1024, HI ? 2048 : 1024);
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);

// ---------------------------------------------------------------- materials
// The snowbound palette uses simple shared materials, keeping the phone pass light.
const rockMat = new THREE.MeshStandardMaterial({ color: 0x777f90, vertexColors: true, roughness: 0.95 });
const mossMat = new THREE.MeshStandardMaterial({ color: 0xb4c7d4, vertexColors: true, roughness: 0.95 });
const snowMat = new THREE.MeshStandardMaterial({ color: 0xf3f7fb, roughness: 0.92 });
const holdMats = [0x20a99e, 0xf06d5e, 0x418ec7].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
const woodMat = new THREE.MeshStandardMaterial({ color: 0x697f91, roughness: 0.8 });
const pineMat = new THREE.MeshStandardMaterial({ color: 0x557d80, roughness: 1 });
const distantMat = new THREE.MeshStandardMaterial({ color: 0xa4bccf, roughness: 1, flatShading: true });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xffedda, roughness: 0.8 });

// ---------------------------------------------------------------- geometry builders
// a lumpy, slightly faceted boulder in world space
function boulder(r, x, y, z, sx, sy, sz, seed, tint = 1) {
  let g = new THREE.IcosahedronGeometry(1, HI ? 3 : 2);
  let p = g.attributes.position; const v = new THREE.Vector3();
  const o = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + 0.28 * noise3(v.x * 1.2 + o, v.y * 1.2, v.z * 1.2) + 0.09 * noise3(v.x * 3.5, v.y * 3.5 + o, v.z * 3.5);
    v.multiplyScalar(d);
    // flatten the faces a bit: chunky planes like real granite boulders
    v.x = v.x;
    v.y = v.y;
    p.setXYZ(i, v.x * r * sx + x, v.y * r * sy + y, v.z * r * sz + z);
  }
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  const welded = mergeVertices(g); g.dispose(); g = welded; g.computeVertexNormals(); p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const rr = rng(seed * 977 + 3);
  const base = (0.78 + rr() * 0.28) * tint;
  for (let i = 0; i < p.count; i++) { const k = base * (0.92 + 0.08 * noise3(p.getX(i), p.getY(i), p.getZ(i))); col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 1.02; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// ---------------------------------------------------------------- level
const levelGroup = new THREE.Group();
scene.add(levelGroup);
let level = null, flag = null;
const WATER_Y = -0.35;

// water with a scrolling procedural normal map
const waterNormal = canvasTex(256, 256, (g, w, h) => {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = (a, b) => noise3(a / 18, b / 18, 0) + 0.5 * noise3(a / 7, b / 7, 3);
    const dx = f(x + 1, y) - f(x - 1, y), dy = f(x, y + 1) - f(x, y - 1);
    const i = (y * w + x) * 4;
    img.data[i] = 128 + dx * 160; img.data[i + 1] = 128 + dy * 160; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});
waterNormal.colorSpace = THREE.NoColorSpace;
waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
waterNormal.repeat.set(24, 24);
const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
  new THREE.MeshStandardMaterial({ color: 0x8cccd9, roughness: 0.22, metalness: 0.05, normalMap: waterNormal, normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.95 }));
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_Y;
water.receiveShadow = true;
scene.add(water);

function textSprite(text, { size = 64, color = '#fff', stroke = '#1b1e2e', bg = null, scale = 1 } = {}) {
  const pad = 16, font = `900 ${size}px system-ui, -apple-system, sans-serif`;
  const m = document.createElement('canvas').getContext('2d'); m.font = font;
  const w = Math.ceil(m.measureText(text).width) + pad * 2, h = size + pad * 2;
  const tex = canvasTex(w, h, (g) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 18); g.fill(); }
    if (stroke) { g.lineWidth = size / 6; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 2); }
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set((w / h) * 0.42 * scale, 0.42 * scale, 1);
  return s;
}

function buildLevel(L) {
  level = L;
  // Geometry is rebuilt each round; shared materials survive the rebuild.
  levelGroup.traverse(o => { o.userData.ownedMaterials?.forEach(m => m.dispose()); if (o.geometry) o.geometry.dispose(); if (o.material?.map?.isCanvasTexture) o.material.map.dispose(); });
  levelGroup.clear();
  const W = L.width, T = L.top;
  const r = rng(1234);
  const rock = [], moss = [];
  const pick = () => (r() < 0.22 ? moss : rock);

  // the climbing wall: a packed field of boulders behind the climbing plane
  for (let y = 12.5; y < T + 3; y += 1.45) {
    for (let x = -W / 2 - 2.5; x < W / 2 + 2.5; x += 1.7) {
      const rad = 0.9 + r() * 0.7;
      const px = x + (r() - 0.5) * 0.9, py = y + (r() - 0.5) * 0.7;
      pick().push(boulder(rad, px, py, -0.55 - rad * 0.55, 1.05, 0.85, 0.55, Math.floor(r() * 1e6)));
    }
  }
  // the column's edges: bigger boulders sticking out toward the camera, framing the climb
  for (let y = 14; y < T + 4; y += 2.2) for (const s of [-1, 1]) {
    const rad = 1.6 + r() * 1.2;
    pick().push(boulder(rad, s * (W / 2 + 1.4 + r() * 1.2), y + r(), -0.2 + r() * 0.8, 0.9, 1.0, 0.8, Math.floor(r() * 1e6), 0.95));
  }
  // solid backdrop so no sky shows through gaps between boulders
  for (let y = 14; y < T + 6; y += 3) for (let x = -W / 2 - 4; x < W / 2 + 4; x += 3)
    rock.push(boulder(2.2, x + (r() - 0.5), y + (r() - 0.5), -2.6, 1.1, 1.1, 0.6, Math.floor(r() * 1e6), 0.62));
  // summit plateau
  for (let x = -W / 2 - 1; x < W / 2 + 1; x += 1.5) rock.push(boulder(1.2, x, T + 0.2, -0.4, 1.0, 0.55, 1.2, Math.floor(r() * 1e6)));

  for (const [geos, mat] of [[rock, rockMat], [moss, mossMat]]) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    geos.forEach(g => g.dispose());
    m.castShadow = true; m.receiveShadow = true;
    levelGroup.add(m);
  }

  // Snow sits on decorative rock shelves, never changes physical grab/foot points.
  const snow = [];
  for (let y = 14; y < T + 2; y += 2.2) {
    for (const side of [-1, 1]) {
      const x = side * (W / 2 + 1.2 + r());
      snow.push(boulder(1.3, x, y + 0.85, 0.15, 1.05, 0.2, 0.8, Math.floor(r() * 1e6)));
    }
    if (r() < 0.25 + 0.6 * y / T) {
      snow.push(boulder(1, (r() - 0.5) * W, y + 0.6, -0.35, 1.15, 0.14, 0.4, Math.floor(r() * 1e6)));
    }
  }
  for (let x = -W / 2; x <= W / 2; x += 1.2)
    snow.push(boulder(1, x, T + 0.75, -0.3, 1, 0.25, 1, Math.floor(r() * 1e6)));
  const snowMesh = new THREE.Mesh(mergeGeometries(snow), snowMat);
  snow.forEach(g => g.dispose());
  snowMesh.receiveShadow = true; levelGroup.add(snowMesh);

  levelGroup.add(createAlpineSection(W, 12));

  // Consistent bright hold silhouettes preserve the exact server attachment positions.
  const holdGeo = [[], [], []];
  for (const h of L.holds) holdGeo[h.id % 3].push(boulder(0.25, wx(h.x), h.y - 0.04, 0.01, 1.15, 0.85, 0.8, h.id * 31 + 7));
  holdGeo.forEach((geos, i) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), holdMats[i]);
    geos.forEach(g => g.dispose()); mesh.castShadow = true; levelGroup.add(mesh);
  });

  // Distant faceted peaks and snow caps are cheap silhouettes rather than texture assets.
  for (let i = 0; i < 18; i++) {
    const height = 25 + r() * 35, radius = 12 + r() * 12;
    const x = (i % 2 ? 1 : -1) * (22 + r() * 75), z = -45 - r() * 65;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), mossMat);
    // Disable vertex colors for these primitive geometries by using a shared plain material.
    peak.material = distantMat;
    peak.position.set(x, height / 2 - 5, z); levelGroup.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.43, height * 0.43, 5), snowMat);
    cap.position.set(x, height * 0.785 - 5 + 0.03, z); levelGroup.add(cap);
  }

  // Snow-dusted pines frame the course without covering usable holds.
  for (let i = 0; i < (HI ? 14 : 8); i++) {
    const side = i % 2 ? 1 : -1, x = side * (W / 2 + 3.2 + r() * 2);
    const y = i < 4 ? -0.1 : r() * T, z = -0.8, height = 1.4 + r() * 1.4;
    for (let j = 0; j < 3; j++) {
      const radius = (0.8 - j * 0.19) * height / 2;
      const branch = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 0.5, 6), pineMat);
      branch.position.set(x, y + height * (0.3 + j * 0.23), z); levelGroup.add(branch);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.76, height * 0.38, 6), snowMat);
      cap.position.set(x, branch.position.y + height * 0.065, z); levelGroup.add(cap);
    }
  }

  // "2+ CLIMBERS" signs at each duo gap: a plank on a post, nailed to the wall
  for (const [a, b] of L.gaps) {
    const sy = (a + b) / 2;
    const signTex = canvasTex(512, 200, (g, w, h) => {
      g.fillStyle = '#eef5f8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,35,15,.5)'; g.lineWidth = 3;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * h / 4 + Math.sin(i) * 4); g.lineTo(w, i * h / 4); g.stroke(); }
      g.textAlign = 'center'; g.fillStyle = '#21334d'; g.strokeStyle = '#eef5f8'; g.lineWidth = 8;
      g.font = '900 72px system-ui, sans-serif'; g.strokeText('TEAMWORK', w / 2, 92); g.fillText('TEAMWORK', w / 2, 92);
      g.font = '800 30px system-ui, sans-serif'; g.lineWidth = 5; g.strokeText('legs PUSH + arms PULL together', w / 2, 150); g.fillText('legs PUSH + arms PULL together', w / 2, 150);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.08), [woodMat, woodMat, woodMat, woodMat, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }), woodMat]);
    board.position.set(0, sy, -0.15); board.rotation.z = (r() - 0.5) * 0.08;
    board.castShadow = true;
    levelGroup.add(board);
    for (const yy of [a, b]) { // a frayed rope line marking each edge of the gap
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, W + 1, 6), new THREE.MeshStandardMaterial({ color: 0xd8b15a, roughness: 0.9 }));
      rope.rotation.z = Math.PI / 2; rope.position.set(0, yy, -0.2);
      levelGroup.add(rope);
    }
  }
  // height marks
  for (let m = 10; m < T; m += 10) {
    const s = textSprite(`${m} m`, { size: 48, color: '#1b1e2e', stroke: null, bg: 'rgba(255,255,255,.85)', scale: 0.9 });
    s.position.set(-W / 2 - 0.3, m, 0.3);
    levelGroup.add(s);
  }
  // summit flag
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
  pole.position.set(0, T + 2.1, -0.2); pole.castShadow = true;
  flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 16, 6), new THREE.MeshStandardMaterial({ color: 0xff5a5f, side: THREE.DoubleSide, roughness: 0.7 }));
  flag.geometry.translate(0.75, 0, 0);
  flag.position.set(0.05, T + 3.1, -0.2); flag.castShadow = true;
  flag.userData.base = flag.geometry.attributes.position.array.slice();
  const summitText = textSprite('SUMMIT', { size: 80, color: '#ffffff', stroke: '#354c68', scale: 2.2 });
  summitText.position.set(0, T + 4.6, 0);
  levelGroup.add(pole, flag, summitText);
}

// ---------------------------------------------------------------- climbers
const climberObjs = new Map();
function makeClimber(id) {
  const model = createAlpineCharacter(Net.colorOf(id));
  const label = textSprite(Net.nameOf(id), { size: 52, color: '#203249', stroke: null, bg: 'rgba(255,253,249,.92)', scale: 0.85 });
  model.root.add(label); scene.add(model.root);
  return { g: model.root, model, label, name: Net.nameOf(id) };
}
function poseClimber(o, c, dt) {
  const local = {
    ...c, x: wx(c.x),
    hands: c.hands.map(h => ({ ...h, x: wx(h.x), ex: wx(h.ex) })),
    legs: c.legs?.map(l => ({ ...l, kx: wx(l.kx), fx: wx(l.fx) })),
  };
  o.model.pose(local, dt, performance.now() / 1000, Net.config || {});
  o.label.position.set(local.x, c.y + 1.15, 0.6);
  o.label.visible = !(mode === 'phone' && c.id === Net.me);
}
function removeClimber(o) {
  scene.remove(o.g); o.model.dispose();
  o.label.material.map.dispose(); o.label.material.dispose();
}

// ---------------------------------------------------------------- banners + shake (DOM overlay)
const banners = document.createElement('div');
banners.id = 'banners';
document.body.appendChild(banners);
function banner(msg, color) {
  const d = document.createElement('div');
  d.className = 'banner'; d.textContent = msg; d.style.borderLeft = `5px solid ${color}`;
  d.style.setProperty('--tilt', (Math.random() * 8 - 4) + 'deg');
  banners.appendChild(d);
  setTimeout(() => d.remove(), 1600);
}
let shake = 0;
Net.on('event', (ev) => {
  const me = Net.me, phone = mode === 'phone';
  const involves = (...ids) => ids.includes(me);
  const n = (id) => Net.nameOf(id);
  let msg = null, color = '#ffffff', sh = 0;
  switch (ev.type) {
    case 'drop': if (!phone || involves(ev.id, ev.victim)) { msg = phone ? (ev.id === me ? 'BETRAYAL!' : `${n(ev.id)} DROPPED YOU`) : `${n(ev.id)} dropped ${n(ev.victim)}`; color = '#ff5a5f'; sh = ev.victim === me ? 0.25 : 0.08; } break;
    case 'throw': if (!phone || involves(ev.id, ev.target)) { msg = phone ? (ev.id === me ? 'YEET!' : 'THROWN!') : `${n(ev.id)} threw ${n(ev.target)}`; color = '#7bd389'; } break;
    case 'yank': if (!phone || involves(ev.id, ev.target)) { msg = phone ? (ev.id === me ? (ev.held ? 'THEY HELD ON' : 'YANKED!') : (ev.held ? 'YOU HELD ON' : `${n(ev.id)} YANKED YOU`)) : `${n(ev.id)} yanked ${n(ev.target)}`; color = '#c77dff'; sh = ev.target === me ? 0.2 : 0; } break;
    case 'shake': if (!phone || involves(ev.id, ev.victim)) { msg = phone ? (ev.id === me ? (ev.held ? 'THEY HELD ON' : 'SHOOK THEM OFF') : (ev.held ? 'YOU HELD ON' : `${n(ev.id)} SHOOK YOU OFF`)) : `${n(ev.id)} shook off ${n(ev.victim)}`; color = '#c77dff'; } break;
    case 'handhold': if (!phone || involves(ev.id, ev.target)) { msg = phone ? 'HOLDING HANDS' : `${n(ev.id)} grabbed ${n(ev.target)}'s hand`; color = '#ffd23f'; } break;
    case 'boost': if (!phone || involves(ev.id, ev.by)) { msg = phone ? (ev.id === me ? 'BOOST!' : `${n(ev.id)} USED YOU`) : `${n(ev.id)} boosted off ${n(ev.by)}`; color = '#7bd389'; } break;
    case 'fall': if (!phone || involves(ev.id)) { msg = phone ? `-${ev.m} m` : `${n(ev.id)} fell ${ev.m} m`; color = '#ffd23f'; sh = ev.id === me ? 0.2 : 0.05; } break;
    case 'slip': if (phone && involves(ev.id)) { msg = { exhausted: 'TOO TIRED', yanked: 'YANKED OFF' }[ev.reason] || 'RIPPED OFF'; color = '#ff5a5f'; sh = 0.25; } break;
    case 'win': msg = `${n(ev.id)} WINS`; color = '#ffd23f'; sh = 0.2; break;
    case 'combo': if (!phone) { msg = `${n(ev.id)} COMBO!`; color = '#ffd23f'; sh = 0.12; } break;
    case 'kick': if (!phone || involves(ev.id, ev.target)) { msg = phone ? (ev.id === me ? (ev.held ? 'THEY HELD ON' : 'KICKED THEM OFF') : `${n(ev.id)} KICKED YOU`) : `${n(ev.id)} kicked ${n(ev.target)}`; color = '#ff9f1c'; sh = ev.target === me ? 0.2 : 0.06; } break;
  }
  if (msg) banner(msg, color);
  shake = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.max(shake, sh * 0.45);
});

// ---------------------------------------------------------------- camera
const cam = { x: 0, y: 3, d: 14 };
function frame(st, dt) {
  const vw = innerWidth, vh = innerHeight;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let tx = 0, ty = 4, td = 14;
  if (mode === 'phone') {
    const me = st && (st.climbers.find(c => c.id === Net.me) || st.climbers[0]);
    td = 7.2 * Math.max(1, 0.62 / camera.aspect); // portrait phones need to back off to see ~5 m across
    if (me) { tx = wx(me.x); ty = me.y + 0.1; }     // you sit mid-screen, clear of the hand pads
    camera.clearViewOffset();
  } else {
    const inset = document.body.classList.contains('playing') ? 0 : (document.getElementById('side')?.offsetWidth || 0) + 16;
    const aspect = (vw - inset) / vh;
    let lo = 0, hi = 8;
    if (st && st.climbers.length) { const ys = st.climbers.map(c => c.y); lo = Math.min(...ys) - 1.5; hi = Math.max(...ys) + 2.5; }
    const span = Math.max(7, hi - lo);
    td = Math.max(span / 2 / tanH, 5.5 / (tanH * aspect)) + 1;  // fit the climbers and ~11 m of wall width
    const xs = st && st.climbers.length ? st.climbers.map(c => wx(c.x)) : [0];
    tx = Math.max(-3, Math.min(3, (Math.min(...xs) + Math.max(...xs)) / 2)); ty = (lo + hi) / 2;
    camera.setViewOffset(vw, vh, -inset / 2, 0, vw, vh); // center the cliff in the space right of the side panel
  }
  ty = Math.max(ty, mode === 'screen' ? td * tanH - 1.6 : 1.2); // never let the water take over the bottom of the view
  const k = 1 - Math.pow(0.02, dt);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.d += (td - cam.d) * k;
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  shake = Math.max(0, shake - dt * 0.8);
  camera.position.set(cam.x + Math.min(3.5, cam.d * 0.2) + sx, cam.y + 1.1 + sy, cam.d);
  camera.lookAt(cam.x + sx, cam.y + 0.55 + sy, 0);
  // the sun's shadow box follows the view so shadows stay crisp
  const ext = Math.min(40, cam.d * tanH * Math.max(1, vw / vh) + 3);
  sunLight.target.position.set(cam.x, cam.y, 0);
  sunLight.position.copy(sunLight.target.position).addScaledVector(sun, 40);
  Object.assign(sunLight.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 120 });
  sunLight.shadow.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- loop
if (Net.level) buildLevel(Net.level);
Net.on('level', buildLevel);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  const st = Net.sample();
  const seen = new Set();
  if (st && level) for (const c of st.climbers) {
    let o = climberObjs.get(c.id);
    if (!o || o.name !== Net.nameOf(c.id)) { if (o) removeClimber(o); o = makeClimber(c.id); climberObjs.set(c.id, o); }
    poseClimber(o, c, dt);
    seen.add(c.id);
  }
  for (const [id, o] of climberObjs) if (!seen.has(id)) { removeClimber(o); climberObjs.delete(id); }
  waterNormal.offset.set(now / 60000, now / 90000);
  if (flag) {
    const p = flag.geometry.attributes.position, b = flag.userData.base;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(now / 220 - x * 4) * 0.12 * x); }
    p.needsUpdate = true; flag.geometry.computeVertexNormals();
  }
  frame(st, dt);
  renderer.render(scene, camera);
});
window.Render3D = { scene, camera, renderer };

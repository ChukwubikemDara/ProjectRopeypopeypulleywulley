// Three.js renderer: a side-on 3D cliff (boulders, sky, water, foliage) with climbers posed from Net snapshots.
// Physics stays 2D on the server: x/y map straight to world x/y, the climbing plane is z = 0 and the
// wall sits just behind it. Mode comes from the page: body.phone -> follows you, body.screen -> frames everyone.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
renderer.toneMappingExposure = 0.72;
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
const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(38));
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
  scene.environmentIntensity = 0.55;
}
scene.fog = new THREE.Fog(0xa9c4dc, 45, 190);

const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4d4a3c, 0.9);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff0d8, 3.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(HI ? 2048 : 1024, HI ? 2048 : 1024);
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);

// ---------------------------------------------------------------- materials
const tl = new THREE.TextureLoader();
function pbr(name, repeat) {
  const load = (suffix, srgb) => {
    const t = tl.load(`/assets/tex/${name}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load('diff', true), normalMap: load('nor'), roughnessMap: load('rough'),
    normalScale: new THREE.Vector2(1.2, 1.2), vertexColors: true, roughness: 1, flatShading: false,
  });
}
const rockMat = pbr('marble_cliff_05');
const mossMat = pbr('mossy_rock');
const holdMat = pbr('marble_cliff_05');
holdMat.color.set(0xfff1dc); // chalked-up holds read lighter and warmer than the wall
const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3627, roughness: 0.95 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xe2ab86, roughness: 0.55 });

// ---------------------------------------------------------------- geometry builders
// box-projected UVs from world position, so texture flows continuously across neighbouring boulders
function boxUV(geo, scale) {
  const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      const [u, v] = az >= ax && az >= ay ? [p.x, p.y] : ax >= ay ? [p.z, p.y] : [p.x, p.z];
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
// a lumpy, slightly faceted boulder in world space
function boulder(r, x, y, z, sx, sy, sz, seed, tint = 1) {
  const g = new THREE.IcosahedronGeometry(1, HI ? 3 : 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  const o = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + 0.28 * noise3(v.x * 1.2 + o, v.y * 1.2, v.z * 1.2) + 0.09 * noise3(v.x * 3.5, v.y * 3.5 + o, v.z * 3.5);
    v.multiplyScalar(d);
    // flatten the faces a bit: chunky planes like real granite boulders
    v.x = Math.round(v.x * 6) / 6 * 0.35 + v.x * 0.65;
    v.y = Math.round(v.y * 6) / 6 * 0.35 + v.y * 0.65;
    p.setXYZ(i, v.x * r * sx + x, v.y * r * sy + y, v.z * r * sz + z);
  }
  g.computeVertexNormals();
  boxUV(g, 0.32);
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
const fernTex = canvasTex(128, 256, (g, w, h) => {
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + 8, h / 2, w / 2, 6); g.stroke();
  for (let i = 0; i < 16; i++) {
    const y = h - 14 - i * 14, len = 48 * (1 - i / 18);
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(w / 2, y);
      g.quadraticCurveTo(w / 2 + s * len * 0.6, y - 12, w / 2 + s * len, y - 4);
      g.quadraticCurveTo(w / 2 + s * len * 0.6, y - 2, w / 2, y + 4); g.fill();
    }
  }
});
const fernMat = new THREE.MeshStandardMaterial({ map: fernTex, color: 0x4a50c8, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });

// fern clump: crossed fronds fanning out from a point
function fern(x, y, z, size, seed) {
  const r = rng(seed), parts = [];
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(0.45 * size, 1.0 * size, 1, 3);
    g.translate(0, 0.5 * size, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const t = pos.getY(k) / size; pos.setZ(k, -t * t * 0.45 * size); } // droop
    g.rotateX(-0.25 - r() * 0.5);
    g.rotateZ((r() - 0.5) * 2.6);
    g.rotateY(r() * Math.PI * 2);
    g.translate(x, y, z);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// gnarled dead tree: recursive bent tubes
function tree(x, y, z, height, seed) {
  const r = rng(seed), parts = [];
  function branch(start, dir, len, rad, depth) {
    const pts = [start.clone()];
    const d = dir.clone();
    for (let i = 1; i <= 5; i++) {
      d.add(new THREE.Vector3((r() - 0.5) * 0.5, (r() - 0.3) * 0.3, (r() - 0.5) * 0.15)).normalize();
      pts.push(pts[i - 1].clone().addScaledVector(d, len / 5));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(new THREE.TubeGeometry(curve, 10, rad, 6, false));
    if (depth > 0) for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
      const t = 0.35 + r() * 0.6, p = curve.getPoint(t);
      const nd = curve.getTangent(t).add(new THREE.Vector3((r() - 0.5) * 2.2, r() * 0.6, (r() - 0.5) * 0.3)).normalize();
      branch(p, nd, len * (0.45 + r() * 0.25), rad * 0.55, depth - 1);
    }
  }
  branch(new THREE.Vector3(x, y, z), new THREE.Vector3((r() - 0.5) * 0.4, 1, 0.05).normalize(), height, 0.13, 3);
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
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
  new THREE.MeshStandardMaterial({ color: 0x18435a, roughness: 0.22, metalness: 0.05, normalMap: waterNormal, normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.95 }));
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
  levelGroup.clear();
  const W = L.width, T = L.top;
  const r = rng(1234);
  const rock = [], moss = [];
  const pick = () => (r() < 0.22 ? moss : rock);

  // the climbing wall: a packed field of boulders behind the climbing plane
  for (let y = -1; y < T + 3; y += 1.45) {
    for (let x = -W / 2 - 2.5; x < W / 2 + 2.5; x += 1.7) {
      const rad = 0.9 + r() * 0.7;
      const px = x + (r() - 0.5) * 0.9, py = y + (r() - 0.5) * 0.7;
      pick().push(boulder(rad, px, py, -0.55 - rad * 0.55, 1.05, 0.85, 0.55, Math.floor(r() * 1e6)));
    }
  }
  // the column's edges: bigger boulders sticking out toward the camera, framing the climb
  for (let y = -1; y < T + 4; y += 2.2) for (const s of [-1, 1]) {
    const rad = 1.6 + r() * 1.2;
    pick().push(boulder(rad, s * (W / 2 + 1.4 + r() * 1.2), y + r(), -0.2 + r() * 0.8, 0.9, 1.0, 0.8, Math.floor(r() * 1e6), 0.95));
  }
  // shore stones you start on (the physics floor is y = 0)
  for (let x = -W / 2 - 3; x < W / 2 + 3; x += 1.1) {
    const rad = 0.7 + r() * 0.5;
    pick().push(boulder(rad, x + (r() - 0.5) * 0.6, -rad * 0.62, (r() - 0.3) * 1.6, 1.1, 0.62, 1.0, Math.floor(r() * 1e6), 0.9));
  }
  // solid backdrop so no sky shows through gaps between boulders
  for (let y = -2; y < T + 6; y += 3) for (let x = -W / 2 - 4; x < W / 2 + 4; x += 3)
    rock.push(boulder(2.2, x + (r() - 0.5), y + (r() - 0.5), -2.6, 1.1, 1.1, 0.6, Math.floor(r() * 1e6), 0.62));
  // foreground stones half in the water, off to the sides, for depth
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, rad = 0.8 + r() * 1.4;
    pick().push(boulder(rad, side * (W / 2 - 1 + r() * 7), WATER_Y - rad * 0.3, 1.5 + r() * 4, 1.2, 0.7, 1, Math.floor(r() * 1e6), 0.85));
  }
  // summit plateau
  for (let x = -W / 2 - 1; x < W / 2 + 1; x += 1.5) rock.push(boulder(1.2, x, T + 0.2, -0.4, 1.0, 0.55, 1.2, Math.floor(r() * 1e6)));

  // holds: rock knobs poking out of the wall right at the grab points
  const holds = [];
  for (const h of L.holds) holds.push(boulder(0.24, wx(h.x), h.y - 0.04, -0.12, 1.25, 0.75, 1.1, h.id * 31 + 7, 1.35));

  for (const [geos, mat] of [[rock, rockMat], [moss, mossMat], [holds, holdMat]]) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true; m.receiveShadow = true;
    levelGroup.add(m);
  }

  // distant rock spires fading into the haze
  const far = [];
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1, fx = side * (22 + r() * 60), fz = -30 - r() * 90;
    const hgt = 20 + r() * 50;
    for (let k = 0; k < hgt; k += 6) far.push(boulder(5 + r() * 3, fx + (r() - 0.5) * 3, k, fz, 1, 1.2, 1, Math.floor(r() * 1e6), 0.85));
  }
  const farMesh = new THREE.Mesh(mergeGeometries(far), rockMat);
  levelGroup.add(farMesh);

  // foliage + dead trees
  const ferns = [];
  for (let i = 0; i < (HI ? 70 : 40); i++) {
    const edge = r() < 0.55;
    const fx = edge ? (r() < 0.5 ? -1 : 1) * (W / 2 + 0.3 + r() * 2) : (r() - 0.5) * W;
    const fy = r() < 0.15 ? r() * 2 : r() * T;
    ferns.push(fern(fx, fy, edge ? 0.2 : -0.45, 0.6 + r() * 0.6, i * 101 + 5));
  }
  for (let x = -W / 2 - 4; x < W / 2 + 4; x += 1.4) ferns.push(fern(x + r(), 0.05, 0.6 + r() * 1.2, 0.7 + r() * 0.5, Math.floor(x * 97) + 2000));
  const fernMesh = new THREE.Mesh(mergeGeometries(ferns), fernMat);
  fernMesh.castShadow = true; fernMesh.receiveShadow = true;
  levelGroup.add(fernMesh);
  const trees = [];
  for (let i = 0; i < 5; i++) trees.push(tree((r() < 0.5 ? -1 : 1) * (W / 2 - 0.5 - r() * 1.5), r() * T * 0.9, -0.25, 3 + r() * 3, i * 7 + 1));
  const treeMesh = new THREE.Mesh(mergeGeometries(trees), barkMat);
  treeMesh.castShadow = true; treeMesh.receiveShadow = true;
  levelGroup.add(treeMesh);

  // "2+ CLIMBERS" signs at each duo gap: a plank on a post, nailed to the wall
  for (const [a, b] of L.gaps) {
    const sy = (a + b) / 2;
    const signTex = canvasTex(512, 200, (g, w, h) => {
      g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,35,15,.5)'; g.lineWidth = 3;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * h / 4 + Math.sin(i) * 4); g.lineTo(w, i * h / 4); g.stroke(); }
      g.textAlign = 'center'; g.fillStyle = '#fff6e0'; g.strokeStyle = '#2b1a0c'; g.lineWidth = 8;
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
  const summitText = textSprite('SUMMIT', { size: 80, color: '#ffd23f', scale: 2.2 });
  summitText.position.set(0, T + 4.6, 0);
  levelGroup.add(pole, flag, summitText);
}

// ---------------------------------------------------------------- climbers
const climberObjs = new Map();
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const sph = new THREE.SphereGeometry(1, 16, 12);
const UP = new THREE.Vector3(0, 1, 0);
function limb(mesh, a, b, rad) {
  const d = new THREE.Vector3().subVectors(b, a), len = Math.max(0.001, d.length());
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  mesh.scale.set(rad, len, rad);
}
function makeClimber(id) {
  const color = new THREE.Color(Net.colorOf(id));
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const pants = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x2a2522, roughness: 0.8 });
  const g = new THREE.Group();
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  const o = {
    g, color,
    chest: add(new THREE.CapsuleGeometry(0.21, 0.3, 6, 12), shirt),
    hips: add(new THREE.CapsuleGeometry(0.17, 0.1, 6, 12), pants),
    neck: add(cyl, skinMat),
    head: add(sph, skinMat),
    hat: add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), shirt),
    arms: [0, 1].map(() => ({ up: add(cyl, shirt), fore: add(cyl, skinMat), elbow: add(sph, skinMat), hand: add(sph, skinMat) })),
    legs: [0, 1].map(() => ({ thigh: add(cyl, pants), shin: add(cyl, pants), knee: add(sph, pants), foot: add(new THREE.BoxGeometry(0.12, 0.08, 0.24), shoe) })),
    label: textSprite(Net.nameOf(id), { size: 52, color: '#' + color.getHexString(), scale: 0.85 }),
    name: Net.nameOf(id),
    vx: 0, vy: 0, px: null, py: null,
  };
  g.add(o.label);
  scene.add(g);
  return o;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function poseClimber(o, c, dt) {
  if (o.px !== null) { o.vx += ((c.x - o.px) / dt - o.vx) * 0.2; o.vy += ((c.y - o.py) / dt - o.vy) * 0.2; }
  o.px = c.x; o.py = c.y;
  const X = wx(c.x), Y = c.y, Z = 0.18;           // body sits a little in front of the wall
  const cfg = Net.config || {};
  const shX = cfg.shoulderX || 0.22, shY = cfg.shoulderY || 0.12;
  const lean = Math.max(-0.35, Math.min(0.35, o.vx * 0.04));

  o.chest.scale.set(1, 1, 0.8);
  o.chest.position.set(X + lean * 0.15, Y + 0.04, Z); o.chest.rotation.set(0, 0, -lean * 0.4);
  o.hips.position.set(X - lean * 0.1, Y - 0.3, Z); o.hips.scale.set(1.05, 1, 0.85);
  const headP = V(X + lean * 0.35, Y + 0.48, Z - 0.03);
  limb(o.neck, V(X + lean * 0.2, Y + 0.28, Z), headP, 0.06);
  o.head.position.copy(headP); o.head.scale.setScalar(0.15);
  o.hat.position.copy(headP).add(V(0, 0.02, 0.01)); o.hat.scale.setScalar(0.158); o.hat.rotation.set(-0.25, 0, 0);

  // arms: shoulder -> elbow -> hand straight from the physics, hands reach into the wall
  c.hands.forEach((h, i) => {
    const s = i ? 1 : -1, a = o.arms[i];
    const sh = V(X + s * shX + lean * 0.2, Y + shY + 0.06, Z);
    const hz = h.grip && !h.onClimber ? -0.02 : 0.08;
    const el = V(wx(h.ex), h.ey, (Z + hz) / 2 + 0.08);
    const hand = V(wx(h.x), h.y, hz);
    limb(a.up, sh, el, 0.075); limb(a.fore, el, hand, 0.06);
    a.elbow.position.copy(el); a.elbow.scale.setScalar(0.065);
    a.hand.position.copy(hand);
    const k = h.closed || h.grip ? 0.075 : 0.085;
    a.hand.scale.set(k, h.closed || h.grip ? k : k * 1.3, k * 0.8);
  });

  // legs: straight from the physics (hip -> knee -> foot); knees bow toward the camera a little for depth
  if (c.legs) for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, l = o.legs[i], lg = c.legs[i];
    const hip = V(X + s * (cfg.hipX || 0.12), Y - (cfg.hipY || 0.28), Z);
    const knee = V(wx(lg.kx), lg.ky, Z + 0.12), foot = V(wx(lg.fx), lg.fy, lg.planted ? -0.02 : Z);
    limb(l.thigh, hip, knee, 0.085); limb(l.shin, knee, foot, 0.07);
    l.knee.position.copy(knee); l.knee.scale.setScalar(0.08);
    l.foot.position.copy(foot).add(V(0, -0.02, 0.04));
  }
  // older snapshots without legs: dangle and trail behind the motion (2-bone IK in the plane)
  else for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, l = o.legs[i];
    const hip = V(X + s * 0.12 - lean * 0.1, Y - 0.36, Z);
    const sway = Math.sin(performance.now() / 700 + i * 2) * 0.04;
    const foot = V(hip.x + s * 0.08 - o.vx * 0.06 + sway, hip.y - 0.74 + Math.min(0.2, Math.max(-0.1, -o.vy * 0.03)), Z + 0.05);
    const L1 = 0.42, L2 = 0.42, d = Math.min(L1 + L2 - 0.001, hip.distanceTo(foot));
    const dir = new THREE.Vector3().subVectors(foot, hip).normalize();
    const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), up = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const knee = hip.clone().addScaledVector(dir, along).add(V(s * up * 0.5, 0, up * 0.85)); // knees out and toward the wall
    foot.copy(hip).addScaledVector(dir, d);
    limb(l.thigh, hip, knee, 0.085); limb(l.shin, knee, foot, 0.07);
    l.knee.position.copy(knee); l.knee.scale.setScalar(0.08);
    l.foot.position.copy(foot).add(V(0, -0.03, 0.02));
  }
  o.label.position.set(X, Y + 0.95, Z + 0.3);
  o.label.visible = !(mode === 'phone' && c.id === Net.me);
}

// ---------------------------------------------------------------- banners + shake (DOM overlay)
const banners = document.createElement('div');
banners.id = 'banners';
document.body.appendChild(banners);
function banner(msg, color) {
  const d = document.createElement('div');
  d.className = 'banner'; d.textContent = msg; d.style.color = color;
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
  shake = Math.max(shake, sh);
});

// ---------------------------------------------------------------- camera
const cam = { x: 0, y: 3, d: 14 };
function frame(st, dt) {
  const vw = innerWidth, vh = innerHeight;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let tx = 0, ty = 4, td = 14;
  if (mode === 'phone') {
    const me = st && (st.climbers.find(c => c.id === Net.me) || st.climbers[0]);
    td = 10.5 * Math.max(1, 0.62 / camera.aspect); // portrait phones need to back off to see ~5 m across
    if (me) { tx = wx(me.x); ty = me.y + 0.1; }     // you sit mid-screen, clear of the hand pads
    camera.clearViewOffset();
  } else {
    const inset = (document.getElementById('side')?.offsetWidth || 0) + 16;
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
  camera.position.set(cam.x + 1.4 + sx, cam.y + 0.6 + sy, cam.d);
  camera.lookAt(cam.x + sx, cam.y + 0.4 + sy, 0);
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

// adaptive quality: when frames get slow (busy / hot phone), render fewer pixels and refresh
// shadows less often; when there's headroom again, step back up. Keeps the game smooth.
const MAX_RATIO = Math.min(devicePixelRatio || 1, HI ? 2 : 1.5), MIN_RATIO = HI ? 1 : 0.6;
const perf = { frames: 0, since: performance.now(), goodFor: 0, fps: 60 };
let frameNo = 0;
function adaptQuality(now) {
  perf.frames++;
  if (now - perf.since < 1000) return;
  perf.fps = Math.round(perf.frames * 1000 / (now - perf.since));
  perf.frames = 0; perf.since = now;
  const r = renderer.getPixelRatio();
  if (perf.fps < 45 && r > MIN_RATIO) { renderer.setPixelRatio(Math.max(MIN_RATIO, r - 0.2)); perf.goodFor = 0; }
  else if (perf.fps >= 57 && r < MAX_RATIO && ++perf.goodFor >= 2) { renderer.setPixelRatio(Math.min(MAX_RATIO, r + 0.1)); perf.goodFor = 0; }
  // still struggling at the lowest resolution: redraw shadows every other frame
  renderer.shadowMap.autoUpdate = !(perf.fps < 45 && renderer.getPixelRatio() <= MIN_RATIO);
  window.Render3D.fps = perf.fps;
}

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  adaptQuality(now);
  if (!renderer.shadowMap.autoUpdate && frameNo++ % 2 === 0) renderer.shadowMap.needsUpdate = true;
  const st = Net.sample();
  const seen = new Set();
  if (st && level) for (const c of st.climbers) {
    let o = climberObjs.get(c.id);
    if (!o || o.name !== Net.nameOf(c.id)) { if (o) scene.remove(o.g); o = makeClimber(c.id); climberObjs.set(c.id, o); }
    poseClimber(o, c, dt);
    seen.add(c.id);
  }
  for (const [id, o] of climberObjs) if (!seen.has(id)) { scene.remove(o.g); climberObjs.delete(id); }
  waterNormal.offset.set(now / 60000, now / 90000);
  if (flag) {
    const p = flag.geometry.attributes.position, b = flag.userData.base;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(now / 220 - x * 4) * 0.12 * x); }
    p.needsUpdate = true; flag.geometry.computeVertexNormals();
  }
  frame(st, dt);
  renderer.render(scene, camera);
});
window.Render3D = { scene, camera, renderer, fps: 60 };

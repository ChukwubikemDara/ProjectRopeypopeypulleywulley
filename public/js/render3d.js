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


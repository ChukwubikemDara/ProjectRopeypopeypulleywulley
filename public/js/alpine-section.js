import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A composed opening section. Decorative terrain never replaces server collision geometry.
export function createAlpineSection(width = 12, height = 12) {
  const group = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.91, vertexColors: true });
  const snow = new THREE.MeshStandardMaterial({ color: '#f2f5ee', roughness: 0.87 });
  const darkRock = new THREE.MeshStandardMaterial({ color: '#777c8b', roughness: 1 });
  const pine = new THREE.MeshStandardMaterial({ color: '#315d60', roughness: 1 });
  const bark = new THREE.MeshStandardMaterial({ color: '#775d4e', roughness: 1 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e47e53', roughness: 0.85, side: THREE.DoubleSide });
  const rope = new THREE.MeshStandardMaterial({ color: '#dbc8a4', roughness: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: '#587483', roughness: 0.55, metalness: 0.35 });
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  function add(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = m.receiveShadow = true; group.add(m); return m;
  }
  // Continuous, gently folded rock surface, with broad strata and smoothly interpolated normals.
  const cliff = new THREE.PlaneGeometry(width + 2.4, height + 2, 110, 100);
  const p = cliff.attributes.position, colors = [];
  const warm = new THREE.Color('#b6a99b'), cool = new THREE.Color('#8995a5'), pale = new THREE.Color('#ddd0ba');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + height / 2;
    const band = y + Math.sin(x * 0.48) * 0.42;
    const vertical = Math.pow(Math.abs(Math.sin(x * 0.95 + Math.sin(y * 0.35) * 0.5)), 12);
    const horizontal = Math.pow(Math.abs(Math.sin(band * 1.05)), 22);
    const fold = Math.sin(x * 1.9 + y * 0.21) * 0.045 + Math.sin(y * 3.7 + x * 0.4) * 0.016;
    const crest = Math.max(0, (y - height + 1) / 2);
    p.setXYZ(i, x, y + crest * (Math.sin(x * 0.8) * 0.3 + Math.sin(x * 1.8) * 0.12), -0.14 - vertical * 0.27 - horizontal * 0.14 + fold);
    const tint = warm.clone().lerp(cool, 0.36 + Math.sin(x * 0.7 + band * 0.55) * 0.27)
      .lerp(pale, Math.max(0, Math.sin(band * 1.05)) * 0.2);
    tint.multiplyScalar(1 - vertical * 0.1 - horizontal * 0.12);
    colors.push(tint.r, tint.g, tint.b);
  }
  cliff.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); cliff.computeVertexNormals();
  add(cliff, rock, 0, 0, 0);
  // Broad shoulder outcrops create a readable silhouette rather than a field of equal-size stones.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = side * (width / 2 + 0.8 + Math.sin(i * 2) * 0.3), y = i * 3.5;
      const outcrop = add(sphere, darkRock, x, y, -1.3, 1.65, 2.5, 1.65);
      outcrop.rotation.z = side * 0.14;
      add(sphere, snow, x - side * 0.15, y + 1.85, -0.9, 1.7, 0.38, 1.7);
    }
  }
  for (let x = -width / 2; x <= width / 2; x += 1.6) {
    add(sphere, snow, x, height + 0.95 + Math.sin(x * .8) * .2, -0.5, 1.1, .22, .75);
  }
  // Soft overhangs stay just outside the active climb or behind the grab plane.
  const shelves = [
    [-width / 2 - 0.1, 2.6, 1.65], [width / 2 + 0.1, 4.8, 1.8],
    [-width / 2, 7.9, 1.65], [width / 2 + 0.2, 10.3, 1.85],
  ];
  for (const [x, y, size] of shelves) {
    add(sphere, snow, x, y, -0.3, size, 0.25, 0.85);
    // Round snow drips at the outer edge, never over interactive holds.
    for (let j = 0; j < 3; j++) add(sphere, snow, x + (j - 1) * size * 0.5, y - 0.12, 0.03, 0.16, 0.26 + j * 0.04, 0.19);
  }
  // Snowy bank and a layered shoreline add foreground depth while preserving floor y=0.
  add(sphere, darkRock, 0, -0.8, 0.1, width / 2 + 2.5, 0.75, 3.6);
  add(sphere, snow, 0, -0.48, 0.5, width / 2 + 2.6, 0.48, 3.6);
  for (const side of [-1, 1]) {
    add(sphere, snow, side * (width / 2 + 3.1), -0.25, 3.5, 2.2, 0.6, 2.1);
  }
  // Layered evergreen boughs with smooth, irregular profiles and snow on the upper surfaces.
  function tree(x, y, z, size) {
    add(new THREE.CylinderGeometry(0.07, 0.13, size, 10), bark, x, y + size * 0.4, z);
    const points = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, taper = 1 - t;
      const scallop = 0.78 + 0.22 * Math.cos(t * Math.PI * 8);
      points.push(new THREE.Vector2(Math.max(0.006, taper * size * 0.34 * scallop), size * (0.15 + t)));
    }
    const foliage = new THREE.LatheGeometry(points, 24);
    const fp = foliage.attributes.position, fn = foliage.attributes.normal, colors = [];
    const green = new THREE.Color('#315d60'), white = new THREE.Color('#edf5f3');
    for (let v = 0; v < fp.count; v++) {
      const coverage = THREE.MathUtils.smoothstep(fn.getY(v), 0.1, 0.7);
      const c = green.clone().lerp(white, coverage);
      colors.push(c.r, c.g, c.b);
    }
    foliage.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1});
    add(foliage, mat, x, y, z);

  }
  tree(-width / 2 - 2.4, -0.1, 0.7, 3.2);
  tree(width / 2 + 2.9, 0, -1.2, 4.3);
  tree(width / 2 + 3.9, 0, 2.6, 2.2);
  tree(-width / 2 - 2.1, 7.5, -1, 1.8);

  // One warm base-camp landmark outside the climbing lane.
  const campX = -width / 2 - 1.8;
  const tentShape = new THREE.Shape(); tentShape.moveTo(-0.8, 0); tentShape.lineTo(0, 1.05); tentShape.lineTo(0.8, 0); tentShape.closePath();
  const tent = new THREE.ExtrudeGeometry(tentShape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.04, bevelSegments: 3, steps: 1 });
  add(tent, orange, campX, 0, 1.1);
  const door = new THREE.Shape(); door.moveTo(-0.29, 0); door.lineTo(0, 0.75); door.lineTo(0.29, 0); door.closePath();
  add(new THREE.ShapeGeometry(door), metal, campX, 0.02, 2.35);
  // Expedition marker and a short rope fence on the outer bank.
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.9);
    add(new THREE.CylinderGeometry(0.035, 0.045, 1.2, 10), metal, x, 0.6, 1.4);
    const flagShape = new THREE.Shape(); flagShape.moveTo(0, 0); flagShape.lineTo(0.55, -0.1); flagShape.lineTo(0, -0.25); flagShape.closePath();
    add(new THREE.ShapeGeometry(flagShape), orange, x, 1.2, 1.4);
  }
  const fenceCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(campX - 1, 0.5, 2.6), new THREE.Vector3(campX, 0.35, 2.8), new THREE.Vector3(campX + 1, 0.5, 2.6)]);
  add(new THREE.TubeGeometry(fenceCurve, 20, 0.018, 6, false), rope, 0, 0, 0);
  const ownedMaterials = new Set();
  group.traverse(o => { if (o.material) ownedMaterials.add(o.material); });
  group.userData.ownedMaterials = ownedMaterials;
  return group;
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sphere = new THREE.SphereGeometry(1, 24, 18);
const tube = new THREE.CylinderGeometry(1, 1, 1, 16);
const round = new RoundedBoxGeometry(1, 1, 1, 3, 0.18);
const materials = {
  cream: new THREE.MeshStandardMaterial({ color: '#fff1da', roughness: 0.85 }),
  trim: new THREE.MeshStandardMaterial({ color: '#ecede3', roughness: 0.95 }),
  ink: new THREE.MeshStandardMaterial({ color: '#203249', roughness: 0.65 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#2b4050', roughness: 0.95 }),
  brass: new THREE.MeshStandardMaterial({ color: '#e7b877', metalness: 0.65, roughness: 0.4 }),
  blush: new THREE.MeshStandardMaterial({ color: '#eeac98', roughness: 0.9 }),
};
function mesh(parent, geometry, material, position, scale) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(...position);
  if (scale) m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ellipsoid(parent, material, position, scale) { return mesh(parent, sphere, material, position, scale); }
function ring(parent, material, radius, thickness, position, scale = [1, 1, 1]) {
  const m = mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 40), material, position, scale);
  m.rotation.x = Math.PI / 2; return m;
}
function segment(m, a, b, radius) {
  const d = b.clone().sub(a), length = Math.max(0.001, d.length());
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(length));
  m.scale.set(radius, length, radius);
}

// Original toy mountaineer. Every endpoint stays tied to authoritative physics;
// the wardrobe and face can evolve independently of the controller/network contract.
export function createAlpineCharacter(color = '#42b7ad') {
  const root = new THREE.Group();
  const teamColor = new THREE.Color(color);
  const coat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: teamColor.clone().multiplyScalar(0.57), roughness: 0.9 });
  const light = new THREE.MeshStandardMaterial({ color: teamColor.clone().lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.9 });
  const body = new THREE.Group(); root.add(body);
  ellipsoid(body, coat, [0, 0, 0], [0.29, 0.37, 0.23]);
  ellipsoid(body, dark, [0, -0.28, -0.005], [0.235, 0.16, 0.2]);
  // Curved puffer seams hug the front of the jacket rather than reading as spheres.
  for (const y of [-0.18, -0.04, 0.1]) {
    const seam = ring(body, dark, 0.252, 0.007, [0, y, 0], [1, 0.82, 1]);
    seam.scale.x = Math.sqrt(1 - (y / 0.44) ** 2);
  }
  mesh(body, round, materials.trim, [0, 0.025, 0.232], [0.018, 0.47, 0.018]);
  mesh(body, round, materials.brass, [0.001, 0.16, 0.249], [0.035, 0.054, 0.018]);
  for (const side of [-1, 1]) {
    const pocket = mesh(body, round, dark, [side * 0.16, -0.075, 0.205], [0.12, 0.085, 0.022]);
    pocket.rotation.z = side * 0.2;
    mesh(body, round, materials.ink, [side * 0.2, 0.01, -0.12], [0.035, 0.52, 0.045]);
  }
  ring(body, materials.ink, 0.24, 0.022, [0, -0.21, 0], [1, 0.85, 1]);
  mesh(body, round, materials.brass, [0.115, -0.21, 0.2], [0.075, 0.055, 0.023]);
  const carabiner = mesh(body, new THREE.TorusGeometry(0.05, 0.01, 6, 16), materials.brass, [-0.25, -0.23, 0.16], [0.75, 1, 1]);
  carabiner.rotation.z = -0.25;
  // Backpack sits on the back (negative Z), keeping the face and coat readable.
  mesh(body, round, dark, [0, 0.03, -0.245], [0.34, 0.42, 0.18]);
  mesh(body, round, light, [0, 0.1, -0.35], [0.29, 0.15, 0.03]);
  ring(body, materials.trim, 0.17, 0.055, [0, 0.29, 0], [1, 0.85, 1]);
  const scarf = mesh(body, round, materials.trim, [0.15, 0.15, 0.23], [0.09, 0.26, 0.04]);
  scarf.rotation.z = -0.22;

  const head = new THREE.Group(); root.add(head);
  ellipsoid(head, coat, [0, 0, -0.02], [0.295, 0.3, 0.25]);
  ellipsoid(head, materials.cream, [0, -0.015, 0.105], [0.245, 0.23, 0.175]);
  const eyes = [-1, 1].map(side => {
    const eye = ellipsoid(head, materials.ink, [side * 0.085, 0.025, 0.267], [0.033, 0.052, 0.018]);
    ellipsoid(head, materials.trim, [side * 0.085 - 0.009, 0.043, 0.282], [0.008, 0.012, 0.005]);
    ellipsoid(head, materials.blush, [side * 0.145, -0.06, 0.247], [0.043, 0.021, 0.008]);
    return eye;
  });
  ellipsoid(head, materials.cream, [0, -0.045, 0.282], [0.025, 0.023, 0.025]);
  const smile = mesh(head, new THREE.TorusGeometry(0.045, 0.009, 6, 16, Math.PI), materials.ink, [0, -0.085, 0.267]);
  smile.rotation.z = Math.PI;
  const surprised = ellipsoid(head, materials.ink, [0, -0.09, 0.271], [0.026, 0.035, 0.01]); surprised.visible = false;
  const cap = mesh(head, new THREE.SphereGeometry(0.3, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), light, [0, 0.08, -0.015], [1.02, 0.88, 0.9]);
  ring(head, light, 0.279, 0.045, [0, 0.095, -0.015], [1, 0.9, 1]);
  // Knit ribs around the rolled brim, and a soft pompom.
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2;
    ellipsoid(head, coat, [Math.sin(angle) * 0.282, 0.095, Math.cos(angle) * 0.251 - 0.015], [0.008, 0.032, 0.008]);
  }
  ellipsoid(head, materials.trim, [0.035, 0.375, -0.015], [0.085, 0.085, 0.085]);
  mesh(head, round, materials.trim, [0, 0.15, 0.26], [0.075, 0.065, 0.015]);

  const arms = [-1, 1].map(side => {
    const upper = mesh(root, tube, coat), fore = mesh(root, tube, coat), elbow = mesh(root, sphere, coat);
    const hand = new THREE.Group(); root.add(hand);
    const palm = ellipsoid(hand, dark, [0, 0.02, 0], [0.16, 0.18, 0.13]);
    ellipsoid(hand, coat, [-side * 0.13, 0, 0.035], [0.075, 0.1, 0.075]);
    ring(hand, materials.trim, 0.105, 0.028, [0, -0.115, 0]);
    const patch = mesh(hand, round, light, [0, 0.03, 0.122], [0.12, 0.11, 0.018]);
    return { upper, fore, elbow, hand, palm, patch };
  });
  const legs = [-1, 1].map(() => {
    const thigh = mesh(root, tube, dark), shin = mesh(root, tube, dark), knee = mesh(root, sphere, dark);
    const boot = new THREE.Group(); root.add(boot);
    mesh(boot, round, coat, [0, 0.03, 0.035], [0.23, 0.19, 0.28]);
    mesh(boot, round, materials.rubber, [0, -0.065, 0.065], [0.255, 0.07, 0.34]);
    mesh(boot, round, dark, [0, -0.003, 0.17], [0.22, 0.1, 0.055]);
    ring(boot, materials.trim, 0.095, 0.026, [0, 0.12, 0]);
    for (let i = 0; i < 3; i++) {
      mesh(boot, round, materials.trim, [0, 0.075 - i * 0.025, 0.149], [0.11, 0.009, 0.012]);
      for (const side of [-1, 1]) mesh(boot, round, materials.rubber, [side * 0.115, -0.1, -0.045 + i * 0.085], [0.04, 0.03, 0.04]);
    }
    return { thigh, shin, knee, boot };
  });
  let previous = null, vx = 0;
  return {
    root,
    pose(c, dt = 1 / 60, time = performance.now() / 1000, config = {}) {
      const x = c.x, y = c.y, z = c.z ?? 0.28;
      if (previous !== null && dt > 0) vx = THREE.MathUtils.lerp(vx, Math.max(-8, Math.min(8, (x - previous) / dt)), 0.15);
      previous = x;
      const lean = THREE.MathUtils.clamp(vx * 0.035, -0.18, 0.18);
      body.position.set(x, y, z); body.rotation.z = -lean;
      if (c.rotation) body.quaternion.set(c.rotation.x, c.rotation.y, c.rotation.z, c.rotation.w);
      head.position.set(x + lean * 0.3, y + 0.51, z + 0.02);
      head.rotation.z = -lean * 0.7;
      if (c.rotation) {
        head.quaternion.copy(body.quaternion);
        head.position.copy(V(0, 0.51, 0.02).applyQuaternion(body.quaternion)).add(body.position);
      }
      const blink = Math.sin(time * 0.75) > 0.997;
      eyes.forEach(e => { e.scale.y = blink ? 0.008 : c.air ? 0.06 : 0.052; });
      smile.visible = !c.air; surprised.visible = !!c.air;
      scarf.rotation.z = -0.22 + Math.sin(time * 3) * Math.min(0.14, Math.abs(vx) * 0.035);
      c.hands.forEach((h, i) => {
        const side = i ? 1 : -1, arm = arms[i];
        const shoulder = c.rotation
          ? V(side * (config.shoulderX || 0.22), (config.shoulderY || 0.12) + 0.06, 0).applyQuaternion(body.quaternion).add(body.position)
          : V(x + side * (config.shoulderX || 0.22), y + (config.shoulderY || 0.12) + 0.06, z);
        const handPos = V(h.x, h.y, h.z ?? (h.grip && !h.onClimber ? 0.02 : 0.17));
        const elbow = V(h.ex, h.ey, h.ez ?? z + 0.045);
        segment(arm.upper, shoulder, elbow, 0.105); segment(arm.fore, elbow, handPos, 0.095);
        arm.elbow.position.copy(elbow); arm.elbow.scale.setScalar(0.102);
        arm.hand.position.copy(handPos);
        if (c.rotation) arm.hand.quaternion.setFromUnitVectors(UP, handPos.clone().sub(elbow).normalize());
        else arm.hand.rotation.z = -Math.atan2(handPos.x - elbow.x, handPos.y - elbow.y);
        arm.palm.scale.y = h.closed || h.grip ? 0.145 : 0.18;
        arm.patch.material = h.grip ? materials.trim : light;
      });
      legs.forEach((leg, i) => {
        const side = i ? 1 : -1, data = c.legs?.[i];
        const hip = c.rotation
          ? V(side * (config.hipX || 0.12), -(config.hipY || 0.28), 0).applyQuaternion(body.quaternion).add(body.position)
          : V(x + side * (config.hipX || 0.12), y - (config.hipY || 0.28), z);
        const knee = data ? V(data.kx, data.ky, data.kz ?? z + 0.12) : hip.clone().add(V(side * 0.08, -0.32, 0.08));
        const foot = data ? V(data.fx, data.fy, data.fz ?? (data.planted ? 0.04 : z)) : hip.clone().add(V(side * 0.1, -0.7, 0.06));
        segment(leg.thigh, hip, knee, 0.103); segment(leg.shin, knee, foot, 0.09);
        leg.knee.position.copy(knee); leg.knee.scale.setScalar(0.1);
        leg.boot.position.copy(foot);
        if (c.rotation) leg.boot.quaternion.copy(body.quaternion);
        else leg.boot.rotation.z = data?.planted ? 0 : side * 0.12;
      });
    },
    dispose() {
      // Shared primitive geometries/materials are module-owned. Unique detail meshes are instance-owned.
      const geometries = new Set(), mats = new Set([coat, dark, light]);
      root.traverse(o => { if (o.geometry && ![sphere, tube, round].includes(o.geometry)) geometries.add(o.geometry); });
      geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
    },
  };
}

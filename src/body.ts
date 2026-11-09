// Robed body shared by every character: shaped robe (flared hem + neon trim), belt, kasaya sash across the
// chest and back, collar, mala beads, sleeves to the hands, and a glowing ensō on the back in your light colour
// (the camera sits behind you, so the back carries your identity).
import * as THREE from 'three';
import { own } from './dispose';

const PROFILE = [
  [0.001, 0],
  [0.41, 0],
  [0.425, 0.05],
  [0.385, 0.2],
  [0.345, 0.45],
  [0.32, 0.7],
  [0.3, 0.88],
  [0.24, 1.0],
  [0.13, 1.07],
  [0.001, 1.09],
].map(([r, y]) => new THREE.Vector2(r, y));

const G = {
  robe: new THREE.LatheGeometry(PROFILE, 28),
  // flat cloth bands (open cylinders hugging the robe) instead of tubes
  trim: new THREE.CylinderGeometry(0.428, 0.433, 0.07, 36, 1, true),
  belt: new THREE.CylinderGeometry(0.343, 0.352, 0.08, 32, 1, true),
  sash: new THREE.CylinderGeometry(0.33, 0.35, 0.17, 32, 1, true),
  collar: new THREE.TorusGeometry(0.165, 0.038, 6, 22),
  enso: new THREE.RingGeometry(0.075, 0.115, 28, 1, 0.5, Math.PI * 1.75),
  bead: new THREE.SphereGeometry(0.026, 8, 6),
  sleeve: new THREE.CapsuleGeometry(0.088, 0.2, 4, 10),
  cuff: new THREE.TorusGeometry(0.09, 0.022, 5, 14),
};
const beadMat = new THREE.MeshStandardMaterial({ color: '#5b3a29', roughness: 0.5 });
const goldMat = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.8, roughness: 0.3 });

const ring = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, tiltX = 0, tiltZ = 0, flat = false) => {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.set((flat ? 0 : Math.PI / 2) + tiltX, 0, tiltZ);
  m.position.y = y;
  m.castShadow = false; // thin bands: the robe already casts the shadow
  return m;
};

/** Robe mesh (origin at the hem) with trim, belt, sash, collar, beads and back emblem as children. */
export function buildRobe(robeMat: THREE.MeshStandardMaterial, sashColor: string, light: string) {
  const robe = new THREE.Mesh(G.robe, robeMat);
  robe.castShadow = true;
  const sash = own(new THREE.MeshStandardMaterial({ color: sashColor, roughness: 0.75, side: THREE.DoubleSide }));
  const trimMat = own(new THREE.MeshStandardMaterial({ color: light, emissive: light, emissiveIntensity: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  robe.add(ring(G.trim, trimMat, 0.045, 0, 0, true));
  robe.add(ring(G.belt, sash, 0.47, 0, 0, true));
  // kasaya: a broad band from the left shoulder to the right hip, wrapping the back too
  const band = ring(G.sash, sash, 0.7, 0, 0.42, true);
  band.scale.set(1.03, 1, 1.03);
  robe.add(band);
  robe.add(ring(G.collar, sash, 1.02, -0.25));
  // mala beads hanging on the chest, one gold bead at the bottom
  const N = 22;
  const beads = new THREE.InstancedMesh(G.bead, beadMat, N);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const front = Math.max(0, Math.cos(a));
    const r = 0.19 + 0.12 * front;
    m4.makeTranslation(Math.sin(a) * r, 1.0 - 0.2 * front ** 1.5, Math.cos(a) * r);
    beads.setMatrixAt(i, m4);
  }
  robe.add(beads);
  const gold = new THREE.Mesh(G.bead, goldMat);
  gold.scale.setScalar(1.7);
  gold.position.set(0, 0.79, 0.33);
  robe.add(gold);
  // glowing ensō on the back
  const enso = new THREE.Mesh(G.enso, own(new THREE.MeshBasicMaterial({ color: light, toneMapped: false, side: THREE.DoubleSide })));
  enso.position.set(0, 0.74, -0.352);
  enso.rotation.set(-0.12, Math.PI, 0);
  enso.scale.setScalar(1.5);
  robe.add(enso);
  return { robe, sash };
}

/** Sleeves from the shoulders to the hands (in the upper-body group, pivot at the chest). */
export function addSleeves(upper: THREE.Group, robeMat: THREE.Material, sash: THREE.Material) {
  const up = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) {
    const a = new THREE.Vector3(sx * 0.27, 0.12, -0.02);
    const b = new THREE.Vector3(sx * 0.07, -0.02, 0.3);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const s = new THREE.Mesh(G.sleeve, robeMat);
    s.quaternion.copy(q);
    s.position.copy(a).addScaledVector(dir, len / 2);
    s.scale.set(1, len / 0.38, 1);
    s.castShadow = false;
    const c = new THREE.Mesh(G.cuff, sash);
    c.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    c.position.copy(a).addScaledVector(dir, len * 0.86);
    upper.add(s, c);
  }
}

// Characters: original low-poly meme-animal heads on the same robed body.
// 0 monk · 1 shibu (pixel shades, curly tail) · 2 froggo · 3 kitty (gold chain) · 3 capy (orange on head)
import * as THREE from 'three';

const sph = (r: number, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
const G = {
  head: sph(0.3, 26, 18),
  hood: new THREE.SphereGeometry(0.335, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
  eye: new THREE.CapsuleGeometry(0.017, 0.055, 2, 6),
  dot: sph(1, 10, 8),
  ear: new THREE.ConeGeometry(0.11, 0.24, 4),
  earIn: new THREE.ConeGeometry(0.06, 0.15, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
  smile: new THREE.TorusGeometry(0.14, 0.014, 5, 18, Math.PI),
  chain: new THREE.TorusGeometry(0.25, 0.028, 6, 24),
  curl: new THREE.TorusGeometry(0.12, 0.055, 8, 16, Math.PI * 1.5),
  catTail: new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, -0.3), new THREE.Vector3(0.1, 0.35, -0.42), new THREE.Vector3(0.05, 0.6, -0.36)]),
    16,
    0.045,
    6,
  ),
  leaf: new THREE.ConeGeometry(0.04, 0.12, 4),
};
const M = new Map<string, THREE.Material>();
function m(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  const k = color + JSON.stringify(opts);
  let x = M.get(k);
  if (!x) M.set(k, (x = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts })));
  return x;
}
const BLACK = '#1d1b22';

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, s: number | [number, number, number] = 1) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  if (Array.isArray(s)) o.scale.set(...s);
  else o.scale.setScalar(s);
  o.castShadow = true;
  return o;
}

/** Fur / skin colour for hands. */
export function skinOf(sp: number) {
  return ['#f3d7bf', '#e08a3c', '#7cc56a', '#b9b3c9', '#a3743f'][sp] ?? '#f3d7bf';
}

/** Adds the head of a species to the upper body group (pivot at the chest) and any tail to the body. */
export function buildCharacter(sp: number, upper: THREE.Group, body: THREE.Group, robeColor: string) {
  const fur = m(skinOf(sp));
  if (sp === 1) {
    // Shibu: orange dog, cream muzzle, pixel shades, curly tail
    const cream = m('#fbe8cf');
    upper.add(part(G.head, fur, 0, 0.56, 0, [1.05, 0.95, 1]));
    for (const sx of [-1, 1]) {
      const e = part(G.ear, fur, sx * 0.17, 0.83, -0.02);
      e.rotation.z = -sx * 0.3;
      const ei = part(G.earIn, cream, sx * 0.17, 0.81, 0.02);
      ei.rotation.z = -sx * 0.3;
      upper.add(e, ei, part(G.dot, cream, sx * 0.16, 0.45, 0.2, [0.1, 0.07, 0.08]));
    }
    upper.add(part(G.dot, cream, 0, 0.47, 0.24, [0.15, 0.11, 0.13]));
    upper.add(part(G.dot, m(BLACK), 0, 0.52, 0.37, 0.04));
    // pixel shades
    const shade = m(BLACK, { roughness: 0.3, metalness: 0.2 });
    upper.add(part(G.box, shade, 0, 0.63, 0.28, [0.5, 0.035, 0.03]));
    for (const sx of [-1, 1]) upper.add(part(G.box, shade, sx * 0.11, 0.6, 0.285, [0.16, 0.09, 0.03]));
    upper.add(part(G.box, m('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), 0.07, 0.62, 0.302, [0.03, 0.025, 0.01]));
    const tail = part(G.curl, fur, 0, 0.8, -0.38);
    tail.rotation.y = Math.PI / 2;
    body.add(tail);
  } else if (sp === 2) {
    // Froggo: wide head, bulging eyes on top, big smile
    upper.add(part(G.head, fur, 0, 0.5, 0, [1.25, 0.78, 1.08]));
    for (const sx of [-1, 1]) {
      upper.add(part(G.dot, fur, sx * 0.16, 0.7, 0.1, 0.12));
      upper.add(part(G.dot, m('#ffffff'), sx * 0.16, 0.72, 0.17, 0.085));
      upper.add(part(G.dot, m(BLACK), sx * 0.16, 0.72, 0.245, 0.042));
      upper.add(part(G.dot, m('#f39aa8'), sx * 0.24, 0.45, 0.2, [0.06, 0.035, 0.03]));
    }
    const smile = part(G.smile, m('#5a2a2e'), 0, 0.47, 0.26, [1, 1, 1]);
    smile.rotation.z = Math.PI;
    smile.rotation.x = -0.25;
    upper.add(smile);
  } else if (sp === 3) {
    // Kitty: pointy ears, whiskers, gold chain, long tail
    const pink = m('#f6b4c4');
    upper.add(part(G.head, fur, 0, 0.56, 0, [1.05, 0.92, 0.98]));
    for (const sx of [-1, 1]) {
      const e = part(G.ear, fur, sx * 0.18, 0.82, 0);
      e.rotation.z = -sx * 0.25;
      const ei = part(G.earIn, pink, sx * 0.18, 0.8, 0.035);
      ei.rotation.z = -sx * 0.25;
      upper.add(e, ei);
      const eye = part(G.dot, m('#c6f25a', { emissive: '#8fd12a', emissiveIntensity: 0.4 }), sx * 0.11, 0.6, 0.255, [0.055, 0.065, 0.03]);
      const pupil = part(G.box, m(BLACK), sx * 0.11, 0.6, 0.285, [0.014, 0.08, 0.01]);
      upper.add(eye, pupil);
      for (const dy of [0, -0.04]) {
        const w = part(G.box, m('#f3f0ea'), sx * 0.2, 0.48 + dy, 0.24, [0.17, 0.008, 0.008]);
        w.rotation.z = sx * (dy ? -0.15 : 0.12);
        upper.add(w);
      }
    }
    upper.add(part(G.dot, pink, 0, 0.51, 0.29, [0.035, 0.025, 0.02]));
    const chain = part(G.chain, m('#f2c14e', { metalness: 0.9, roughness: 0.25 }), 0, 0.26, 0.04);
    chain.rotation.x = Math.PI / 2 - 0.25;
    upper.add(chain);
    body.add(part(G.catTail, fur, 0, 0.3, -0.25));
  } else if (sp === 4) {
    // Capy: boxy head, big snout, tiny ears, an orange balanced on top
    const dark = m('#7c5530');
    upper.add(part(G.head, fur, 0, 0.56, 0.02, [0.95, 0.88, 1.15]));
    upper.add(part(G.dot, dark, 0, 0.5, 0.24, [0.2, 0.16, 0.16]));
    for (const sx of [-1, 1]) {
      upper.add(part(G.dot, dark, sx * 0.19, 0.78, -0.06, [0.06, 0.05, 0.04]));
      upper.add(part(G.dot, m(BLACK), sx * 0.15, 0.63, 0.22, 0.032));
      upper.add(part(G.dot, m(BLACK), sx * 0.05, 0.53, 0.39, [0.02, 0.012, 0.01]));
    }
    upper.add(part(G.dot, m('#ff9a1f', { roughness: 0.55 }), 0, 0.89, 0, 0.11));
    const leaf = part(G.leaf, m('#3fae5a'), 0.04, 1.0, 0);
    leaf.rotation.z = -0.8;
    upper.add(leaf);
  } else {
    // Monk: round face under a soft hood
    const hoodMat = m(new THREE.Color(robeColor).multiplyScalar(0.9).getStyle(), { side: THREE.DoubleSide, roughness: 0.9 });
    upper.add(part(G.head, fur, 0, 0.55, 0));
    const hood = part(G.hood, hoodMat, 0, 0.57, -0.03);
    hood.rotation.x = -0.38;
    upper.add(hood);
    for (const sx of [-1, 1]) {
      const e = part(G.eye, m(BLACK), sx * 0.1, 0.56, 0.283);
      e.rotation.z = Math.PI / 2;
      upper.add(e, part(G.dot, m('#f2b2a0'), sx * 0.17, 0.48, 0.24, [0.05, 0.03, 0.025]));
    }
  }
}

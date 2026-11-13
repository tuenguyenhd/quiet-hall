// Procedural low-poly "meme archetype" pets (original characters, no logos / text / likeness of any artwork):
//   meme-shiba.glb  Biscuit: an excited Shiba-style pup with a red bandana
//   meme-frog.glb   Lily: a chill, half-lidded pond frog wearing a lily-pad hat
//   meme-cat.glb    Pip: a cream-and-ginger cat that "pops" its mouth open, bell collar
// Style matches the Quaternius CC0 animals: flat-shaded faceted primitives, flat colours (here as vertex
// colours on ONE material = one draw call per pet), roughness 0.415 / metalness 0.4 like the CC0 set.
// Each model is a single SkinnedMesh with rigid (weight 1) bone parts, so it clones and animates exactly
// like shiba.glb / frog.glb in src/animals.ts. Clips: see CLIPS in each builder.
// Usage: node scripts/meme-pets.mjs && node scripts/optimize-glb.mjs public/models/meme/*.glb
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// GLTFExporter (binary) needs FileReader in Node
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = r;
      this.onloadend?.();
    });
  }
};

const OUT = 'public/models/meme';
const D2 = Math.PI / 2;

// ---------- geometry helpers ----------
const sphere = (w = 8, h = 6, t0 = 0, tl = Math.PI) => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, t0, tl);
const cone = (seg = 4) => new THREE.ConeGeometry(1, 1, seg);
const cyl = (rt, rb, seg = 6) => new THREE.CylinderGeometry(rt, rb, 1, seg);
const box = () => new THREE.BoxGeometry(1, 1, 1);
const torus = (r, tube, rs = 4, ts = 8, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc);

/** A rigged model under construction: bones + rigid parts (each part weighted 1.0 to one bone). */
class Rig {
  constructor() {
    this.bones = {};
    this.list = [];
    this.parts = [];
    this.bone('root', null, [0, 0, 0]);
  }
  /** bone at a MODEL-space position (rest rotation = identity) */
  bone(name, parent, pos) {
    const b = new THREE.Bone();
    b.name = name;
    b.userData.at = new THREE.Vector3(...pos);
    if (parent) {
      const p = this.bones[parent];
      b.position.copy(b.userData.at).sub(p.userData.at);
      p.add(b);
    } else b.position.copy(b.userData.at);
    this.bones[name] = b;
    this.list.push(b);
    return this;
  }
  /** a part: unit primitive -> scale, rotate (euler XYZ), translate, in model space */
  part(bone, color, g, pos, scale = [1, 1, 1], rot = [0, 0, 0]) {
    g = g.index ? g.toNonIndexed() : g.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...(typeof scale === 'number' ? [scale, scale, scale] : scale)));
    g.applyMatrix4(m);
    g.computeVertexNormals(); // non-indexed -> flat facets
    const n = g.attributes.position.count;
    const c = new THREE.Color(color); // sRGB hex -> linear (glTF COLOR_0 is linear)
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const bi = this.list.indexOf(this.bones[bone]);
    if (bi < 0) throw new Error(`no bone ${bone}`);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], i * 3);
      si[i * 4] = bi;
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.parts.push(g);
    return this;
  }
  /** mirrored pair (x and -x); `name` gets L / R suffix when the bone is per-side */
  pair(bone, color, g, pos, scale, rot = [0, 0, 0]) {
    const sides = [
      ['L', 1],
      ['R', -1],
    ];
    for (const [s, k] of sides) {
      const b = this.bones[bone + s] ? bone + s : bone;
      this.part(b, color, g, [pos[0] * k, pos[1], pos[2]], scale, [rot[0], rot[1] * k, rot[2] * k]);
    }
    return this;
  }
  build(name) {
    const geo = mergeGeometries(this.parts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.415, metalness: 0.4, name: `${name}_Mat` });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = name;
    const scene = new THREE.Group();
    scene.name = `${name}_Root`;
    scene.add(this.bones.root, mesh);
    scene.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.list));
    for (const b of this.list) delete b.userData.at; // build-time only, keep it out of the glTF extras
    return { scene, mesh, tris: geo.attributes.position.count / 3 };
  }
}

// ---------- animation helpers (offsets from the rest pose) ----------
const q = new THREE.Quaternion();
const rotT = (bone, times, eulers) =>
  new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, eulers.flatMap((e) => q.setFromEuler(new THREE.Euler(...e)).toArray()));
/** position track: rest position (from the rig) + offsets */
const posT = (rig, bone, times, offs) => {
  const p = rig.bones[bone].position;
  return new THREE.VectorKeyframeTrack(`${bone}.position`, times, offs.flatMap((o) => [p.x + o[0], p.y + o[1], p.z + o[2]]));
};
const sclT = (bone, times, s) => new THREE.VectorKeyframeTrack(`${bone}.scale`, times, s.flatMap((v) => (typeof v === 'number' ? [v, v, v] : v)));
/** evenly spaced looping keys over `dur`: f(phase 0..1) for n steps (first = last) */
const loop = (dur, n, f) => {
  const t = [];
  const v = [];
  for (let i = 0; i <= n; i++) {
    t.push((dur * i) / n);
    v.push(f((i % n) / n));
  }
  return [t, v];
};
const S = (ph) => Math.sin(ph * Math.PI * 2);
const clip = (name, dur, tracks) => new THREE.AnimationClip(name, dur, tracks);

// ---------- Biscuit: Shiba-style pup ----------
function shiba() {
  const ORANGE = 0xd88c4a;
  const CREAM = 0xf4e6cc;
  const DARK = 0x2b211c;
  const TONGUE = 0xe57f86;
  const SCARF = 0xcf5a4c;
  const r = new Rig()
    .bone('body', 'root', [0, 0.33, 0])
    .bone('head', 'body', [0, 0.44, 0.17])
    .bone('earL', 'head', [0.075, 0.62, 0.22])
    .bone('earR', 'head', [-0.075, 0.62, 0.22])
    .bone('tail', 'body', [0, 0.4, -0.2])
    .bone('legFL', 'body', [0.08, 0.26, 0.13])
    .bone('legFR', 'body', [-0.08, 0.26, 0.13])
    .bone('legBL', 'body', [0.08, 0.26, -0.13])
    .bone('legBR', 'body', [-0.08, 0.26, -0.13]);
  // body + cream chest
  r.part('body', ORANGE, sphere(8, 6), [0, 0.33, -0.01], [0.135, 0.125, 0.235]);
  r.part('body', CREAM, sphere(8, 5), [0, 0.3, 0.09], [0.1, 0.1, 0.13]);
  // legs (orange) with cream socks
  for (const [b, x, z] of [['legFL', 0.08, 0.13], ['legFR', -0.08, 0.13], ['legBL', 0.08, -0.13], ['legBR', -0.08, -0.13]]) {
    r.part(b, ORANGE, cyl(0.042, 0.036, 6), [x, 0.17, z], [1, 0.2, 1]);
    r.part(b, CREAM, sphere(6, 4), [x, 0.035, z + 0.012], [0.045, 0.035, 0.055]);
  }
  // head: big round chibi head
  r.part('head', ORANGE, sphere(9, 7), [0, 0.53, 0.23], [0.15, 0.13, 0.135]);
  r.part('head', CREAM, sphere(8, 5), [0, 0.475, 0.335], [0.075, 0.055, 0.07]); // muzzle
  r.pair('head', CREAM, sphere(6, 5), [0.07, 0.47, 0.3], [0.06, 0.05, 0.05]); // cheeks
  r.part('head', DARK, sphere(6, 4), [0, 0.5, 0.405], [0.022, 0.016, 0.014]); // nose
  r.pair('head', DARK, sphere(6, 5), [0.062, 0.545, 0.352], [0.022, 0.026, 0.014]); // eyes
  r.pair('head', CREAM, sphere(5, 4), [0.058, 0.6, 0.333], [0.02, 0.012, 0.01]); // eyebrow dots
  r.part('head', TONGUE, box(), [0, 0.43, 0.38], [0.03, 0.012, 0.035], [0.5, 0, 0]); // happy tongue
  // ears: pyramids, cream inside
  r.pair('ear', ORANGE, cone(4), [0.075, 0.67, 0.22], [0.05, 0.11, 0.03], [0, 0, -0.3]);
  r.pair('ear', CREAM, cone(3), [0.074, 0.66, 0.235], [0.03, 0.075, 0.012], [0, 0, -0.3]);
  // curled tail over the back, cream tip
  r.part('tail', ORANGE, torus(0.055, 0.03, 5, 7, Math.PI * 1.4), [0, 0.47, -0.2], 1, [0, D2, 0.4]);
  r.part('tail', CREAM, sphere(5, 4), [0, 0.49, -0.135], 0.03);
  // bandana: neck band + a triangle flap on the chest
  r.part('body', SCARF, torus(0.1, 0.022, 4, 10), [0, 0.425, 0.15], [1, 1, 0.8], [D2 - 0.35, 0, 0]);
  r.part('body', SCARF, cone(3), [0, 0.37, 0.235], [0.06, 0.08, 0.015], [Math.PI + 0.25, 0, 0]);

  const clips = [];
  // Idle: breathing, happy tail wag, an ear flick
  {
    const [t, v] = loop(2, 16, (p) => p);
    clips.push(
      clip('Idle', 2, [
        sclT('body', t, v.map((p) => [1, 1 + 0.025 * S(p), 1 + 0.01 * S(p)])),
        rotT('tail', t, v.map((p) => [0, 0, 0.45 * S(p * 4)])),
        rotT('head', t, v.map((p) => [0.04 * S(p), 0, 0.06 * S(p)])),
        rotT('earL', [0, 1.1, 1.2, 1.3, 2], [[0, 0, 0], [0, 0, 0], [0, 0, 0.45], [0, 0, 0], [0, 0, 0]]),
      ]),
    );
  }
  // Idle_2: looks around
  {
    const [t, v] = loop(3, 12, (p) => p);
    clips.push(
      clip('Idle_2', 3, [
        rotT('head', t, v.map((p) => [0.05, 0.55 * S(p), 0.1 * S(p)])),
        rotT('tail', t, v.map((p) => [0, 0, 0.3 * S(p * 3)])),
      ]),
    );
  }
  // Walk: diagonal leg pairs, body bob, tail wag
  {
    const [t, v] = loop(0.6, 12, (p) => p);
    const A = 0.55;
    clips.push(
      clip('Walk', 0.6, [
        rotT('legFL', t, v.map((p) => [A * S(p), 0, 0])),
        rotT('legBR', t, v.map((p) => [A * S(p), 0, 0])),
        rotT('legFR', t, v.map((p) => [-A * S(p), 0, 0])),
        rotT('legBL', t, v.map((p) => [-A * S(p), 0, 0])),
        posT(r, 'body', t, v.map((p) => [0, 0.012 * Math.abs(S(p)), 0])),
        rotT('head', t, v.map((p) => [0.05 * S(p * 2), 0, 0])),
        rotT('tail', t, v.map((p) => [0, 0, 0.35 * S(p * 2)])),
      ]),
    );
  }
  // Sit: rear down, back legs folded, head level, slow wag
  {
    const [t, v] = loop(2, 8, (p) => p);
    const pitch = -0.42;
    clips.push(
      clip('Sit', 2, [
        rotT('body', t, v.map(() => [pitch, 0, 0])),
        posT(r, 'body', t, v.map(() => [0, -0.06, -0.02])),
        rotT('legFL', t, v.map(() => [-pitch, 0, 0])),
        rotT('legFR', t, v.map(() => [-pitch, 0, 0])),
        rotT('legBL', t, v.map(() => [-pitch - 1.25, 0, 0])),
        rotT('legBR', t, v.map(() => [-pitch - 1.25, 0, 0])),
        rotT('head', t, v.map((p) => [-pitch + 0.05 * S(p), 0, 0])),
        rotT('tail', t, v.map((p) => [0, 0, 0.3 * S(p * 2)])),
      ]),
    );
  }
  return { ...r.build('MemeShiba'), clips };
}

// ---------- Lily: chill pond frog ----------
function frog() {
  const GREEN = 0x8fc46d;
  const BACK = 0x74ad57;
  const BELLY = 0xf0ebc4;
  const WHITE = 0xf6f3e8;
  const DARK = 0x2a2a24;
  const CHEEK = 0xeaa59b;
  const PAD = 0x4e8a3c;
  const r = new Rig()
    .bone('body', 'root', [0, 0.12, 0])
    .bone('head', 'body', [0, 0.2, 0.06])
    .bone('lidL', 'head', [0.085, 0.3, 0.075])
    .bone('lidR', 'head', [-0.085, 0.3, 0.075])
    .bone('legFL', 'body', [0.085, 0.13, 0.11])
    .bone('legFR', 'body', [-0.085, 0.13, 0.11])
    .bone('legBL', 'body', [0.12, 0.09, -0.05])
    .bone('legBR', 'body', [-0.12, 0.09, -0.05]);
  // body: squat pear, cream belly
  r.part('body', GREEN, sphere(9, 6), [0, 0.12, -0.01], [0.16, 0.115, 0.165], [-0.25, 0, 0]);
  r.part('body', BELLY, sphere(8, 5), [0, 0.1, 0.075], [0.115, 0.085, 0.09], [-0.3, 0, 0]);
  r.pair('body', BACK, sphere(5, 4), [0.06, 0.2, -0.07], [0.035, 0.015, 0.035], [-0.6, 0, 0]); // back spots
  // head: wide and flat with eyes on top
  r.part('head', GREEN, sphere(10, 6), [0, 0.225, 0.07], [0.165, 0.085, 0.13]);
  r.part('head', BELLY, sphere(8, 4), [0, 0.19, 0.11], [0.13, 0.05, 0.09]); // chin
  r.pair('head', WHITE, sphere(8, 6), [0.085, 0.3, 0.075], 0.052);
  r.pair('head', DARK, sphere(6, 5), [0.085, 0.292, 0.122], [0.022, 0.02, 0.012]); // pupils, low = sleepy
  // heavy upper lids: green hemispheres tipped forward over the top half (chill / sleepy look)
  r.pair('lid', GREEN, sphere(8, 4, 0, D2), [0.085, 0.302, 0.075], [0.058, 0.058, 0.058], [0.55, 0, 0]);
  r.pair('head', CHEEK, sphere(6, 4), [0.115, 0.215, 0.155], [0.028, 0.02, 0.01], [0, 0.55, 0]);
  // small content smile (a thin arc)
  r.part('head', DARK, torus(0.05, 0.006, 3, 8, Math.PI * 0.7), [0, 0.215, 0.192], [1, 0.7, 1], [0, 0, Math.PI * 1.15]);
  // lily-pad hat (a notched disc) tilted on the head, tiny stem
  {
    const pad = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0.35, Math.PI * 2 - 0.7);
    r.part('head', PAD, pad, [0.02, 0.335, 0.0], [0.125, 0.014, 0.125], [0.2, 0.4, -0.2]);
    r.part('head', PAD, cyl(0.006, 0.006, 4), [0.02, 0.35, 0.0], [1, 0.03, 1], [0.2, 0, -0.2]);
  }
  // legs: big back thighs + flat feet, thin front arms + feet
  r.pair('legB', GREEN, sphere(7, 5), [0.13, 0.075, -0.05], [0.055, 0.06, 0.1], [0.3, 0, 0]);
  r.pair('legB', GREEN, box(), [0.16, 0.012, 0.05], [0.065, 0.018, 0.1], [0, -0.25, 0]);
  r.pair('legF', GREEN, cyl(0.022, 0.018, 5), [0.09, 0.07, 0.13], [1, 0.12, 1], [0.15, 0, 0.1]);
  r.pair('legF', GREEN, box(), [0.1, 0.01, 0.16], [0.05, 0.015, 0.055], [0, -0.2, 0]);

  const clips = [];
  // Frog_Idle-style idle: breathing throat/belly, slow blink
  {
    const [t, v] = loop(3, 15, (p) => p);
    const blink = [0, 2.1, 2.2, 2.35, 3];
    const lid = [[0, 0, 0], [0, 0, 0], [0.75, 0, 0], [0, 0, 0], [0, 0, 0]];
    clips.push(
      clip('Idle', 3, [
        sclT('body', t, v.map((p) => [1 + 0.02 * S(p), 1 - 0.02 * S(p), 1 + 0.02 * S(p)])),
        rotT('head', t, v.map((p) => [0.03 * S(p), 0, 0.03 * S(p * 0.5)])),
        rotT('lidL', blink, lid),
        rotT('lidR', blink, lid),
      ]),
    );
  }
  // Hop: crouch, launch (back legs kick), arc, land
  {
    const t = [0, 0.1, 0.2, 0.32, 0.44, 0.52, 0.6];
    const y = [0, -0.015, 0.06, 0.11, 0.06, -0.01, 0];
    const pitch = [0, 0.12, -0.3, -0.1, 0.15, 0.08, 0];
    const back = [0, 0.3, -0.9, -0.6, -0.1, 0.25, 0];
    const front = [0, 0.1, -0.2, 0.5, 0.7, 0.1, 0];
    clips.push(
      clip('Hop', 0.6, [
        posT(r, 'body', t, y.map((v) => [0, v, 0])),
        rotT('body', t, pitch.map((v) => [v, 0, 0])),
        rotT('legBL', t, back.map((v) => [v, 0, 0])),
        rotT('legBR', t, back.map((v) => [v, 0, 0])),
        rotT('legFL', t, front.map((v) => [-v, 0, 0])),
        rotT('legFR', t, front.map((v) => [-v, 0, 0])),
      ]),
    );
  }
  return { ...r.build('MemeFrog'), clips };
}

// ---------- Pip: cream-and-ginger cat that pops its mouth ----------
function cat() {
  const CREAM = 0xf8ecd6;
  const GINGER = 0xe39b5b;
  const PINK = 0xe9a0a0;
  const DARK = 0x2c2523;
  const MOUTH = 0x8c3f45;
  const COLLAR = 0x4f93bd;
  const BELL = 0xe9c35c;
  const r = new Rig()
    .bone('body', 'root', [0, 0.27, 0])
    .bone('head', 'body', [0, 0.36, 0.15])
    .bone('mouth', 'head', [0, 0.405, 0.3])
    .bone('earL', 'head', [0.085, 0.57, 0.16])
    .bone('earR', 'head', [-0.085, 0.57, 0.16])
    .bone('tail1', 'body', [0, 0.3, -0.19])
    .bone('tail2', 'tail1', [0, 0.46, -0.27])
    .bone('legFL', 'body', [0.065, 0.22, 0.11])
    .bone('legFR', 'body', [-0.065, 0.22, 0.11])
    .bone('legBL', 'body', [0.065, 0.22, -0.11])
    .bone('legBR', 'body', [-0.065, 0.22, -0.11]);
  // body: chunky cream loaf with a ginger saddle patch (v1 had thin legs and read goat-like; an all-ginger v2
  // was too close to the Shiba at range, so v3 keeps it cream-and-ginger: cream body, ginger cap / ears / tail)
  r.part('body', CREAM, sphere(8, 6), [0, 0.265, -0.005], [0.13, 0.115, 0.2]);
  r.part('body', GINGER, sphere(8, 4, 0, Math.PI * 0.3), [0, 0.27, -0.05], [0.135, 0.12, 0.15]);
  for (const [b, x, z] of [['legFL', 0.068, 0.11], ['legFR', -0.068, 0.11], ['legBL', 0.068, -0.11], ['legBR', -0.068, -0.11]]) {
    r.part(b, CREAM, cyl(0.042, 0.038, 6), [x, 0.12, z], [1, 0.2, 1]);
    r.part(b, 0xffffff, sphere(6, 4), [x, 0.03, z + 0.012], [0.046, 0.034, 0.055]);
  }
  // head: big round, ginger cap over the top/back
  r.part('head', CREAM, sphere(10, 7), [0, 0.46, 0.18], [0.155, 0.135, 0.13]);
  r.part('head', GINGER, sphere(10, 5, 0, Math.PI * 0.42), [0, 0.465, 0.165], [0.16, 0.14, 0.135], [-0.45, 0, 0]);
  r.pair('head', CREAM, sphere(6, 4), [0.06, 0.415, 0.27], [0.05, 0.04, 0.035]); // muzzle puffs
  r.part('head', PINK, sphere(5, 3), [0, 0.44, 0.302], [0.016, 0.011, 0.01]); // nose
  r.pair('head', DARK, sphere(6, 5), [0.06, 0.485, 0.282], [0.021, 0.027, 0.012]); // eyes
  // the "pop": an open oval mouth on its own bone (scaled in the idle)
  r.part('mouth', MOUTH, sphere(8, 5), [0, 0.39, 0.29], [0.032, 0.036, 0.014]);
  // ears: ginger pyramids, pink inside
  r.pair('ear', GINGER, cone(4), [0.088, 0.61, 0.16], [0.058, 0.11, 0.04], [0, 0.25, -0.28]);
  r.pair('ear', PINK, cone(3), [0.083, 0.59, 0.176], [0.03, 0.065, 0.012], [0, 0.25, -0.28]);
  // tail: two segments curving up, ginger
  r.part('tail1', GINGER, cyl(0.032, 0.038, 5), [0, 0.38, -0.23], [1, 0.19, 1], [-0.75, 0, 0]);
  r.part('tail2', GINGER, cyl(0.026, 0.032, 5), [0, 0.53, -0.275], [1, 0.16, 1], [-0.25, 0, 0]);
  r.part('tail2', CREAM, sphere(5, 4), [0, 0.61, -0.29], 0.028);
  // collar + bell
  r.part('body', COLLAR, torus(0.085, 0.017, 4, 10), [0, 0.36, 0.135], [1, 1, 0.85], [D2 - 0.4, 0, 0]);
  r.part('body', BELL, sphere(6, 4), [0, 0.315, 0.215], 0.022);

  const clips = [];
  // Idle: breathing, swaying tail, and the mouth "pop" (closed -> wide open -> closed)
  {
    const [t, v] = loop(2.4, 12, (p) => p);
    const pt = [0, 0.9, 1.0, 1.35, 1.45, 2.4];
    const ps = [[0.6, 0.35, 1], [0.6, 0.35, 1], [1.25, 1.35, 1], [1.25, 1.35, 1], [0.6, 0.35, 1], [0.6, 0.35, 1]];
    clips.push(
      clip('Idle', 2.4, [
        sclT('body', t, v.map((p) => [1, 1 + 0.02 * S(p), 1])),
        rotT('tail1', t, v.map((p) => [0, 0, 0.3 * S(p)])),
        rotT('tail2', t, v.map((p) => [0.15 * S(p + 0.25), 0, 0.35 * S(p - 0.2)])),
        rotT('head', pt, pt.map((x, i) => [i === 2 || i === 3 ? -0.12 : 0, 0, 0])),
        sclT('mouth', pt, ps),
        rotT('earL', [0, 1.8, 1.9, 2.0, 2.4], [[0, 0, 0], [0, 0, 0], [0, 0, 0.4], [0, 0, 0], [0, 0, 0]]),
      ]),
    );
  }
  // Walk: slinky diagonal gait, tail up
  {
    const [t, v] = loop(0.6, 12, (p) => p);
    const A = 0.5;
    clips.push(
      clip('Walk', 0.6, [
        rotT('legFL', t, v.map((p) => [A * S(p), 0, 0])),
        rotT('legBR', t, v.map((p) => [A * S(p), 0, 0])),
        rotT('legFR', t, v.map((p) => [-A * S(p), 0, 0])),
        rotT('legBL', t, v.map((p) => [-A * S(p), 0, 0])),
        posT(r, 'body', t, v.map((p) => [0, 0.01 * Math.abs(S(p)), 0])),
        rotT('tail1', t, v.map((p) => [-0.2, 0, 0.12 * S(p)])),
        rotT('tail2', t, v.map((p) => [0, 0, 0.2 * S(p - 0.2)])),
        sclT('mouth', t, v.map(() => [0.6, 0.35, 1])),
      ]),
    );
  }
  // Sit: haunches down, front legs straight, tail wrapped low
  {
    const [t, v] = loop(2.4, 8, (p) => p);
    const pitch = -0.5;
    clips.push(
      clip('Sit', 2.4, [
        rotT('body', t, v.map(() => [pitch, 0, 0])),
        posT(r, 'body', t, v.map(() => [0, -0.05, -0.02])),
        rotT('legFL', t, v.map(() => [-pitch, 0, 0])),
        rotT('legFR', t, v.map(() => [-pitch, 0, 0])),
        rotT('legBL', t, v.map(() => [-pitch - 1.3, 0, 0])),
        rotT('legBR', t, v.map(() => [-pitch - 1.3, 0, 0])),
        rotT('head', t, v.map((p) => [-pitch, 0, 0.06 * S(p)])),
        rotT('tail1', t, v.map((p) => [0.9, 0, 0.1 * S(p)])),
        sclT('mouth', t, v.map(() => [0.6, 0.35, 1])),
      ]),
    );
  }
  return { ...r.build('MemeCat'), clips };
}

mkdirSync(OUT, { recursive: true });
const exporter = new GLTFExporter();
for (const [file, make] of [
  ['meme-shiba', shiba],
  ['meme-frog', frog],
  ['meme-cat', cat],
]) {
  const { scene, clips, tris } = make();
  const glb = await exporter.parseAsync(scene, { binary: true, animations: clips });
  writeFileSync(`${OUT}/${file}.glb`, Buffer.from(glb));
  console.log(`${file}.glb  ${tris} tris  ${(glb.byteLength / 1024).toFixed(0)} KB raw  clips: ${clips.map((c) => c.name).join(', ')}`);
}

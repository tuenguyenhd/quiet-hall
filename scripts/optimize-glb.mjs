// Optimise the .glb models in place: drop unused / duplicate animation clips, prune + dedup, then meshopt
// geometry compression (the app's GLTFLoaders register MeshoptDecoder). Textures: see scripts/shrink-glb.mjs.
// Usage: node scripts/optimize-glb.mjs [files...]   (default: public/models/*.glb public/chars/*.glb)
import { readdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// animation clips the app actually plays (after stripping "Armature|" and "Man_/Female_" prefixes)
const KEEP = {
  shiba: ['Walk', 'Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'],
  husky: ['Walk', 'Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'],
  frog: ['Frog_Jump', 'Frog_Idle'],
  turtle: ['StretchingPose', 'HidingPose'],
  // pets (public/models/pets): keep every clip the pet table maps
  slime: ['idle'],
  hamster: ['Take 001'],
  teddy: ['Idle', 'Run', 'sitting', 'Wave'],
  sharpei: ['sitting_idle', 'walking_cycle', 'standing_idle'],
  bulldog: ['Sitting'],
  chick: ['Take 001'],
  tiger: ['idle', 'walk'],
  duck: ['ArmatureAction'],
  man: ['Idle', 'Walk', 'Sitting', 'Clapping'],
  woman: ['Idle', 'Walk', 'Sitting', 'Clapping'],
  'woman-dress': ['Idle', 'Walk', 'Sitting', 'Clapping'],
};
/** static (unrigged) meshes that are heavier than needed: simplify to this share of triangles */
/** display stands / props baked into downloads: nodes to remove (by name) */
const DROP = { axolotl: /^Stand/i };
const SIMPLIFY = { axolotl: 0.25, dragon: 0.45, penguin: 0.6 };
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['public/models', 'public/models/pets', 'public/chars'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.glb')).map((f) => `${d}/${f}`));

let before = 0;
let after = 0;
for (const f of files) {
  const size0 = statSync(f).size;
  const doc = await io.read(f);
  const root = doc.getRoot();
  if (root.listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    console.log(`= ${f} already optimised`);
    continue;
  }
  const name = f.split('/').pop().replace('.glb', '');
  const keep = KEEP[name] ?? []; // pool characters + scenery: no clips are used
  const seen = new Set();
  let dropped = 0;
  for (const a of root.listAnimations()) {
    const short = a.getName().replace(/^.*\|/, '').replace(/^(Man|Female)_/, '');
    if (keep.includes(short) && !seen.has(short)) seen.add(short);
    else {
      a.dispose();
      dropped++;
    }
  }
  if (DROP[name]) for (const n of root.listNodes()) if (DROP[name].test(n.getName())) n.dispose();
  const simp = SIMPLIFY[name];
  await doc.transform(
    resample(),
    dedup(),
    prune(),
    ...(simp ? [weld(), simplify({ simplifier: MeshoptSimplifier, ratio: simp, error: 0.002 })] : []),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(f, doc);
  const size1 = statSync(f).size;
  before += size0;
  after += size1;
  console.log(`✔ ${f}  ${(size0 / 1024).toFixed(0)} → ${(size1 / 1024).toFixed(0)} KB${dropped ? `  (−${dropped} clips)` : ''}`);
}
console.log(`\ntotal ${(before / 1048576).toFixed(2)} → ${(after / 1048576).toFixed(2)} MB`);

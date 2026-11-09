// Optimise the .glb models in place: drop unused / duplicate animation clips, prune + dedup, then meshopt
// geometry compression (the app's GLTFLoaders register MeshoptDecoder). Textures: see scripts/shrink-glb.mjs.
// Usage: node scripts/optimize-glb.mjs [files...]   (default: public/models/*.glb public/chars/*.glb)
import { readdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// animation clips the app actually plays (after stripping "Armature|" and "Man_/Female_" prefixes)
const KEEP = {
  shiba: ['Walk', 'Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'],
  husky: ['Walk', 'Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'],
  frog: ['Frog_Jump', 'Frog_Idle'],
  man: ['Idle', 'Walk', 'Sitting', 'Clapping'],
  woman: ['Idle', 'Walk', 'Sitting', 'Clapping'],
  'woman-dress': ['Idle', 'Walk', 'Sitting', 'Clapping'],
};
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['public/models', 'public/chars'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.glb')).map((f) => `${d}/${f}`));

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
  await doc.transform(resample(), dedup(), prune(), reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(f, doc);
  const size1 = statSync(f).size;
  before += size0;
  after += size1;
  console.log(`✔ ${f}  ${(size0 / 1024).toFixed(0)} → ${(size1 / 1024).toFixed(0)} KB${dropped ? `  (−${dropped} clips)` : ''}`);
}
console.log(`\ntotal ${(before / 1048576).toFixed(2)} → ${(after / 1048576).toFixed(2)} MB`);

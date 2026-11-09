// Shrink textures embedded in .glb files (macOS `sips`, no extra installs). Usage: node scripts/shrink-glb.mjs <maxPx> files...
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [max, ...files] = process.argv.slice(2);
const pad4 = (n) => (n + 3) & ~3;
for (const f of files) {
  const b = readFileSync(f);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const binStart = 20 + jl + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jl));
  const imgViews = new Map((j.images || []).filter((i) => i.bufferView !== undefined).map((i) => [i.bufferView, i]));
  const dir = mkdtempSync(join(tmpdir(), 'glb-'));
  const parts = [];
  let off = 0;
  j.bufferViews.forEach((bv, idx) => {
    let data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const img = imgViews.get(idx);
    if (img && /png|jpeg/.test(img.mimeType ?? '')) {
      const p = join(dir, `${idx}.${img.mimeType.includes('png') ? 'png' : 'jpg'}`);
      writeFileSync(p, data);
      execFileSync('sips', ['-Z', String(max), p], { stdio: 'ignore' });
      data = readFileSync(p);
    }
    bv.byteOffset = off;
    bv.byteLength = data.length;
    parts.push(data, Buffer.alloc(pad4(data.length) - data.length));
    off = pad4(off + data.length);
  });
  const newBin = Buffer.concat(parts);
  j.buffers[0].byteLength = newBin.length;
  let js = Buffer.from(JSON.stringify(j));
  js = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + newBin.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  writeFileSync(f, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(newBin.length, 0x004e4942), newBin]));
  console.log(f, Math.round(b.length / 1024) + 'KB ->', Math.round((12 + 8 + js.length + 8 + newBin.length) / 1024) + 'KB');
}

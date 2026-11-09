// One-time: add a Royalties plugin (default 5%) to the stone + tree collections, paid to the tip recipient.
// Marketplaces that support Metaplex Core (Magic Eden, Tensor) then send that share of every resale to the hall.
// Usage: node scripts/set-royalties.mjs [bps]      (uses DEV_NET_SOL from .dev.vars, the collections' update authority)
import { readFileSync } from 'node:fs';
import { address } from '@solana/kit';
import { addRoyaltiesIx, sendAndConfirm, treasurySigner } from '../worker/core.ts';

const bps = Number(process.argv[2] ?? 500);
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const v = (k) => /"([^"]+)"/.exec(toml.split('\n').find((l) => l.startsWith(k + ' ')) ?? '')?.[1];
const treasury = await treasurySigner(vars.DEV_NET_SOL);
const creator = address(v('TIP_RECIPIENT'));
const rpc = 'https://api.devnet.solana.com';
for (const k of (process.env.ONLY ?? 'STONE_COLLECTION,TREE_COLLECTION,CUSHION_COLLECTION').split(',')) {
  if (!v(k)) {
    console.log(`- ${k} not in wrangler.toml`);
    continue;
  }
  try {
    const sig = await sendAndConfirm(rpc, treasury, [addRoyaltiesIx(address(v(k)), treasury, creator, bps)]);
    console.log(`✔ ${k} royalties ${bps / 100}% → ${creator}  ${sig}`);
  } catch (e) {
    console.log(`✘ ${k}: ${String(e).slice(0, 300)}`);
  }
}

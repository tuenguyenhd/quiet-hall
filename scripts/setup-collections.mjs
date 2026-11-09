// One-time: create the "Quiet Hall Stones" and "Quiet Hall Trees" Metaplex Core collections on devnet,
// using the treasury key DEV_NET_SOL from .dev.vars (never printed). Appends the collection addresses to .dev.vars.
// Usage: node scripts/setup-collections.mjs [publicBaseUrl]
import { readFileSync, appendFileSync } from 'node:fs';
import { generateKeyPairSigner, createSolanaRpc } from '@solana/kit';
import { createCollectionIx, sendAndConfirm, treasurySigner } from '../worker/core.ts';

const envFile = new URL('../.dev.vars', import.meta.url);
const vars = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
if (!vars.DEV_NET_SOL) throw new Error('DEV_NET_SOL missing in .dev.vars');
const BASE = process.argv[2] ?? 'https://quiet-hall.ted-233.workers.dev';
const RPC = 'https://api.devnet.solana.com';
const treasury = await treasurySigner(vars.DEV_NET_SOL);
console.log('treasury', treasury.address);
const bal = (await createSolanaRpc(RPC).getBalance(treasury.address).send()).value;
console.log('balance', Number(bal) / 1e9, 'SOL (devnet)');

for (const [key, name, kind] of [
  ['STONE_COLLECTION', 'Quiet Hall Stones', 'stone'],
  ['TREE_COLLECTION', 'Quiet Hall Trees', 'tree'],
  ['CUSHION_COLLECTION', 'Quiet Hall Founder Cushions', 'cushion'],
]) {
  if (vars[key]) {
    console.log(`${key} already set: ${vars[key]}`);
    continue;
  }
  const col = await generateKeyPairSigner();
  const sig = await sendAndConfirm(RPC, treasury, [createCollectionIx(col, treasury, treasury.address, name, `${BASE}/api/meta/${kind}/collection.json`)]);
  appendFileSync(envFile, `\n${key}=${col.address}`);
  console.log(`${key}=${col.address}  (tx ${sig})`);
}

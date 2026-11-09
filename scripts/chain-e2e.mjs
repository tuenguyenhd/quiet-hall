// Devnet chain checks (spec 006 T214/T220): royalties on both collections, and the hall follows NFT transfers.
// Transfers one stone the test wallet (DEV_NET_SOL) owns to a fresh address, then expects /api/spots to show the new owner.
// Usage: node scripts/chain-e2e.mjs [baseUrl]   (needs a stone owned by the test wallet: run items-e2e first)
import { readFileSync } from 'node:fs';
import { address, createSolanaRpc, generateKeyPairSigner, getAddressEncoder } from '@solana/kit';
import { assetOwners, sendAndConfirm, transferAssetIx, treasurySigner } from '../worker/core.ts';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const v = (k) => /"([^"]+)"/.exec(toml.split('\n').find((l) => l.startsWith(k + ' ')) ?? '')?.[1];
const RPC = 'https://api.devnet.solana.com';
const me = await treasurySigner(vars.DEV_NET_SOL);
let pass = 0, fail = 0;
const t = (name, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${d ? `  (${d})` : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// royalties plugin present on both collections (creator = tip recipient)
const rpc = createSolanaRpc(RPC);
const creator = Buffer.from(getAddressEncoder().encode(address(v('TIP_RECIPIENT'))));
for (const k of ['STONE_COLLECTION', 'TREE_COLLECTION']) {
  const acc = await rpc.getAccountInfo(address(v(k)), { encoding: 'base64' }).send();
  t(`${k} has royalties to the hall`, Buffer.from(acc.value.data[0], 'base64').includes(creator));
}

// owner reader
const spots = (await (await fetch(`${BASE}/api/spots`)).json());
const mine = Object.entries(spots.stone).find(([, s]) => s.owner === me.address && s.asset);
t('test wallet owns a stone with an NFT', !!mine, mine ? `#${Number(mine[0]) + 1}` : 'run items-e2e first');
if (mine) {
  const [n, s] = mine;
  const owners = await assetOwners(RPC, [s.asset]);
  t('reads owner from the asset account', owners.get(s.asset) === me.address);
  const to = (await generateKeyPairSigner()).address;
  const sig = await sendAndConfirm(RPC, me, [transferAssetIx(address(s.asset), address(v('STONE_COLLECTION')), me, to)]);
  t('NFT transferred on chain', (await assetOwners(RPC, [s.asset])).get(s.asset) === to, sig.slice(0, 12) + '…');
  let seen = '';
  for (let i = 0; i < 8 && seen !== to; i++) {
    await wait(i ? 22000 : 2000);
    seen = (await (await fetch(`${BASE}/api/spots?refresh=1`)).json()).stone[n]?.owner;
  }
  t('hall shows the new owner', seen === to, `${to.slice(0, 6)}…`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

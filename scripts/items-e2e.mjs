// Devnet end-to-end for hall items (spec 006 phase B): free lantern limit, paid lantern, buying a stone (real NFT mint).
// The buyer is the devnet treasury key DEV_NET_SOL from .dev.vars (never printed). Spends ~0.03 devnet SOL.
// Usage: node scripts/items-e2e.mjs [baseUrl]   (default http://localhost:5173)
//   SKIP=stone,lantern  skips parts to save devnet SOL (faucet: https://faucet.solana.com)
import { readFileSync } from 'node:fs';
import {
  AccountRole, address, appendTransactionMessageInstructions, createSolanaRpc, createTransactionMessage,
  getBase64EncodedWireTransaction, getUtf8Encoder, pipe, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, signBytes, signTransactionMessageWithSigners,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { treasurySigner, MPL_CORE } from '../worker/core.ts';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const host = new URL(BASE).host;
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const buyer = await treasurySigner(vars.DEV_NET_SOL);
const rpc = createSolanaRpc('https://api.devnet.solana.com');
let pass = 0, fail = 0;
const t = (name, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}${d ? `  (${d})` : ''}`); };
const j = async (path, body) => {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify(body) } : {});
  return { status: r.status, body: await r.json() };
};
const SKIP = new Set((process.env.SKIP ?? '').split(','));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bal = async () => Number((await rpc.getBalance(buyer.address).send()).value) / 1e9;
console.log(`buyer ${buyer.address}  balance ${await bal()} SOL (devnet)\n`);

// sign in (SIWS) as the buyer
const { body: { nonce } } = await j('/api/nonce');
const msg = getUtf8Encoder().encode(`${host} wants you to sign in with your Solana account:\n${buyer.address}\n\nSign in to Quiet Hall.\n\nURI: ${BASE}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`);
const sig = await signBytes(buyer.keyPair.privateKey, msg);
const v = await j('/api/verify', { address: buyer.address, message: Buffer.from(msg).toString('base64'), signature: Buffer.from(sig).toString('base64') });
t('sign in', v.status === 200);
const token = v.body.token;

async function pay(order) {
  const ix = getTransferSolInstruction({ source: buyer, destination: address(order.recipient), amount: BigInt(order.raw) });
  const ixRef = { ...ix, accounts: [...ix.accounts, { address: address(order.reference), role: AccountRole.READONLY }] };
  const { value: bh } = await rpc.getLatestBlockhash().send();
  const m = pipe(createTransactionMessage({ version: 0 }), (x) => setTransactionMessageFeePayerSigner(buyer, x), (x) => setTransactionMessageLifetimeUsingBlockhash(bh, x), (x) => appendTransactionMessageInstructions([ixRef], x));
  const s = await rpc.sendTransaction(getBase64EncodedWireTransaction(await signTransactionMessageWithSigners(m)), { encoding: 'base64' }).send();
  for (let i = 0; i < 45; i++) {
    await wait(2000);
    const c = await j('/api/tip/confirm', { id: order.id, signature: s });
    if (c.body.status === 'paid') return c.body;
  }
  return null;
}

const spots = (await j('/api/spots')).body;
if (!SKIP.has('stone')) {
// ---------- spots: buy the first free stone ----------
t('spots on sale (devnet)', spots.onSale === true, `price ${spots.prices.stone.SOL} SOL`);
const frees = [...Array(108).keys()].filter((i) => !spots.stone[i]);
const free = frees[Math.floor(Math.random() * frees.length)];
const anon = await j('/api/tip/order', { kind: 'stone', spot: free, name: 'Test', currency: 'SOL' });
t('anonymous cannot buy a stone', anon.status === 400, anon.body.error);
const order = await j('/api/tip/order', { kind: 'stone', spot: free, name: 'Quiet Tester', line: 'just breathe', currency: 'SOL', token });
t(`order stone #${free + 1}`, order.status === 200 && order.body.raw === String(spots.prices.stone.SOL * 1e9), `${order.body.amount} SOL`);
const dup = await j('/api/tip/order', { kind: 'stone', spot: free, name: 'Other', currency: 'SOL', token });
t('same spot is reserved for the first buyer', dup.status === 400, dup.body.error);
const paid = await pay(order.body);
t('stone paid + verified', !!paid);
const asset = paid?.spot?.asset;
t('NFT minted', !!asset, asset ?? paid?.spot?.mintError);
if (asset) {
  const acc = await rpc.getAccountInfo(address(asset), { encoding: 'base64' }).send();
  t('asset account owned by Metaplex Core', acc.value?.owner === MPL_CORE);
  const data = Buffer.from(acc.value.data[0], 'base64');
  t('asset owner = buyer', data.includes(Buffer.from((await import('@solana/kit')).getAddressEncoder().encode(buyer.address))));
}
const after = (await j('/api/spots')).body;
t('spot shows owner name', after.stone[free]?.name === 'Quiet Tester');
const meta = await j(`/api/meta/stone/${free}.json`);
t('metadata json', meta.body.name === `Quiet Hall Stone #${free + 1}` && meta.body.attributes.some((a) => a.value === 'Quiet Tester'));
const again = await j('/api/tip/order', { kind: 'stone', spot: free, name: 'Late', currency: 'SOL', token });
t('owned spot cannot be bought again', again.status === 400, again.body.error);

}

// ---------- lanterns over the hall socket ----------
const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?room=t${Date.now().toString(36)}`);
const msgs = [];
ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
await new Promise((r) => (ws.onopen = r));
const PID = `e2e${Date.now().toString(36)}`;
ws.send(JSON.stringify({ t: 'hello', color: 3, pid: PID, session: token }));
await wait(800);
ws.send(JSON.stringify({ t: 'lantern', wish: 0, name: 'Mom' }));
await wait(800);
const l1 = msgs.find((m) => m.t === 'lantern');
t('free lantern lit (1 min)', l1 && l1.l.tier === 'free' && Math.abs(l1.l.until - l1.l.at - 60000) < 1000);
ws.send(JSON.stringify({ t: 'lantern', wish: 1 }));
await wait(800);
t('second free lantern refused today', msgs.some((m) => m.t === 'lanternNo'));
if (!SKIP.has('lantern')) {
const lo = await j('/api/tip/order', { kind: 'lantern24', currency: 'SOL', token });
const lp = await pay(lo.body);
t('24 h lantern paid', !!lp, `${lo.body.amount} SOL`);
ws.send(JSON.stringify({ t: 'lantern', wish: 8, name: 'Ser', order: lo.body.id }));
await wait(1200);
const l2 = msgs.filter((m) => m.t === 'lantern').at(-1);
t('paid lantern lit (24 h)', l2?.l.tier === 'lantern24' && Math.abs(l2.l.until - l2.l.at - 86400000) < 1000);
ws.send(JSON.stringify({ t: 'lantern', wish: 8, order: lo.body.id }));
await wait(800);
t('paid order cannot light a second lantern', msgs.filter((m) => m.t === 'lanternNo').length >= 2);
}

// ---------- blessing (24 h, paid) ----------
const bo = await j('/api/tip/order', { kind: 'bless24', currency: 'SOL', token });
t('bless order price', bo.status === 200 && bo.body.amount === spots.prices.bless24.SOL, `${bo.body.amount} SOL`);
const bp = await pay(bo.body);
t('24 h blessing paid', !!bp);
ws.send(JSON.stringify({ t: 'bless', f: 0, order: bo.body.id }));
await wait(1500);
const bl = msgs.filter((m) => m.t === 'bl').at(-1);
t('blessed for 24 h', bl && bl.u - Date.now() > 86000000);
ws.send(JSON.stringify({ t: 'bless', f: 1, order: bo.body.id }));
await wait(1000);
t('bless order cannot be used twice', msgs.some((m) => m.t === 'blessNo'));

// ---------- pet (paid once, kept by visitor id + wallet) ----------
ws.send(JSON.stringify({ t: 'pet', k: 2 }));
await wait(1000);
t('pet locked before adopting', msgs.some((m) => m.t === 'petNo' && m.k === 2));
const po = await j('/api/tip/order', { kind: 'pet', pet: 2, pid: PID, currency: 'SOL', token });
t('pet order price', po.status === 200 && po.body.amount === spots.prices.pet.SOL, `${po.body.amount} SOL`);
const pp = await pay(po.body);
t('pet paid', !!pp);
ws.send(JSON.stringify({ t: 'pet', k: 2 }));
await wait(1500);
const pm = msgs.filter((m) => m.t === 'pets').at(-1);
t('pet adopted + worn', pm?.pets.includes(2) && pm.pt === 2);
ws.close();
// a new connection (same wallet, new visitor id) keeps the pet
const ws2 = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?room=t${Date.now().toString(36)}`);
const m2 = [];
ws2.onmessage = (e) => e.data !== 'pong' && m2.push(JSON.parse(e.data));
await new Promise((r) => (ws2.onopen = r));
ws2.send(JSON.stringify({ t: 'hello', color: 3, pet: 2, pid: `e2f${Date.now().toString(36)}`, session: token }));
await wait(1500);
const w2 = m2.find((m) => m.t === 'welcome');
t('pet comes back on another device (same wallet)', w2?.me.pets.includes(2) && w2.me.pt === 2);
ws2.close();

console.log(`\nbalance now ${await bal()} SOL\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

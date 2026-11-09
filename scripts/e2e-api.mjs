// End-to-end API check with a throwaway wallet: sign-in, profile, devnet tip.
// Usage: node scripts/e2e-api.mjs [baseUrl]   (default http://localhost:5173)
// For the tip step, fund a devnet wallet and pass it:  KEYPAIR=path/to/devnet-keypair.json node scripts/e2e-api.mjs
import {
  AccountRole, address, appendTransactionMessageInstructions, createSolanaRpc, createTransactionMessage,
  generateKeyPairSigner, getBase58Decoder, getBase64EncodedWireTransaction, lamports, pipe,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners,
  signBytes, getUtf8Encoder, createKeyPairSignerFromBytes,
} from '@solana/kit';
import { readFileSync } from 'node:fs';
import { getTransferSolInstruction } from '@solana-program/system';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const ORIGIN = BASE;
const host = new URL(BASE).host;
const j = async (path, body) => {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) } : { headers: { origin: ORIGIN } });
  return { status: r.status, body: await r.json() };
};
const b64 = (u8) => Buffer.from(u8).toString('base64');

const cfg = await j('/api/config'); console.log('config', cfg.body);
const kp = process.env.KEYPAIR
  ? await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(process.env.KEYPAIR, 'utf8'))))
  : await generateKeyPairSigner();
console.log('test wallet', kp.address);

// 1. sign in
const { body: { nonce } } = await j('/api/nonce');
const msg = `${host} wants you to sign in with your Solana account:\n${kp.address}\n\nSign in to Quiet Hall.\n\nURI: ${BASE}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
const msgBytes = getUtf8Encoder().encode(msg);
const sig = await signBytes(kp.keyPair.privateKey, msgBytes);
const v = await j('/api/verify', { address: kp.address, message: b64(msgBytes), signature: b64(sig) });
console.log('verify', v.status, { ...v.body, token: v.body.token ? v.body.token.slice(0, 12) + '…' : undefined });
const replay = await j('/api/verify', { address: kp.address, message: b64(msgBytes), signature: b64(sig) });
console.log('replay same nonce ->', replay.status, replay.body.error);
const bad = await j('/api/verify', { address: kp.address, message: b64(msgBytes), signature: b64(new Uint8Array(64)) });
console.log('bad signature ->', bad.status, bad.body.error);
const me = await j('/api/me', { token: v.body.token });
console.log('me', me.status, me.body);

// 2. devnet tip (needs airdrop; public faucet is rate limited)
const rpc = createSolanaRpc('https://api.devnet.solana.com');
if (!process.env.KEYPAIR) try {
  const as = await rpc.requestAirdrop(kp.address, lamports(200_000_000n)).send();
  console.log('airdrop requested', as);
} catch (e) { console.log('airdrop failed:', String(e.message ?? e).slice(0, 160)); }
let bal = 0n;
for (let i = 0; i < 20 && bal === 0n; i++) { await new Promise(r => setTimeout(r, 1500)); bal = (await rpc.getBalance(kp.address).send()).value; }
console.log('balance', bal);
if (bal === 0n) { console.log('SKIP tip: no devnet SOL (faucet limit). Re-run later or fund', kp.address); process.exit(0); }

const order = await j('/api/tip/order', { currency: 'SOL', amount: 0.01, token: v.body.token });
console.log('order', order.status, { id: order.body.id, reference: order.body.reference, raw: order.body.raw });
const ix = getTransferSolInstruction({ source: kp, destination: address(order.body.recipient), amount: BigInt(order.body.raw) });
const ixRef = { ...ix, accounts: [...ix.accounts, { address: address(order.body.reference), role: AccountRole.READONLY }] };
const { value: bh } = await rpc.getLatestBlockhash().send();
const m = pipe(createTransactionMessage({ version: 0 }), x => setTransactionMessageFeePayerSigner(kp, x), x => setTransactionMessageLifetimeUsingBlockhash(bh, x), x => appendTransactionMessageInstructions([ixRef], x));
const signed = await signTransactionMessageWithSigners(m);
const txSig = await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64' }).send();
console.log('sent', txSig);
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const c = await j('/api/tip/confirm', { id: order.body.id }); // no signature: server finds it by reference key
  if (c.body.status === 'paid') { console.log('confirmed by reference ->', c.body.status, 'payer', c.body.order.payer); break; }
  if (i === 24) console.log('not confirmed', c.body);
}
const reuse = await j('/api/tip/confirm', { id: (await j('/api/tip/order', { currency: 'SOL', amount: 0.01 })).body.id, signature: txSig });
console.log('reuse old signature for new order ->', reuse.body.status, reuse.body.reason ?? '');
console.log('me after tip', (await j('/api/me', { token: v.body.token })).body);

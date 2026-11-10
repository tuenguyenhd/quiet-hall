// Spike for edition-near.md "Signing in the Worker": one transaction carrying two
// function calls (mint_fren + post_prices), signed inside the Workers runtime.
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';

interface Env { NEAR_ACCOUNT: string; NEAR_RPC: string; NEAR_PRIVATE_KEY: string }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/spike') return new Response('GET /spike', { status: 404 });
    const started = Date.now();
    try {
      const provider = new JsonRpcProvider({ url: env.NEAR_RPC });
      const signer = KeyPairSigner.fromSecretKey(env.NEAR_PRIVATE_KEY as `ed25519:${string}`);
      const account = new Account(env.NEAR_ACCOUNT, provider, signer);
      const run = crypto.randomUUID().slice(0, 8);
      // a player id that has never existed on chain: hex of 32 random bytes
      const player = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const hour = Math.floor(Date.now() / 3_600_000) * 1000 + Math.floor(Math.random() * 1000); // unique, increasing-ish for the spike
      const gas = 30_000_000_000_000n;
      const res = await account.signAndSendTransaction({
        receiverId: env.NEAR_ACCOUNT,
        actions: [
          actions.functionCall('mint_fren', { owner: player, species: 'froggo', serial: Number(`${Date.now() % 100000}`), job_id: `worker-fren-${run}` }, gas, 0n),
          actions.functionCall('post_prices', { hour, quotes: [{ item: 'moon_rock', bid: 2, ask: 3 }], job_id: `worker-prices-${run}` }, gas, 0n),
        ],
      });
      const status = res.status as Record<string, unknown>;
      return Response.json({
        ok: 'SuccessValue' in status || 'SuccessReceiptId' in status,
        tx: res.transaction.hash,
        explorer: `https://explorer.testnet.near.org/transactions/${res.transaction.hash}`,
        player,
        status,
        ms: Date.now() - started,
      });
    } catch (e) {
      return Response.json({ ok: false, error: String((e as Error)?.stack ?? e), ms: Date.now() - started }, { status: 500 });
    }
  },
};

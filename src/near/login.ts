// Log in with NEAR via NEAR Connect (@hot-labs/near-connect), the NEAR equivalent of Seeker Connect.
// One step: the player picks a wallet in NEAR Connect's standard picker and approves ONE signed message
// (NEP-413: no transaction, no fee). The server checks it (worker/nearlogin.ts) and links the account.
// The wallet code loads only when the player taps "Log in with NEAR", so the first load stays small.
// The wallet list is a pinned copy (public/near-connect-manifest.json), not the live main branch.

export type LoginNetwork = 'mainnet' | 'testnet';

export interface LoginResult {
  ok: boolean;
  why?: string;
  account?: string;
  name?: string;
  pid?: string;
  switched?: boolean;
}

interface Challenge {
  nonce: string;
  message: string;
  recipient: string;
}

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** After a successful login: adopt the account's original visitor id (another device) and reload to rejoin as it. */
function applyLogin(r: LoginResult) {
  if (r.ok && r.pid) {
    try {
      localStorage.setItem('qh.pid', r.pid);
    } catch {
      /* private mode: this session still has the link */
    }
    location.reload();
  }
}

/**
 * Opens NEAR Connect's wallet picker for `network` and logs in with the chosen wallet.
 * Resolves when the server has verified the signature (then the page reloads), or with the reason it didn't.
 */
export async function loginWithNear(pid: string, network: LoginNetwork = 'mainnet'): Promise<LoginResult> {
  const ch = (await (await fetch(`/api/near/login-nonce?pid=${encodeURIComponent(pid)}`)).json()) as Challenge;
  const { NearConnector } = await import('@hot-labs/near-connect');
  const connector = new NearConnector({ network, manifest: '/near-connect-manifest.json', autoConnect: false });
  return new Promise<LoginResult>((resolve) => {
    let done = false;
    const finish = (r: LoginResult) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    connector.events.on('wallet:signInAndSignMessage', async ({ accounts }) => {
      const a = accounts[0];
      if (!a?.signedMessage) return finish({ ok: false, why: 'the wallet did not return a signed message' });
      const res = await fetch('/api/near/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pid, nonce: ch.nonce, network, accountId: a.accountId, publicKey: a.signedMessage.publicKey, signature: a.signedMessage.signature }),
      });
      const r = (await res.json().catch(() => ({ ok: false, why: `HTTP ${res.status}` }))) as LoginResult;
      // the game only needs the proof; the wallet session is not kept
      void connector.disconnect().catch(() => undefined);
      finish(r);
      if (r.ok) applyLogin(r);
    });
    connector
      .connect({ signMessageParams: { message: ch.message, recipient: ch.recipient, nonce: fromB64(ch.nonce) } })
      .catch((e: unknown) => finish({ ok: false, why: String((e as Error)?.message ?? e).slice(0, 140) || 'cancelled' }));
  });
}

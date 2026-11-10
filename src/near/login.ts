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
  /** Leaves given for this account's first login */
  bonus?: number;
  /** the player closed the picker or the wallet, or tapped Cancel */
  cancelled?: boolean;
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
      // the page reloads: the welcome-back toast (and any bonus) is shown after it
      sessionStorage.setItem('qh.justLoggedIn', JSON.stringify({ name: r.name ?? r.account ?? '', bonus: r.bonus ?? 0 }));
    } catch {
      /* private mode: this session still has the link */
    }
    location.reload();
  }
}

/** What the game shows while a wallet is open (NEAR Connect gives no event when an extension window is closed). */
export interface LoginUi {
  /** a wallet was picked and is now asking for the signature; `cancel` gives up on it */
  waiting(walletName: string, cancel: () => void): void;
  /** the player came back to the game while the wallet had not answered (likely closed it) */
  stalled(walletName: string): void;
  /** the attempt is over, whatever the result */
  done(): void;
}

/** a wallet that never answers is given up on after this long */
const WALLET_TIMEOUT_MS = 3 * 60_000;
/** after the game gets focus back, how long the wallet still has to answer before we ask the player */
const STALL_MS = 4000;

/**
 * Opens NEAR Connect's wallet picker for `network` and logs in with the chosen wallet.
 * Resolves when the server has verified the signature (then the page reloads), or with the reason it didn't:
 * closing the picker, closing the wallet, Cancel, or a timeout all resolve as `cancelled`, never hang.
 */
export async function loginWithNear(pid: string, network: LoginNetwork = 'mainnet', ui?: LoginUi): Promise<LoginResult> {
  const ch = (await (await fetch(`/api/near/login-nonce?pid=${encodeURIComponent(pid)}`)).json()) as Challenge;
  const { NearConnector } = await import('@hot-labs/near-connect');
  const connector = new NearConnector({ network, manifest: '/near-connect-manifest.json', autoConnect: false });
  // 1. the picker (closing it rejects: that is a cancel)
  let walletId: string;
  try {
    walletId = await connector.selectWallet({ features: { signInAndSignMessage: true } });
  } catch {
    return { ok: false, why: 'cancelled', cancelled: true };
  }
  const walletName = connector.wallets.find((w) => w.manifest.id === walletId)?.manifest.name ?? 'your wallet';

  // 2. the wallet asks for the signature. An extension window that is closed never answers, so we also stop on
  //    Cancel, on a timeout, and offer Cancel / Try again when the player comes back to the game without an answer.
  return new Promise<LoginResult>((resolve) => {
    let done = false;
    let stallTimer = 0;
    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(stallTimer);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
      connector.events.removeAllListeners('wallet:signInAndSignMessage');
      ui?.done();
    };
    const finish = (r: LoginResult) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(r);
    };
    const cancel = () => finish({ ok: false, why: 'cancelled', cancelled: true });
    const timeout = setTimeout(() => finish({ ok: false, why: `${walletName} did not answer. Try again.` }), WALLET_TIMEOUT_MS);
    const onBack = () => {
      if (document.visibilityState !== 'visible' || done) return;
      clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => !done && ui?.stalled(walletName), STALL_MS);
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    ui?.waiting(walletName, cancel);

    connector.events.on('wallet:signInAndSignMessage', async ({ accounts }) => {
      if (done) return;
      // NEAR Connect's shape is { accountId, publicKey, signedMessage: { publicKey, signature } }, but some executors
      // (HOT) pass the wallet's reply through as-is, with the signature at the top level: accept both
      const a = accounts[0] as (typeof accounts)[0] & { signature?: string };
      const sm = a?.signedMessage ?? (a?.signature ? { accountId: a.accountId, publicKey: a.publicKey, signature: a.signature } : null);
      if (!a || !sm?.signature) return finish({ ok: false, why: `${walletName} did not return a signed message` });
      clearTimeout(stallTimer);
      const res = await fetch('/api/near/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pid, nonce: ch.nonce, network, accountId: a.accountId ?? sm.accountId, publicKey: sm.publicKey ?? a.publicKey, signature: sm.signature, wallet: walletId }),
      });
      const r = (await res.json().catch(() => ({ ok: false, why: `HTTP ${res.status}` }))) as LoginResult;
      // the game only needs the proof; the wallet session is not kept
      void connector.disconnect().catch(() => undefined);
      finish(r);
      if (r.ok) applyLogin(r);
    });
    connector.connect({ walletId, signMessageParams: { message: ch.message, recipient: ch.recipient, nonce: fromB64(ch.nonce) } }).catch((e: unknown) => {
      const why = String((e as Error)?.message ?? e).slice(0, 140);
      finish(/reject|cancel|close|denied|user/i.test(why) ? { ok: false, why: 'cancelled', cancelled: true } : { ok: false, why: why || 'cancelled' });
    });
  });
}

// Log in with a NEAR wallet (NEP-413 signed message; no transaction, no fee). Server side: worker/nearlogin.ts.
// The wallet code is loaded only when the player taps "Log in", so the game's first load stays small.
// Wallets that work by redirect (MyNearWallet) come back to this page with #accountId=…&publicKey=…&signature=…;
// finishPendingLogin() completes those on the next load.

const PENDING = 'qh.nearLogin';
const NETWORK = 'testnet';

interface Challenge {
  nonce: string;
  message: string;
  recipient: string;
}
interface Pending extends Challenge {
  pid: string;
  callbackUrl: string;
}
export interface LoginResult {
  ok: boolean;
  why?: string;
  account?: string;
  name?: string;
  pid?: string;
  switched?: boolean;
}

const callbackUrl = () => location.origin + location.pathname;

async function submit(p: Pending, signed: { accountId: string; publicKey: string; signature: string }): Promise<LoginResult> {
  const r = await fetch('/api/near/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pid: p.pid, nonce: p.nonce, callbackUrl: p.callbackUrl, ...signed }),
  });
  return (await r.json().catch(() => ({ ok: false, why: `HTTP ${r.status}` }))) as LoginResult;
}

/** After a successful login: adopt the account's original visitor id (another device) and reload to rejoin as it. */
function applyLogin(r: LoginResult) {
  if (r.ok && r.pid) {
    try {
      localStorage.setItem('qh.pid', r.pid);
    } catch {
      /* private mode: the link still works for this session's receipts */
    }
    location.reload();
  }
}

/** On start-up: finish a login that went through a redirect wallet. Returns a message to show, or null. */
export async function finishPendingLogin(): Promise<string | null> {
  const h = new URLSearchParams(location.hash.slice(1));
  const accountId = h.get('accountId');
  const publicKey = h.get('publicKey');
  const signature = h.get('signature');
  if (!accountId && !h.get('error')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let p: Pending | null = null;
  try {
    p = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
    sessionStorage.removeItem(PENDING);
  } catch {
    p = null;
  }
  if (h.get('error')) return 'Login cancelled in the wallet.';
  if (!p || !accountId || !publicKey || !signature) return 'Login could not be finished. Please try again.';
  const r = await submit(p, { accountId, publicKey, signature: decodeURIComponent(signature) });
  if (!r.ok) return `Login failed: ${r.why}`;
  applyLogin(r);
  return null;
}

/** Loads the wallet selector (testnet) and returns the wallets a player can pick. */
export async function loadWallets() {
  // some wallet libraries expect Node globals: shim them just before loading the wallet code
  const g = globalThis as unknown as { global?: unknown; process?: { env: Record<string, string> }; Buffer?: unknown };
  g.global ??= globalThis;
  g.process ??= { env: {} };
  const { Buffer } = await import('buffer');
  g.Buffer ??= Buffer;
  const [{ setupWalletSelector }, { setupMyNearWallet }, { setupMeteorWallet }, { setupHotWallet }, { setupIntearWallet }, { setupHereWallet }] = await Promise.all([
    import('@near-wallet-selector/core'),
    import('@near-wallet-selector/my-near-wallet'),
    import('@near-wallet-selector/meteor-wallet'),
    import('@near-wallet-selector/hot-wallet'),
    import('@near-wallet-selector/intear-wallet'),
    import('@near-wallet-selector/here-wallet'),
  ]);
  const selector = await setupWalletSelector({
    network: NETWORK,
    modules: [setupMeteorWallet(), setupMyNearWallet(), setupHotWallet(), setupIntearWallet(), setupHereWallet()],
  });
  const wallets = selector.store.getState().modules.map((m) => ({ id: m.id, name: m.metadata.name, icon: m.metadata.iconUrl, available: m.metadata.available }));

  /** Ask the chosen wallet to sign the login message, then verify it on the server. */
  async function login(walletId: string, pid: string): Promise<LoginResult> {
    const ch = (await (await fetch(`/api/near/login-nonce?pid=${encodeURIComponent(pid)}`)).json()) as Challenge;
    const p: Pending = { ...ch, pid, callbackUrl: callbackUrl() };
    try {
      sessionStorage.setItem(PENDING, JSON.stringify(p));
    } catch {
      /* redirect wallets need this; popup and extension wallets don't */
    }
    const wallet = await selector.wallet(walletId);
    if (!wallet.signMessage) return { ok: false, why: `${walletId} can't sign a login message` };
    const signed = await wallet.signMessage({ message: ch.message, recipient: ch.recipient, nonce: Buffer.from(ch.nonce, 'base64'), callbackUrl: p.callbackUrl });
    if (!signed) return { ok: false, why: 'redirecting' }; // a redirect wallet: finishPendingLogin() completes it on return
    try {
      sessionStorage.removeItem(PENDING);
    } catch {
      /* ignore */
    }
    const r = await submit(p, signed);
    if (r.ok) applyLogin(r);
    return r;
  }

  return { wallets, login };
}

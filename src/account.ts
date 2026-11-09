// Optional wallet layer: sign in (SIWS) -> Seeker check -> gold light; profile sheet; tip jar.
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { apiGet, apiPost } from './api';
import { CLUSTER, connect, disconnect, listWallets, onWalletsChanged, registerWallets, short, signIn, toB64 } from './wallet';
import { confirmTip, sendTip, type Order } from './tip';
import type { Theme } from './world';

export interface Session {
  token: string;
  address: string;
  seeker: boolean;
  supporter: boolean;
}

export interface AccountHooks {
  toast(text: string, ms?: number): void;
  onSession(s: Session | null): void;
  invites(): number;
  nightUnlocked(): boolean;
  theme(): Theme;
  setTheme(t: Theme): void;
  room(): string;
  setRoom(r: string): void;
}

const $ = (id: string) => document.getElementById(id)!;
const KEY = 'qh.session';
const AMOUNTS: Record<string, number[]> = { SOL: [0.01, 0.05, 0.1], USDC: [1, 3, 5] };

function load(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return s && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}
function save(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

const errText = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  if (/reject|denied|cancel|declin/i.test(m)) return 'Cancelled in the wallet.';
  if (/insufficient|0x1\b|debit an account/i.test(m)) return 'Not enough funds in this wallet. Use the test faucet below.';
  return m.length > 140 ? m.slice(0, 140) + '…' : m;
};

export function setupAccount(h: AccountHooks) {
  let session = load();
  let wallet: Wallet | null = null;
  let account: WalletAccount | null = null;
  let afterConnect: (() => void) | null = null;
  let currency: 'SOL' | 'USDC' = 'SOL';
  let amount = AMOUNTS.SOL[1];

  registerWallets();
  onWalletsChanged(() => {
    if (!$('wallets').classList.contains('hidden')) renderWallets();
  });

  let walletWaiter: ((ok: boolean) => void) | null = null;
  const close = (id: string) => {
    $(id).classList.add('hidden');
    if (id === 'wallets' && walletWaiter) {
      const w = walletWaiter;
      walletWaiter = null;
      w(!!(wallet && account));
    }
  };
  const open = (id: string) => $(id).classList.remove('hidden');
  for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) {
    b.addEventListener('click', () => close(b.dataset.close!));
  }

  function renderPill() {
    const b = $('btn-wallet');
    b.classList.toggle('on', !!session);
    b.classList.toggle('gold', !!session?.seeker);
    $('wallet-text').textContent = session ? (session.seeker ? `Seeker · ${short(session.address)}` : short(session.address)) : '👛';
  }

  function setSession(s: Session | null) {
    session = s;
    save(s);
    renderPill();
    h.onSession(s);
  }

  // ---------- wallet picker ----------
  function renderWallets() {
    const list = $('wallet-list');
    list.replaceChildren();
    const ws = listWallets();
    $('wallet-empty').classList.toggle('hidden', ws.length > 0);
    for (const w of ws) {
      const b = document.createElement('button');
      const img = document.createElement('img');
      img.src = w.icon;
      img.alt = '';
      const span = document.createElement('span');
      span.textContent = w.name === 'Mobile Wallet Adapter' ? 'Wallet on this phone (Seeker)' : w.name;
      b.append(img, span);
      b.addEventListener('click', () => pick(w));
      list.appendChild(b);
    }
  }

  function openWallets(mode: 'signin' | 'connect', then?: () => void) {
    afterConnect = then ?? null;
    ($('wallet-status') as HTMLElement).textContent = '';
    $('wallet-status').classList.remove('err');
    $('wallets').dataset.mode = mode;
    renderWallets();
    open('wallets');
  }

  async function pick(w: Wallet) {
    const status = $('wallet-status');
    status.classList.remove('err');
    try {
      if ($('wallets').dataset.mode === 'connect') {
        status.textContent = 'Open your wallet to connect…';
        account = await connect(w);
        wallet = w;
        close('wallets');
        afterConnect?.();
        return;
      }
      status.textContent = 'Check your wallet to sign in (free)…';
      const { nonce } = await apiGet<{ nonce: string }>('/api/nonce');
      const r = await signIn(w, nonce);
      status.textContent = 'Checking for a Seeker…';
      const res = await apiPost<Omit<Session, 'token'> & { token: string }>('/api/verify', {
        address: r.account.address,
        message: toB64(r.message),
        signature: toB64(r.signature),
      });
      wallet = w;
      account = r.account;
      setSession(res);
      close('wallets');
      h.toast(
        res.seeker ? 'Verified Seeker ✦ Your light is gold now.' : 'Signed in. No Seeker found on this wallet, so your light stays as chosen.',
        5000,
      );
      afterConnect?.();
    } catch (e) {
      status.classList.add('err');
      status.textContent = errText(e);
    }
  }

  // ---------- profile ----------
  function renderProfile() {
    if (!session) return;
    $('pf-addr').textContent = short(session.address);
    $('pf-seeker').textContent = session.seeker ? '✦ Verified Seeker owner: gold light on' : 'No Seeker Genesis Token on this wallet';
    $('pf-supporter').textContent = session.supporter ? '✧ Supporter. Thank you!' : '';
    const sh = $('btn-seeker-hall');
    sh.classList.toggle('hidden', !session.seeker);
    sh.textContent = h.room() === 'seeker' ? 'Back to the main hall' : 'Enter the Seeker hall';
    const th = $('btn-theme');
    th.classList.toggle('hidden', !h.nightUnlocked());
    th.textContent = h.theme() === 'night' ? 'Day hall' : 'Night hall';
    const n = h.invites();
    $('pf-invites').textContent = h.nightUnlocked()
      ? `${n} friend${n === 1 ? '' : 's'} joined from your link. The Night hall is yours.`
      : `Invite friends: ${Math.min(n, 3)}/3 joined. 3 unlock the Night hall.`;
  }

  function openProfile() {
    renderProfile();
    open('profile');
  }

  $('btn-wallet').addEventListener('click', () => (session ? openProfile() : openWallets('signin', openProfile)));
  $('btn-seeker-hall').addEventListener('click', () => {
    h.setRoom(h.room() === 'seeker' ? 'main' : 'seeker');
    close('profile');
  });
  $('btn-theme').addEventListener('click', () => {
    h.setTheme(h.theme() === 'night' ? 'day' : 'night');
    renderProfile();
  });
  $('btn-signout').addEventListener('click', async () => {
    await disconnect(wallet);
    wallet = null;
    account = null;
    if (h.room() === 'seeker') h.setRoom('main');
    setSession(null);
    close('profile');
    h.toast('Signed out. Your light is still here.');
  });

  // ---------- tips ----------
  function renderAmounts() {
    const box = $('tip-amounts');
    box.replaceChildren();
    for (const a of AMOUNTS[currency]) {
      const b = document.createElement('button');
      b.textContent = `${a} ${currency}`;
      b.classList.toggle('on', a === amount);
      b.addEventListener('click', () => {
        amount = a;
        renderAmounts();
      });
      box.appendChild(b);
    }
  }
  $('tip-currency').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    currency = b.dataset.c as 'SOL' | 'USDC';
    amount = AMOUNTS[currency][1];
    for (const x of $('tip-currency').querySelectorAll('button')) x.classList.toggle('on', x === b);
    renderAmounts();
  });

  function openTip() {
    close('profile');
    if (!wallet || !account) {
      // wallets forget the connection on reload; reconnect (no new sign-in needed)
      openWallets('connect', openTip);
      return;
    }
    $('tip-cluster').textContent = CLUSTER === 'mainnet' ? '' : `${CLUSTER} test mode`;
    $('tip-faucets').classList.toggle('hidden', CLUSTER === 'mainnet');
    $('tip-status').textContent = '';
    renderAmounts();
    open('tipsheet');
  }
  $('btn-tip').addEventListener('click', openTip);

  let sending = false;
  $('btn-send-tip').addEventListener('click', async () => {
    if (sending || !wallet || !account) return;
    sending = true;
    const status = $('tip-status');
    status.classList.remove('err');
    try {
      status.textContent = 'Preparing…';
      const order = await apiPost<Order>('/api/tip/order', { currency, amount, token: session?.token });
      status.textContent = 'Approve the tip in your wallet…';
      const sig = await sendTip(wallet, account, order);
      status.textContent = 'Confirming on Solana…';
      if (await confirmTip(order.id, sig)) {
        if (session) {
          // the halo belongs to the paying wallet; refresh from the server
          const me = await apiPost<Session>('/api/me', { token: session.token }).catch(() => null);
          setSession({ ...session, supporter: me?.supporter ?? session.supporter });
        }
        close('tipsheet');
        h.toast(`Thank you ✧ ${amount} ${currency} received.`, 5000);
      } else {
        status.classList.add('err');
        status.textContent = 'Sent, but not confirmed yet. It will count once the network confirms it.';
      }
    } catch (e) {
      status.classList.add('err');
      status.textContent = errText(e);
    } finally {
      sending = false;
    }
  });

  // refresh the cached session in the background
  renderPill();
  if (session) {
    apiPost<Session>('/api/me', { token: session.token })
      .then((me) => setSession({ ...session!, seeker: me.seeker, supporter: me.supporter }))
      .catch((e) => {
        if (/signed out/i.test(String(e))) setSession(null);
      });
  }

  /** Resolves true once a wallet is connected (and signed in when `signIn`), false if the person closes the picker. */
  function ensureWallet(needSignIn: boolean): Promise<boolean> {
    if (wallet && account && (!needSignIn || session)) return Promise.resolve(true);
    return new Promise((resolve) => {
      walletWaiter = resolve;
      openWallets(needSignIn && !session ? 'signin' : 'connect', () => {
        walletWaiter = null;
        resolve(true);
      });
    });
  }

  /**
   * Buy an item (lantern / stone / tree): order -> wallet pays -> server verifies (and mints).
   * `say` shows progress. Returns the server's confirmation or null.
   */
  async function buy(
    item: { kind: string; currency?: 'SOL' | 'USDC'; spot?: number; name?: string; line?: string; pet?: number; pid?: string },
    say: (text: string, err?: boolean) => void,
  ) {
    const needSignIn = item.kind === 'stone' || item.kind === 'tree';
    if (!(await ensureWallet(needSignIn))) {
      say('Connect a wallet to continue.', true);
      return null;
    }
    try {
      say('Preparing…');
      const order = await apiPost<Order>('/api/tip/order', { currency: item.currency ?? 'SOL', amount: 0, token: session?.token, ...item });
      say('Approve in your wallet…');
      const sig = await sendTip(wallet!, account!, order);
      say(needSignIn ? 'Confirming and minting your NFT…' : 'Confirming on Solana…');
      const r = await confirmTip(order.id, sig);
      if (!r) say('Sent, but not confirmed yet. It will appear once the network confirms it.', true);
      return r ? { ...r, order } : null;
    } catch (e) {
      say(errText(e), true);
      return null;
    }
  }

  return {
    session: () => session,
    openProfile,
    openTip,
    buy,
  };
}

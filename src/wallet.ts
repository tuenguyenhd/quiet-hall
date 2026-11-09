// Wallet connection through the Wallet Standard:
//  - Mobile Wallet Adapter (Seeker's Seed Vault wallet and other Android wallets, in Chrome / the store app)
//  - Seeker Connect (one-tap "Connect with Seeker") when a relay domain is configured
//  - browser extension wallets on desktop (Phantom, Solflare, ...)
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, StandardDisconnect, type StandardConnectFeature, type StandardDisconnectFeature } from '@wallet-standard/features';
import {
  SolanaSignIn,
  SolanaSignMessage,
  type SolanaSignInFeature,
  type SolanaSignMessageFeature,
} from '@solana/wallet-standard-features';
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';
import { registerSeekerConnect } from '@solana-mobile/seeker-connect-wallet-standard';

export const CLUSTER = (import.meta.env.VITE_SOLANA_CLUSTER as string | undefined) ?? 'devnet';
export const CHAIN = `solana:${CLUSTER}` as const;
const STATEMENT = 'Sign in to Quiet Hall. This is free and does not move any funds.';

let registered = false;
export function registerWallets() {
  if (registered) return;
  registered = true;
  const identity = { name: 'Quiet Hall', uri: location.origin, icon: '/icon-192.png' };
  try {
    registerMwa({
      appIdentity: identity,
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ['solana:devnet', 'solana:mainnet'],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
  } catch (e) {
    console.warn('MWA not available', e);
  }
  const relay = import.meta.env.VITE_SEEKER_RELAY as string | undefined;
  if (relay) {
    try {
      registerSeekerConnect({ identity, relayDomain: relay, chain: CHAIN as 'solana:devnet' });
    } catch (e) {
      console.warn('Seeker Connect not available', e);
    }
  }
}

/** Wallets that can connect and sign in on Solana. Seeker Connect / MWA first. */
export function listWallets(): Wallet[] {
  const rank = (w: Wallet) => (w.name === 'Seeker Connect' ? 0 : w.name.includes('Mobile Wallet Adapter') ? 1 : 2);
  return getWallets()
    .get()
    .filter((w) => StandardConnect in w.features && w.chains.some((c) => c.startsWith('solana:')))
    .sort((a, b) => rank(a) - rank(b));
}

export function onWalletsChanged(cb: () => void) {
  const api = getWallets();
  api.on('register', cb);
  api.on('unregister', cb);
}

export async function connect(w: Wallet): Promise<WalletAccount> {
  const { accounts } = await (w.features as StandardConnectFeature)[StandardConnect].connect();
  const acc = accounts[0] ?? w.accounts[0];
  if (!acc) throw new Error('The wallet did not share an account');
  return acc;
}

export async function disconnect(w: Wallet | null) {
  try {
    if (w && StandardDisconnect in w.features) await (w.features as StandardDisconnectFeature)[StandardDisconnect].disconnect();
  } catch {
    /* ignore */
  }
}

/** Sign-In-With-Solana. Uses the wallet's native sign-in when offered, otherwise signMessage. */
export async function signIn(w: Wallet, nonce: string): Promise<{ account: WalletAccount; message: Uint8Array; signature: Uint8Array }> {
  const domain = location.host;
  const issuedAt = new Date().toISOString();
  if (SolanaSignIn in w.features) {
    const [out] = await (w.features as SolanaSignInFeature)[SolanaSignIn].signIn({
      domain,
      statement: STATEMENT,
      nonce,
      issuedAt,
      uri: location.origin,
      version: '1',
    });
    return { account: out.account, message: out.signedMessage, signature: out.signature };
  }
  if (!(SolanaSignMessage in w.features)) throw new Error('This wallet cannot sign in');
  const account = await connect(w);
  const text =
    `${domain} wants you to sign in with your Solana account:\n${account.address}\n\n${STATEMENT}\n\n` +
    `URI: ${location.origin}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
  const [out] = await (w.features as SolanaSignMessageFeature)[SolanaSignMessage].signMessage({
    account,
    message: new TextEncoder().encode(text),
  });
  return { account, message: out.signedMessage, signature: out.signature };
}

export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function toB64(b: Uint8Array) {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

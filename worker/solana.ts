// On-chain reads: Seeker Genesis Token (mainnet, read-only) and tip verification (devnet for now).
import { address, createSolanaRpc } from '@solana/kit';
import { getSeekerGenesisTokens } from '@solana-mobile/skr-genesis-token';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

/** Mint addresses of every Seeker Genesis Token the wallet holds ([] = not a Seeker owner). */
/** Server-side RPC URL. Uses Helius when a key is set (public RPC refuses Cloudflare Workers). */
export function serverRpc(env: { HELIUS_API_KEY?: string; SOLANA_CLUSTER: string; SOLANA_RPC: string; MAINNET_RPC: string }, which: 'cluster' | 'mainnet') {
  const k = env.HELIUS_API_KEY?.trim();
  if (!k) return which === 'mainnet' ? env.MAINNET_RPC : env.SOLANA_RPC;
  const net = which === 'mainnet' || env.SOLANA_CLUSTER === 'mainnet' ? 'mainnet' : 'devnet';
  return `https://${net}.helius-rpc.com/?api-key=${encodeURIComponent(k)}`;
}

export async function seekerMints(mainnetRpc: string, owner: string): Promise<string[]> {
  const rpc = createSolanaRpc(mainnetRpc);
  const tokens = await getSeekerGenesisTokens(rpc, address(owner), { abortSignal: AbortSignal.timeout(8000) });
  return tokens.map((t) => t.mint);
}

export async function associatedTokenAccount(owner: string, mint: string) {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata as string;
}

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`rpc ${method} ${r.status}`);
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result ?? null;
}

/** Solana Pay-style lookup: the first successful transaction that included the order's reference key. */
export async function signatureForReference(url: string, reference: string) {
  const r = await rpcCall<{ signature: string; err: unknown }[]>(url, 'getSignaturesForAddress', [
    reference,
    { limit: 5, commitment: 'confirmed' },
  ]);
  return r?.find((x) => !x.err)?.signature ?? null;
}

export interface TipCheck {
  currency: 'SOL' | 'USDC';
  reference: string;
  recipient: string;
  raw: string; // smallest units
  mint?: string;
  recipientAta?: string;
}

type ParsedIx = { program?: string; parsed?: { type: string; info: Record<string, unknown> } };

/** Confirms that `signature` paid at least the order amount to the recipient and carried the reference key. */
export async function verifyTip(url: string, signature: string, o: TipCheck): Promise<{ ok: true; payer: string } | { ok: false; reason: string }> {
  const tx = await rpcCall<{
    meta: { err: unknown; innerInstructions?: { instructions: ParsedIx[] }[] } | null;
    transaction: { message: { accountKeys: ({ pubkey: string } | string)[]; instructions: ParsedIx[] } };
  }>(url, 'getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  if (!tx) return { ok: false, reason: 'not_found' };
  if (!tx.meta || tx.meta.err) return { ok: false, reason: 'failed' };
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  if (!keys.includes(o.reference)) return { ok: false, reason: 'no_reference' };
  const ixs = [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap((i) => i.instructions)];
  const need = BigInt(o.raw);
  const paid = ixs.some((ix) => {
    const p = ix.parsed;
    if (!p) return false;
    if (o.currency === 'SOL') {
      return ix.program === 'system' && p.type === 'transfer' && p.info.destination === o.recipient && BigInt(String(p.info.lamports)) >= need;
    }
    const amt = (p.info.tokenAmount as { amount?: string } | undefined)?.amount;
    return (
      ix.program === 'spl-token' &&
      p.type === 'transferChecked' &&
      p.info.mint === o.mint &&
      p.info.destination === o.recipientAta &&
      amt !== undefined &&
      BigInt(amt) >= need
    );
  });
  if (!paid) return { ok: false, reason: 'wrong_transfer' };
  return { ok: true, payer: keys[0] };
}

// "Support the Hall" tips: server creates an order with a unique reference key (Solana Pay pattern),
// the wallet signs and sends a transfer that includes that key, the server verifies it on-chain.
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Base64EncodedWireTransaction,
  type Instruction,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignTransactionFeature,
} from '@solana/wallet-standard-features';
import { apiPost, apiUrl } from './api';

export interface Order {
  id: string;
  reference: string;
  recipient: string;
  currency: 'SOL' | 'USDC' | 'SKR';
  amount: number;
  raw: string;
  decimals: number;
  mint?: string;
  recipientAta?: string;
  cluster: string;
  expiresAt: number;
}

export const RPC: Record<string, string> = {
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
};

function withReference(ix: Instruction, reference: string): Instruction {
  return { ...ix, accounts: [...(ix.accounts ?? []), { address: address(reference), role: AccountRole.READONLY }] };
}

/** Builds the transfer, asks the wallet to sign + send it, returns the transaction signature. */
export async function sendTip(w: Wallet, account: WalletAccount, o: Order): Promise<string> {
  // blockhash + send go through the hall server's RPC (public RPC throttles browsers, esp. mainnet)
  const rpc = createSolanaRpc(apiUrl('/api/rpc'));
  const payer = createNoopSigner(address(account.address));
  let ixs: Instruction[];
  if (o.currency === 'SOL') {
    ixs = [
      withReference(
        getTransferSolInstruction({ source: payer, destination: address(o.recipient), amount: BigInt(o.raw) }),
        o.reference,
      ),
    ];
  } else {
    const mint = address(o.mint!);
    const [source] = await findAssociatedTokenPda({ owner: payer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const destination = address(o.recipientAta!);
    ixs = [
      getCreateAssociatedTokenIdempotentInstruction({ payer, ata: destination, owner: address(o.recipient), mint }),
      withReference(
        getTransferCheckedInstruction({ source, mint, destination, authority: payer, amount: BigInt(o.raw), decimals: o.decimals }),
        o.reference,
      ),
    ];
  }
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const bytes = new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
  const chain = `solana:${o.cluster}` as `${string}:${string}`;

  if (SolanaSignAndSendTransaction in w.features) {
    const [r] = await (w.features as SolanaSignAndSendTransactionFeature)[SolanaSignAndSendTransaction].signAndSendTransaction({
      account,
      chain,
      transaction: bytes,
    });
    return getBase58Decoder().decode(r.signature);
  }
  if (!(SolanaSignTransaction in w.features)) throw new Error('This wallet cannot send transactions');
  const [s] = await (w.features as SolanaSignTransactionFeature)[SolanaSignTransaction].signTransaction({
    account,
    chain,
    transaction: bytes,
  });
  const wire = getBase64Decoder().decode(s.signedTransaction) as Base64EncodedWireTransaction;
  return await rpc.sendTransaction(wire, { encoding: 'base64' }).send();
}

/** Polls the server until it has verified the payment on-chain (max ~90 s). Returns the server's answer or null. */
export async function confirmTip(id: string, signature: string | null): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < 45; i++) {
    const r = await apiPost<Record<string, unknown>>('/api/tip/confirm', { id, signature }).catch(() => ({ status: 'pending' }));
    if (r.status === 'paid') return r;
    if (r.status === 'expired' || r.status === 'unknown') return null;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

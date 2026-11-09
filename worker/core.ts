// Minimal Metaplex Core client (CreateV1 / CreateCollectionV1) built from the official IDL
// (github.com/metaplex-foundation/mpl-core idls/mpl_core.json, shank, program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d).
// Borsh layout: u8 discriminator, then args; string = u32 LE length + UTF-8; Option = u8 tag.
// Optional accounts that are absent are passed as the program id (shank convention).
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';

export const MPL_CORE = address('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const SYSTEM = address('11111111111111111111111111111111');

function str(s: string) {
  const b = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + b.length);
  new DataView(out.buffer).setUint32(0, b.length, true);
  out.set(b, 4);
  return out;
}
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export function createCollectionIx(collection: KeyPairSigner, payer: KeyPairSigner, updateAuthority: Address, name: string, uri: string): Instruction {
  return {
    programAddress: MPL_CORE,
    accounts: [
      { address: collection.address, role: AccountRole.WRITABLE_SIGNER, signer: collection },
      { address: updateAuthority, role: AccountRole.READONLY },
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer },
      { address: SYSTEM, role: AccountRole.READONLY },
    ],
    data: cat(new Uint8Array([1]), str(name), str(uri), new Uint8Array([0])),
  } as Instruction;
}

/** Mint one asset into `collection`, owned by `owner`; `authority` = collection update authority. */
export function createAssetIx(
  asset: KeyPairSigner,
  collection: Address,
  authority: KeyPairSigner,
  payer: KeyPairSigner,
  owner: Address,
  name: string,
  uri: string,
): Instruction {
  return {
    programAddress: MPL_CORE,
    accounts: [
      { address: asset.address, role: AccountRole.WRITABLE_SIGNER, signer: asset },
      { address: collection, role: AccountRole.WRITABLE },
      { address: authority.address, role: AccountRole.READONLY_SIGNER, signer: authority },
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer },
      { address: owner, role: AccountRole.READONLY },
      { address: MPL_CORE, role: AccountRole.READONLY }, // updateAuthority: none (collection is the authority)
      { address: SYSTEM, role: AccountRole.READONLY },
      { address: MPL_CORE, role: AccountRole.READONLY }, // logWrapper: none
    ],
    data: cat(new Uint8Array([0, 0]), str(name), str(uri), new Uint8Array([0])),
  } as Instruction;
}

export async function treasurySigner(secretBase58: string) {
  return createKeyPairSignerFromBytes(new Uint8Array(getBase58Encoder().encode(secretBase58.trim())));
}

/** Signs with every signer in the instructions, sends, and waits for "confirmed" (polling; no websockets needed). */
export async function sendAndConfirm(rpcUrl: string, payer: KeyPairSigner, ixs: Instruction[], timeoutMs = 45000) {
  const rpc = createSolanaRpc(rpcUrl);
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const sig = await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const st = value[0];
    if (st?.err) throw new Error(`transaction failed: ${JSON.stringify(st.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return sig as string;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`not confirmed in time: ${sig}`);
}

export async function mintSpotAsset(opts: {
  rpcUrl: string;
  treasury: KeyPairSigner;
  collection: string;
  owner: string;
  name: string;
  uri: string;
}) {
  const asset = await generateKeyPairSigner();
  const ix = createAssetIx(asset, address(opts.collection), opts.treasury, opts.treasury, address(opts.owner), opts.name, opts.uri);
  const sig = await sendAndConfirm(opts.rpcUrl, opts.treasury, [ix]);
  return { asset: asset.address as string, sig };
}

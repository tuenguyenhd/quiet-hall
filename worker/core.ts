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
  getAddressEncoder,
  getBase58Decoder,
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

/** TransferV1: move an asset to `newOwner` (the current owner signs as authority). */
export function transferAssetIx(asset: Address, collection: Address, owner: KeyPairSigner, newOwner: Address): Instruction {
  return {
    programAddress: MPL_CORE,
    accounts: [
      { address: asset, role: AccountRole.WRITABLE },
      { address: collection, role: AccountRole.READONLY },
      { address: owner.address, role: AccountRole.WRITABLE_SIGNER, signer: owner }, // payer
      { address: owner.address, role: AccountRole.READONLY_SIGNER, signer: owner }, // authority
      { address: newOwner, role: AccountRole.READONLY },
      { address: MPL_CORE, role: AccountRole.READONLY }, // systemProgram: none
      { address: MPL_CORE, role: AccountRole.READONLY }, // logWrapper: none
    ],
    data: new Uint8Array([14, 0]), // compressionProof: None
  } as Instruction;
}

/** AddCollectionPluginV1(Royalties): marketplaces pay `bps` (e.g. 500 = 5%) of each resale to `creator`. */
export function addRoyaltiesIx(collection: Address, authority: KeyPairSigner, creator: Address, bps: number): Instruction {
  const data = new Uint8Array(1 + 1 + 2 + 4 + 33 + 1 + 1);
  const dv = new DataView(data.buffer);
  let o = 0;
  data[o++] = 3; // AddCollectionPluginV1
  data[o++] = 0; // Plugin::Royalties
  dv.setUint16(o, bps, true);
  o += 2;
  dv.setUint32(o, 1, true); // one creator
  o += 4;
  data.set(getAddressEncoder().encode(creator), o);
  o += 32;
  data[o++] = 100; // creator gets 100% of royalties
  data[o++] = 0; // RuleSet::None
  data[o++] = 0; // initAuthority: None
  return {
    programAddress: MPL_CORE,
    accounts: [
      { address: collection, role: AccountRole.WRITABLE },
      { address: authority.address, role: AccountRole.WRITABLE_SIGNER, signer: authority }, // payer
      { address: authority.address, role: AccountRole.READONLY_SIGNER, signer: authority }, // authority
      { address: SYSTEM, role: AccountRole.READONLY },
      { address: MPL_CORE, role: AccountRole.READONLY }, // logWrapper: none
    ],
    data,
  } as Instruction;
}

/**
 * Current owners of Core assets, read straight from their accounts (AssetV1: key u8, then owner pubkey).
 * Works on any RPC. Missing / non-Core accounts are left out.
 */
export async function assetOwners(rpcUrl: string, assets: string[]): Promise<Map<string, string>> {
  const rpc = createSolanaRpc(rpcUrl);
  const dec = getBase58Decoder();
  const out = new Map<string, string>();
  for (let i = 0; i < assets.length; i += 100) {
    const batch = assets.slice(i, i + 100);
    const { value } = await rpc
      .getMultipleAccounts(batch.map((a) => address(a)), { encoding: 'base64', dataSlice: { offset: 0, length: 33 }, commitment: 'confirmed' })
      .send();
    value.forEach((acc, j) => {
      if (!acc || acc.owner !== MPL_CORE) return;
      const bytes = Uint8Array.from(atob(acc.data[0]), (c) => c.charCodeAt(0));
      if (bytes[0] !== 1) return; // Key::AssetV1
      out.set(batch[j], dec.decode(bytes.slice(1, 33)));
    });
  }
  return out;
}

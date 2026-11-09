// Checks the Seeker Genesis Token lookup against mainnet. Usage: node scripts/check-seeker.mjs [wallet]
import { address, createSolanaRpc } from '@solana/kit';
import { getSeekerGenesisTokens } from '@solana-mobile/skr-genesis-token';
const rpc = createSolanaRpc(process.env.MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com');
let owner = process.argv[2];
if (!owner) {
  // owner of the example SGT from the Solana Mobile docs
  const big = await rpc.getTokenLargestAccounts(address('5mXbkqKz883aufhAsx3p5Z1NcvD2ppZbdTTznM6oUKLj')).send();
  const acc = await rpc.getAccountInfo(big.value[0].address, { encoding: 'jsonParsed' }).send();
  owner = acc.value.data.parsed.info.owner;
}
const t0 = Date.now();
const tokens = await getSeekerGenesisTokens(rpc, address(owner));
console.log('owner', owner, '-> SGTs:', tokens.map(t => `${t.mint} #${t.memberNumber}`), `${Date.now() - t0}ms`);
const none = await getSeekerGenesisTokens(rpc, address('5g1qkWYJrrRFhEWtiFQ6sCKoCi9hNARcPymwNxjcFudb'));
console.log('tip wallet -> SGTs:', none.length);

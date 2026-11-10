// Check a Market Cup round yourself: the setup and results the game published must hash to what the NEAR
// contract stored (setup committed BEFORE the round opened, results at settlement).
// Usage: node scripts/verify-round.mjs <gameUrl> <roundId> [rpcUrl]
//   e.g. node scripts/verify-round.mjs https://quiet-hall-near.<account>.workers.dev 20261110-090000
import { createHash } from 'node:crypto';
const [BASE, ID, RPC = 'https://test.rpc.fastnear.com'] = process.argv.slice(2);
if (!BASE || !ID) {
  console.log('usage: node scripts/verify-round.mjs <gameUrl> <roundId> [rpcUrl]');
  process.exit(2);
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const game = await (await fetch(`${BASE.replace(/\/$/, '')}/api/near/round?id=${ID}`)).json();
if (game.error) throw new Error(game.error);
const contract = game.chain.contract;
const view = await (
  await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: 'round', args_base64: Buffer.from(JSON.stringify({ round_id: ID })).toString('base64') },
    }),
  })
).json();
const chain = JSON.parse(Buffer.from(view.result?.result ?? []).toString() || 'null');
let ok = true;
const line = (c, msg) => { ok &&= c; console.log(c ? '✔' : '✘', msg); };
console.log(`round ${ID} · contract ${contract}`);
line(!!chain, 'the round exists on chain');
line(sha(game.setup) === game.setup_hash, 'sha256(published setup) = the game\'s setup hash');
line(chain?.setup_hash === game.setup_hash, 'the game\'s setup hash = the hash committed on chain before the round');
if (game.status === 'settled') {
  line(sha(game.resultsText) === game.results_hash, 'sha256(published results) = the game\'s results hash');
  line(chain?.results_hash === game.results_hash, 'the results hash = the one recorded on chain at settlement');
  line(chain?.setup === game.setup, 'the setup revealed on chain = the published setup');
} else console.log('· round not settled yet: results will be checkable after it ends');
for (const j of game.chain.jobs ?? []) console.log(`  ${j.method.padEnd(13)} ${j.status.padEnd(6)} ${j.tx ? `https://explorer.testnet.near.org/transactions/${j.tx}` : ''}`);
process.exit(ok ? 0 : 1);

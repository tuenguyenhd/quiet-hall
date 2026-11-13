#!/bin/sh
# One command for every NEAR edition test, from a fresh clone, no secrets, no Cloudflare login:
#   npm run test:near
# It starts a throwaway local Worker with a fast clock (1 game minute = 200 ms) and the chain mirror in mock mode,
# runs every suite against it, prints a summary and stops the Worker. The keys below are local test values only.
set -u
PORT=${PORT:-8899}
BASE="http://127.0.0.1:$PORT"
DIR=$(mktemp -d)
LOG="$DIR/worker.log"
npx wrangler dev -c wrangler.near.toml --port "$PORT" --ip 127.0.0.1 --persist-to "$DIR/state" \
  --var MINUTE_MS:200 --var NEAR_MIRROR_MODE:mock --var LOAD_TEST_KEY:localkey \
  --var CAMPAIGN_ADMIN_KEY:localadmin --var LLM_MODE:mock > "$LOG" 2>&1 &
WPID=$!
trap 'kill $WPID 2>/dev/null; rm -rf "$DIR"' EXIT
i=0
until curl -s -m 2 -o /dev/null "$BASE/api/near/campaigns"; do
  i=$((i + 1))
  if [ $i -gt 90 ]; then echo "Worker did not start; log:"; tail -20 "$LOG"; exit 1; fi
  sleep 1
done
FAIL=0
run() {
  name=$1; shift
  printf '%-10s ' "$name"
  out=$(node "$@" 2>&1); code=$?
  echo "$out" | tail -1
  if [ $code -ne 0 ]; then FAIL=1; echo "$out" | grep '✘'; fi
}
run economy  scripts/near-economy-test.mjs  "$BASE" localkey
run valley   scripts/near-valley-test.mjs   "$BASE" localkey
run market   scripts/near-market-test.mjs   "$BASE" localkey
run duel     scripts/near-duel-test.mjs     "$BASE" localkey
run campaign scripts/near-campaign-test.mjs "$BASE" localkey localadmin
run mcp      scripts/near-mcp-test.mjs      "$BASE" localadmin
if [ $FAIL -ne 0 ]; then echo "SOME SUITES FAILED"; exit 1; fi
echo "ALL NEAR SUITES PASSED"

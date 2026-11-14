#!/bin/sh
# Fast-forward economy simulation, from a fresh clone, no secrets:  npm run sim:near
# Starts a throwaway local Worker (1 game minute = 50 ms, mock chain, plain trading rules instead of the AI),
# runs scripts/near-sim.mjs against it and stops the Worker.
set -u
PORT=${PORT:-8898}
BASE="http://127.0.0.1:$PORT"
DIR=$(mktemp -d)
npx wrangler dev -c wrangler.near.toml --port "$PORT" --ip 127.0.0.1 --persist-to "$DIR/state" \
  --var MINUTE_MS:50 --var NEAR_MIRROR_MODE:mock --var LOAD_TEST_KEY:localkey --var LLM_MODE:mock > "$DIR/worker.log" 2>&1 &
WPID=$!
trap 'kill $WPID 2>/dev/null; rm -rf "$DIR"' EXIT
i=0
until curl -s -m 2 -o /dev/null "$BASE/api/near/campaigns"; do
  i=$((i + 1))
  if [ $i -gt 90 ]; then echo "Worker did not start; log:"; tail -20 "$DIR/worker.log"; exit 1; fi
  sleep 1
done
MINUTE_MS=50 node scripts/near-sim.mjs "$BASE" localkey "${1:-24}"

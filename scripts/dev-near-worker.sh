#!/bin/sh
# Starts the NEAR edition Worker for `npm run dev:near`.
# With .dev.vars.near (your own TEST contract key + secrets) it writes receipts to NEAR testnet;
# without it (a fresh clone) it runs in mock mode: the whole game works, receipts are marked "mock".
if [ -f .dev.vars.near ]; then
  exec wrangler dev -c wrangler.near.toml --env-file .dev.vars.near --port 8788 --ip 127.0.0.1 "$@"
fi
echo "[near] no .dev.vars.near: mock mode (no chain writes)"
exec wrangler dev -c wrangler.near.toml --port 8788 --ip 127.0.0.1 --var NEAR_MIRROR_MODE:mock "$@"

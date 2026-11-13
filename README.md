# Quiet Hall

> **NEAR Hackathon entry (branch `near-hackathon`):** see [NEAR.md](NEAR.md): rest after a trading day in a calm 3D world. Rescue meme pets together, play a free trading game whose fairness anyone can check on NEAR, and collect sponsored drops an AI agent launched with one prompt (MCP). Run it with `npm run dev:near`; test it with `npm run test:near`.


A shared meditation space: walk into a calm hall, see other people's lights, sit together in silence.
Web app (Vite + Three.js) + Cloudflare Worker / Durable Object for live presence.
Later phases wrap the same web app as a Trusted Web Activity for the Seeker dApp Store.

## Phase 1 (this build)
- 3D hall: stone path, lanterns, pond, bell pavilion, hall with cushions and a singing bowl. All shapes and
  sounds are generated in code (no external assets yet).
- Join with one tap (no account). Pick a light colour.
- Walk: tap the ground (desktop: click or WASD/arrows). Drag = look around. Pinch / mouse wheel = zoom. Q/E = turn.
- Tap a cushion to walk there and sit. Tap the bell or bowl to ring it (others hear it).
- Sit: 3/5/10/20 min or open-ended. The screen dims to a breathing circle (4 s in, 6 s out); 3D rendering pauses.
- Bow / Greet emotes. Live count of people here and sitting, minutes sat together today.
- Group bell rings for everyone at the top of every hour (server clock). Test with `?bell=2` (every 2 min).
- Works without a server (shows "Offline").

## Phase 2
- Fonts: Zen Old Mincho (headings) + Zen Maru Gothic (text), self-hosted, SIL OFL (`public/fonts`).
- Works offline once visited (service worker): hall, timer, breathing, sounds. Installable ("Install app").
- Share card after a sit (image + "sit with me" link) using the Android share sheet; falls back to download + copy.
- Invite links: `/?with=<visitor id>`. The friend appears next to you and both rings glow. No accounts.
- World Sit: every day at 20:00 UTC everyone sits for 10 min (20-min join window, counted on the server).
  Test the client with `?world=HH:MM` (UTC); test server counting with `WORLD_SIT="HH:MM"` in `.dev.vars`.

## Phase 3 (devnet)
- Optional wallet: Mobile Wallet Adapter (Seeker / Android wallets in Chrome), desktop extension wallets,
  Seeker Connect when `VITE_SEEKER_RELAY` is set (Solana Mobile's free relay requires accepting their terms).
- Sign-In-With-Solana -> server checks the Seeker Genesis Token on mainnet (read-only) -> gold light + Seeker-only hall.
- Tips (devnet): SOL or USDC to `TIP_RECIPIENT`, Solana Pay reference key, verified on-chain; supporter halo.
- Invite rewards: 3 friends who join from your link unlock the Night hall. Daily streaks (on device).
- Test the API: `node scripts/e2e-api.mjs [baseUrl]` (add `KEYPAIR=devnet-keypair.json` to also send a test tip).
  Seeker lookup: `node scripts/check-seeker.mjs <wallet>`.

## Phase 4: world + items (specs 005, 006)
- Places: Lake (dock, boulders), Stone Garden (raked sand, benches, 108 stone spots), Maple Grove (64 tree spots,
  bench, swing), Tea House (4 cushions), Lookout (hill over the valley). Tap any seat to walk there and sit.
- Badges (earned, 30 days), free lanterns (1/day, 1 h) shared live over the lake, paid lanterns (24 h / 7 days),
  stones and trees bought as Metaplex Core NFTs (devnet). Degen style: Solana purple→green accents, night aurora.
- Tests: `node scripts/test-items.mjs` (rules), `node scripts/items-e2e.mjs` (real devnet purchase + mint; spends
  ~0.03 devnet SOL from `DEV_NET_SOL`), `node scripts/shots.mjs <dir>` (screenshots per place, `PLACES=lake,garden`).
- One-time: `node scripts/setup-collections.mjs` created the devnet collections (addresses in `.dev.vars`).
- Local RPC: the Worker uses `/rpc/devnet` and `/rpc/mainnet` on the Vite server because Solana's public RPC
  blocks Cloudflare Workers. Live needs a keyed RPC (see specs/006 T230).

## PvP prediction duels (design/gdd/pvp-prediction-duel.md)
- In PumpHall (and its avenue), bump into someone and tap the ⚔ bubble over their head, or use ⚔ Duel in the player menu.
  Call SOL or SKR up or down for the next 1- or 5-minute round; they take the other side if they accept.
- Settled by the same Coinbase candles as PumpHall. Points only (win 15, +3 per duel win in a row, max +15), Elo rating,
  weekly ⚔ Duels board. Same network / new player / 4th duel of a pair in a day = unrated. Never in calm places or during a sit.
- Opt out with "Open to duels" in the PumpHall sheet. Tuning knobs: `DUEL` in `src/layout.ts`.
- Test: `node scripts/duel-test.mjs [baseUrl] [loadTestKey]` (test rooms; settles duels through a test hook).

## Live (devnet)
- Web: https://quiet-hall.vercel.app (Vercel project `quiet-hall`)
- Hall server + API: https://quiet-hall.ted-233.workers.dev (Cloudflare Worker `quiet-hall`; also serves the app)
- Redeploy: `npx wrangler deploy` (server) and
  `vercel deploy --prod --yes --build-env VITE_HALL_URL=https://quiet-hall.ted-233.workers.dev` (web)
- Server config: `[vars]` in `wrangler.toml`; secret `SESSION_SECRET` (`wrangler secret put`). Local: `.dev.vars`.

## Run
```bash
npm install
npm run dev          # web on :5173 (also on your Wi-Fi IP), live hall on :8787
```

## Test on the Mac
1. Open http://localhost:5173 in Chrome.
2. Phone view: DevTools (Cmd+Opt+I), then device toolbar (Cmd+Shift+M), pick a ~412×915 Android size.
   Touch, drag and pinch are simulated (hold Shift and drag to pinch).
3. Presence: open a second window (or Incognito) at the same URL and walk around; you see each other.

## Test on an Android phone / Seeker
- Same Wi-Fi: open `http://<your-mac-ip>:5173` (the Vite terminal prints it, e.g. http://192.168.1.11:5173).
- USB (better: counts as localhost, so screen wake-lock works):
  ```bash
  adb reverse tcp:5173 tcp:5173   # then open http://localhost:5173 on the phone
  ```

Offline test: stop `npm run dev`, run `npm run prod-local`, open http://localhost:8787 once, then stop the
server (or DevTools > Network > Offline) and reload. Service workers only run on localhost/https, not on the Wi-Fi IP.

URL options: `?world=HH:MM` World Sit time (UTC) · `?bell=2` group bell every 2 min · `?low` low-power mode · `?noshadow` turn off shadows.

## Other scripts
- `npm run check`: type-check app + worker
- `npm run prod-local`: build and serve exactly like production through the Worker on :8787
- `npm run deploy`: deploy to Cloudflare (needs `npx wrangler login`)

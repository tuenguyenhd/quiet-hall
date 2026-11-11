# Quiet Hall × NEAR: Meme Valley

**A calm 3D world where your stillness powers the economy.** Sit with strangers to earn Leaves, rescue lost meme frens together in Meme Valley, trade in a market whose prices are moved only by players, and compete in a free 3-hour Market Cup whose fairness anyone can check on NEAR. Nobody needs a wallet.

- **Track:** Games With Real Economies
- **Live demo:** https://quiet-hall-near.ted-233.workers.dev
- **Contract (NEAR testnet):** [`quiethall-521e7c.testnet`](https://explorer.testnet.near.org/accounts/quiethall-521e7c.testnet)
- **Design docs:** [`design/gdd/edition-near.md`](design/gdd/edition-near.md) (this build), [`design/gdd/master-gdd.md`](design/gdd/master-gdd.md) (the whole game), [`design/pitch-near.md`](design/pitch-near.md)

## What you can do (live)

1. **Sit.** Open the link, tap a cushion, breathe. Every minute you sit (server-timed; hidden time doesn't count) earns 1 Leaf.
2. **Rescue a fren together.** Follow the lanterns to Meme Valley. Tap Moon Rocks to gather (each player has their own stock, so nobody can take yours). Grant Shibby's wish and sit beside him for a minute: **everyone sitting beside him is rescued too.** He follows you home.
3. **Craft.** Make a Moon Collar at the workbench.
4. **Trade.** The Market, its own square south-east of the courtyard (PumpHall is up/down and duels only): prices move with every trade anyone makes (mid = base·e^(k·gap), 10% spread, decays back to base). The Market buys up to 60 Leaves' worth from you a day.
5. **Call it.** PumpHall's big board runs live Bitcoin and NEAR prices (Coinbase public candles): guess up or down for the next round, or bump into someone and duel. Points and a leaderboard only, no money.
6. **Compete.** The Market Cup: every 3 hours, join free with 200 play chips, trade the same live market, top 10 win Leaves.
7. **Look ahead.** The telescope at the Lookout shows six **Preview** screens (sample data, clearly labelled): Cabal Hall, Sitting Bazaar, Whale Order, Calm the FUD Golem, trade feed, Agent Cup.

## Where NEAR is used

| On NEAR (testnet) | How |
|---|---|
| **Rescue, craft and trophy receipts** | NEP-171 NFTs (`fren:shibby:214`, `drip:moon_collar:7`, `trophy:<round>:1`) minted to an owner id the server derives for each player (a real implicit account id from HKDF + ed25519). **The player never creates an account or signs anything.** Tokens are bound: `nft_transfer` always fails. |
| **The market's prices** | Every hour the current bids and asks are posted to the contract (`post_prices`) and emitted as events. |
| **Cup fairness** | Before a round opens, the hash of its setup (starting prices, market-maker seed) is committed (`commit_round`). At the end, the setup is revealed and the hash of the full results file is recorded (`settle_round`); the contract rejects a setup that doesn't match the commitment. |
| **Sponsored drops** | A campaign's terms are committed before it goes live (`commit_campaign`: the sha256 of its config, emitted as a `campaign_committed` event). A player who completes it gets a bound badge `badge:<campaign_id>:<serial>` (`mint_badge`, event `badge_minted`); the sponsor's own reward is a claim link or code handed out off chain. |
| **Safe retries** | Every write carries a one-use `job_id`; the contract rejects a reused one, so a retried transaction can never mint twice. |

**Check a round yourself:**
```bash
node scripts/verify-round.mjs <demo-url> <roundId>
```
It recomputes both hashes from what the game published and compares them with the contract's own `round()` view.

Off-chain on purpose: Leaves, the bag, Cup chips and trades. Leaves are play money with no cash value; putting them on-chain would give them a price.

## Honest security statement

The game server (a Cloudflare Worker) holds the game account's key and is the trust root: it decides prices, rescues and results. NEAR makes what it did **public and tamper-evident**: receipts with unique serials, a price history, and Cup rounds committed before they start. Nothing of value is held by the contract, nothing is sold, and there is no token.

## How it is built

- **Client:** Vite + Three.js (one-thumb, phone-first). NEAR UI in `src/near/`; valley and market as data in `src/valley.ts`, `src/market.ts`, `src/economy.ts`.
- **Server:** Cloudflare Worker + Durable Objects: `Hall` (live presence, server-timed sits, reach checks), `Economy` (Leaves + bag + market + Cup in one SQLite store, every change one transaction with an audit row), `Mirror` (the only chain writer: one transaction in flight, batched calls, one-use job ids, retries, RPC fallbacks; a failing action parks only its own job).
- **Contract:** Rust, `near-sdk` 5.30 + `near-contract-standards` (NEP-171), in `contracts/items/` (26 unit tests).
- **Chain access:** `near-api-js` 7 signing inside the Workers runtime; FastNEAR testnet RPC.

## Run it locally (no secrets needed)

```bash
npm install
npm run dev:near        # app on http://localhost:5174, NEAR Worker on :8788 (no secrets needed)
```
Needs Node 20+ only; `wrangler dev` runs locally without a Cloudflare login. Rust is only needed to rebuild the contract.
Without a `NEAR_PRIVATE_KEY` the Mirror runs in **mock mode**: everything works and receipts are marked "mock" instead of being sent. To write to testnet locally, create `.dev.vars.near` with your **own test contract**'s `NEAR_ACCOUNT` and `NEAR_PRIVATE_KEY`, plus `OWNER_SECRET` and `SESSION_SECRET`. Never point a local Worker at the production contract.

**Production smoke test** (real clock, real testnet writes, ~3 minutes): `node scripts/near-prod-smoke.mjs https://quiet-hall-near.ted-233.workers.dev`

**Known:** Cup round `20261110-090000` (the first, 09:00–12:00 UTC on Nov 10) was committed on chain by a pre-launch local check, so its settlement does not match the commitment and `verify-round` reports it. Every later round is clean.

**Tests** (start the Worker with a fast clock: `npx wrangler dev -c wrangler.near.toml --port 8788 --var MINUTE_MS:200 --var NEAR_MIRROR_MODE:mock --var CUP_ROUND_MIN:30 --var CUP_JOIN_CLOSE_MIN:5`):
```bash
node scripts/near-economy-test.mjs  http://127.0.0.1:8788   # sit pay, caps, hidden time, no double pay, mirror
node scripts/near-valley-test.mjs   http://127.0.0.1:8788   # personal stock, reach, co-rescue, crafting, receipts
node scripts/near-market-test.mjs   http://127.0.0.1:8788   # market, Cup, settlement, hashes
cd contracts/items && cargo test                             # 26 contract tests (rustup installs Rust 1.95 for this folder)
```
From a fresh clone (no secrets) 72 checks run and pass (economy 23, valley 23, market 26). With a `LOAD_TEST_KEY` passed as a second argument, 5 more test-hook checks run: 77, plus 26 contract tests. The market suite also passes with the live testnet mirror. Screenshots: `docs/qa/near-2026-11-10/`.

## What existed before the hackathon, and what was built for it

- **Before (first commit 2026-11-09):** Quiet Hall, a shared meditation world: the hall, sitting, presence, chat, pets, blessings, and its Solana features (wallet sign-in, tips, collectibles, PumpHall predictions).
- **Built in the window, on branch `near-hackathon`:** everything NEAR: the items contract, the Mirror, the Economy store (Leaves, bag, market, Cup), Meme Valley (gathering, wishes with co-rescue, crafting), the Living Market, the Market Cup with on-chain commit/settle, the NEAR client UI and previews, the verify script, all NEAR tests. `git log main..near-hackathon` shows the diff.
- **AI tools:** built with Claude Code (Anthropic) as a coding assistant. Libraries: three.js, near-api-js, near-sdk-rs, near-contract-standards, @noble/curves, @noble/hashes. Fren models are CC0 (Quaternius).

## Live, Preview, Roadmap

| Tier | |
|---|---|
| **Live** | Sit → Leaves · co-rescue · personal-stock gathering · crafting · the Living Market · Market Cup · NEP-171 receipts · hourly price posts · Cup commit/settle · trophies · verify script |
| **Preview** (sample data, labelled) | Cabal Hall · Sitting Bazaar · Whale Order · Calm the FUD Golem · trade feed and trader card · Agent Cup |
| **Roadmap** | NEAR Auth social login · OutLayer-proven Cup scoring · AI characters (a market trader you can haggle with, the Vault guard) with limited function-call keys · Shade Agents in an Agent Cup · receipt roots (one Merkle root an hour, mint on claim) · valley shards and regional markets · NEAR Intents for "pay with any token" cosmetics in the other editions |

Never planned: a token, an airdrop, paid odds, or cashing out Leaves.

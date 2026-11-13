# Quiet Hall × NEAR: rest after a trading day

**A calm 3D world for traders.** Sit with strangers in the Quiet Hall after a trading day, rescue lost meme pets together in Meme Valley, play a free trading game whose fairness anyone can check on NEAR, and collect sponsored drops that an AI agent launched with one prompt. No currency to grind; most of the game needs no wallet at all.

- **Tracks:** Games With Real Economies (`games`); also fits NFTs That Do Something (`nfts`, NEP-171 receipts) and Agent Economy (`agents`, MCP server for sponsored drops)
- **Live demo:** https://quiet-hall-near.ted-233.workers.dev (phone first; works on desktop)
- **Contract (NEAR testnet):** [`quiethall-521e7c.testnet`](https://testnet.nearblocks.io/address/quiethall-521e7c.testnet)
- **Network:** testnet only (allowed in all tracks, rules Q-010)
- **License:** MIT ([LICENSE](LICENSE)); third-party models and fonts keep their own licences ([public/models/CREDITS.md](public/models/CREDITS.md))

## The problem, the product, how NEAR fits

Trading is loud, and most "web3 games" are a token with a game painted on it. Quiet Hall is the opposite. It is a place to rest, and its economy is a game you play, not a token you farm.

- **Players** sit together and rescue pets with whoever sits beside them. They play a free 3-hour trading game in a market whose prices only players move.
- **Sponsors** run airdrops as play: "collect 3 🐕 in the Courtyard". An AI agent can launch one from a prompt over MCP.
- **NEAR** is the public, tamper-evident record. Rescues, crafts, trophies and sponsor badges are bound NEP-171 receipts. Trading-game rounds are committed before they start and settled after. Sponsor terms are hashed on chain.

The player never needs to notice the chain. Guests get an account id derived for them, with no sign-up, no seed phrase and no gas.

## Try it (live demo, about 3 minutes)

1. Open the demo link and tap **Quick join**. No account is needed. Tap **Sit**: sitting is just sitting, and the counter shows who sits with you.
2. Tap 🐾 (top left), then **Show me the way**. Follow the lanterns to Meme Valley. Tap 2 Moon Rocks 🪨, tap **Shibby**, **Grant the wish**, and sit beside him for 1 minute. Anyone sitting nearby is rescued too. He follows you as your pet.
3. Tap 📖 **Rescue Book**, then **receipt ↗**. The explorer shows `fren:shibby:N` owned by an account you never created.
4. Glowing 🐕 or 🐸 bubbles in the Courtyard or Valley are **sponsored drops**. Tap 3 of them; the 🎁 count is on the 🐾 chip. Finishing one gives a bound badge (`badge:<campaign>:<n>`) plus the sponsor's claim link. Claiming needs a NEAR login.
5. Walk to the **Market** (🛒, south-east). The **Market Cup** is a free round with 200 play chips; the top 3 win trophies on NEAR. Joining needs a NEAR login: one signed message, no transaction, no fee.
6. **PumpHall** (south): guess whether Bitcoin or NEAR goes up or down next round, or bump into someone to duel. Points only. Needs a login.
7. The **Coming Soon** district (south-west) and the Lookout telescope show labelled previews with sample data.

## Where NEAR is used

| On NEAR (testnet) | How |
|---|---|
| **Receipts for rescues, crafts, trophies and badges** | NEP-171 tokens (`fren:shibby:214`, `drip:moon_collar:7`, `trophy:<round>:1`, `badge:<campaign>:<n>`) are minted to an owner id the server derives for each player: a real implicit account id (HKDF + ed25519). **Guests never create an account or sign anything.** Tokens are bound, so `nft_transfer` always fails. |
| **Login (optional)** | NEAR Connect plus one NEP-413 signed message. The server checks it is a full-access key of the account. Receipts then go to your own `.near` account, and your progress follows you to any phone. |
| **Trading-game fairness** | Before a round opens, its setup hash is committed (`commit_round`). At the end the setup is revealed and the results hash is recorded (`settle_round`); the contract rejects a setup that doesn't match. Check it: `node scripts/verify-round.mjs <demo-url> <roundId>`. |
| **Market prices** | Bids and asks are posted every hour (`post_prices`, event log). |
| **Sponsored drops** | A campaign's terms are committed before it goes live (`commit_campaign`, the sha256 of its canonical config). Completions mint `badge:<campaign>:<serial>` (`mint_badge`). The sponsor's reward is their own claim link or code, shown only to the player who completes it. We never hold sponsor tokens. |
| **Safe retries** | Every write carries a one-use `job_id`; the contract rejects a reused one, so a retry can never mint twice. |

## Sponsored drops from a prompt (MCP)

A sponsor or an AI agent connects once, then describes the airdrop in plain words:

```bash
claude mcp add --transport http quiet-hall <demo-url>/api/near/mcp --header "x-api-key: <sponsor key>"
# then: "Drop 20 BONK memes in the Courtyard; collect 3 for a Bonk Hunter badge; claim at https://…"
```

- **Tools:** `list_zones`, `draft_campaign_from_prompt`, `create_campaign`, `list_campaigns`, `get_campaign_stats`, `end_campaign`.
- **Safety:** every draft goes through one validator (`src/campaigns.ts`), which caps counts, allows https-only links and limits zones to a list. Sponsor keys are stored hashed and rate-limited. Drop spots are placed deterministically from the campaign id, so client and server agree.
- **Keys:** issued by an admin with `CAMPAIGN_ADMIN_KEY=… node scripts/near-sponsor-key.mjs <base> "<label>"`.

## Run it locally (no secrets, no Cloudflare login)

Needs Node 20+. Rust is only needed to rebuild the contract.

```bash
npm install
npm run dev:near     # game on http://localhost:5174, NEAR Worker on :8788
```

Without `.dev.vars.near` the Worker runs in **mock mode**. Everything works, and receipts are marked "mock" instead of being sent. To write to testnet, put your **own** test contract's `NEAR_ACCOUNT` and `NEAR_PRIVATE_KEY`, plus `OWNER_SECRET` and `SESSION_SECRET`, in `.dev.vars.near`.

**Fast-forward for judges.** Start the Worker with `--var MINUTE_MS:200` (1 game minute = 0.2 s) and `--var CUP_ROUND_MIN:30`. Sits, regrowth and trading-game rounds then move fast enough to watch.

## Tests

```bash
npm run test:near                          # all 6 NEAR suites on a throwaway fast-clock Worker, mock chain, no secrets
cd contracts/items && cargo test           # 26 contract tests
npm run check && npm run build:near        # typecheck and production build
```

**Suites:** economy (no currency, sits, hidden time, mirror), valley (gathering, co-rescue, crafting, receipts), market (trading game, settlement, hashes), duel (PumpHall), campaign (sponsored drops), and mcp (MCP server).

`scripts/near-login-test.mjs` also checks a real NEP-413 signature on testnet. It needs a testnet key file: `NEAR_LOGIN_KEYFILE=~/.near-credentials/testnet/<acct>.json`.

**Latest QA:** [docs/qa/near-2026-11-13/](docs/qa/near-2026-11-13/qa-signoff-near-2026-11-13.md). That's 177 checks plus 26 contract tests, 23 UI cases on a 412 px phone viewport with screenshots, and 4 small UI bugs found and fixed.

## How it is built

- **Client:** Vite + Three.js, one-thumb and phone-first. The NEAR UI is in `src/near/`. Game rules are kept as data: `src/valley.ts`, `src/market.ts` (pricing in one readable file), `src/economy.ts` and `src/campaigns.ts`.
- **Server:** Cloudflare Worker + Durable Objects.
  - `Hall`: live presence, server-timed sits, reach checks.
  - `Economy`: bag, market, trading game and sponsored drops in one SQLite store; each change is one transaction.
  - `Mirror`: the only chain writer. One transaction in flight, batched calls, one-use job ids, retries and RPC fallbacks.
  - `worker/mcp.ts`: the MCP server.
- **Contract:** Rust, `near-sdk` 5.30 + `near-contract-standards` (NEP-171), in `contracts/items/`.
- **Chain access:** `near-api-js` signing inside the Workers runtime, using FastNEAR testnet RPC with fallbacks.

## Built during the hackathon

- **Timing:** the whole repository was created inside the hackathon window. The first commit is 2026-11-09, after the 2026-10-19 announcement, so there is no pre-hackathon baseline.
- **Order of work:**
  1. The calm hall core and a Solana/Seeker edition were built first, on `main`.
  2. Everything NEAR was built on top of it on `near-hackathon`: the items contract, the Mirror, the Economy store, Meme Valley, the market and trading game with on-chain commit/settle, NEAR login, sponsored drops and the MCP server, no-currency play, and all NEAR tests.
- **Diff:** `git log main..near-hackathon`.
- **AI tools:** built with Claude Code (Anthropic) as the coding assistant.
- **Libraries:** three.js, near-api-js, @hot-labs/near-connect, near-sdk-rs, near-contract-standards, @noble/curves, @noble/hashes, wrangler.
- **Models:** animals by Quaternius (CC0), plus CC-BY pets listed in [CREDITS](public/models/CREDITS.md).

## Honest security statement

The game server (a Cloudflare Worker) holds the game account's key and is the trust root: it decides prices, rescues and results. NEAR makes what it did public and tamper-evident: receipts with unique serials, a price history, trading-game rounds committed before they start, and sponsor terms committed before they go live. The contract holds nothing of value. Nothing is sold, and there is no token. Sponsored-drop picks trust the position the client reports. A rate limit and a reach check limit abuse, but this is not full anti-cheat.

## Live, Preview, Roadmap

| Tier | |
|---|---|
| **Live** | Server-timed sits · co-rescue · personal-stock gathering · free crafting · market moved by players · trading game with on-chain commit/settle and trophies · NEP-171 receipts · NEAR login (optional) · PumpHall up/down and duels · sponsored drops with badges · MCP server for agents |
| **Preview** (sample data, labelled in the game) | Coming Soon district: Cabal Camp (clans) · Event Arena (team trading events, contests) · Sitting Bazaar (swaps) · The Vault (AI NPC); Lookout telescope previews |
| **Roadmap** | Short tutorial and a chaptered journey ([design](design/gdd/near-player-journey.md)) · AI pet companion and NPCs on Claude / NEAR AI, with a paid AI Pass in NEAR · a Sponsor SDK (TypeScript + MCP) so any game or agent can launch drops · NEP-245 multi-token items · social login · NEAR Intents |

Never planned: a token, paid odds, or an in-game currency to cash out.

# Quiet Hall: NEAR Edition GDD ("Meme Valley on NEAR")

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Branch / deploy**: `near-hackathon` (from `main`) · separate Vercel project + Worker `quiet-hall-near` · NEAR **testnet**
> **Target**: NEAR Hackathon, submissions close **2026-11-14 23:59 UTC**. Track: **Games With Real Economies** only.
> **Shared design**: `master-gdd.md` and the system GDDs. This doc says what the NEAR edition includes, cuts and adds.

## Summary

A NEAR edition of Quiet Hall built for the NEAR Hackathon: earn Leaves by sitting, rescuing and playing a living market whose prices are set by what every player does, then compete in a free three-hour trading Cup. Rescues, crafts and Cup trophies are recorded on NEAR in your name, and so are the market's prices and each Cup round's proof of fairness. The player never sees a wallet.

## Overview

The build is a narrow slice done well: the calm core that already exists, the smallest valley that shows the rescue loop, **a player-driven market (Kettle's Living Market and the Market Cup) that shows an economy evolving without a dev patch, with its prices and competitions recorded on NEAR**, and labelled previews of what comes next, and a chain receipt that works from day one. This edition deliberately departs from the shared Pillar 3: sitting is one source of Leaves among several, not the main one (see "NEAR economy"). Scope is frozen below. NEAR is what makes this an entry, so the chain is built first and gameplay is cut before the chain is. Section "NEAR technology map" shows where NEAR's other tools fit the game later, which is the roadmap half of the pitch.

## Player Fantasy

"I sat for a minute next to a lost dog with a torn map. Two strangers sat down too. He followed all of us home. Later I tapped 'receipt' and found him on a blockchain under my name. Nobody asked me for a wallet."

## Detailed Design

### The hackathon build in one line

**Sit, rescue a fren together, trade in a market the players move, compete in a free 3-hour Cup whose results are proven on NEAR; every rescue, craft and trophy gets a NEAR receipt nobody has to think about.** Four things work for real. Everything larger is shown as a labelled preview or described in "Beyond the hackathon".

### Three tiers: Live, Preview, Roadmap

| Tier | Meaning | Rule |
|---|---|---|
| **Live** | Works end to end, tested, on testnet | Everything in "frozen scope" below |
| **Preview** | A clickable screen with seeded sample data so judges can see the next features. It writes nothing to Leaves, the bag or the chain. | Every preview screen carries a **"Preview: sample data"** banner, lives behind one "Coming next" door (the Lookout telescope), and is listed under "Preview" in the README. Never mixed into a live screen. |
| **Roadmap** | Described in the README and the pitch only | "Beyond the hackathon" section |

**Preview screens (2D sheets, seeded data, about 3 hours in total, cut first):**

| Preview | What the judge sees | Becomes |
|---|---|---|
| **Cabal Hall** | A sample Cabal: banner, 12 members, a lantern rack lit by members' sit minutes, a shared fren corner, the recruitment board | `saga-and-long-term.md` Cabals |
| **Sitting Bazaar** | The Trading Hall floor with sample sellers sitting on mats, their offers floating above them; tap one to see the buy sheet | Player-to-player market (after the trade gate) |
| **Whale Order** | One giant community order (2,000 Moon Rocks), a progress bar, top contributing Cabals | Community event |
| **Calm the FUD Golem** | A weekly co-op event: the golem's panic bar falling as sample players sit near it | Co-op "raid" where the weapon is meditation |
| **Trade feed and trader card** | A Vector-style feed of sample trades and a shareable Cup profile card | Social trading layer |
| **Agent Cup** | A board of sample AI agents with their one-line strategies, ranked beside humans | Agent bracket |

The README states plainly which tier each feature is in. The video says "preview" aloud when it shows one.

### Core Rules: frozen scope for Nov 14

| In the build | Notes |
|---|---|
| Calm core: hall, sit, presence, chat, bells, pets (exists) | Unchanged |
| Leaves: `sit`, `world_sit`, `bell`, `streak`, `wish` (granter **and** co-rescuers), `market_sell`, `cup_prize`, `welcome`, `craft_fee`, `market_buy` | NEAR value table below; `MIN_SIT` 1 and `STARTER_LEAVES` 10 for judging |
| Valley: Gate + two areas (Wen Moon Lake, Copium Caves), personal-stock nodes, tap to pick | Per `meme-valley.md`; **no bloom** |
| Two frens: **Shibby** and **Froggo**, both always present | Reuse the existing CC0 Shiba and Frog with a prop each |
| Wishes with the 1-minute sit, co-rescue, first-timer Shibby at the Gate, the first-five-minutes path | The heart of the demo |
| One recipe: **Moon Collar** (one Rug Yarn bush is placed at the Gate so it can be made without Rug Fields) | Fee per the NEAR value table |
| Rescue Book (2 entries) with a "receipt" link | |
| **Kettle's Living Market**: buy and sell Moon Rock, Copium Shroom, Rug Yarn and the Moon Collar at prices moved by all players' trades; price board with a line per item | Server only, scripted lines, no AI |
| **Market Cup**: free 3-hour trading rounds with play chips, Leaves prizes by rank | |
| **On-chain economy record**: hourly price feed, Cup round commitments and results, trophies for each round's top 3 | Contract methods below |
| **Preview door** (Lookout telescope) with the six preview screens | Seeded data only |
| **Chain receipts on NEAR testnet** for rescues and crafts | Rules below |
| Mock mode with no secrets | For the judges' automated run |

| Cut from the build (roadmap, linked from the README) | Why |
|---|---|
| Kettle's on-chain key and the AI Security track | The security claim would not be honest with one Worker holding every key |
| Haggle, the Vault, all AI | Time; cost; not needed to show the loop |
| Variants, three more frens, five more recipes (including Copium Shades), Rug Fields, Ape Hill, node bloom | Time and art; cut to make room for the market |
| Trade, Drop, Auction, Saga | Gated on economy data anyway |
| Solana wallet, payments, tips, paid items, predictions, duels | Not part of this edition (`EDITION=near` removes UI **and** Worker routes) |

**Cut order if time runs short:** preview screens (one by one) → Cup trophies → Froggo → Market Cup and its on-chain record → crafting. **Never cut:** sit → Leaves, Shibby's rescue with co-rescue, the Living Market and its hourly price feed, the testnet receipt, mock mode, the README.

### Core Rules: NEAR economy (a deliberate exception to Pillar 3)

**Why:** the Games track is judged on "economies that evolve without a dev patch". In this edition the economy is the showcase, so Leaves come from playing the market as well as from sitting. The shared pillar (sitting is the main source; non-sit caps ≤ half the sit cap) still governs the Seeker and Web3 editions. The NEAR edition is a separate world, so nothing earned here reaches them.

Every other shared rule still holds here: Leaves are play money, cannot be bought or cashed out, are never on-chain; nothing random is paid for; nothing earned with Leaves is exportable.

**NEAR value table** (overrides `leaves-economy.md` for this edition only):

| Reason | Source | Amount | Daily cap |
|---|---|---|---|
| `sit` | Sitting | 1 per full minute, sit ≥ `MIN_SIT` (1) | 60 |
| `world_sit` / `bell` / `streak` | As shared | 20 / 5 / 2 × days, max 30 | as shared |
| `wish` | Rescue, as granter **or** co-rescuer | 10 | 2 |
| `market_sell` | Selling to Kettle's Living Market | current bid price × units | **60** Leaves received |
| `cup_prize` | Market Cup placing (below) | 5–100 | 1 prize a day (the best placing that day) |
| `welcome` | First visit | 10 | once |
| `craft_fee` (sink) | Moon Collar | 10 | — |
| `market_buy` (sink) | Buying from the Living Market | current ask price × units | — |

**Maximum created per day:** sitting-linked 60 + 20 + 15 + 30 = 125; other 20 + 60 + 100 = 180; total 305. A realistic active day (30 min sat, 1 bell, 7-day streak, 2 wishes, 30 Leaves of sales, a Cup finish in profit) is about 49 + 20 + 30 + 5 = 104, of which sitting-linked ≈ 47%.

**A. Kettle's Living Market**
1. Kettle quotes a **bid** (he buys) and an **ask** (he sells) for 4 items: Moon Rock, Copium Shroom, Rug Yarn, Moon Collar.
2. Prices move with the **net flow** of all players' trades: buying pushes the price up, selling pushes it down. Each item drifts back toward its base price when nobody trades (Formulas).
3. Prices are bounded between 0.5× and 3× the base price.
4. The board in the Trading Hall shows each item's price and a 6-hour line. The valley's Gate signpost shows the current Moon Rock and Copium Shroom bids, so gatherers know when to sell.
5. Real Leaves trades: selling earns `market_sell` up to 60 Leaves a day; buying is unlimited (a sink).
6. Materials bought from the market can be used for wishes, the collar, or resold.
7. All trades are against Kettle (the server). Players never trade with each other in this build.

**B. Kettle's Orders** moved to the roadmap; the Whale Order preview replaces them in the demo.

**C. The Market Cup (trading competition)**
10. A round runs every 3 hours (00:00, 03:00, … UTC). Joining is free and allowed up to the last 30 minutes of a round.
11. On joining, the player gets **200 Cup chips** and an empty **Cup bag**, both separate from their real Leaves and bag and thrown away when the round ends.
12. With chips, the player buys and sells the 4 market items at the same live prices as everyone else. Cup trades move prices exactly like real trades, so the Cup is visible to the whole market.
13. **Score** at the round's end = chips + Cup bag valued at the closing **bid** prices.
14. **Prizes in real Leaves**, paid when the round ends:

| Place | Prize |
|---|---|
| 1st | 100 |
| 2nd–3rd | 60 |
| 4th–10th | 30 |
| Anyone else with a score above 200 | 5 |

15. A player receives at most one Cup prize per UTC day (the best placing that day).
16. There is no entry fee and nothing of the player's is at risk, so the Cup is a free skill contest with a play-money prize.
17. Ties are broken by fewer trades, then by earliest join.
18. A Cup round with fewer than 3 entrants pays only the "above 200" prize.

**D. Limits that keep it fair**
19. Every market or Cup trade must be at least 2 seconds after the player's previous one.
20. Per round, a player may trade at most 200 units of each item with chips.
21. Each Cup entrant must have at least one server-measured sit minute (the same check that guards free mints), so making accounts costs a minute each.
22. At most 3 Cup entrants per network address per round; the rest are refused with a reason.

**E. What judges should see**
23. The board's lines move during the demo because other people are playing; a Cup round in progress shows the live top 10 by score.
24. The README explains the economy in one diagram: sitting, rescues, the market and the Cup create Leaves; the market's spread and crafting consume them; prices are set by players, not by patches, and posted on NEAR every hour.

### Core Rules: chain design

1. **Standard:** an NFT contract following NEP-171, built from the reference implementation in `near-contract-standards` (Rust, `cargo-near`). Every fren and drip is unique with a serial, which is what an NFT is. A multi-token design is deferred (see the technology map).
2. **No account creation.** Each player's owner id is a deterministic implicit account id: the hex of an ed25519 public key derived from `HKDF(master_secret, visitor_id)` in the Worker. Tokens are minted to that id. No sub-accounts, no storage deposits per player, no stored per-player keys.
3. **Bound by the contract.** `nft_transfer` and `nft_transfer_call` panic for every token. A game-only method `game_move(token_id, to, job_id)` exists for drip (unused in this build).
4. **Methods (callable by the game account only):** `mint_fren(owner, species, serial, job_id)`, `mint_drip(owner, kind, job_id)`, `mint_trophy(owner, round_id, place, job_id)`. Each rejects a `job_id` it has already seen, so a retry can never mint twice. Token ids: `fren:shibby:214`, `drip:moon_collar:<n>`, `trophy:<round_id>:<place>`.
4a. **Economy record (game account only):**
   - `post_prices(hour, prices, job_id)`: stores the latest bid and ask of the 4 market items and emits an event (NEP-297 log). Only the latest values are kept in storage; history lives in the event log, so storage stays tiny.
   - `commit_round(round_id, setup_hash)`: posted before a Cup round opens. `setup_hash` = hash of the starting prices and the apprentice bots' seed.
   - `settle_round(round_id, setup, final_prices, results_hash)`: posted at the end. The contract checks `hash(setup) = setup_hash`, stores `results_hash` (a hash of every entrant's final score) and emits an event. Anyone can recompute both from the published round file.
   - View methods: `latest_prices()`, `round(round_id)`.
5. **One writer.** All chain writes go through one `Mirror` Durable Object: a stored queue, an alarm, **one transaction in flight at a time**, several mints batched per transaction, nonce tracked locally and refreshed on an invalid-nonce error.
6. **The server bag decides; the chain is a receipt.** Play never waits for the chain. If they disagree, the bag wins and a repair job re-issues.
7. **Abuse limits (the relayer pays):** a mint is queued only for an account with at least one server-measured sit minute; at most 20 mints per network address per day; relayer balance checked at start and the mirror pauses below a threshold.
8. **Signing in the Worker:** the modular `@near-js/*` packages with a fetch-based provider. Proving this works in the Workers runtime is the day-1 gate.
9. **What the player sees:** nothing, unless they tap "receipt" on a Rescue Book entry, which opens the explorer page. No pop-up, no wallet, no jargon.
10. **Honest security statement (for the README):** the Worker holds the game account's key and is the trust root. The contract's job here is a public, tamper-evident record with unique serials, not custody of anything valuable. Leaves are play money on the server. Nothing is sold.

### Build plan (one developer, four days)

| Day (UTC) | Goal | Gate at end of day |
|---|---|---|
| **Nov 11, morning** | **Chain spike:** NEP-171 contract deployed to testnet; one `mint_fren` sent from `wrangler dev` through the Mirror DO; token visible on the explorer | **If not working by end of Nov 11:** replace the contract with a minimal hand-written one (owner map + `job_id` set + mint). The chain is never cut. |
| Nov 11, rest | Branch, `EDITION=near` (UI and routes), Economy DO (bag + Leaves), sit → Leaves | Sit pays Leaves in two browser windows |
| **Nov 12** | Valley blockout (Gate + 2 areas), personal-stock picks, Shibby and Froggo, wishes with sit, co-rescue, first-timer Shibby, lantern trail | Scripted new-visitor run reaches a rescue in ≤ 330 s |
| **Nov 13** | **Living Market** (price book, bid/ask, buy/sell, board with lines) with the hourly `post_prices`, Moon Collar, Rescue Book with receipt link, rescue and craft wired to the Mirror, mock mode | Two clients selling Moon Rocks move the bid on both screens; clean clone runs with no secrets |
| **Nov 14, morning** | **Market Cup** (rounds, chips, Cup bag, scoring, prizes, live top 10) with `commit_round`, `settle_round` and trophies | A scripted 3-player round pays the right prizes and its commitment checks out on testnet |
| **Nov 14, early afternoon** | Preview door and the six preview sheets (seeded JSON, banner on each) | Each preview opens from the telescope and shows its banner |
| **Nov 14, rest** | Props and polish, deploy, README with the economy diagram and the Live / Preview / Roadmap table, 2-minute video, X post, **submit by 20:00 UTC** | Form sent, 4 h margin |

The Cup on the last morning is the riskiest scheduling choice. If it is not passing its script by 12:00 UTC on Nov 14, it is switched off (`CUP_ENABLED=false`) and the README lists it as the next feature.

### Submission checklist (from the official rules)

- Public repository with a LICENSE (MIT), public before the deadline.
- README: what it is; run steps that work from a clean clone with **no secrets and no Cloudflare login** (mock mode); hosted demo link; track entered; **what existed before** (the Quiet Hall meditation world, first commit Nov 9, Solana features) **and what was built for NEAR in the window** (valley, Leaves, co-rescue, contract, mirror), with a diff link; AI tools and libraries used; the honest security statement; roadmap with links to these GDDs and the technology map.
- Hosted demo up until at least Nov 25, with a list of fallback testnet RPC endpoints.
- X post: built at NEAR HACKATHON, @NEARProtocol, #NEARHackathon, with the video.
- A NEAR **mainnet** account for the prize payout.

### Demo script (90 seconds)

1. Open the link on a phone. No sign-up. Sit one minute; the card shows Leaves and "someone is lost in the valley". *(Calm core; stillness is the engine.)*
2. Follow the lanterns. Shibby is at the Gate with a torn map. Pick two Moon Rocks. *(One tap, no chores.)*
3. Grant his wish and sit beside him. A second player walks up and sits too. Both are followed home. *(Co-rescue: the multiplayer moment.)*
4. Gather Copium Shrooms; the Gate signpost shows Kettle's bid is high. Walk to the Trading Hall and sell. A second player's sales push the line down on the board. Open the explorer: the same prices were posted on NEAR this hour. *(An economy players move, recorded on-chain.)*
5. Join the running Market Cup with 200 chips, buy cheap Rug Yarn, watch the live top 10. Show a finished round on the explorer: setup committed before, results after, trophies minted to the top 3. *(A competition anyone can check.)*
6. Craft a Moon Collar, put it on Shibby, walk back to the hall and sit with him beside the cushion. *(Calm and play in one loop.)*
7. Rescue Book → "receipt" → the explorer shows `fren:shibby:N` owned by an account the player never created. *(The chain you never noticed.)*

8. Look through the Lookout telescope: Cabal Hall, Sitting Bazaar, Whale Order, Calm the FUD Golem, trade feed, Agent Cup, each marked "Preview". *(Where this goes next.)*

The video runs about 2 minutes; the live demo link lets judges try any step on their own.

### NEAR technology map (how NEAR's tools fit the game later)

**Research findings (web search, 2026-11-10; sources in the session notes, re-check before building):**
- NEP-171 NFTs: `near-contract-standards` ships an NFT module; `near-examples/NFT` is a working Rust contract with tests, built with `cargo near build`.
- NEP-245 multi-token: the standard is final, but its reference implementation PR to `near-sdk-rs` was closed unmerged. NEAR Intents uses NEP-245 for balances.
- Soulbound (NEP-393): still an open proposal. Non-transferable = NEP-171 with `nft_transfer` overridden to fail.
- RPC: `rpc.testnet.near.org` is being phased out (final limit 30 requests a minute). Use FastNEAR `test.rpc.fastnear.com`, with dRPC and ZAN as fallbacks.
- Signing in Cloudflare Workers: `near-api-js` supports build, sign and send as separate steps, and Workers have Web Crypto; **no source confirms it running on Workers**. The Nov 11 spike decides.
- Minting to a not-yet-existing implicit account: **not confirmed**. The Nov 11 spike tests it.
- Function-call keys: confirmed as designed (one contract, named methods, no deposits, gas-only allowance that cannot be changed later). Daily limits must live in the contract.
- Storage: 1 NEAR per 100 KB.
- Social login: FastAuth is deprecated; **NEAR Auth** (Auth0 + NEAR's key network; Google, Apple, email, passkey; same login → same account) replaces it.
- **OutLayer** (hackathon partner): verifiable off-chain compute in secure hardware with signed proofs a contract can check; testnet contract `outlayer.testnet`.
- **NEAR Intents / 1Click API**: cross-chain swaps filled by competing solvers; quote → single-use deposit address; **no testnet**.
- Shade Agents (2025 framework), NEAR AI Cloud private inference (launched Dec 2025 – Feb 2026), Chain Signatures: available; not tested here.

Tags: 🟢 fits today's pillars · 🟡 needs design care · 🔴 legal or policy first. **Every item marked "verify" must be checked against current NEAR documentation before it is promised in a pitch or built.**

| NEAR capability | Use in Quiet Hall | What the player gets | When | Tag |
|---|---|---|---|---|
| **NEP-171 NFTs** | Rescue and craft receipts with serials | Proof "I was there", never needing a wallet | **Now** | 🟢 |
| **Relayer / meta-transactions** (the game pays fees) | Every chain action is free and invisible | No gas, no wallet | **Now** (server-signed); NEP-366 delegate actions later, verify | 🟢 |
| **On-chain economy record** | Hourly prices, Cup commitments and results, trophies | The economy itself is public and checkable | **Now** | 🟢 |
| **Implicit and named accounts** | Derived owner ids now; later a readable name like `ted.quiethall.near` as the player's in-game identity | A name that is theirs across devices | Month 1–2 | 🟢 |
| **Function-call access keys** | A per-device "session key" that can only call the game's methods, so a player who links an account plays without signing each action | Safe one-tap play | Month 2 | 🟢 |
| **Function-call keys for AI characters** | Kettle and Coldwall each sign with a key limited to named methods, held in a **separate signer Worker**, with limits enforced in the contract | AI characters that act on-chain inside hard limits; an honest entry for an agent-security track | Month 2–3 | 🟢 |
| **On-chain world state** | A small contract holding community totals (shared sit minutes, fog step, Bell progress) written once a day, with the unlock rules in the contract | "The world changed because we sat", verifiable; an economy that evolves by rule, not by patch | Month 2 | 🟢 |
| **Commit–reveal on-chain** | Publish the hash of each day's Vault guard card and of each fren schedule before it starts; reveal after | Proof the puzzle and the schedule were not rigged | Month 1 (cheap) | 🟢 |
| **Sub-accounts as characters** | Each rescued fren as its own account that owns its drip ("NFTs that do something") | A fren that carries its own wardrobe and history | Month 4+, verify cost | 🟡 |
| **NEP-245 multi-token** | Stackable materials and editions on-chain, if a maintained implementation is confirmed | Not needed while materials stay server-side | Later, verify | 🟡 |
| **Sputnik DAO** | Cabal treasuries and votes (decor, banner, next village project); community votes on the next fren design | Real say in the world | Month 4+ | 🟡 (Leaves stay off-chain; votes only) |
| **NEAR AI / private inference in secure hardware** | Run Coldwall and a personal meditation companion where the operator cannot read the conversation; publish an attestation | "Even we can't read your chats"; a provably unmodified guard | Later, verify availability and cost | 🟡 |
| **Chain Signatures** | One NEAR account proving control of an address on another chain: show a Seeker Genesis mark in the NEAR world, or link the Seeker and NEAR editions' identities without a bridge | One identity across both editions | Later, verify | 🟡 |
| **NEAR Intents (1Click)** | Value lane only, Seeker and Web3 editions: pay for a fixed-price cosmetic with any token from any chain | "Pay with whatever you hold" | Later; no testnet, so tested with small mainnet amounts | 🟡 (never for Leaves) |
| **Intent-style play market** (our design, inspired by Intents; not the Intents protocol) | Players post trade intents ("sell 5 Moon Rocks for at least 3 each"); Kettle, apprentice bots and Agent Cup agents compete as solvers | A market of solvers, including AI agents, with play money | Month 2–3 | 🟢 |
| **OutLayer** (hackathon partner) | Settle each Cup round inside OutLayer so the contract records results with a hardware-signed proof of the scoring code | A competition provably scored by the published code | **Stretch for Nov 14**, else Month 1 | 🟢 |
| **NEAR Auth** | "Save my progress with Google, Apple, email or passkey" → a real NEAR account; receipts move there | Social login, the Games track's own hint | Month 1 | 🟢 |
| **Meme-token launch tools (partners)** | Licensed partner drops: a project's official mascot as a fren, with no price talk | Famous characters, properly licensed | Later | 🟡 |
| **Real-value item market, staking, agent trading** | See `growth-and-monetization-vision.md` | — | — | 🔴 |

**Why this matters for the pitch:** the hackathon build proves the hardest part (a chain nobody notices). Each later row reuses the same pattern (the game acts, the contract limits, the player is never asked to understand it) and moves one more piece of the world's rules from "trust us" to "check it".

### Beyond the hackathon: innovative and scalable features

The build stays small. This section is the pitch: what the same pattern grows into. Tags: 🟢 fits the pillars · 🟡 design care · 🔴 legal first. Rows marked **verify** depend on NEAR capabilities that must be checked against current documentation before they are promised.

**1. Innovations (what nobody else's game does)**

| Feature | What it is | Why it is new | Tag |
|---|---|---|---|
| **Proof-of-Calm economy** | Sit minutes are the base input of the whole economy; the server signs a daily per-player calm attestation (minutes, no content) and posts its Merkle root on-chain | An economy whose root resource is verified stillness, not clicks or capital; other apps could read "this person meditated 30 days" with consent | 🟢 |
| **Open price oracle of a player economy** | Every hour the Living Market's prices are posted on-chain | Any other game, bot or dashboard can read a live, player-made economy; Quiet Hall becomes a data source, not just a game | 🟢 |
| **Agent Cup** | A second Cup bracket where AI agents trade: a player writes a short strategy prompt, the agent trades the same market with its own chips; humans and agents ranked separately, plus one "humans vs agents" board | A public, safe arena for AI trading agents with play money only; fits NEAR's agent focus | 🟢 (play chips only) |
| **Agents with limited keys (done honestly)** | Kettle and Cup agents sign their trades with function-call keys held in a separate signer service; the contract enforces per-day limits; every agent action is publicly auditable | An agent economy where the limits are enforced by the chain, not by trust in the game | 🟢, verify key and allowance rules |
| **Verifiable rounds** | Each Cup round's apprentice-bot seed, starting prices and final prices are committed by hash before the round and revealed after | Anyone can check a competition was not rigged | 🟢 |
| **Co-rescue receipts** | A rescue receipt lists everyone who sat together ("Shibby #214, rescued by 4") | A record of a shared moment, not of a purchase | 🟢 |
| **Players set the rules** | Market parameters (spread, decay, base prices of new items) and the next fren design are voted by players with a governance contract (votes weighted by calm days, not by wealth) | An economy that evolves by its community's decisions, on-chain | 🟡 (play money only; verify DAO tooling) |
| **Private AI companion** | A personal meditation companion fren that talks, run on private inference where the operator cannot read the chat, with a published attestation | "Even we can't read your conversations" | 🟡, verify NEAR AI availability and cost |
| **One identity across editions** | A NEAR account proves control of a Solana address (for example a Seeker Genesis holder) without a bridge | One player, many worlds | 🟡, verify Chain Signatures fit |

**2. Scalability (how it grows from 200 judges to millions)**

| Layer | Hackathon | At scale |
|---|---|---|
| **Receipts on-chain** | One NFT per rescue or craft, batched | **Receipt roots:** each hour, one Merkle root of all receipts is posted in one transaction; a player claims an individual NFT only when they want it (lazy mint). Chain cost becomes per hour, not per player. |
| **World** | One valley room | **Valley shards:** one Durable Object per valley instance of about 50 players, created on demand; friends and co-rescuers are routed to the same shard. |
| **Economy** | One Economy object | Sharded by account; cross-shard trades use escrow rows. |
| **Market** | One price book | **Regional markets** per shard group with their own prices; a slow global index links them, which creates arbitrage play between markets. |
| **Cup** | One bracket every 3 hours | Many brackets in parallel (by region, by skill tier, agents vs humans), each settled independently. |
| **AI** | None | Per-NPC call budgets, reserved before each call; scripted fallback; cost grows with Trusted players, not visitors. |
| **Content** | Hand-made props | Seeded recolours, player-voted designs, licensed partner frens. |
| **Accounts** | Derived owner ids | Readable named accounts on request; per-device session keys for one-tap play. |

**3. Ecosystem plays (how others build on it)**

| Feature | What it is | Tag |
|---|---|---|
| **Open fren receipts** | Other games can read a player's fren receipts and give a matching cosmetic (a "Shibby hat" in another game) | 🟢 |
| **Partner valleys** | A NEAR project sponsors a themed valley with its own licensed mascot fren and market items | 🟡 (contracts; no token-price promotion) |
| **Market API** | Read-only API and on-chain feed of prices, Cup results and calm totals for dashboards and research | 🟢 |
| **Builder kit** | The valley, market and Cup as a template other developers deploy for their own world | 🟡 |

**4. What never changes as it scales**

Leaves stay play money; nothing earned with Leaves is exportable or sellable; nothing random is ever paid for; nothing is lost for not playing; the chain stays invisible unless the player chooses to look. Real-value features are in `growth-and-monetization-vision.md`, tagged 🔴.

### States and Transitions

**Receipt job:** `queued → sent → confirmed | failed (retry ≤ 5 with growing delay) → parked (repair list)`. The pet or drip works in every state.

**Mirror:** `running → paused (low relayer balance or RPC down) → running`.

**Edition after the hackathon:** `showcase → kept as a second world | merged into another edition | archived` (owner decision).

### Interactions with Other Systems

- **Other editions:** shared code behind the `ItemLedger` interface (`mint`, `move`, `burn`, `status`, all with idempotent job ids). The mock implementation is the proof the interface works. Worlds and data are separate.
- **`main` must not regress:** `EDITION` guards every difference, in UI and in Worker routes.
- **NEAR tools in the build:** `near-contract-standards`, `cargo-near`, `@near-js/*`, testnet RPC, explorer links. Intents, Chain Signatures and NEAR AI are roadmap only.

## Formulas

**Chain writes**: `≈ visitors × (rescues + crafts)`. 200 visitors in judging week × about 3 ≈ 600 receipts, batched; testnet gas is free.

**Mint cap per address**: 20 a day. A judge playing normally produces 2–4.

**Relayer pause threshold**: mirror pauses when the game account's balance cannot cover 100 more batched transactions (value set after measuring gas on day 1).

**Market price** (per item `i`, one price book shared by real and Cup trades):
```
mid_i  = base_i × exp( k_i × gap_i ), clamped to [0.5 × base_i, 3 × base_i]
gap_i  = units players have bought from Kettle − units sold to him (decays over time)
bid_i  = max( 1, floor( mid_i × (1 − SPREAD) ) )      ask_i = ceil( mid_i × (1 + SPREAD) )
```
Each unit traded moves `gap` by ±1, and a multi-unit trade is priced unit by unit along the curve. Every minute the gap decays toward 0 by `DECAY` (5%), so prices drift back to base when nobody trades. `SPREAD` = 10%: buying then selling the same unit always loses Leaves, so the spread is a sink.

| Item | `base` | `k` per unit | Price halves after net sales of |
|---|---|---|---|
| Moon Rock | 2 | 0.010 | 69 units |
| Copium Shroom | 4 | 0.015 | 46 |
| Rug Yarn | 4 | 0.015 | 46 |
| Moon Collar | 30 | 0.050 | 14 |

(The same counts of net buys double the price.)

**Cup payout per round** with N ≥ 10 entrants: 100 + 2 × 60 + 7 × 30 = 430 Leaves to the top 10, plus 5 to each other entrant above 200. Eight rounds a day; one prize per player per day.

**Why a pump-and-dump does not pay**: a Cup player who buys to push a price up must later sell into the bid, below the ask they paid, while the decay pulls the price back. The real-Leaves seller who benefits is capped at 60 Leaves of sales a day. Coordinated accounts are limited by the sit-minute check and 3 entrants per address.

Other gameplay numbers are those of the shared docs, with `MIN_SIT` = 1 and `STARTER_LEAVES` = 10.

## Edge Cases

| Case | Handling |
|---|---|
| Testnet RPC down or slow during judging | Play unaffected; "syncing" dot; mirror cycles through the fallback RPC list. |
| RPC timeout after a send | Treated as unknown, not failed: the retry carries the same `job_id`, so the contract rejects a duplicate. |
| Invalid nonce | Refresh the nonce from the RPC and resend the same batch. |
| Relayer balance low | Mirror pauses; `/health` reports it; play continues. |
| Device data cleared | The visitor id is lost; tokens remain on the old derived id. A recovery code (shown after the first rescue) restores the visitor id. |
| Many visitors on one network (judges, an event) | `FLAG_SHARED_NETWORK=false`; only the 20 mints per address per day limit applies. |
| Scripted abuse of free mints | Needs a server-measured sit minute per account and hits the per-address cap. |
| Judge on desktop | Click and WASD already work. |
| Judge has two minutes | Starter Leaves, `MIN_SIT` 1 and the Gate Shibby make a rescue reachable in about five. The video covers the rest. |
| Automated screening runs the repo | `npm install && npm run dev` starts in mock mode with no secrets and prints that it is in mock mode. |
| Contract bug after deploy | Deploy to a new account, switch `ITEMS_CONTRACT`, re-queue from the bag. |
| Nobody else is trading during a judge's visit | Three labelled market makers ("Kettle's apprentices") trade small amounts every 5 minutes so the board is never frozen. They never enter the Cup. |
| Price at the 3× ceiling and players keep buying | The ask stays at the ceiling; the gap still grows, so it takes longer to fall. |
| Cup round ends during a Worker restart | The round settles from stored state when the alarm fires; prizes are paid once. |
| Player tries to join a Cup with 20 minutes left | Refused; joins close 30 minutes before the end. |
| Player sells real materials while in the Cup | Allowed; the two bags are separate and both move the same price. |
| Market sale would pass 60 Leaves today | Refused; the player can still trade in the Cup. |
| `post_prices` or `settle_round` fails | Queued like a mint, same job id, retried; the round's prizes in Leaves are paid regardless; the round page shows "proof syncing". |
| A judge asks how to check a Cup round | The round page links the round file (setup, every trade, final scores) and the two transactions; a 20-line script in the repo recomputes both hashes. |
| A preview screen is opened | Banner shown; no write route is called (preview routes are read-only and return seeded JSON). |

## Dependencies

| Depends on | For |
|---|---|
| `meme-valley.md`, `leaves-economy.md` | Gameplay in scope |
| `trading-hall.md` §A (Kettle) | Kettle's stall and lines; the Living Market and Cup are specified only in this doc |
| `master-gdd.md` §9 | Mirror rules |
| NEAR testnet RPC and explorer, `near-contract-standards`, `cargo-near`, `@near-js/*` | Chain |
| Existing presence, sit, pets code | Base |
| `nearhackathon.com/HACKATHON.md` | Rules |

## Tuning Knobs

| Knob | Start | Effect |
|---|---|---|
| `EDITION` | `near` | Removes Solana, money and prediction UI and routes. |
| `MIRROR_MODE` | `testnet` / `mock` | Real receipts or logged no-ops. |
| `ITEMS_CONTRACT`, `GAME_ACCOUNT`, `RPC_URLS` | set at deploy | Chain targets. |
| `MINTS_PER_ADDRESS_DAY` | 20 | Relayer protection. |
| `MIN_SIT`, `STARTER_LEAVES` | 1, 10 | Judge-friendly first minutes. |
| `FLAG_SHARED_NETWORK` | false | Judges are never flagged. |
| `FRENS_PRESENT` | Shibby + Froggo, fixed | No schedule in this build. |
| `base`, `k`, `SPREAD`, `DECAY` | table, 10%, 5% a minute | How lively prices are. |
| `MARKET_SELL_CAP` | 60 | Leaves from market sales per day. |
| `PRICE_POST_MINUTES` | 60 | How often prices go on-chain. |
| `PREVIEWS_ENABLED` | true | Shows the telescope door. |
| `CUP_ROUND_HOURS` / `CUP_CHIPS` / `CUP_JOIN_CLOSE` | 3 / 200 / 30 min | Cup pace. |
| Cup prizes | 100 / 60 / 30 / 5 | Faucet size. |
| `CUP_ENABLED` | true | Kill switch. |
| `APPRENTICES` | 3, small trades every 5 min | Keeps the board alive. |

## Visual/Audio Requirements

Same world and style. The Market has its own square at the end of the south-east road (BAZAAR in src/layout.ts, 2026-11-11): Kettle's stall, four item stalls, a Market Cup board; trades and Cup joins only there. PumpHall (south road) keeps up/down and duels. Solana banners and stickers are hidden. One small "receipt" link per Rescue Book entry. Two fren props (torn map, lily hat), one drip mesh (Moon Collar).

## Game Feel

The chain must be unfelt. The only blockchain moment is a pleasant surprise the player chooses to look at.

## UI Requirements

- No wallet button anywhere.
- Rescue Book entry: "receipt ↗" and a "syncing" dot while queued.
- About sheet: "Rescues and crafts are recorded on NEAR testnet. Leaves are play money. Nothing here has cash value."
- Recovery code offered after the first rescue.
- Market sheet: 4 items with bid and ask, Buy / Sell with a quantity stepper, today's sale cap left.
- Cup sheet: time left, chips, Cup bag, live score, top 10, Join.
- Round page: setup hash, results hash, explorer links, "check it yourself" script link.
- Preview sheets: banner "Preview: sample data" across the top of each.
- Every market and Cup sheet: "Play money. No cash value. Free to enter."

## Cross-References

`master-gdd.md` · `meme-valley.md` · `leaves-economy.md` · `trading-hall.md` · `edition-seeker.md` · `edition-web3.md` · `growth-and-monetization-vision.md` · `../meme-valley-brief.md`.

## Acceptance Criteria

Scripts against a local Worker and a local NEAR sandbox (or mock), unless marked.

1. Given a clean clone with no secrets, when `npm install && npm run dev` runs, then the game starts in mock mode and the scripted run (sit → pick → grant → sit → rescue → sell to the market → join a Cup → craft) passes.
2. Given `EDITION=near`, then every Solana, payment, tip, prediction and duel route returns 404 and no such UI element exists.
3. Given a first rescue in mock mode (as granter or co-rescuer), then exactly one `mint_fren` job with the right owner id, species and serial is queued; given a craft, one `mint_drip` job.
4. Given the same visitor id twice, then the derived owner id is identical; given two visitor ids, they differ.
5. Given the contract in a sandbox, then `nft_transfer` on any token fails for any caller; `mint_fren` from a non-game account fails; a second `mint_fren` with a used `job_id` fails and creates no token.
6. Given 10 mint jobs queued at once, then the Mirror sends them with at most one transaction in flight and all 10 tokens exist once.
7. Given the RPC stub times out on the first send and succeeds on the second, then exactly one token exists.
8. Given the RPC is unreachable, then the scripted run still passes and entries show "syncing"; when it returns, the queue drains with no duplicates.
9. Given an account with zero server-measured sit minutes, then no mint is queued for it; given 20 mints from one address today, the 21st is not queued and the item still works in the bag.
10. Given a job that fails 5 times, then it is parked, `/health` lists it, and the pet still follows.
11. Given the branch, then `main`'s `npm run check` and online test still pass.
12. Given Moon Rock at base, when clients A and B together sell 69 units, then both clients show the price at about half of base within 1 s; after 60 minutes with no trades it is back within 10% of base.
13. Given 10,000 random trades from seed 42, then no ask exceeds 3 × base and no bid falls below max(1, 0.5 × base × 0.9) for any item.
14. Given a player who buys 10 units and sells them at once, then their balance is lower than before.
15. Given 60 Leaves of market sales today, then the next sale is refused and the materials stay in the bag.
16. Given the price book at an hour mark, then one `post_prices` job is queued with the current bids and asks; in the sandbox, `latest_prices()` returns them and a second post with the same job id is rejected.
17. Given a scripted Cup round with 12 entrants and known trades, then scores equal chips + Cup bag at closing bids, prizes are 100, 60, 60, 30 × 7 and 5 for the rest above 200, and nobody is paid twice that day.
18. Given a Cup round with 2 entrants, then only the "above 200" prize is paid.
19. Given a round end while the Worker is stopped, then on restart prizes are paid exactly once.
20. Given 3 entrants from one address in a round, then a 4th from that address is refused; given an account with no sit minute, Join is refused.
21. Given `CUP_ENABLED=false`, then no Cup route or UI exists and every other script passes.
22. Given a Cup round in the sandbox, then `commit_round` is posted before the first join is accepted; `settle_round` with a setup whose hash differs is rejected; with the right setup it stores the results hash; the repo's check script recomputes both hashes from the round file and they match.
23. Given a settled round with ≥ 3 entrants, then exactly one trophy is minted to each of the top 3 owner ids, and none can be transferred.
24. Given any preview screen, then it shows the "Preview: sample data" banner, and opening it calls no route that writes Leaves, the bag, the Cup or the chain (route log check).
25. **[live, non-blocking]** On testnet, a rescue's token is visible on the explorer within 60 s.
26. **[manual]** Hosted demo, public repo with LICENSE and README, video and X post exist before 2026-11-14 20:00 UTC.

## Open Questions

0. The economy exception: if judges respond to the market, should the Living Market and Cup come to the other editions as well (which would mean changing the shared Pillar 3)?

1. After the hackathon: keep the NEAR world, merge its systems into the other editions, or both?
2. Which account name for the game on testnet, and which mainnet account receives a prize?
3. Is reusing the CC0 Shiba and Frog acceptable for the entry, or is one original fren model worth half a day?

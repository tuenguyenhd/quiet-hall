# GDD Review, Pass 1 (2026-11-10)

**Documents reviewed (first drafts):** `master-gdd.md`, `leaves-economy.md`, `meme-valley.md`, `trading-hall.md`, `vault-whisperer-npc.md`, `saga-and-long-term.md`, `edition-seeker.md`, `edition-near.md`.
**Not reviewed in this pass:** `growth-and-monetization-vision.md` (written during the review), `edition-web3.md` (written after it).
**Method:** five specialist agents in parallel, each told to find problems, then a creative-director synthesis. Adapted from the studio's `/design-review` (full mode) and `/review-all-gdds`; the skills' own scripts were not run because QuietHall is outside the studio project root.
**Pass 2 has not been run.** The revised documents below are unverified by reviewers.

## Verdicts

| Reviewer | Verdict |
|---|---|
| game-designer | MAJOR REVISION NEEDED |
| economy-designer | MAJOR REVISION NEEDED |
| systems-designer | MAJOR REVISION NEEDED |
| qa-lead | NEEDS REVISION |
| technical-director | NEEDS REVISION |
| **creative-director (final)** | **MAJOR REVISION NEEDED** |

## Findings and what was changed

| # | Finding (sources) | Ruling | Change made |
|---|---|---|---|
| A | Lost frens left at 00:00 UTC, so the valley had no fren about 23% of hours; no first-five-minutes path (game, systems) | Agree | Each fren stays 24 h, two always present; first-timer Shibby at the Gate; first five minutes scripted (`meme-valley.md`) |
| B | Shared node stock gave ~4,632 units/day vs 6,000–9,000 needed at 500 players; crowd scaling jumped; lazy regrow lost partial progress (game, economy, systems) | Per-player stock; shared feeling from additive bloom | Personal stock, continuous regrow anchor, bloom; crowd scaling removed |
| C | Sitting became a duty (storms, quotas, watering); Pillar 1 test contradicted the core loop (game) | Sitting earns and gives, never owed | Pillars 1 and 3 rewritten; storms and Cabal quotas cut; fog only retreats; gardens never wilt; "not a duty" anti-pillar |
| D | Racing vs calm: first-10 marks, serial prestige, weekly rescuer board (game) | Drop them; add co-rescue | Board and first marks removed; co-rescue added; competition confined to the Trading Hall |
| E | Gathering had no decision; 3 s hold was a chore (game) | Tap, not hold | 1 s tap; decision is where to walk; Kettle cap cut so extra gathering earns nothing |
| F | Day-7 emptiness; sinks at ~8% / 45% / ≤60% of faucet (game, economy) | Dyes as recurring sink; fees ×2; trade gated on ratio ≥ 0.8 | Sink plan with stated assumptions; consumable dyes; shop within 10 days; trade gate; pouch cap 1,000 |
| G | 55% sit-linked claim failed for ordinary players (economy, systems) | Lower non-sit faucets; hold by construction | Wish 10, Kettle cap 10, Vault and invites pay no Leaves; non-sit caps ≤ 0.5 × sit cap; share table published including the case that fails (10-minute sitter, 29%) |
| H | Trades could pass Leaves between accounts; on-chain drip could be sold for money (economy, systems, technical) | Close every route | Only the side receiving items may pay; 300 ceiling; band needs 6 pairs; unbanded limit 4× reference cost; receive cap 150; Leaves-earned items never exportable; Seeker receipts frozen |
| I | Daily Drop and hourly auction sized for a crowd that will not exist; 365 assets a year (economy, game) | Weekly, recolours; auction needs 3 present | Weekly Drop from seeded recolours, supply 0.2 × DAU7; auction up to 6 slots a day, opens only with 3 bidders present |
| J | Vault: finale took ~a year; midnight advantage; cards repeated; publication by default; guests could drain the budget; Trust contradictions (game, technical, qa, systems) | Amend | No Leaves, no first bonus, no hardening, no time ranking; cards from a secret seed (168 days without repeat, commit–reveal); 7-day spoiler window; publication opt-in; New accounts get scripted Coldwall; Trust defined only in `leaves-economy.md`; finale = 700 relics server-wide |
| K | NEAR plan had the chain on day 3; sub-account per guest; NEP-245 without a confirmed reference implementation; nonce and duplicate risks; Kettle wallet security claim not honest (technical) | Agree in full | Chain spike first; NEP-171; derived owner ids; one Mirror queue with idempotent job ids; AI Security track dropped; frozen scope and cut order; honest security statement |
| L | ~15 daily counters, three books, four masteries (game) | Three numbers, one book | Three daily numbers; one Rescue Book with pages; one valley craft level in Month 4+ |
| M | Acceptance criteria not automatable or contradicting rules; cross-doc contradictions (qa, systems) | Rewrite; one owner per number | Criteria rewritten as Given/When/Then with stub model, sandbox and clock; device and live checks marked non-blocking; `leaves-economy.md` owns every economy number |
| — | Bag and Leaves in different Durable Objects could not be atomic (technical) | — | One `Economy` Durable Object for bag, Leaves, caps, trades |
| — | Foreground detection is client-reported (technical) | — | Stated plainly; caps, Trust and flags are the real defence |

## Departures from the creative director's rulings

| Ruling | What the documents do instead | Why |
|---|---|---|
| Vault resets on each player's rolling 24 h | Rounds stay on the UTC day; the midnight advantage is removed by dropping the first-crack bonus, hardening and time ranking | One shared daily card is simpler and keeps "today's guard" a shared topic |
| Kettle's catalogue and bond levels 1–3 in Month 1, not MVP | Followed | — |
| Finance bots and real-money markets are anti-pillars and should not be pitched | `growth-and-monetization-vision.md` keeps them, tagged 🔴 as options under review, with this dissent recorded in its §9 | The owner asked for them to be shown as potential; this is an owner decision (master §12, question 2) |

## Not addressed, or still uncertain

- **The sink estimates are guesses.** Purchase rates in `leaves-economy.md` are assumptions; the 0.8 gate must be met with measured data.
- **A player who sits 10 minutes a day and maxes wishes and sales earns only 29% from sitting.** Accepted and documented, not fixed.
- **NEP-245 vs NEP-171:** the claim that NEP-245 lacks a maintained reference implementation came from the technical reviewer with a request to verify; it has not been verified. NEP-171 was chosen because its reference implementation is known.
- **Signing with `@near-js/*` inside the Workers runtime** is unproven until the day-1 spike.
- **Every "verify" row in the NEAR technology map** rests on general knowledge of NEAR, not on a check of current documentation.
- **Metaplex Core frozen receipts** need plugin support that `worker/core.ts` does not have yet.
- **Chapter drama after cutting storms** is an open design question (saga, Open Questions 3).
- **Three days of sitting before the first AI message** may be too slow for the Vault (vault, Open Questions 4).
- `systems-index.md` and `game-concept.md` were not updated to list the new systems.

## Owner decisions waiting

1. Ratify the constitution amendments and the "never exportable" ruling (`master-gdd.md` §3, §9).
2. Keep or drop the 🔴 items in the pitch vision.
3. PumpHall: off when the Trading Hall's shop ships?
4. Future of the NEAR world and the role of the Web3 edition.
5. Enter the NEAR Hackathon with the frozen scope in `edition-near.md`, starting with the chain spike on Nov 11.

## What would make pass 2 APPROVED (creative director's list)

- Rewritten Pillars 1 and 3 applied in every doc.
- One value table, no doc contradicting it.
- A faucet/sink sheet showing ≥ 55% sit-linked for ordinary players and ≥ 0.8 before trade ships.
- `edition-near.md` matching the frozen scope.
- The first five minutes written step by step.
- Every acceptance criterion testable.
- No daily race and nothing lost for not sitting anywhere in the master GDD.

## Changes after pass 1 (owner direction, not reviewed)

2026-11-10, owner decisions:
- **NEAR edition economy exception.** Leaves also come from Kettle's Living Market (player-moved prices), Kettle's Orders and a free 3-hour Market Cup with play chips and Leaves prizes. Sitting is about 35% of Leaves in this edition. The shared Pillar 3 still governs the Seeker and Web3 editions. Cut to make room: node bloom and the Copium Shades recipe.
- **"Beyond the hackathon"** section added to `edition-near.md`: innovations (Proof-of-Calm, open price oracle, Agent Cup, honest agent keys, verifiable rounds, co-rescue receipts, player-set rules), scalability (receipt roots with lazy mint, valley shards, regional markets, parallel Cup brackets), ecosystem plays.
- Not reviewed: the market price formula, Cup prize faucet size and anti-manipulation limits are unreviewed design. Pass 2 should check them first.

2026-11-10, later owner decisions (not reviewed):
- NEAR build gains an on-chain economy record (hourly `post_prices`, Cup `commit_round` / `settle_round`, top-3 trophies). Kettle's Orders move to the roadmap.
- NEAR build gains six **Preview** screens (Cabal Hall, Sitting Bazaar, Whale Order, Calm the FUD Golem, trade feed and trader card, Agent Cup) with sample data, each labelled, behind one door; nothing they show writes to the economy or the chain.
- Saga doc gains Cabals in depth and an events table (lessons from MMO guilds and world events).
- Pitch outline added: `../../pitch-near.md`.
- NEAR research findings recorded in `edition-near.md`; NEAR Intents is roadmap only (value lane; no testnet), plus an intent-style play market of our own design.

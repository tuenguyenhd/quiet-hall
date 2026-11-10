# Quiet Hall: Master GDD (the bigger picture)

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Supersedes nothing.** `game-concept.md` stays the record of the shipped game. This doc maps where it goes next and links the system and edition GDDs.
> **Rules source**: `.specify/memory/constitution.md`. Section 3 lists the amendments this plan needs. Until the owner ratifies them, the constitution wins.

---

## 1. Vision

**A calm world you sit in, and a silly world you play in, joined by one currency you can only earn by being still.**

Quiet Hall today is a shared meditation space. This plan grows it into a **cozy social MMO**: you meditate to earn **Leaves**, walk out into **Meme Valley** to rescue lost frens with whoever else is there and craft them drip, and bring it to the **Trading Hall** to haggle with an AI merchant. Under the caves, an AI golem guards a vault that players try to talk open.

No combat, no power stats, no real money in or out of the game economy, and nothing is ever lost because you did not show up.

## 2. World map

```
                      [ Lookout ]
                           |
                 (valley road, lantern trail)
                           |
   [ MEME VALLEY ] --------+
   Gate · Wen Moon Lake · Rug Fields · Ape Hill · Copium Caves
                                                     |
                                               [ The Vault ]  (Coldwall, AI guard)

 [Maple Grove] [Stone Garden] [Lake] [Tea House]
                \      |       |      /
                 [ COURTYARD + QUIET HALL ]   <- calm core (shipped)
                           |
                     (south road)
                           |
                   [ TRADING HALL ]
            Kettle's stall · Drop pedestal · Auction podium · Price board
```

| Zone | Mood | What you do | Doc |
|---|---|---|---|
| Quiet Hall + calm places | Calm | Sit, breathe, bells, World Sit. **Earn Leaves.** | `game-concept.md` |
| Meme Valley | Cozy, together | Gather, rescue lost frens (co-rescue), craft drip, fill the Rescue Book | `meme-valley.md` |
| Trading Hall | Lively, competitive (opt-in) | Kettle's shop and haggling; later trade, weekly Drop, auction | `trading-hall.md` |
| The Vault | Brain duel | 3 messages a day to talk Coldwall into opening | `vault-whisperer-npc.md` |

Competition lives only on the south road. The valley and the hall have no races and no rankings.

## 3. Pillars (v2) and the constitution amendments they need

| # | Pillar | Test |
|---|---|---|
| 1 | **Calm first** | Inside a calm zone or during a sit, nothing may ask, count, sound, notify, or compete; what you own may be seen, silently and still; and nothing anywhere is ever lost because you did not sit. |
| 2 | **Free to join, free to play** | A visitor with no wallet can do every activity in every GDD here, some after three days of sitting (Trust). No device, token or payment unlocks gameplay. |
| 3 | **Stillness is the engine** | Sitting is the main source of Leaves: all other daily Leaves caps together are at most half the sitting cap, and at least 55% of Leaves created each week come from sit-linked sources. The community's sit minutes only ever add to the world. *(Seeker and Web3 editions. The NEAR edition is a recorded exception: there the market, orders and Cup are equal sources; see `edition-near.md`.)* |
| 4 | **Play money only** | Leaves cannot be bought, cashed out or moved on-chain. Nothing random is ever paid for. Nothing earned or bought with Leaves can ever be sold for money: on-chain records of such items are frozen under game control. |
| 5 | **No power, only stories** | Progress unlocks looks, places, lore and recipes. Never stats, speed or advantage. |
| 6 | **Light on phones** | First load ≤ 5 MB; each zone ≤ 2 MB on entry; at most three daily numbers on screen; one book. |

**Amendments to ratify (owner decision):**

| Constitution text | Proposed change | Why |
|---|---|---|
| §1 "Calm first… No chat, no leaderboards of money, no pop-ups during a sit" | Replace the test with Pillar 1's sentence above | Makes "show your fren beside your cushion" legal and bans anything owed |
| Concept anti-pillar "Not a trading app" | "Not a real-money trading app. In-game item trading for Leaves is allowed, in the Trading Hall only." | The Trading Hall |
| §7 "Paying never buys odds, random drops or rank" | Add: "This applies to Leaves as well as money. Leaves cannot be purchased or cashed out, and Leaves-earned items are never exportable." | Closes the play-money loopholes |
| §5 "never a copy of a specific meme character" | Unchanged. The valley cast is original. Famous characters only through licensed partner drops. | Reconfirmed |

**Anti-pillars (v2):** not a casino; not a real-money market; not grind-to-win; not loud; not an idle farm; **not a duty** (no quotas, storms, wilting or decay).

## 4. The loops, by time horizon

| Horizon | Loop | Tier |
|---|---|---|
| 30 s | Walk, tap a node, pocket a Moon Rock. Sit down next to a lost fren beside a stranger. | MVP |
| 5–15 min | Sit 10 min → walk to the valley → rescue a fren with others → craft a collar → walk back and sit with the fren beside you. | MVP |
| Daily (three numbers only) | Leaves from sitting · wishes left · gathers left. | MVP |
| Daily (opportunistic, never listed as tasks) | World Sit, a bell, 3 haggles, 3 Vault messages. | Month 1 |
| Weekly | The Drop, Best Haggle, the Vault wall's Best Cope. | Month 2 |
| Monthly | Real full moon: Full Moon Mewn, a festival craft, a story beat. | Month 2+ |
| Months | Bonds to level 10, Den, garden, Cabal lanterns, village rebuild. | Month 4+ |

**The loop that joins everything:** *sit → Leaves → rescue and craft together → come back and sit, with your fren beside your cushion.*

**The first five minutes** are scripted step by step in `meme-valley.md`: first sit → lantern trail → Shibby at the Gate → two rocks → sit with him one minute → he follows you.

## 5. Story in one paragraph

The valley was once **Moon Village**. One night the **Great Rug** hit: the ground was pulled out, the frens scattered, the Great Bell cracked and a fog called **the FUD** rolled in. Players rescue the frens, piece together Shibby's torn "wen moon" map, thin the fog with their combined sit minutes, rebuild the village, and learn that nobody pulled the Rug: everyone panicked and ran at once. When the village rings the mended Bell together, the moon finally rises. The moral, "calm is what holds", is why the game never punishes absence. Full arc: `saga-and-long-term.md`.

## 6. Cast

| Character | Role | AI? |
|---|---|---|
| The 7 resident frens (shipped) | Blessings in the calm zone | No |
| **Shibby, Bonko, Froggo, Hatdawg, Mewn** | Lost frens; once rescued they join your pets | Scripted |
| **Kettle** | Merchant: buys, sells, haggles. (Saga: the old village Dev.) | Month 1 |
| **Coldwall** | Stone golem guarding the Dev's vault | Month 1 |
| **Elder Hodl**, **Paperhands** | Story-giver tortoise; nervous raccoon | Later |

Vocabulary: a **resident fren** blesses you; a **lost fren** is rescued and becomes a **pet**; **drip** is pet gear; a **receipt** is the on-chain record of an item.

## 7. Systems index (new systems; shipped ones are in `systems-index.md`)

| # | System | Tier | Doc |
|---|---|---|---|
| 18 | Leaves + Economy store | **MVP** | `leaves-economy.md` |
| 19 | Trust (anti-bot) | **MVP** | `leaves-economy.md` |
| 20 | Bag | **MVP** | `meme-valley.md` |
| 21 | Valley zone + gathering (personal stock, bloom) | **MVP** | `meme-valley.md` |
| 22 | Lost frens, wishes, co-rescue | **MVP** | `meme-valley.md` |
| 23 | Crafting + drip | **MVP** | `meme-valley.md` |
| 24 | Rescue Book | **MVP** | `meme-valley.md` |
| 25 | Item chain mirror (`ItemLedger`) | per edition | §9, edition docs |
| 26 | Kettle: sell (MVP) · shop with dyes (Month 1) | MVP / Month 1 | `trading-hall.md` |
| 27 | Haggle (AI) | Month 1 | `trading-hall.md` |
| 31 | The Vault (Coldwall) | Month 1 | `vault-whisperer-npc.md` |
| 32 | AI NPC framework | Month 1 | §8 |
| 34 | Bonds, expeditions, variants | Month 1 | `saga-and-long-term.md`, `meme-valley.md` |
| 33 | Fog, fishing, village donations | Month 2 | `saga-and-long-term.md` |
| 28–30 | Player trade, weekly Drop, Live Auction | **After the trade gate** | `trading-hall.md` |
| 35 | Dens, gardens, Cabals, mentors, valley craft level | Month 4+ | `saga-and-long-term.md` |

**The trade gate:** trade, Drop and auction do not ship until the measured 7-day sink ÷ faucet ratio is ≥ 0.8 (`leaves-economy.md`).

PumpHall predictions and duels (14–16): Seeker edition only, behind a flag, points only.

## 8. AI NPC framework (shared by Kettle, Coldwall and later NPCs)

1. **Server only.** The client never calls a model.
2. **An NPC = persona + rule card + memory + tool whitelist.** Memory is one summary per (NPC, player), max 300 characters.
3. **The model proposes, the server decides.** Numbers come back as structured output and are clamped by the server. A win condition (the Vault) counts only as a native tool-use call from the API, never as text. Temperature 0 where an outcome depends on it.
4. **Trusted players only.** New accounts get scripted lines, so AI cost is bounded by the number of Trusted players.
5. **Quotas and budget.** Per player per NPC per UTC day (Kettle 3, Coldwall 3), 280 characters in. A global `AI_DAILY_USD` (start 5: Vault 3, Kettle 2) converted to a call cap; each call reserves a unit in a Durable Object before it is made. At the cap, NPCs fall back to scripted lines and the game keeps working.
6. **Safety and privacy.** Player text is data. Player text and model replies both pass a word filter before display or publication. Players are told their messages go to an AI provider; messages are kept 30 days or until deleted; publication is opt-in.
7. **AI characters have no wallet at launch.** If one is added later, its key lives in a separate signer service with limits enforced in the contract, and the security claim names what is and is not protected (`edition-near.md`, technology map).

## 9. Editions and chain plan

Three editions share the system GDDs and are separate worlds (separate balances, serials, boards):

| | **Web3 (chain-neutral)** `edition-web3.md` | **Seeker** `edition-seeker.md` | **NEAR** `edition-near.md` |
|---|---|---|---|
| Role | The baseline product for anyone | Solana dApp Store product | NEAR Hackathon build |
| Sign-in | Guest → code → email/passkey → optional wallet | Guest → optional Solana wallet | Guest; derived owner id, no wallet |
| Paid cosmetics | Card first, crypto optional | SOL / USDC (shipped) | None |
| Receipts | Optional, chain chosen late | Metaplex Core, frozen (later) | NEP-171, bound (day one) |
| Ecosystem perks | None | Seeker identity marks only | None |
| Predictions / duels | Not included | Behind a flag | Off |

**Rules for all:**
- One `ItemLedger` interface (`mint`, `move`, `burn`, `status`, idempotent job ids) with a mock implementation; chain code sits behind it.
- The **server bag is the source of truth.** The chain is a public receipt, written from one queue with one transaction in flight, and never blocks play.
- **Mirrored:** rescued frens and relics (bound), crafted drip (movable only by the game).
- **Never on-chain:** Leaves, materials, haggle results.
- **Never exportable:** anything earned or bought with Leaves. Receipts are non-transferable or frozen under game control. (Proposed ruling; closes the earlier open question on export. Owner to ratify.)

## 10. Roadmap

| When | Ships | Goal |
|---|---|---|
| **By Nov 14, 2026 23:59 UTC** | NEAR build: frozen scope in `edition-near.md` (calm core, Leaves, two frens with co-rescue, one recipe, Kettle's Living Market, Orders, Market Cup, NEP-171 receipts) | NEAR Hackathon, Games track |
| Month 1 | Full valley MVP (5 frens, 6 recipes), Kettle shop with dyes, Haggle, the Vault, bonds, expeditions, variants, chapter 1 | D7 retention; sink ratio toward 0.7 |
| Month 2 | Fog, fishing, village donations; then trade, Drop, auction once the gate is met | Sink ratio ≥ 0.8; a working market |
| Months 4–6 | Dens, gardens, Cabals, mentors, chapter 3 | D90 retention |
| After | Chapter 4, Moon Festival, new lands | Seasons |

Future potential beyond this roadmap (more games, finance-flavoured and AI features, monetization) is in `growth-and-monetization-vision.md`, tagged by readiness.

## 11. What success looks like (targets, to be measured)

| Metric | Target | Why |
|---|---|---|
| New visitor rescues a fren in the first session | ≥ 40% | The first five minutes work |
| Rescues that are co-rescues | ≥ 30% | The valley is played together |
| Leaves from sit-linked sources (weekly, all players) | ≥ 55% | Pillar 3 |
| Sink ÷ faucet (7-day) | 0.8–1.1 before trade ships | No runaway inflation |
| D7 / D30 retention | to be set from the first month's data | No baseline is assumed |
| AI spend per daily player | ≤ $0.01 | Inside the budget |

## 12. Top risks and open questions

**Risks**
1. **Scope vs one developer.** Each tier ships alone; content comes from clocks, the community and AI.
2. **Nothing to spend Leaves on.** The shop with consumable dyes must ship within 10 days of the valley; the trade gate holds the market back until sinks work.
3. **Bots and Leaves passing.** Trust, daily caps, pay-only-for-items-received, price limits, no export.
4. **Three editions split the effort.** One codebase, one flag, one ledger interface; only the NEAR build is on a deadline.
5. **Store reviewers read "trading" as financial.** Play money only, frozen receipts, clear labels.
6. **Calm players feel the game got loud.** Pillar 1's test on every feature; competition only on the south road.

**Open questions (owner)**
1. Ratify the amendments in §3 and the "never exportable" ruling in §9?
2. `growth-and-monetization-vision.md` lists real-value and finance features the creative-director review advised against pitching. Keep them in the pitch as tagged options, or drop the 🔴 items?
3. Does the Trading Hall replace PumpHall in the Seeker edition when the shop ships?
4. After the hackathon, is the NEAR world kept, merged or archived? Is the Web3 edition a product or the design baseline?
5. Is three days of sitting before the first AI message too slow for the Vault, the most shareable feature?

## 13. Document map

| Doc | Covers |
|---|---|
| `master-gdd.md` | This file |
| `edition-web3.md` | The chain-neutral Web3 edition (baseline) |
| `edition-seeker.md` | The Seeker edition |
| `edition-near.md` | The NEAR edition, hackathon scope, NEAR technology map |
| `leaves-economy.md` | Currency, **all economy numbers**, Trust, anti-bot |
| `meme-valley.md` | Zone, gathering, bag, lost frens, co-rescue, crafting, Rescue Book, first five minutes |
| `trading-hall.md` | Kettle, haggle, trade, weekly Drop, auction |
| `vault-whisperer-npc.md` | Coldwall and the Vault |
| `saga-and-long-term.md` | Story chapters, fog, bonds, expeditions, Dens, Cabals |
| `growth-and-monetization-vision.md` | Pitch material: future games, AI, monetization, tagged by readiness |
| `reviews/review-pass-1-2026-11-10.md` | Review findings, rulings and what changed |
| `game-concept.md`, `systems-index.md`, `pvp-prediction-duel.md` | The shipped game |
| `../meme-valley-brief.md` | One-page brief for the NEAR build |

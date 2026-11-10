# Leaves Economy

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Implements Pillars**: 3 (Stillness is the engine), 4 (Play money only), 2 (Free to play)
> **Tier**: NEAR MVP (sit faucets, wish reward, Kettle buy-back, craft fees); later tiers add sinks
> **This doc owns every economy number.** Other GDDs link here and must not restate a value differently.
> **Exception:** the NEAR edition has its own value table (`edition-near.md`, "NEAR economy"), with market, order and Cup faucets. It does not follow the rule of construction below. It is a separate world, so its Leaves never reach the other editions.

## Summary

Leaves are Quiet Hall's single soft currency. You earn them mainly by meditating and spend them in the Valley and the Trading Hall. They live only on the game server, cannot be bought with money and cannot be cashed out.

## Overview

Every activity outside the calm zone runs on Leaves: crafting fees, Kettle's shop, the weekly Drop, auction bids and player trades. The main faucet is sitting (1 Leaf per full minute, capped per day). All other daily faucets together are capped at half the sitting cap, so the calm half of the game funds the playful half by construction. Sitting earns and gives; it is never owed, and no balance ever shrinks because you stayed away.

## Player Fantasy

"My quiet time is worth something here." A ten-minute sit pays for a hat for Shibby. Nobody can buy their way ahead of me, and nothing is taken from me when I don't show up.

## Detailed Design

### Core Rules

1. **One currency.** Leaves are whole numbers, never negative.
2. **Server-side only.** Leaves are never a token, never on any chain, never shown with a money value.
3. **No purchase, no cash-out, no gifts.** Leaves move between players only as payment for an item in a trade or auction (`trading-hall.md`), and only from the side that receives the item.
4. **One store.** The bag, Leaves, daily caps and trades live in one `Economy` Durable Object (SQLite), separate from the money `Ledger`. Every change is one transaction that inserts a row `{account, delta, reason, ref, ts}` and updates a stored balance column. Rows are the audit trail; the stored balance must always equal their sum.
5. **Accounts.** A visitor has a device account. Linking a wallet or a recovery code lets the balance survive a new device. Linking changes nothing else: every limit depends on **Trust**, never on a wallet.
6. **Earning needs presence, and the caps are the real defence.** Sit time is measured by the server clock from `sit_start` to `sit_end` while the socket is connected. The client also reports when the sit view is hidden, and hidden time does not count; this report can be faked by a modified client, so the daily caps, Trust and the flag rules are what actually bound abuse.
7. **Day boundary** is 00:00 UTC. Caps are keyed by UTC date (no reset job).
8. **No decay.** Balances never shrink over time.

### Value table (single source for all docs)

**Faucets**

| Reason | Source | Amount | Daily cap | Sit-linked | Tier |
|---|---|---|---|---|---|
| `sit` | Sitting | 1 per full minute, sit ≥ `MIN_SIT` | 60 (Trusted) / 30 (New) | yes | MVP |
| `world_sit` | ≥ 8 of the 10 World Sit minutes | +20 | once | yes | MVP |
| `bell` | Seated at the hourly ring, in a sit that reaches `MIN_SIT` | +5 | 3 | yes | MVP |
| `streak` | First paying sit of the day | +2 × streak days, max +30 | once | yes | MVP |
| `wish` | A lost fren rescue (granted or co-rescued) | +10 | 2 | no | MVP |
| `sell_kettle` | Materials sold to Kettle | floor price × units | 10 Leaves | no | MVP |
| `welcome` | First visit | `STARTER_LEAVES` (0 Seeker, 10 NEAR) | once ever | no | MVP |
| `trade_in` | Item sold to a player, after tax | price − burn | 150 received | transfer, not a faucet | after the trade gate |

The Vault and invites pay no Leaves (they pay relics, titles and drip).

**Rule of construction (Pillar 3):** the non-sit daily caps (`wish` 20 + `sell_kettle` 10 = 30) must stay ≤ 0.5 × the Trusted sit cap (60). Any new non-sit faucet must fit inside that 30 or replace part of it.

**Maximum created per account per day:** 60 + 20 + 15 + 30 + 20 + 10 = **155**.

**Sit-linked share for ordinary players** (7-day streak = +14; all take both wishes and sell the full 10):

| Player | Sit-linked | Total | Share |
|---|---|---|---|
| 30 min sat, World Sit, 1 bell | 30 + 20 + 5 + 14 = 69 | 99 | 70% |
| 20 min sat, World Sit, 1 bell | 59 | 89 | 66% |
| 30 min sat, no World Sit, no bell | 44 | 74 | 59% |
| 20 min sat, no World Sit, no bell | 34 | 64 | 53% |
| 10 min sat only, streak day 1 | 12 | 42 | 29% |

The pillar target (≥ 55% of all Leaves created in a week come from sit-linked reasons) is a population measure. It holds for anyone sitting about 20 minutes with the World Sit or a bell; it does not hold for a player who sits little and maxes both wishes and sales. That player is rare and bounded at 30 non-sit Leaves a day.

**Sinks**

| Reason | Sink | Amount | Tier |
|---|---|---|---|
| `craft_fee` | Crafting drip | 10 / 10 / 10 / 20 / 20 / 80 (per `meme-valley.md` recipes) | MVP |
| `dye` | Consumable dye: recolours one drip, used up | 15 | Month 1 |
| `shop` | Kettle goods (recipes 60, bag +4 slots 120 / 200 / 300, decor 40–150) | list or haggled price | Month 1 |
| `expedition` | Snacks for a pet expedition | 10 / 18 / 30 | Month 1 |
| `donate` | Village projects (additive, open-ended) | any | Month 2 |
| `drop` | Weekly Drop | curve, `trading-hall.md` | Month 2 |
| `auction` | Winning bid, all burned | bid | Month 2 |
| `trade_tax` | 5% of every trade price, burned | — | after the trade gate |
| `den`, `garden`, `cabal` | Furniture, seeds, Cabal decor | open-ended | Month 4+ |

**Floor prices (Kettle buys):** Moon Rock 1, Hopium Herb 1, Rug Yarn 2, Copium Shroom 2, Diamond Pebble 8.

### Sink plan and the trade gate

Design estimate, not a measurement. Assumptions: an engaged player creates about 90 Leaves a day; purchase rates are guesses to be replaced by data.

| Stage | Recurring sinks per engaged player per day (estimate) | Ratio (burned ÷ created) |
|---|---|---|
| MVP (hackathon week) | crafting ≈ 15 | ≈ 0.17 |
| Month 1 | crafting 20 + dye 15 + shop 20 + snacks 10 = 65 | ≈ 0.7 |
| Month 2 | + donations 10 + Drop and auction 10 = 85 | ≈ 0.9 |

1. **Pouch cap:** balances are capped at 1,000 until Kettle's shop ships. Earnings above the cap are not written; the pouch sheet says "Your pouch is full".
2. **The shop ships within 10 days of the valley opening to the public** (hackathon judging week excepted).
3. **Trade gate:** player-to-player trade, the Drop and the auction do not ship until the measured 7-day ratio is ≥ 0.8.
4. **Weekly health check:** target ratio 0.8–1.1. Below 0.8 for two weeks: add or cheapen a recurring sink, never raise a faucet. Above 1.1: lower craft fees first.

### Trust (the only gate; this section is the single source)

| Status | How | Can | Cannot |
|---|---|---|---|
| **New** | default | Sit, gather, rescue, craft, sell to and buy from Kettle, read the Vault wall, talk to scripted Kettle and Coldwall | Trade, bid, buy the Drop, use AI messages (Haggle, Vault), publish on the Vault wall. Sit cap 30. |
| **Trusted** | 3 different UTC days with ≥ 10 paid sit minutes each | Everything. Sit cap 60. | — |
| **Flagged** | a flag rule fires | Sit (unpaid), walk, chat | Earn, trade, bid, buy the Drop, AI messages |

Trust costs only time, so Pillar 2 holds: every activity is free, some after three days of sitting. A Seeker Genesis Token or a linked wallet gives a cosmetic mark only.

**Flag rules:** (a) more than 3 accounts earning `sit` from one network address in a UTC day (off when `FLAG_SHARED_NETWORK=false`); (b) more than 10 trades in a UTC day with the same partner; (c) 5 or more accounts created from one address in an hour. A flag sets the account to Flagged from New or Trusted; the owner clears it, restoring the earlier status with no back-pay.

### States and Transitions

| From | To | When |
|---|---|---|
| New | Trusted | third qualifying day completes |
| New, Trusted | Flagged | a flag rule fires |
| Flagged | New or Trusted (whichever it was) | owner clears |

Sit session: `idle → sitting → hidden (not counting) → sitting → ended (paid)`. Hidden for more than 60 s in one stretch, or socket lost for more than 60 s, ends the session and pays the whole minutes counted so far.

### Interactions with Other Systems

- **Sit (4):** `sit_start`, `sit_end`, `hidden`, `shown` messages; server clock.
- **Group bell / World Sit (5):** the Hall DO reports who was seated at the ring; the bonus is paid when that sit ends, if it reached `MIN_SIT`.
- **Invites + streaks (13):** the streak count moves from the device to the server.
- **Meme Valley:** `earn(wish)`, `spend(craft_fee)`, `earn(sell_kettle)`; the bag shares the Economy DO.
- **Trading Hall:** prices, escrow, burn, Trust.
- **Vault:** Trust only; no Leaves.
- **Money Ledger (12):** separate object; no route links the two.

## Formulas

**Sit pay**
```
counted_seconds = server seconds between sit_start and sit_end, minus hidden seconds
sit_minutes     = floor( counted_seconds / 60 )
pay             = 0                                         if sit_minutes < MIN_SIT
                = min( sit_minutes, SIT_CAP(status) − sit_paid_today )   otherwise
```
A sit that crosses 00:00 UTC is split at the boundary; each part is checked against its own day's cap, and `MIN_SIT` is tested on the whole sit.

Examples: Trusted, 50 paid today, sits 20 min → 10. Sit of 2 min 59 s → 0. Sit 23:50–00:10 with 55 paid on day 1 and 0 on day 2 → 5 and 10.

**Streak**: `bonus = min( 2 × streak_days, 30 )`; a UTC day with no paying sit resets `streak_days` to 0.

**Kettle buy-back**: units are sold one at a time in the order chosen; a unit is bought only if `sold_today + floor_price ≤ KETTLE_BUY_CAP`. Example: 8 Leaves sold today, a Diamond Pebble (8) is refused, two Moon Rocks (1 each) are bought.

**Trade tax**: `burn = max( 1, price − floor( price × 0.95 ) )`; `seller_gets = price − burn`. Minimum price 2 (seller gets 1).

**Health ratio**: `Σ negative deltas with a sink reason ÷ Σ positive deltas with a faucet reason`, over 7 days, excluding `trade_in` and the matching buyer payment (transfers).

## Edge Cases

| Case | Handling |
|---|---|
| App hidden for 30 s twice during a 10-minute sit | 9 minutes counted, 9 Leaves. |
| App hidden for 61 s | Session ends; whole minutes counted so far are paid; the player can sit again. |
| Two devices, one account, both sitting | Only the first session is paid; the second is told after the sit. |
| Bell rings 2 minutes into a sit that ends at 2 min 30 s | No bell bonus (sit under `MIN_SIT`). |
| Bell rings in a sit that ends at 5 min | +5. |
| Cap reached mid-sit | The sit continues; the summary afterwards says "Today's Leaves are full". Nothing is shown during the sit. |
| Pouch at 995 with the 1,000 cap, earns 10 | 5 are written. |
| Device data cleared with no link | The balance is lost; the first-rescue card offers a recovery code. |
| Economy write fails | The action fails as a whole (no craft without the fee, no fee without the craft). |
| Spend larger than balance | Refused, no row. |
| Flagged by mistake | Balance untouched; owner clears; no back-pay. |
| A modified client never reports "hidden" | It earns at most the daily cap, like an honest player sitting an hour. Accepted; rule 6. |

## Dependencies

| System | Direction | Needs |
|---|---|---|
| Sit + breathing timer (4) | Leaves depends on it | start, end, hidden, shown |
| Presence (3) | Leaves depends on it | socket state, network address |
| Group bell + World Sit (5) | Leaves depends on it | seated-at-ring list |
| Meme Valley | depends on Leaves | wish, craft fee, buy-back; shared Economy DO |
| Trading Hall | depends on Leaves | spend, escrow, release, burn, Trust |
| Vault | depends on Leaves | Trust |
| Saga | depends on Leaves | later sinks |

## Tuning Knobs

| Knob | Start | Safe range | Effect |
|---|---|---|---|
| `SIT_CAP_NEW` / `SIT_CAP_TRUSTED` | 30 / 60 | 20–40 / 45–90 | Daily ceiling from sitting. |
| `MIN_SIT` | 3 min (1 in the NEAR judging build) | 1–5 | Shortest paying sit. |
| `WORLD_SIT_BONUS` | 20 | 10–30 | Pull toward the shared moment. |
| `BELL_BONUS` / `BELL_CAP` | 5 / 3 | 3–10 / 1–5 | Hourly pull. |
| `STREAK_STEP` / `STREAK_MAX` | 2 / 30 | 1–3 / 20–40 | Daily return. |
| `WISH_REWARD` / wishes per day | 10 / 2 | 5–15 / 1–3 | Valley faucet (inside the 30 non-sit budget). |
| `KETTLE_BUY_CAP` | 10 | 5–20 | Material faucet (inside the 30). |
| `STARTER_LEAVES` | 0 / 10 | 0–20 | First craft without waiting. |
| `TRADE_TAX` | 5% | 3–10% | Burn per trade. |
| `TRUST_DAYS` / `TRUST_MIN` | 3 / 10 | 2–5 / 5–15 | Bot friction. |
| `POUCH_CAP` | 1,000 | removed when the shop ships | Stops a pile-up. |
| Craft fees, dye price, snack prices | per sink table | ±50% | Sink size. |

All knobs live in one data file shared by client and Worker.

## Visual/Audio Requirements

A leaf icon and number in the top bar, hidden during a sit and inside the Quiet Hall. A soft rustle on the post-sit summary. No coin sounds.

## Game Feel

Earning is quiet and after the fact; you never watch a counter while breathing. Spending is where the play is, outside the calm zone.

## UI Requirements

- Post-sit summary: "You sat 12 min · +12 Leaves".
- Pouch sheet: balance, today's three numbers (Leaves from sitting, wishes left, gathers left), Trust progress ("2 of 3 days").
- First open: "Leaves are earned by sitting. They can't be bought or cashed out."

## Cross-References

`master-gdd.md` §3, §11 · `meme-valley.md` · `trading-hall.md` · `vault-whisperer-npc.md` · `saga-and-long-term.md`.

## Acceptance Criteria

All run as scripts against a local Worker with a controllable clock, unless marked.

1. Given a Trusted account with 50 `sit` Leaves today, when it sits 20 counted minutes, then exactly 10 Leaves are written.
2. Given any account, when a sit ends at 179 counted seconds, then 0 Leaves; at 180 seconds, then 3.
3. Given a 10-minute sit in which the client reports hidden for 30 s twice, then 9 Leaves; given one hidden stretch of 61 s starting at minute 4, then the session ends and 4 Leaves are written.
4. Given two sessions on one account over the same 10 minutes, then 10 Leaves in total.
5. Given a sit from 23:50 to 00:10 UTC with 55 paid on day 1, then 5 are written for day 1 and 10 for day 2.
6. Given a bell at minute 2 of a sit that ends at 2:30, then no `bell` row; ending at 5:00, then one `bell` row of 5.
7. Given 2 qualifying days and one 9-minute day, then the account is New; after a third qualifying day it is Trusted.
8. Given a New account, when it opens a trade, bids, buys the Drop or sends an AI message, then the server returns `needs_trust`.
9. Given 4 accounts paid `sit` from one address in a UTC day with `FLAG_SHARED_NETWORK=true`, then all 4 are Flagged and later sits write no rows; with the knob false, none is flagged. Clearing restores the earlier status and writes no back-pay.
10. Given 8 Leaves sold to Kettle today, when the player sells 1 Diamond Pebble and 2 Moon Rocks, then the pebble stays in the bag and 2 Leaves are paid.
11. Given a balance of 995 and `POUCH_CAP` 1,000, when 10 are earned, then 5 are written.
12. Given the route table, then no route with a money, signature or chain-transaction input writes an Economy row (static check of route → reason codes).
13. Given 1,000 random valid and invalid actions from seed 42, then for every account the stored balance equals the sum of its rows and no balance is negative.
14. Given the per-day faucet caps in the data file, then `wish_cap × WISH_REWARD + KETTLE_BUY_CAP ≤ 0.5 × SIT_CAP_TRUSTED` (unit test on the data file).
15. Given an avatar seated in the Quiet Hall, then the DOM contains no element with `data-ui="leaves"` (headless check).

## Open Questions

1. Is 60 Leaves a day from sitting right for people who sit two hours? Proposed: keep; long sitters get titles, not more Leaves.
2. Should the 10-minute-a-day player (29% sit-linked) be nudged, or left alone? Proposed: left alone; nothing is owed.
3. One balance shared by a linked NEAR code and a linked Solana wallet? Editions are separate worlds, so this only matters if they ever merge.

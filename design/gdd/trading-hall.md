# Trading Hall (Kettle, Haggle, Player Trade, Weekly Drop, Live Auction)

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Implements Pillars**: 4 (Play money only), 5 (No power), 1 (Calm first, by zoning)
> **Tier**: Kettle buy-back = MVP · Kettle shop + Haggle = Month 1 · Player trade, Drop, Auction = after the **trade gate** (`leaves-economy.md`)
> **Economy numbers** (floor prices, tax, caps, Trust) are owned by `leaves-economy.md`.

## Summary

The south-road district becomes a market where players spend Leaves: an AI merchant you can bargain with, direct trades between players, a weekly limited item on a rising price, and a live auction when a crowd is present. Everything is play money, and nothing bought here can ever leave the game for cash.

## Overview

The Trading Hall is the "degen" side with the wager removed. The thrill is timing, bargaining and bragging. This is where competitive energy lives, on its own road, away from the hall and the valley. Kettle sells a small catalogue, buys spare materials and haggles in chat. Players trade drip and materials face to face under price rules that stop Leaves being passed around. The weekly Drop sells one recoloured item on a price curve. The auction runs only when at least three bidders are standing at the podium.

## Player Fantasy

"I talked Kettle down to 62, caught the drop at number 9 and sold a scarf for double." The swagger of a market trader, with nothing real to lose.

## Detailed Design

### Core Rules

**Zone**
1. The south road and the former PumpHall building. All market UI, sounds and ticker lines are tagged `zone=market` and exist only inside it.
2. Prediction games and duels: off in the NEAR edition, behind a flag in the Seeker edition (`edition-seeker.md`).
3. Only Leaves are used. Paid cosmetics are never sold, listed or traded here.
4. **Nothing from this market is ever exportable.** Items earned or bought with Leaves stay under the game's control on every chain (`master-gdd.md` §9).

**What can change hands**

| Item type | Kettle buys | Kettle sells | Player trade | Drop | Auction |
|---|---|---|---|---|---|
| Materials | yes | no | yes | no | no |
| Crafted drip | no | no | yes | no | no |
| Dyes (consumable), recipes, bag slots | no | yes | dyes only | no | no |
| Decor | no | yes | yes | no | no |
| Drop items (numbered) | no | no | yes, after the drop ends | yes | no |
| Auction rares (numbered) | no | no | yes | no | yes |
| Rescued frens, variants, Vault relics, paid cosmetics | never | never | never | never | never |

**A. Kettle's shop (MVP: Sell tab only; Month 1: Buy tab)**
5. **Sell:** materials at floor price up to the daily buy cap (`leaves-economy.md`). Scripted lines.
6. **Buy:** a fixed catalogue, all goods always available, per-player limits where stated:

| Good | Price | Limit |
|---|---|---|
| Dye (8 colours; recolours one drip, used up) | 15 | none |
| Recipe scroll (3 at launch: new drip) | 60 | once each |
| Bag +4 slots | 120, then 200, then 300 | 3 times |
| Decor (4 items; stall props until Dens ship) | 40 / 60 / 100 / 150 | none |

**B. Haggle (Month 1, AI, Trusted only)**
7. On any catalogue good except dyes, tap **Haggle**. **3 messages per Trusted player per UTC day**, 280 characters, shared across goods. New accounts see list prices and scripted lines.
8. Each reply is a line of talk plus an **offer**. The server computes the offer (Formulas); the model only proposes.
9. The offer can go down, stay, or go back up toward list if Kettle is insulted. It can never go below the floor or above list.
10. The last offer is valid for 10 minutes for that player and that good. Buying uses it. Not buying costs nothing.
11. Kettle keeps one 300-character note per player (mood, jokes, last deal). It changes his tone, never the floor.
12. If the AI budget is used up or the provider is down, Haggle shows "Kettle is napping" and any standing offer is still honoured until it expires.
13. Board: "Best haggle this week" (percent off, ties by earliest). Title only.

**C. Player-to-player trade (after the trade gate)**
14. Tap a Trusted player within 3 m → **Trade**. Invite expires after 30 s.
15. Each side may place up to 4 item stacks. **Leaves may be added by one side only, and only by a side that is receiving at least one item.** Item-for-item with no Leaves is always allowed.
16. **Price limits** on the Leaves amount:
   - **Hard ceiling:** 300 Leaves per trade.
   - **Banded items** (item types with ≥ 10 trades among ≥ 6 different buyer–seller pairs in 7 days): the Leaves must be within 0.25× to 4× of the sum of `median7 × quantity` for the items received.
   - **Unbanded items:** the Leaves must be ≤ 4 × the sum of the items' reference cost (Formulas).
   - A bundle is checked on the sum of its items' limits.
17. Both tap **Lock** → 5 s countdown → both tap **Confirm** within 60 s, or the trade cancels. Any change unlocks both.
18. One atomic step in the Economy DO; the trade tax is burned.
19. Daily limits per player: 20 trades, 10 with the same partner (more flags both accounts), 150 Leaves received.
20. "Open to trades" toggle: on inside the zone, off elsewhere.

**D. Weekly Drop (after the trade gate, Trusted only)**
21. One item a week: a seeded **recolour** of a base set of 12 drip and decor models (base model × palette), so no new art is needed per drop.
22. Supply `S = max( 30, round( 0.2 × DAU7 ) )`; one per player; numbered in sale order.
23. Price of the n-th unit: `P0 + K × (n − 1)`, `P0` = 30, `K = round( 120 / S )` (min 1).
24. Opens Saturday at a rotating hour (`(week_index × 7) mod 24` UTC), shown 3 days ahead; runs 48 hours or until sold out. Unsold units are never issued.
25. No randomness: the item and its price are shown before buying.
26. Drop items cannot be traded until that drop has ended.

**E. Live Auction (after the trade gate, Trusted only)**
27. Up to 6 slots a day (every 4 hours at :30). A slot opens **only if at least 3 Trusted players are within 12 m of the podium** at that moment; otherwise it is skipped silently.
28. One numbered rare from a fixed list of 24 designs (seeded order).
29. Ascending bids for 60 s. Opening bid 100. Each bid ≥ highest × 1.05, rounded up.
30. A bid escrows the Leaves; being outbid releases them at once.
31. A bid placed with less than 10 s left **sets the remaining time to 10 s**; this can happen at most 3 times.
32. The winner's Leaves are burned; the item goes to their bag. No bids → no item issued.
33. One win per player per UTC day.

**F. Boards and ticker (zone only)**
34. Price board: last price and 7-day line per tradable item type; the current drop; the next auction slot.
35. Ticker: drop numbers, auction wins, flips.
36. Weekly titles: Best Flip, Best Haggle. No valley or hall activity is ranked here.

### States and Transitions

**Haggle:** `closed → talking → offer standing (10 min; a new message replaces the offer and restarts the 10 min) → bought | expired → closed`; `napping` (budget or provider) is entered from any state and returns to the prior state; an offer standing when napping begins still expires on time.

**Trade:** `invited (30 s) → open → one locked → both locked (5 s) → awaiting confirm (60 s) → swapped | cancelled`. Cancel on: either side cancels, either walks > 5 m, disconnects, starts a sit, or a timeout.

**Drop:** `announced (3 days) → live (≤ 48 h) → sold out | ended → tradable`.

**Auction slot:** `scheduled → skipped (fewer than 3 present) | open (60 s) → extended (≤ 3) → sold | no sale`.

### Interactions with Other Systems

| System | Interaction |
|---|---|
| Leaves (`leaves-economy.md`) | spend, escrow, release, burn, Trust, caps, trade gate. |
| Bag / Valley | items; shared Economy DO makes swaps atomic. |
| Presence (3) | proximity for trade and bids; zone ticker. |
| Player menu (6), Chat mute (7) | Trade entry; mute blocks invites. |
| Sit (4) | Starting a sit cancels an open trade and releases any bid that is not the high bid; a high bidder who sits keeps the bid. |
| AI framework (`master-gdd.md` §8) | Haggle. |
| Chain mirror | Trades of mirrored items queue a `move` receipt; items stay under game control. |

## Formulas

**Haggle floor**: `floor = ceil( list × 0.6 )`. List 60 → 36; list 300 → 180.

**Offer**:
```
if model_offer is a finite number:  offer = min( list, max( floor, round( model_offer ) ) )
else:                               offer = previous offer, or list if there is none
```
Model outputs 0, −5, 59.4, 9999 at list 100 → 60, 60, 60, 100. `NaN` or missing → previous offer.

**Reference cost** (for unbanded trade limits and flip): material → floor price; crafted drip → fee + materials at floor; Kettle good → list price; drop or auction item → price paid by its first owner. Minimum 1.

**Trade limit examples**: a Rug Beanie (fee 10 + 4 yarn × 2 = 18) unbanded → at most 72 Leaves. One Moon Rock unbanded → at most 4. With `median7` = 40 for an item: allowed 10–160 per unit.

**Daily receive cap**: 150, about one maximum day of faucets (155), so an account cannot take in more by trade than it could earn.

**Drop burn**: `Σ = S × P0 + K × S × (S − 1) / 2`. At 500 daily players: `S` = 100, `K` = 1 → 3,000 + 4,950 = 7,950 Leaves a week if sold out; average price 79.5, under one typical day's earnings.

**Auction burn**: depends on attendance; with slots skipped when fewer than 3 are present, no estimate is assumed in the sink plan.

**Flip ratio**: `sale price ÷ max( 1, own cost )`, own cost = reference cost for crafted items, price paid for bought items. Only sales to an account the seller has traded with fewer than 3 times that week count.

## Edge Cases

| Case | Handling |
|---|---|
| Prompt tricks on Kettle | The server clamp makes them harmless. |
| Model returns no valid structured output | One retry, counted in the AI budget; then a scripted line; the previous offer stands; the player's message is spent. |
| Provider down | "Napping"; the message is not spent. |
| Offer standing when the day changes | Honoured until its 10 minutes end. |
| Trade: Leaves side empties before confirm | The swap fails as a whole. |
| Trade with Leaves but the paying side receives nothing | Cannot be locked. |
| Bundle mixing banded and unbanded items | Limits are summed per item. |
| Item with a queued chain receipt is traded | Allowed; the `move` receipt queues behind it. |
| Two Drop buyers at the same n | Ordered by the server; each pays the price of the n they got; the sheet warns if the price rose since it opened. |
| Auction end falls during a Worker restart | The Durable Object alarm settles it once from stored state; escrow totals are unchanged. |
| Outbid player rebids at once | Allowed; the release is applied first. |
| Receive cap would be passed | The sale is refused; only the seller sees why. |
| Calm player wanders in | Gate sign: "Market ahead: lively." Sounds start inside the boundary. |

## Dependencies

| System | Direction | Needs |
|---|---|---|
| Leaves economy | Trading depends on it | all money rules, trade gate |
| Bag / Meme Valley | Trading depends on it | items |
| Presence, Player menu, Chat | Trading depends on them | proximity, invites, mute |
| AI NPC framework | Haggle depends on it | calls, quota, budget |
| Chain mirror | depends on Trading | `move` receipts |
| Saga | depends on Trading | decor, stalls later |

## Tuning Knobs

| Knob | Start | Safe range | Effect |
|---|---|---|---|
| `HAGGLE_MSGS` | 3 | 2–5 | Cost; weight of each line. |
| `HAGGLE_FLOOR` | 0.6 | 0.5–0.8 | Best deal. |
| `OFFER_TTL` | 10 min | 5–30 | Pressure. |
| `TRADE_CEILING` | 300 | 100–1,000 | Largest single payment. |
| `BAND_LOW` / `BAND_HIGH` / `BAND_PAIRS` | 0.25 / 4 / 6 | 0.1–0.5 / 2–6 / 4–12 | Freedom vs laundering. |
| `UNBANDED_MULT` | 4 | 2–6 | Same, for thinly traded items. |
| `TRADES_DAILY` / `PARTNER_DAILY` | 20 / 10 | 10–50 / 5–20 | Wash-trade friction. |
| `DROP_SHARE`, `P0`, curve top | 0.2, 30, +120 | 0.1–0.4, 20–50, 60–200 | Scarcity, weekly sink. |
| `AUCTION_SLOTS` / `AUCTION_MIN_PRESENT` | 6 / 3 | 2–12 / 2–5 | How often the crowd moment happens. |
| `AUCTION_OPEN_BID`, `STEP`, `ANTI_SNIPE` | 100, 5%, 10 s × 3 | 50–200, 3–10%, 5–15 s × 1–5 | Pace, fairness. |

## Visual/Audio Requirements

Reuse the neon district. Kettle: an original old tea merchant with a kettle-shaped hat and three faces (pleased, neutral, offended). Stall bell, gavel, paper shuffle on the market audio bus.

## Game Feel

Fast and chatty where the valley is slow. Haggling is a comedy scene with a real number in it. The auction is a crowd moment that only happens when there is a crowd.

## UI Requirements

- Kettle sheet: Sell / Buy; Haggle button with messages left.
- Haggle chat: offer pill with a 10-minute ring; Buy at offer / Keep talking.
- Trade window: two columns, 4 slots, one Leaves field (enabled only for a side that receives items), limit shown inline, Lock, Confirm.
- Drop card: item, number sold, price now, price next.
- Auction banner: clock, high bid, Bid button with the exact next amount.
- Footer on every market sheet: "Leaves are play money. No cash value."

## Cross-References

`master-gdd.md` §8, §9 · `leaves-economy.md` · `meme-valley.md` · `vault-whisperer-npc.md` · `pvp-prediction-duel.md` (zone sharing).

## Acceptance Criteria

Scripts against a local Worker with a controllable clock and a stub model, unless marked.

1. Given 8 Leaves sold to Kettle today, when selling 2 Moon Rocks and a Diamond Pebble, then 2 Leaves are paid and the pebble stays.
2. Given list 100 and stub model offers 0, −5, 59.4, 9999, `NaN`, then the offers are 60, 60, 60, 100 and the previous offer.
3. Given a stub that returns invalid output twice, then the reply is the scripted line, the offer is unchanged and the player's message count has gone down by 1; given a provider error, the count is unchanged.
4. Given an offer made at T, then buying at T + 9 min costs the offer and at T + 11 min costs list.
5. Given a New account, then Haggle, Trade, Drop and Bid return `needs_trust`.
6. Given a trade of 1 Wen Scarf for 100 Leaves between Trusted accounts, then the scarf moves, the buyer pays 100, the seller receives 95 and a burn row of 5 is written, in one transaction (a kill between steps leaves no partial state).
7. Given a trade with Leaves on a side that receives no item, or Leaves on both sides, then Lock is refused.
8. Given an unbanded Rug Beanie, then 72 Leaves is accepted and 73 refused; given `median7` = 40 with band conditions met, then 10 and 160 are accepted, 9 and 161 refused; given any trade, 301 Leaves is refused.
9. Given 10 trades between two accounts today, then the 11th flags both; given 20 trades today, the 21st is refused; given 140 Leaves received today, a sale for 20 is refused.
10. Given `DAU7` = 500, then the drop has 100 units, the 50th buyer pays 79, the 101st request is refused and a second purchase by one account is refused; two simultaneous purchases at n = 50 pay 79 and 80.
11. Given a live drop, then trading that drop's item is refused until the drop ends.
12. Given 2 Trusted players within 12 m at a slot time, then no auction opens; given 3, it opens.
13. Given a bid below highest × 1.05 rounded up, then it is refused; given an outbid, the escrow is back within 1 s.
14. Given a bid with 5 s left, then 10 s remain; after three such resets, a fourth late bid leaves the clock unchanged.
15. Given an auction whose end time passes while the Worker is stopped, then on restart it settles once and the sum of balances plus burns equals the sum before.
16. Given an avatar at the courtyard test point, then no `data-zone="market"` element, no visible `zone=market` mesh and no `zone=market` audio source exists.
17. Given `AI_DAILY_USD` = 0, then shop, trade, drop and auction scripts pass and Haggle returns the napping line.
18. Given the trade gate flag is off, then the Trade, Drop and Bid routes return `not_open`.

## Open Questions

1. Is a 300-Leaf trade ceiling too low once auction rares exist? Revisit with data.
2. Stalls (selling while away) are in the saga doc; add to face-to-face trade, not replace it.
3. Should "Best Flip" exist at all, given the story's "don't panic" moral? Kept for now because it stays inside the market; owner call.

# Meme Valley (zone, gathering, lost frens, crafting, Rescue Book)

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Implements Pillars**: 5 (No power, only stories), 1 (Calm first), 2 (Free to play)
> **Tier**: MVP. The NEAR hackathon build ships a subset (`edition-near.md`). One-page version: `../meme-valley-brief.md`
> **Economy numbers** (rewards, fees, floor prices, caps) are owned by `leaves-economy.md`.

## Summary

A second zone past the Lookout where players gather materials, rescue lost meme frens by granting their wishes, often together, and craft drip for them. No combat, no races. Rescued frens join the existing pets system.

## Overview

Meme Valley is the "adventure" half of Quiet Hall. Four small areas hold about 20 gathering nodes. Everyone sees the same nodes, but each player has their own stock at each one, so nobody can take what you came for. Two lost frens are always somewhere in the valley, each staying 24 hours. A fren has a wish: a few materials and one small action, usually sitting beside it for a minute. Anyone sitting beside the fren when a wish is granted is rescued-with, so helping strangers is the fast way to play. Materials also feed a workbench that makes drip your pets wear. Everything is recorded in the Rescue Book.

## Player Fantasy

"I sat down next to a lost dog with a torn map, a stranger showed up with the rocks he wanted, and now he trots behind me in a hat I made." A gentle treasure hunt where being present and being kind are the skills.

## Detailed Design

### Core Rules

**Zone**
1. Entered by the valley road from the Lookout. Models load on entry (≤ 2 MB).
2. Four areas: **Wen Moon Lake**, **Rug Fields**, **Ape Hill**, **Copium Caves**, plus the **Gate** (workbench, signpost, two Moon Rock nodes).
3. The valley is its own room in the Hall DO (same presence, chat, emotes). Sitting is allowed anywhere and pays Leaves as normal.
4. Pillar 1: valley sounds, UI and nodes never appear in a calm zone. A rescued fren and its drip may be seen there, silent and still.

**Bag**
5. 24 slots; a slot holds one material type up to 20 units, or one drip item. Stored in the Economy DO with Leaves.

**Gathering**
6. A **node** is a fixed spot. Each player has a **personal stock** at each node; taking a unit never reduces anyone else's.
7. Tap a node within 2.5 m → a 1 s pick animation timed by the server → 1 unit in your bag. No hold, no minigame.
8. Personal stock regrows continuously up to `max_stock` (Formulas). An empty node shows its regrow time to you only.
9. Daily gather limit: 40 units per player. Diamond Pebble: personal stock 1, regrows in 24 h.
10. **Bloom (the shared moment):** when 3 different players have gathered at the same node within 10 minutes, it blooms for 10 minutes: everyone sees flowers on it, and each player's next pick there gives 2 units instead of 1 (once per bloom per player). Blooming only adds.
11. Boulders are "bonked" (same rule, different animation and sound) and give Moon Rocks.

| Material | Area | Nodes | `max_stock` | `REGROW` per unit |
|---|---|---|---|---|
| Moon Rock | Gate (2), Wen Moon Lake (2), Ape Hill boulders (2) | 6 | 4 | 5 min |
| Hopium Herb | Ape Hill | 5 | 4 | 5 min |
| Rug Yarn | Rug Fields | 4 | 3 | 8 min |
| Copium Shroom | Copium Caves | 4 | 3 | 8 min |
| Diamond Pebble | Copium Caves (deep) | 1 | 1 | 24 h |

The decision in gathering is where to walk: which materials today's two frens and your next recipe need.

**Lost frens**
12. A new fren appears every 12 hours (00:00 and 12:00 UTC) and **stays 24 hours**, so exactly two are always present. Order: a shuffled cycle of all frens (reshuffled each cycle by seed, never the same fren in two slots running). With 5 frens, each returns every 2.5 days.
13. A fren stands at one of 12 hiding spots (seeded per appearance), with a soft glow from 15 m. The Gate signpost says which area each is in.
14. **First-timer rule:** an account with zero rescues always sees its own Shibby at the Gate, with the starter wish (2 Moon Rocks + sit beside him 1 minute), whatever the schedule says.

**Wishes**
15. Tap a fren → wish card: a material list and one action. Two wish variants per fren, seeded per appearance:

| Fren | Home material | Wish A | Wish B |
|---|---|---|---|
| Shibby | Moon Rock | 3 Moon Rock + sit beside him 1 min | 2 Moon Rock + 1 Rug Yarn + sit 1 min |
| Bonko | Moon Rock | Bonk 5 times + sit 1 min | 2 Moon Rock + 1 Hopium Herb + sit 1 min |
| Froggo | Copium Shroom | 1 Copium Shroom + sit 1 min | 2 Copium Shroom + sit 1 min |
| Hatdawg | Rug Yarn | 3 Rug Yarn + sit 1 min | 2 Rug Yarn + 1 Hopium Herb + sit 1 min |
| Mewn | Hopium Herb | 2 Hopium Herb + sit 1 min | 3 Hopium Herb + sit 1 min |

16. "Grant" takes the materials and starts the 1-minute sit within 3 m. When it completes, the fren is **rescued** by the granter.
17. **Co-rescue:** every other player seated within 3 m of the fren at that moment, who has not rescued this appearance, is rescued-with: same result, no materials needed. The granter's Rescue Book counts "helped N others".
18. One rescue per player per fren appearance. **First rescue of that fren ever** → it joins your pets (bound to your account, never tradable), with a serial (a quiet number in the Rescue Book; nothing is ranked by it). **Later rescues** → +3 bond hearts (saga doc). Each rescue pays the wish reward up to the daily wish limit (`leaves-economy.md`).
19. There is no leaderboard, no "first" mark and no reward for speed in the valley.

**Variants (Month 1; fixed rules, never random, none time-limited forever)**

| Variant | Rule |
|---|---|
| Golden Shibby | Rescue Shibby on a UTC day when you also complete the World Sit (either order) |
| Rainy Froggo | Rescue Froggo while it rains in the valley (one 3-hour block a day at a rotating hour, on the signpost) |
| Full Moon Mewn | Rescue Mewn on a real full-moon UTC date; on those dates Mewn takes the 00:00 slot |
| Diamond Bonko | Rescue Bonko with a Diamond Pebble in your bag (it is used up) |
| Cozy Hatdawg | Rescue Hatdawg together with at least 2 other players (grant or co-rescue) |

A variant is a second Rescue Book entry and a skin for the same pet.

**Crafting and drip**
20. A workbench at the Gate. Recipe = materials + a Leaves fee → 1 drip item, instantly.
21. Drip is worn by a pet in one of 3 slots (head, neck, eyes) and seen by everyone, including in calm zones.

| Drip | Slot | Materials | Fee |
|---|---|---|---|
| Rug Beanie | head | 4 Rug Yarn | 10 |
| Moon Collar | neck | 3 Moon Rock + 1 Rug Yarn | 10 |
| Hopium Wreath | head | 5 Hopium Herb | 10 |
| Copium Shades | eyes | 3 Copium Shroom + 2 Moon Rock | 20 |
| Wen Scarf | neck | 6 Rug Yarn + 2 Hopium Herb | 20 |
| Diamond Paws Chain | neck | 1 Diamond Pebble + 4 Moon Rock | 80 |

**Rescue Book**
22. One book at MVP: 5 entries (10 with variants), each with serial, date, and "helped N others".

### The first five minutes (scripted path for a new visitor)

| Step | What the player sees | Time |
|---|---|---|
| 1 | Lands in the courtyard as today. A cushion glows. Sit (any length). | 0:00 |
| 2 | Post-sit card: Leaves earned, and one line: "Someone is lost in the valley. Follow the lanterns past the Lookout." A lantern trail lights on the Lookout road (outside the hall). | ~1:00–3:00 |
| 3 | At the Gate, Shibby waits with a torn map. Wish card: 2 Moon Rocks + sit with him 1 minute. Two glowing rocks are 5 m away. | ~4:00 |
| 4 | Tap, tap: 2 rocks. Tap Shibby → Grant → sit one minute beside him. | ~5:00 |
| 5 | He hops up and follows. Card: "Shibby joined you. Make him a hat at the workbench, or take him back to the hall." | ~5:30 |

The lantern trail and the line in step 2 appear once, only after the first sit, never during one.

### States and Transitions

**Personal node stock:** `full → partial → empty → partial → full` (continuous regrow).

**Node bloom:** `plain → blooming (10 min) → plain`.

**Fren appearance (world):** `present (24 h) → gone`. Two overlap at all times.

**Fren (per player, per appearance):** `unseen → wish open → sitting (60 s) → rescued`. Standing up or leaving the 3 m circle before 60 s returns to `wish open` and gives the materials back. A wish sit in progress when the fren's 24 h ends may finish (up to 5 minutes).

**Pick:** `idle → picking (1 s) → got 1 or 2 | refused (too far, empty, daily limit, bag full)`.

### Interactions with Other Systems

| System | Interaction |
|---|---|
| World (1) | New zone, road, Gate signpost, lantern trail. |
| Presence (3) | Valley room; pick and grant requests are validated by the server (distance ≤ 2.5 m + 1.0 m tolerance; timing by the server clock); bloom state broadcast. |
| Sit (4) | Wish sits are normal sits and count toward Leaves if they reach `MIN_SIT`. |
| Pets (9) | Rescued frens are new species; follow, sit-beside and pat are reused; 3 attachment points for drip. |
| Leaves (`leaves-economy.md`) | Wish reward, craft fees, Kettle buy-back; shared Economy DO. |
| Trading Hall | Drip and materials become tradable when trade ships. |
| Chain mirror | Rescue and craft events are queued as receipts (`edition-near.md`, `edition-seeker.md`). |
| Saga | Bond hearts, map pieces, fog. |

## Formulas

**Personal regrow** (lazy, no timers): each (player, node) stores `stock` and `anchor`.
```
grown  = floor( (now − anchor) / REGROW )
stock' = min( max_stock, stock + grown )
anchor' = now                      if stock' = max_stock
        = anchor + grown × REGROW  otherwise      (partial progress is kept)
```
On a pick: apply the above, then `stock' − 1`; if stock was at `max_stock`, set `anchor = now`.

**Personal supply per day** (if a player emptied everything all day): far above the 40-unit daily limit, so the limit is the binding number, not scarcity.

**Daily need**: two wishes 1–6 units; one or two crafts 4–16 units → about 5–22 units. The 40 limit leaves room to stock up for a recipe; Kettle buys at most 10 Leaves' worth (`leaves-economy.md`), so gathering more than you need earns nothing.

**Total materials entering the economy** ≤ `40 × daily players` (20,000 a day at 500 players), bounded per player, not by a shared pool.

**Fren return time**: with `N` frens and a new one every `SLOT` hours, each returns every `N × SLOT` hours. `SLOT = min( 12, floor( 84 / N ) )` keeps every fren returning within 3.5 days (N = 5 → 12 h; N = 10 → 8 h, three present at once).

**Rain block**: starts at `(day_index × 7 + 3) mod 24` UTC and lasts 3 hours from that moment, including across midnight.

**Serial**: assigned inside the Economy DO transaction as `count of accounts with a first rescue of this fren + 1`; unique and gap-free per fren.

## Edge Cases

| Case | Handling |
|---|---|
| Pick request from too far, or faster than 1 s after the last | Refused; nothing consumed. |
| Bag full | Pick refused: "Your bag is full." A Bonko bonk still counts toward his wish. |
| Daily limit reached | "You've gathered enough for today." Wishes can still be completed with what is in the bag or by co-rescue. |
| Player has no materials at all | Sit beside a fren while someone else grants: co-rescue. |
| Two players grant the same fren at once | Both sits run; each completion co-rescues whoever is seated nearby and not yet rescued. |
| Granter stands up at second 40 | Materials returned; nobody is rescued by that attempt. |
| Co-rescuer sat down at second 59 | Counts. Being there is the point. |
| Fren's 24 h ends mid-wish | The wish may finish within 5 minutes. |
| Full-moon date and Mewn was due elsewhere in the cycle | Mewn takes that day's 00:00 slot; the displaced fren takes Mewn's next slot. |
| Golden Shibby: rescue first, World Sit later the same day | The variant is granted when the World Sit completes. |
| Player owns the starter Shiba pet | Shibby is a separate species entry. |
| Chain receipt fails | The pet or drip works at once; the receipt retries; the Rescue Book shows a "syncing" dot. |
| 0 Leaves at the workbench | "You need 10 Leaves. A ten-minute sit will do it." Shown at the workbench only. |
| Crowded fren (30 players sitting) | All are co-rescued; the server caps the co-rescue list at 50 per grant and the rest are caught by the next grant. |

## Dependencies

| System | Direction | Needs |
|---|---|---|
| World + places (1) | Valley depends on it | zone loader, road, signposts |
| Presence (3) | Valley depends on it | room, server-side distance and timing checks, bloom relay |
| Sit (4) | Valley depends on it | sit near a point, sit duration |
| Pets (9) | Valley extends it | species, attachment points |
| Leaves economy | Valley depends on it | rewards, fees, Economy DO |
| Chain mirror | depends on Valley | rescue and craft events |
| Trading Hall, Saga | depend on Valley | items, rescues, hearts |

## Tuning Knobs

| Knob | Start | Safe range | Effect |
|---|---|---|---|
| `PICK_SECONDS` | 1 | 0.5–2 | Pace. |
| `DAILY_GATHER_LIMIT` | 40 | 25–80 | Bot ceiling, material inflow. |
| `REGROW`, `max_stock` | table | ×0.5–×2 | How much walking a recipe takes. |
| `BLOOM_PLAYERS` / `BLOOM_MINUTES` | 3 / 10 | 2–5 / 5–20 | How often the shared moment happens. |
| `FREN_STAY_HOURS` / `SLOT` | 24 / 12 | 12–48 / formula | Frens present at once. |
| `WISH_SIT_SECONDS` | 60 | 30–180 | Stillness per rescue. |
| `CO_RESCUE_RADIUS` | 3 m | 2–5 | How close "together" is. |
| `GLOW_RANGE` | 15 m | 8–30 | Hunt difficulty. |
| `BAG_SLOTS` / `STACK` | 24 / 20 | 16–40 / 10–50 | Storage. |

## Visual/Audio Requirements

- Same low-poly style; misty purple-green; neon only on the signpost and workbench.
- Fren models: original designs. The hackathon build may reuse the existing CC0 Shiba and Frog with a prop each (torn map, lily hat); credits recorded.
- Bloom: small flowers and a soft chime, audible only in the valley.
- Sounds: pluck, "bonk", cloth rustle, rescue chime, forest ambience; all tagged `zone=valley`.

## Game Feel

One tap, one small thing in the bag. The slow part is the minute you sit with a lost creature while others wander up and sit too. A rescue is the bright moment: the fren hops, spins once and falls in behind everyone who was there.

## UI Requirements

- Bag button (valley and Trading Hall only).
- Wish card: portrait, have/need, Grant; while sitting, a quiet ring and "3 others are sitting with you".
- Workbench: recipes, have/need, fee, Craft.
- Rescue Book: tiles with serial, date, "helped N"; variant hints.
- Gate signpost: where today's two frens are, when each leaves (local time), rain block.
- At most three daily numbers anywhere: Leaves from sitting, wishes left, gathers left.
- One-thumb reach: primary buttons in the bottom 40% of a 412×915 screen.

## Cross-References

`master-gdd.md` · `leaves-economy.md` (all rewards, fees, prices) · `trading-hall.md` · `saga-and-long-term.md` · `edition-near.md` (hackathon subset) · `../meme-valley-brief.md`.

## Acceptance Criteria

Scripts against a local Worker with a controllable clock, unless marked.

1. Given clients A and B at the same node with personal stock 4 each, when A picks 4 times, then A's stock is 0 and B's is still 4.
2. Given a node with `REGROW` 5 min and A's stock 0 at T, then A's stock is 1 at T + 5 min, 2 at T + 10 min; given a pick at T + 7 min, then the next unit arrives at T + 10 min (partial progress kept), not T + 12 min.
3. Given a pick request from 3.6 m, or 0.5 s after the previous pick, then it is refused and no stock changes.
4. Given 40 picks today, then the 41st is refused.
5. Given A, B and C each pick at one node within 10 minutes, then all clients receive `bloom` for that node within 1 s, and each of the three gets 2 units on their next pick there, then 1 after.
6. For slots 0–99, the schedule shows exactly 2 frens present at every hour, never the same fren twice at once, and every fren's gap between appearances is ≤ 84 hours (script).
7. Given an account with zero rescues, then a Shibby with the starter wish is at the Gate at any hour; after its first rescue, that personal Shibby is gone.
8. Given A grants Shibby's Wish A with 3 Moon Rocks and sits 60 s within 3 m, then A's pets include Shibby with serial = previous highest + 1, the wish reward row is written, and 3 Moon Rocks are gone.
9. Given B is seated within 3 m when A's wish completes and has not rescued this appearance, then B is also rescued, B's materials are untouched, and A's "helped" count is 1.
10. Given A stands up at second 40, then A's materials are back and no rescue is recorded.
11. Given two simultaneous first rescues of Shibby by A and B, then their serials are consecutive and different.
12. Given a second rescue of Shibby in a later appearance, then no second pet, +3 hearts, and a wish reward only if today's wish limit allows.
13. Given 4 Rug Yarn and 10 Leaves, when crafting a Rug Beanie, then both are removed and one drip is added in one transaction; with 9 Leaves, nothing changes.
14. Given a scripted new visitor (sit 60 s, walk the trail, pick 2 rocks, grant, sit 60 s), then a rescue is recorded within 330 s of simulated time.
15. Given an avatar at the Quiet Hall test point, then the scene graph has no visible mesh tagged `zone=valley` other than pets and drip, the DOM has no `data-zone="valley"` element, and `audio.activeSources()` lists no `zone=valley` source.
16. Given the valley zone request log, then transferred bytes ≤ 2,097,152. With 20 simulated players, 4× CPU throttle, 412×915, median frame time ≤ 33 ms over 10 s.
17. **[device, non-blocking]** On a mid-range Android phone the valley holds 30 fps with 20 players.
18. Given the data file, then the valley contains no board, rank or "first" reward (static check: no leaderboard route with `zone=valley`).

## Open Questions

1. Should co-rescue need the co-rescuer to have sat at least N seconds? Proposed: no; arriving late and being included is the kindness.
2. Should materials be tradable when trade ships, or only drip? Proposed: both, under the price rules in `trading-hall.md`.
3. Five frens will feel thin after two weeks; five more are scoped in the saga doc, chapter 1.

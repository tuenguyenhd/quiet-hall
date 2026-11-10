# Game Brief: Meme Valley

**One-sentence pitch:** Beyond the Quiet Hall lies a misty valley full of lost meme frens. Find them, grant their wish, bring them home, and craft them drip with everyone online.

A second world for Quiet Hall, reached by a road from the Lookout. Cozy MMO: gather, rescue, craft, collect. No combat (Pillar 1: Calm First). Uses Leaves, the in-game currency earned by meditating.

## Cast (original characters, meme winks only)
No real brands or live tokens (Pepe, Doge, Bonk etc. are owned or live coins). Our frens are original.

| Fren | Wink | Wish example |
|---|---|---|
| **Shibby** | lost Shiba holding a torn "wen moon" map | "Bring me 3 Moon Rocks and sit with me 1 min" |
| **Bonko** | pup with a tiny club who bonks rocks open | "Bonk 5 boulders with me" |
| **Froggo** | sad-eyed green frog hiding in the lily pads | "Find me a Copium Shroom" |
| **Hatdawg** | dog in a knit beanie | "Knit me a new hat from Rug Yarn" |
| **Mewn** | cat napping on a coin-shaped rock | "Bring 2 Hopium Herbs" |

**Places:** Wen Moon Lake, Copium Caves, Rug Fields, Ape Hill.
**Materials:** Moon Rocks, Copium Shrooms, Hopium Herbs, Rug Yarn, Diamond Pebbles.

## Core loop
1. Earn Leaves by sitting, rescuing, filling Kettle's orders and trading in his market (NEAR edition: all equal sources).
2. Walk into the valley and tap nodes to gather materials (everyone sees the nodes; each player has their own stock).
3. Find a lost fren and grant its wish: a few materials plus sitting beside it for one minute. **Everyone sitting beside it is rescued-with (co-rescue).** It follows you home as a pet, recorded as a bound NEAR receipt with a serial.
4. Craft drip (collars, shades, hats) at the workbench and take your fren back to the hall.

## Player goal & fail state — what "working" looks like
- **Goal:** fill the **Rescue Book**: every fren, later its rare variants (fixed rules, never random draws).
- **Fail:** none that takes anything away. No death, no combat, no races, no timers that punish. A fren stays 24 hours and returns within days; nodes regrow for you alone.

## MVP — the NEAR hackathon build (frozen scope, see `gdd/edition-near.md`)
1. Leaves from sitting (Economy store shared with the bag)
2. Valley: Gate + Wen Moon Lake + Copium Caves, personal-stock nodes, tap to pick
3. Two frens always present: Shibby and Froggo; wishes with a 1-minute sit; co-rescue; first-timer Shibby at the Gate
4. Workbench: 1 recipe (Moon Collar); Rescue Book with a "receipt" link
5. **Kettle's Living Market**: prices moved by all players' trades, a live price board, prices posted on NEAR hourly
6. **Market Cup**: free 3-hour trading rounds with 200 play chips; Leaves prizes; each round committed and settled on NEAR; trophies for the top 3
7. NEAR testnet receipts (NEP-171, bound, minted by the game to a derived owner id; no wallet, no account creation)

**Preview (sample data, labelled):** Cabal Hall, Sitting Bazaar, Whale Order, Calm the FUD Golem, trade feed, Agent Cup. Pitch outline: `pitch-near.md`.

## Out of scope — not building this (for Nov 14)
- Three more frens, five more recipes, Rug Fields, Ape Hill, variants, node bloom (Month 1)
- Any AI (Haggle, the Vault), Kettle's on-chain key, the AI Security track
- Trade, Drop, Auction, Saga
- Combat, levels, boards or "first" rewards in the valley
- Paid items, loot boxes, Leaves on-chain, cash-out, exportable items
- Real-world brand or memecoin names and art

## Build order
1. **Chain spike first (Nov 11 morning):** NEP-171 contract on testnet, one mint from the Worker
2. Economy store + sit → Leaves
3. Valley, picks, Shibby and Froggo, wishes, co-rescue, first five minutes
4. Living Market, Orders, crafting, Rescue Book, receipts wired, mock mode (Nov 13)
5. Market Cup (Nov 14 morning; switched off if not passing by 12:00 UTC)
6. Polish, deploy, README, video, submit by 20:00 UTC Nov 14

---
**Who it's for / what they feel:** Seeker and NEAR degens who want a cozy MMO that gets their jokes. "Three strangers and I sat down with a lost dog, and he followed all of us home."

**Art & audio direction:** Same low-poly Quiet Hall look; misty purple-green valley, neon meme accents; soft forest ambience plus a "bonk" sound effect.

**Reference game:** Cozy gather-and-craft MMOs. The MVP keeps the gathering spots and a collection book, with no combat and no races.

**Deadline note:** NEAR Hackathon Games track closes 2026-11-14 23:59 UTC. Build on a `near-hackathon` branch. Full design: `gdd/master-gdd.md`; the full valley (5 frens, 6 recipes) is in `gdd/meme-valley.md`. Revised 2026-11-10 after GDD review pass 1.

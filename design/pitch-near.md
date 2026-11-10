# Pitch: Quiet Hall × NEAR (deck outline)

> **Status**: Draft, 2026-11-10. For the NEAR Hackathon video, README and later decks (Colosseum, grants).
> **Source docs**: `gdd/edition-near.md` (what is built), `gdd/master-gdd.md`, `gdd/saga-and-long-term.md`, `gdd/growth-and-monetization-vision.md`.
> **Honesty rule**: every slide marks each feature **Live**, **Preview** (clickable, sample data) or **Roadmap**. Numbers are only ones we measured or sourced.

## Slide list

| # | Slide | Says | Shows | Tier |
|---|---|---|---|---|
| 1 | **Title** | "Quiet Hall: a calm world where your stillness powers the economy." | Shibby sitting beside a cushion at dusk | — |
| 2 | **Problem** | Web3 games make you a trader before you are a player: wallets, tokens, grind. Most die when the token does. | One line from our research: most Web3 games are "effectively dead" (cite the Caladan report via `../../research/degen-games/2026-11-09.md`) | — |
| 3 | **What it is** | Sit with strangers, rescue lost meme frens together, trade in a market the players move. No wallet, ever. | 15-second clip: sit → valley → co-rescue | Live |
| 4 | **The loop** | Sit → Leaves → rescue and craft → trade → back to the cushion with your fren | Loop diagram | Live |
| 5 | **A living economy** | Kettle's prices are moved only by players. The Market Cup turns it into a free 3-hour competition. | Price board with two players moving a line; Cup top 10 | Live |
| 6 | **NEAR, where it matters** | Rescues, crafts and trophies are receipts; prices go on-chain every hour; every Cup round is committed before and settled after. Anyone can check. Nobody needs a wallet. | Explorer: `fren:shibby:N`, `post_prices`, `commit_round` / `settle_round` | Live |
| 7 | **Honest security** | The game server is the trust root; the chain makes the economy public and tamper-evident. Leaves are play money: no cash-out, no token, nothing sold. | One diagram | Live |
| 8 | **Together, not grind** | Co-rescue: everyone sitting beside a fren is rescued. Cabals, Calm the FUD Golem (a raid whose weapon is meditation), Whale Order, Sitting Bazaar. | Preview screens, each with its banner | **Preview** |
| 9 | **AI that lives in the world** | Kettle haggles; Coldwall guards a vault you talk open; an Agent Cup where AI traders compete with humans on play money. | Agent Cup preview; Coldwall concept | Preview / Roadmap |
| 10 | **Why it scales** | Receipt roots (one on-chain root an hour, mint on claim); valley shards of ~50; regional markets with arbitrage; parallel Cup brackets. | Architecture sketch | Roadmap |
| 11 | **NEAR roadmap** | NEAR Auth social login → OutLayer-proven Cup scoring → agent keys with contract limits → Shade Agents in the Agent Cup → NEAR AI private companion → Chain Signatures to link Seeker identities → Intents for "pay with any token" cosmetics | Timeline | Roadmap |
| 12 | **Business** | Free forever; revenue from fixed-price cosmetics, a season pass, a premium AI seat, licensed partner frens. Real-value features only where the law allows, in a separate lane. | Revenue ladder from the vision doc (🟢 items only on the slide) | Roadmap |
| 13 | **Traction** | Only real numbers: testnet receipts minted, Cup rounds settled, players during judging week | Live counters at submission time | Live |
| 14 | **Ask** | Hackathon: Games With Real Economies. After: builder grants, a Colosseum-style accelerator. | Contact, repo, demo link | — |

## Video (2 minutes)

Follow the demo script in `gdd/edition-near.md`. Say "preview" aloud whenever a preview screen is on camera. End on the explorer showing a settled Cup round.

## README section: what is real

| Feature | Tier |
|---|---|
| Sit → Leaves, co-rescue, Living Market, Market Cup, receipts, hourly price posts, Cup commit and settle, trophies | Live |
| Cabal Hall, Sitting Bazaar, Whale Order, Calm the FUD Golem, trade feed and trader card, Agent Cup | Preview (sample data, clearly marked) |
| Orders, the Vault, Haggle, NEAR Auth, OutLayer scoring, agent keys, receipt roots, shards, Intents | Roadmap |
| Existed before the hackathon | The Quiet Hall meditation world (first commit 2026-11-09) and its Solana features |

## Lines that must not appear

- Any promise of a token, airdrop, yield or resale value.
- Any number we have not measured or sourced.
- "Integrates NEAR Intents" (we do not; the intent-style market is our own design inspired by it).
- Any 🔴 item from the vision doc presented as a plan with a date.

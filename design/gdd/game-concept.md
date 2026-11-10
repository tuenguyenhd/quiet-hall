# Game Concept: Quiet Hall

> **Status**: Draft (rewrite of README phases + specs 004–008 into the Game Studios GDD format)
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Platform**: Solana Seeker dApp Store (webshell APK) + mobile web (PWA)
> **Source of truth for rules**: `.specify/memory/constitution.md`. If this doc and the constitution disagree, the constitution wins until it is amended.

---

## Elevator Pitch

A small 3D world on your phone where strangers sit together in silence. Walk in with no account, pick a fren and a light, sit on a cushion and breathe. When you want energy instead of calm, walk the south road to **PumpHall**, guess whether SOL or SKR goes up or down, and challenge whoever you bump into to a one-on-one prediction duel. Everything is free. Crypto is optional, and only buys how you look.

## Core Identity

| | |
|---|---|
| Genre | Social presence / ambient multiplayer, with a light prediction mini-game |
| Session | 1–20 min (a sit), 5–15 min (a PumpHall visit) |
| Players | Shared rooms: everyone online sees everyone |
| Input | One thumb: tap to walk, tap things to use them, drag to look |
| Tech | Vite + Three.js client, Cloudflare Worker + Durable Objects (Hall, Pump, Ledger), Solana (devnet → mainnet) |
| Business | Optional tips, cosmetic items (lanterns, blessings, pets, stones, trees, cushions, banners), all at fixed prices |

## Core Fantasy

**"I'm not alone, and I don't have to perform."** You are in a calm place with other real people, and nobody needs anything from you. Then the second fantasy, kept on its own side of the map: **"I called it."** In PumpHall you're the degen who read the chart right, and now you can prove it face to face.

## Unique Hook

It's a meditation app that is also a tiny MMO, with a Solana meme culture layer. The calm side and the hype side sit on **opposite roads from the same courtyard**, so each player picks their mood by walking.

## Player Experience Analysis (MDA)

### Target Aesthetics
1. **Fellowship**: soft presence, sitting with others, invites, World Sit.
2. **Submission / relaxation**: breathing guide, bells, slow ambient world.
3. **Expression**: frens, lights, pets, owned stones/trees/cushions.
4. **Challenge (light, PumpHall only)**: reading the market, beating a rival in a duel.

### Key Dynamics
- People gather at the hourly bell and the 20:00 UTC World Sit.
- Players show off rare cosmetics simply by being seen in the world.
- In PumpHall, players linger near the board, bump into each other and start duels. Rivalries form through rematches.

### Core Mechanics
Walk, sit timer, emotes, chat, pets, blessings, lanterns, owned spots, wallet sign-in + Seeker check, tips, PumpHall round predictions, **PvP prediction duels (new)**.

## Player Motivation Profile

### Primary Psychological Needs
- **Relatedness**: shared presence, sitting together, invites, whispers, duels with a person you can see.
- **Autonomy**: choose calm or hype, which fren, which light, how long to sit.
- **Competence (PumpHall only)**: streak bonus, duel rating, leaderboard.

### Player Types (Bartle)
- **Socializers** (main audience): hall, chat, invites, pets.
- **Explorers**: places (Lake, Stone Garden, Maple Grove, Tea House, Lookout), badges.
- **Achievers / Killers** (PumpHall only): leaderboard, streaks, duels.

### Flow State Design
A sit removes all challenge: the 3D view stops and only the breath remains. PumpHall gives short bursts of tension: one round lasts 1–15 minutes and the result is always clear (up, down, flat).

## Core Loop

### Moment-to-Moment (30 s)
Walk, look, see someone, wave or bow, tap a seat, breathe. In PumpHall: look at the board, pick a side, watch the price.

### Short-Term (5–15 min)
One sit (3/5/10/20 min or open-ended) → "You sat" summary → share or invite. Or one PumpHall round or duel → result toast → rematch or walk away.

### Session-Level (30–120 min)
The hourly group bell, the World Sit, several sits across places, a few duels with whoever is around.

### Long-Term Progression
Daily streak, badges (30 days), invite unlocks (3 friends → Night hall), PumpHall weekly/all-time points, duel rating, owned spots in the world.

### Retention Hooks
Daily streak, World Sit at 20:00 UTC, one free lantern and one free blessing per day, the weekly PumpHall reset (Monday 00:00 UTC), rematch requests from duel rivals.

## Game Pillars

### Pillar 1: Calm First
Every feature must make sitting together feel calmer, not busier. **Test:** if it can show up in the Quiet Hall or during a sit, it must be silent and optional. Duels never fire in calm zones or while sitting.

### Pillar 2: Free to Join, Free to Play
No account, wallet or payment is needed to walk, sit, collect, invite, predict or duel. **Test:** a brand-new visitor with no wallet can do every activity in this doc.

### Pillar 3: Cosmetic Only, No Gambling
Money buys how you look and where your name sits in the world, never odds, random drops, rank or prizes. **Test:** PumpHall and duels use points only. Nothing of value can be staked or won.

### Pillar 4: Light on Phones
First load under ~5 MB, 30+ fps on a mid-range Android, 3D paused during a sit.

### Anti-Pillars (What Quiet Hall is NOT)
- **Not a casino.** No wagers, no pots, no paid entries, no prizes, no tokens paid out. This applies to duels too.
- **Not a trading app.** No live charts beyond the board, no trading links, no "signals".
- **Not grind-to-win.** No stats or power. Points only rank you on the leaderboards.
- **Not loud.** No pop-ups or notifications during a sit, and duel invites stay inside PumpHall.

## Inspiration and References
Shared-presence spaces (ambient multiplayer lobbies), meditation timers with breathing guides, classic MMO "tap a player → menu" interaction, simple "up or down" price-guess games. All art is original or CC0 (constitution §5).

## Target Player Profile
Seeker owners and Solana mobile users, 18–40, who are online a lot, like meme culture, and want a calm place that still feels like *their* community. Secondary: anyone who wants a free social meditation app.

## Technical Considerations
- **Presence and positions:** `Hall` Durable Object. It relays `move`, `state`, `emote` and `chat`, and stores positions server-side, so the server can check that two players are actually near each other.
- **Predictions:** `Pump` Durable Object (SQLite). Rounds sit on the wall clock. Prices come from the Coinbase Exchange 1-minute candles; each result stores a public `verify` URL.
- **Payments:** `Ledger` Durable Object, Solana Pay reference keys, verified on-chain.
- **Wallet:** Mobile Wallet Adapter, Seeker Connect, desktop wallets; authorizes **only the cluster the app runs on**.
- **Distribution:** `solana-mobile webshell` APK for the dApp Store; the same site as a PWA.

## Risks and Open Questions

### Design Risks
- Duels could bring hype energy into calm areas. Mitigated by zoning (duels only in PumpHall and on its avenue) and an "Open to duels" toggle.
- "Touch to duel" can feel spammy in a crowd. Mitigated by cooldowns, a per-pair limit, a mute that also blocks duels, and silent auto-decline.

### Technical Risks
- Position lag (~100–300 ms) makes "touching" fuzzy. The server checks with a tolerance (see the duel GDD formulas).
- The Coinbase API can be down. Rounds become void after 15 min, and duels draw.

### Market / Store Risks
- The dApp Store or app reviewers may read predictions as gambling. Mitigated by the points-only design, a "just for fun, no money" label on every PvP screen, and no prizes.

### Scope Risks
- Duel rating and rematches add a new server table and a second leaderboard tab. Duels can ship without rating first (see the duel GDD's Scope Tiers).

### Open Questions
See `pvp-prediction-duel.md` → Open Questions.

## MVP Definition (current build = MVP done)
Shipped: hall, sit, presence, chat, pets, blessings, lanterns, owned spots, wallet + Seeker check, tips, PumpHall solo predictions.
**Next milestone:** PvP prediction duels (see `pvp-prediction-duel.md`).

### Scope Tiers
1. Duel MVP: touch → challenge → one round → result, points only, no rating.
2. Plus duel rating, rematch, and a "Duels" leaderboard tab.
3. Plus spectators (people nearby see the duel ring and the result).

## Next Steps
1. The owner reviews the open questions in `pvp-prediction-duel.md` and approves or changes the defaults.
2. Write `specs/009-pvp-prediction-duel/{spec,plan,tasks}.md` from the approved GDD.
3. Build behind a flag, test with two browser windows plus the emulator, then on a Seeker.

# Systems Index: Quiet Hall

> **Status**: Draft
> **Created**: 2026-11-10
> **Last Updated**: 2026-11-10
> **Source Concept**: design/gdd/game-concept.md

---

## Overview

Quiet Hall is a light social world with two moods. The **calm systems** (hall, sit, presence, places, pets, blessings, lanterns) carry the main pillar. The **PumpHall systems** (round predictions and the new PvP duels) give a short, points-only challenge loop on the south road. **Economy and wallet systems** are optional and cosmetic. Existing systems are recorded from the code and from specs 004–008 ("Implemented"). Only the new duel system has a full design doc.

---

## Systems Enumeration

| # | System | Category | Priority | Status | Design Doc | Depends On |
|---|---|---|---|---|---|---|
| 1 | World + places (courtyard, Quiet Hall, Lake, Stone Garden, Maple Grove, Tea House, Lookout, PumpHall, teasers) | Core | MVP | Implemented | specs/005 | — |
| 2 | Player controller + camera (tap-to-walk, drag look, pinch zoom) | Core | MVP | Implemented | README Phase 1 | World |
| 3 | Presence / netcode (Hall DO: hello, move, state, emote, relay) | Core | MVP | Implemented | specs/004 | — |
| 4 | Sit + breathing timer (meditation overlay, 3D pause, summary) | Gameplay | MVP | Implemented | README Phase 1–2 | Presence, Controller |
| 5 | Group bell + World Sit (hourly bell, 20:00 UTC sit) | Gameplay | MVP | Implemented | README Phase 2 | Presence, Sit |
| 6 | Emotes + player menu (tap a player → chat / wave / bow / mute) | Gameplay | MVP | Implemented | — | Presence |
| 7 | Chat (global box, whispers, bubbles, filter, mute) | UI | MVP | Implemented | — | Presence, Player menu |
| 8 | Frens + light + character style | Meta | MVP | Implemented | specs/007 | — |
| 9 | Pets + blessings | Economy | Vertical Slice | Implemented | specs/008 | Presence, Frens, Ledger |
| 10 | Lanterns, badges, owned spots (stones, trees, cushions, banners) | Economy | Vertical Slice | Implemented | specs/006 | Ledger, Wallet |
| 11 | Wallet + Sign-In-With-Solana + Seeker Genesis check | Persistence | Vertical Slice | Implemented | README Phase 3 | — |
| 12 | Payments / Ledger (tips, fixed prices, Solana Pay refs) | Economy | Vertical Slice | Implemented | README Phase 3 | Wallet |
| 13 | Invites + streaks | Progression | MVP | Implemented | README Phase 2–3 | Presence |
| 14 | PumpHall round predictions (SOL 5 min, SKR 15 min, points, weekly/all-time board) | Gameplay | Vertical Slice | Implemented | worker/pump.ts header | Pump DO, Coinbase oracle |
| 15 | **PvP prediction duels (touch → challenge)** | Gameplay | Alpha | **Implemented** (2026-11-10) | [pvp-prediction-duel.md](pvp-prediction-duel.md) | Presence (3), Player menu (6), Chat mute (7), PumpHall (14) |
| 16 | Duel rating + Duels board (inferred) | Progression | Alpha | Implemented (2026-11-10) | [pvp-prediction-duel.md](pvp-prediction-duel.md) § Formulas | Duels (15) |
| 17 | Offline / PWA / webshell APK | Meta | MVP | Implemented | PUBLISHING.md | — |

---

## Dependency Notes (bidirectional)

- **Presence (3)** must add duel message relays (`duel_*`) and a server-side proximity check. Used by → 15.
- **Player menu (6)** gains a "⚔ Duel" button for players in a duel zone. Used by → 15.
- **Chat mute (7)**: muting a player also blocks duel invites from them. Used by → 15.
- **PumpHall (14)**: duels reuse its oracle (`priceAt`), market list and settle alarm. Duel points go to a separate column, so solo leaderboards stay comparable. Used by → 15, 16.
- **Sit (4)**: starting a sit cancels any pending duel invite. Duels never interrupt a sit. Used by → 15.

---

## Priority Tiers

| Tier | Meaning |
|---|---|
| MVP | Live now; the game doesn't work without it |
| Vertical Slice | Live; makes the dApp Store build feel complete |
| Alpha | Next milestone (duels) |
| Full Vision | Later: spectators, duel seasons, SKR-only events |

# Spec 008: Pets + blessings (BACKLOG, not started)

Status: backlog (added 2026-11-09 by owner). Paid feature.

## Idea (owner's words)
"Get a pet. Pet/bless the doge, … npc so they give you bless effect (this is pay)"

## Draft scope
- **Get a pet**: a small companion (e.g. shiba, frog, capy, cat) that follows you around the world and sits beside you when you sit. Visible to everyone in the hall.
- **Pet / bless an NPC fren**: tap Shibu (the doge), Froggo, Kitty, Capy, Old Monk… → "Pet" / "Bless" → the fren reacts (animation + line) and gives you a **bless effect**: a visible aura/sparkle on your avatar for a set time.
- **Paid**: blessing (and/or getting a pet) costs a small amount via the existing order/checkout flow (SOL/USDC, later SKR). Fixed price, no randomness.

## Open questions (decide before building)
- Pet: one-time buy, time-limited (like lanterns), or NFT (like stones/trees)?
- Bless: price, duration (1 h / 24 h?), one per fren or one at a time, stackable?
- Does a bless do anything besides look (e.g. counts toward a badge)? Keep it cosmetic only — no odds, no rewards that feel like gambling.
- Free taste: one free pet/bless per day (like the free lantern)?
- Seeker owners: discount or a free bless per day?

## Rules (from the constitution)
- Calm first; cosmetic only; fixed prices; no loot boxes / random paid outcomes.
- Works free without paying (petting can be free with a small reaction; the lasting effect is paid).
- Light on phones: pets reuse the CC0 animal models / degen block style; one bless effect = one sprite/ring.

## Building blocks already in the code
- NPC frens + tap handling: `src/frens.ts` (`tap`, speech bubbles).
- Wandering animals (CC0 Shiba/Husky/Frog): `src/animals.ts` (reusable as pets).
- Paid orders + verification + recovery: `worker/ledger.ts` (`createOrder`, `confirmOrder`, alarm), client `account.buy()`.
- Avatar effects: aura sprite + ring in `src/avatar.ts` (`setBadges` gold/supporter halo) — a bless glow fits here.

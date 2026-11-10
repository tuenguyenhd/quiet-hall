# Quiet Hall: Seeker Edition GDD

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Branch / deploy**: `main` · quiet-hall.vercel.app + Worker `quiet-hall` · Solana devnet → mainnet
> **Shared design**: `master-gdd.md` and the system GDDs. This doc says what the Seeker edition includes, changes and adds. Where it is silent, the shared docs apply.

## Summary

Quiet Hall for the Solana Seeker dApp Store (webshell APK) and as a PWA. Calm core first, optional Solana wallet, fixed-price cosmetics in SOL/USDC, then Leaves, the Valley, the market and the Vault in phases.

## Overview

The Seeker edition is what is live today (hall, sit, presence, chat, pets, blessings, lanterns, owned spots, wallet, tips, PumpHall). Its next milestone is a mainnet dApp Store release of that shipped game. New systems arrive in order of store risk and value. Seeker owners get identity perks (gold light, Seeker hall, a mark on their name), never economic ones.

## Player Fantasy

"My phone came with a place to breathe, and the whole Seeker crowd hangs out there." Calm when I want it, my community's jokes when I don't, and my Seeker makes me recognisably one of the locals.

## Detailed Design

### Core Rules: what this edition contains

| System (`master-gdd.md` §7, `systems-index.md`) | Seeker edition | Notes |
|---|---|---|
| 1–13, 17 Calm core, presence, chat, pets, items, wallet, payments, PWA | **Shipped** | Unchanged |
| 14–16 PumpHall predictions, duels, rating | **Shipped, behind `PUMP_ENABLED`** | Rule 3 |
| 18–19 Leaves + Trust | Phase S2 | Shared rules |
| 20–24 Bag, Valley, lost frens, crafting, Rescue Book | Phase S3 | Port from the NEAR branch |
| 26 Kettle shop, 27 Haggle, 31–32 Vault and AI framework | Phase S4 | AI characters have no wallet |
| 28–30 Player trade, Drop, Auction | Phase S5, only after the trade gate (`leaves-economy.md`) | |
| 25 Item chain mirror | Phase S6, Metaplex Core, frozen | Rule 5 |
| 33–35 Saga and long-term | Phase S7+ | |

### Core Rules: edition-specific

1. **Identity.** No account needed. Optional wallet through Mobile Wallet Adapter and Seeker Connect, Sign-In-With-Solana, Seeker Genesis Token check (read-only, mainnet).
2. **Seeker perks are identity only:** gold light, Seeker-only hall, a "Seeker" mark on the name tag and on Trading Hall boards, and a board filter "Seekers only". No extra Leaves, caps, drops or prices (Pillar 2).
3. **PumpHall and the Trading Hall.** Price-guessing games stay behind `PUMP_ENABLED`, points only. Proposed: the flag turns off when the Trading Hall's shop ships (S4) and the building becomes the Trading Hall. Owner decision (Open Questions 1).
4. **Real money stays in its own lane.** SOL / USDC (later SKR) buys only fixed-price cosmetics and tips. These are never tradable for Leaves and never listed in the Trading Hall. No route converts either way.
5. **Chain mirror (S6).** Rescued frens, relics and drip are mirrored as Metaplex Core assets **only as frozen receipts**: created with a permanent freeze delegate and a permanent burn delegate held by the game authority, so they cannot be listed, sold or moved by the holder on any marketplace. This is required by Pillar 4: an item earned with Leaves must never gain a cash price. Players without a wallet keep everything in the server bag with no loss of function.
6. **SKR.** May be accepted for the same fixed-price cosmetics. Never earned in the game, never linked to Leaves.
7. **Distribution.** `solana-mobile webshell` APK → dApp Store; the same site as a PWA. Listing text: free, no gambling, play-money market, AI characters, chat.

### States and Transitions

| Phase | Contents | Gate to start |
|---|---|---|
| **S1 Mainnet launch** | Shipped game on mainnet, keyed RPC, store listing | Quality gates pass; `PUMP_ENABLED` decision made |
| **S2 Leaves** | Sit → Leaves, Trust, pouch, server-side streak | S1 live |
| **S3 Meme Valley** | Bag, gathering, lost frens with co-rescue, crafting, Rescue Book, Kettle sell | NEAR build playtested |
| **S4 Shop + AI** | Kettle's catalogue (dyes), Haggle, the Vault | AI backend with budget cap; shop within 10 days of S3 going public |
| **S5 Market** | Player trade, weekly Drop, Auction | Measured sink ÷ faucet ≥ 0.8 for 7 days |
| **S6 Chain mirror** | Frozen Metaplex Core receipts | S3 stable 2 weeks |
| **S7 Saga** | Chapter 1 → | Real player data |

### Interactions with Other Systems

- **Other editions:** shared code behind the `ItemLedger` interface; separate worlds and data.
- **Seeker ecosystem:** Seeker Season quests ("sit 3 days", "rescue a fren"), store featuring, Builder Grant milestones, Colosseum Eternal weekly updates.

## Formulas

No edition-specific gameplay formulas. `AI_DAILY_USD` = 5 at launch (Vault share 3, Kettle share 2).

## Edge Cases

| Case | Handling |
|---|---|
| No wallet | Full game; items in the server bag; no mirror. |
| Wallet linked after earning items | Mirror mints frozen receipts on link (S6); serials unchanged. |
| Wallet change | Requires a signature from the new wallet and either a signature from the old one or a 7-day wait; the game authority burns the old receipts (burn delegate) and mints new ones. |
| Seeker Genesis Token moves (phone resold) | The Seeker mark follows the token at next sign-in; Leaves and items stay with the account. |
| Reviewer flags PumpHall | A `PUMP_ENABLED=false` build is always ready. |
| Reviewer flags "trading" | Evidence: no purchase of Leaves, no cash-out, frozen receipts, route list. |
| Public RPC blocks the Worker | A keyed RPC is a launch blocker for S1. |

## Dependencies

| Depends on | For |
|---|---|
| Shared system GDDs | Gameplay |
| `claude-backend` template | S4 AI |
| Keyed Solana RPC | S1 |
| NEAR build | S3 port |
| Metaplex Core create-with-plugins support in `worker/core.ts` | S6 (today's minimal create does not encode plugins) |
| dApp Store review | S1, S4, S5 |

## Tuning Knobs

| Knob | Start | Effect |
|---|---|---|
| `PUMP_ENABLED` | true until S4 (proposed) | Predictions and duels. |
| `SEEKER_FILTER_DEFAULT` | off | Board filter. |
| `MIRROR_ENABLED` | false until S6 | Receipts. |
| `AI_DAILY_USD` | 5 | AI budget. |
| `STARTER_LEAVES`, `MIN_SIT` | 0, 3 | Shared defaults. |

## Visual/Audio Requirements

As shipped. The Seeker mark is a small gold ring on the name tag.

## Game Feel

Unchanged: one thumb, soft, slow. A new visitor still lands in the courtyard, hears the hall and sees a cushion.

## UI Requirements

- First-run card unchanged (no wallet prompt).
- Wallet sheet says what a wallet adds: gold light, Seeker hall, owning spots, tips. It never mentions Leaves.
- Trading Hall boards: "All / Seekers only".
- Listing and About carry the play-money and no-gambling lines.

## Cross-References

`master-gdd.md` · system GDDs · `edition-near.md` · `edition-web3.md` · `game-concept.md` · `systems-index.md` · `pvp-prediction-duel.md` · `../../PUBLISHING.md` · `../../specs/006-collectibles-nft/`.

## Acceptance Criteria

1. Given `PUMP_ENABLED=false`, then every prediction and duel route returns 404 and no such UI element exists on a scripted walk of the south road.
2. Given a wallet-less visitor (S3), then the scripted run sit → pick → rescue → craft → sell passes.
3. Given a Seeker-verified account and a plain Trusted account running the same scripted day, then their Leaves balances are equal.
4. Given the route table, then no route converts SOL, USDC or SKR into Leaves or Leaves items, or Leaves into a paid cosmetic (static check).
5. Given the "Seekers only" filter, then only accounts with a verified token are listed and no score changes.
6. Given S6 and an account with 2 frens and 3 drip, when a wallet is linked, then 5 assets are created, each with freeze and burn delegates set to the game authority, and a transfer attempt by the holder fails (local validator).
7. Given a first load without entering the valley or market, then transferred bytes ≤ 5 MB.
8. **[funds, non-blocking]** On mainnet, a tip and a paid lantern verify and appear within 30 s.

## Open Questions

1. Turn PumpHall off at S4 (proposed), keep both, or remove predictions before S1 to de-risk review?
2. Accept SKR at S1 or later?
3. A Seeker-only cosmetic recipe in the valley (looks only)?
4. After S1: S2 alone, or S2 + S3 together as one bigger update?

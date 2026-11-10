# Quiet Hall: Web3 Edition GDD (chain-neutral)

> **Status**: Draft v1, written after review pass 1 and **not yet reviewed**. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Branch / deploy**: none yet. Proposed: `EDITION=web3` on `main`, its own deployment and world.
> **Shared design**: `master-gdd.md` and the system GDDs. This is the edition with no ecosystem behind it: no Seeker perks, no Solana or NEAR incentive, no hackathon scope. Where it is silent, the shared docs apply.

## Summary

Quiet Hall as an ordinary Web3 game anyone can open in a phone browser: the whole game works with no wallet, ownership records sit behind one interface on whichever chain makes sense, and the business is fixed-price cosmetics and passes, not a token.

## Overview

The Seeker and NEAR editions are shaped by a store, a device or a hackathon. This edition is the game on its own terms: the general-audience product, and the reference that the other two are variations of. It answers three questions an ecosystem-specific edition can dodge: who is the player when nobody is paying them to show up, what is the chain for when no sponsor requires one, and where does revenue come from without a grant. Its answers: the player is someone who wants a calm daily habit with a silly side; the chain is a receipt and an identity option, chosen late and replaceable; revenue is cosmetics, a season pass, premium AI and partner drops.

## Player Fantasy

"A friend sent me a link. I sat for five minutes with strangers, rescued a dog with a torn map, and came back the next day. Weeks later I found out the things I'd earned were recorded in my name." Web3 as something discovered, not demanded.

## Detailed Design

### Core Rules: what this edition contains

| System | Web3 edition | Notes |
|---|---|---|
| Calm core, presence, chat, pets (1–8, 13, 17) | Yes | As shipped |
| Paid cosmetics, tips (9–12) | Yes, **card first**, crypto optional | Rule 4 |
| PumpHall predictions, duels (14–16) | **Not included** | The Trading Hall is the market; no price-guessing games in the general edition |
| Leaves + Trust (18–19) | Yes | Shared rules |
| Bag, Valley, lost frens, crafting, Rescue Book (20–24) | Yes | Full five frens, six recipes |
| Kettle, Haggle, Vault, AI framework (26–27, 31–32) | Yes | AI characters have no wallet |
| Trade, Drop, Auction (28–30) | After the trade gate | Shared rules |
| Item chain mirror (25) | Optional, chain chosen by the criteria below | Rule 5 |
| Saga and long-term (33–35) | Yes | Shared |

### Core Rules: edition-specific

1. **No wallet required, ever.** Sign-in ladder: guest (device) → recovery code → email or passkey → optional wallet link. Every gameplay feature works at the first rung; later rungs only add recovery and a public record.
2. **No ecosystem perks.** No device, token or chain gives a mark, a hall or an advantage. Trust (three days of sitting) is the only gate.
3. **No token.** The game issues no fungible token and has no airdrop, points-for-tokens scheme or staking. Leaves are play money on the server (Pillar 4).
4. **Money lane.** Fixed-price cosmetics, a season pass with no random rewards, and a premium AI seat. Payment by card through a standard processor first; a crypto checkout (stablecoin on the mirror chain) is optional and second. The two lanes never convert (`growth-and-monetization-vision.md` §2).
5. **Chain mirror, if any.** Rescues, relics and drip may be mirrored as non-transferable receipts under game control, exactly as in the other editions. Leaves-earned items are never exportable or sellable. The mirror sits behind the `ItemLedger` interface, so the chain can be added late or changed.
6. **Chain choice criteria** (decide when the mirror is actually built, not before):

| Criterion | Why it matters |
|---|---|
| Fee per receipt well under $0.001, paid by the game | The player never pays or signs |
| Stable public RPC usable from a Cloudflare Worker | Lesson from the Solana public RPC blocking Workers |
| A maintained NFT standard with a way to make tokens non-transferable | Pillar 4 |
| Signing library that runs in the Workers runtime | One runtime, no extra server |
| Account abstraction or derived owner ids (no account creation per player) | Lesson from the NEAR review |
| Explorer with readable token pages | The "receipt" link is the whole user-facing chain |
| Grants or distribution, as a tiebreaker only | Never the reason for the design |

Candidates to evaluate against these when the time comes: the two chains already integrated (Solana with Metaplex Core, NEAR with NEP-171), or a low-fee EVM network with a standard ERC-721 and a soulbound extension. No candidate is chosen in this doc.

7. **Distribution.** Mobile web first (PWA, installable). Then, in order of fit: web-game portals and itch.io (free, HTML5); a Telegram or other chat-app mini-app wrapper for the valley and Vault as entry points; crypto wallet in-app browsers. App-store wrappers only if the store's rules on in-app purchases and AI chat are met.
8. **Growth loops (no incentives to farm):** the "sit with me" invite link and share card (shipped); the co-rescue moment (bring a friend, both get the fren); the Vault wall's public web page; rescue receipts with a public page per fren ("Shibby #214, rescued with 3 others").
9. **Compliance defaults for a general audience:** age gate for chat and AI features where required; privacy notice covering AI providers; no finance-flavoured games in this edition; region rules for paid features follow the payment processor.

### States and Transitions

| Phase | Contents | Gate |
|---|---|---|
| **W1 Core** | Calm core + Leaves + Valley (full MVP) with guest and recovery-code sign-in; no chain | The NEAR build's loop is playtested |
| **W2 Shop + AI** | Kettle's catalogue, Haggle, Vault, email or passkey sign-in | AI budget cap live; shop within 10 days of W1 |
| **W3 Money lane** | Card checkout for cosmetics, season pass, premium AI seat | Day-7 retention holds; processor approved |
| **W4 Market** | Trade, Drop, Auction | Measured sink ÷ faucet ≥ 0.8 |
| **W5 Mirror** | Receipts on the chosen chain; public fren pages | Chain chosen by the criteria; legal check on wording |
| **W6 Saga** | Chapter 1 → | Player data |

### Interactions with Other Systems

- **Other editions:** this edition is the baseline. Seeker = baseline + Solana wallet + Seeker identity perks + dApp Store. NEAR = baseline subset + NEAR receipts from day one. All three share code through `EDITION` and `ItemLedger`; worlds and data are separate unless the owner later decides to merge.
- **Vision doc:** every 🟢 item in `growth-and-monetization-vision.md` applies here first; 🔴 items are out of scope for this edition.

## Formulas

No edition-specific gameplay formulas. Defaults: `MIN_SIT` 3, `STARTER_LEAVES` 0, `AI_DAILY_USD` 5 at launch, scaled so AI spend per daily player stays ≤ $0.01 (`master-gdd.md` §11).

**Premium AI seat cost check** (to be measured before pricing): `seat_cost_per_month = extra_messages_per_day × 30 × cost_per_call`. With +10 messages a day at an estimated $0.002: about $0.60 a month of model cost per subscriber. The price must cover this plus processor fees; no price is set in this doc.

## Edge Cases

| Case | Handling |
|---|---|
| Player never links anything | Full game; a cleared browser loses the account. The recovery code is offered after the first rescue and again at 7 days. |
| Player links a wallet later (W5) | Receipts are issued for what they already own; serials unchanged. |
| The chosen chain raises fees or degrades | Switch the `ItemLedger` implementation; re-issue receipts from the server bag, which is the source of truth. |
| A portal or wrapper forbids crypto wording | `MIRROR_ENABLED=false` build: identical game, no receipt links. |
| A region blocks card payments or AI providers | The free game is unaffected; paid and AI features show "not available here". |
| Someone asks "wen token" | The About sheet says plainly: there is no token and none is planned. |
| Bots arrive without an incentive to farm | Same Trust, caps and flag rules; with no cash value anywhere there is little to farm. |

## Dependencies

| Depends on | For |
|---|---|
| Shared system GDDs | Gameplay |
| `claude-backend` template | W2 AI |
| A payment processor (card) | W3 |
| Email or passkey auth | W2 |
| `ItemLedger` mock from the NEAR branch | W1 (runs with no chain) |
| Chain decision | W5 only |

## Tuning Knobs

| Knob | Start | Effect |
|---|---|---|
| `EDITION` | `web3` | Removes Seeker, Solana-wallet-first and prediction UI and routes. |
| `MIRROR_ENABLED` | false until W5 | Receipts and their links. |
| `AUTH_METHODS` | guest, code → + email/passkey → + wallet | Sign-in ladder. |
| `PAY_METHODS` | none → card → + stablecoin | Money lane. |
| `AI_DAILY_USD` | 5 | AI budget. |
| `AGE_GATE` | per region | Chat and AI access. |

## Visual/Audio Requirements

The shipped world with chain branding removed: no Solana or NEAR marks, banners or stickers. The south road is the Trading Hall. Meme flavour stays in the valley's cast and names.

## Game Feel

Identical to the shared docs. The first minute contains no Web3 concept at all.

## UI Requirements

- Welcome card: "No account needed."
- Account sheet: the sign-in ladder, each rung saying what it adds ("keep your progress on a new phone", "a public record of your rescues").
- About: "Leaves are play money. There is no token. Paid items are cosmetic and fixed-price."
- Rescue Book "receipt" link only when `MIRROR_ENABLED`.

## Cross-References

`master-gdd.md` · system GDDs · `edition-seeker.md` · `edition-near.md` · `growth-and-monetization-vision.md`.

## Acceptance Criteria

1. Given `EDITION=web3` and a guest with no wallet, then the scripted run sit → pick → rescue → craft → sell passes and no wallet prompt, chain name or token wording appears in the DOM during it.
2. Given `EDITION=web3`, then every prediction, duel, Solana-wallet and Seeker route returns 404.
3. Given `MIRROR_ENABLED=false`, then no receipt link exists and all item features pass their scripts; given true with the mock ledger, then each rescue and craft queues one receipt job.
4. Given a guest who saves a recovery code, clears storage and enters the code, then balance, bag, pets and Rescue Book are restored.
5. Given the route table, then no route converts a card or crypto payment into Leaves or a Leaves item (static check).
6. Given the data and copy files, then no string promises a token, airdrop, yield or resale value (static text check against a deny-list).
7. Given two `ItemLedger` implementations (mock and one chain), then the same scripted run passes against both without changes outside the ledger module.

## Open Questions

1. Is this edition a product to launch, or the design baseline the other two are measured against? This doc is written so it can be either.
2. Which comes first for reach: a web-portal release or a chat-app mini-app wrapper?
3. Card payments need a business entity and processor approval; who and where?
4. Should the three editions eventually share one world? Separate worlds are simpler and are the default.

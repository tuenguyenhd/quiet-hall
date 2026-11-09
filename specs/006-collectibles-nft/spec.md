# Spec 006: Hall items: lanterns, badges, stones, trees

## Why
Two kinds of things give people reasons to come back and to pay:
- **Time-limited** (lanterns, badges): fresh every day or month, cheap or free, bring people back.
- **Scarce and owned** (stones, trees): very few exist, each with a fixed spot in the world, owned as an NFT,
  resellable later.

## Rules (constitution 2 + 7)
- Badges are earned, never bought. Lanterns have a free daily one.
- No random drops, no loot boxes. Prices and supply are shown up front.
- Lantern wishes, stone lines and tree names use preset phrases plus a name (no free text to moderate).
- We never promise stones or trees will rise in value.

## Items
| Item | Kind | Lasts | Price (to test) | Where |
|---|---|---|---|---|
| Lantern | time-limited | free 1 h (1/day) · 24 h $0.99 · 7 days $2.99 | see left | floats over the lake, everyone sees it |
| Badge | time-limited, earned | 30 days after earning; seasonal ones only in season | free | on your profile + beside your light |
| Stone | scarce, owned (NFT) | until sold | from $19 · 108 total | fixed spot in the Stone Garden, shows name + line |
| Tree | scarce, owned (NFT) | until sold | from $29 · 64 total | fixed spot in the Maple Grove, grows as people sit under it |

### Badges v1
Lake Stone, Raked Ring, Maple Leaf, Tea Cup, Summit Pebble (sit 3 min at that place) · Hall Bell (ring during a
group bell) · World Sit Mark (sit during World Sit) · Seven Days (7-day streak) · Gathering (3 friends from your link) ·
Seeker Lotus (verified Seeker sits once) · Giver (donated). Each shows for 30 days, then fades unless earned again.

## User stories
1. **Light a free lantern (P1).** Pick a wish ("peace", "for Mom", "thank you"…) + optional first name → it rises and
   floats over the lake for 1 h; everyone online sees it; one free per day.
2. **Earn badges (P1).** Finishing a qualifying sit shows "You earned Lake Stone (30 days)". Profile shows active
   badges with days left; faded ones as silhouettes with a hint.
3. **See stones and trees (P1).** The garden and grove show all 108 / 64 spots; unowned spots are plain, owned ones
   show the owner's name + line. Tap a spot → details (owner, line, "available").
4. **Buy a special lantern (P2, [funds])** 24 h / 7 day lantern paid in SOL/USDC (devnet first).
5. **Buy a stone or tree (P2, [funds])** Pay → server mints the spot's NFT to the buyer → the spot shows their name.
6. **Badge mint (P3, [funds])** Optional: mint an active badge as an NFT ($1 + fee).
7. **Resale (P4, later)** Listing on marketplaces that support the NFT standard; in-app resale maybe later.
   The hall always shows the *current* on-chain owner of each spot.

## Acceptance
- Lantern + badge expiry logic unit-tested with fake clocks.
- Free lanterns and badges work offline-first (badges) / online (lanterns are shared live).
- Stone/tree purchase flow tested end-to-end against a **mock mint** in scripts; real devnet purchase is manual **[funds]**.
- Ownership display reads on-chain ownership (devnet) and survives a transfer.

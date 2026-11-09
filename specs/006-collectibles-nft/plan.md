# Plan 006: Hall items

## Lanterns (live, shared)
- Hall DO keeps active lanterns `{id, wish, name, colour, tier, x, z, until}` in storage; sends them in `welcome`,
  broadcasts `lantern` on create, prunes expired ones on an alarm.
- Free tier: 1 per visitor id (`pid`) per UTC day, 1 h. Paid tiers: created only after the tip/checkout flow confirms
  an order of kind `lantern24` / `lantern7d`.
- Client: lantern = paper body + warm point sprite, drifts slowly over the lake water with a slight bob;
  label on tap shows wish + name + time left.

## Badges (earned, 30 days)
- `src/badges.ts`: catalogue + pure earning rules (`earn(state, event, now)`), stored locally
  `{id: earnedAt}`, active if `now - earnedAt < 30 days` (seasonal: also within season dates).
- Events from main: sit finished (place, seconds), bell rung during group bell, World Sit sit, streak, invites, Seeker
  sit, donation. Server-side copy for signed-in wallets later (so badges follow you across devices and can be minted).
- Profile sheet section: active badges with days left; faded ones as silhouettes + hint.

## Stones and trees (scarce, owned)
- Fixed spot lists generated in code: 108 stone spots in the garden (rings around the raked bed), 64 tree spots in
  the grove. Spot id = index; deterministic positions so every client agrees.
- Ownership source of truth = on-chain NFT (Metaplex Core asset per spot, one collection per kind, attribute
  `spot=<n>`). The Ledger DO caches `spot → {owner, name, line, asset}` and refreshes from chain periodically and
  after each purchase; the hall shows the cache.
- Purchase (devnet first): `POST /api/spot/order {kind, spot, name, line}` → order with reference (existing
  checkout) → user pays → server verifies → server mints the asset to the buyer (server pays mint fee from a
  devnet treasury key held as a Worker secret) → cache updated → broadcast.
- Resale later: because ownership is read from chain, a sale on any marketplace moves the spot to the new owner;
  the new owner can set the name/line after signing in.

## Testing
- `scripts/test-items.mjs`: expiry rules, daily free-lantern limit, badge earning, spot generation determinism.
- `scripts/online-test.mjs`: lantern broadcast to all clients, expiry pruning.
- `scripts/spot-mock.mjs`: purchase flow against a mock mint (no chain).
- **[funds]** devnet purchase + mint with a funded wallet; **[device]** on a Seeker.

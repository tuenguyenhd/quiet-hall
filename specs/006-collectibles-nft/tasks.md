# Tasks 006: Hall items

Depends on spec 005 (lake, garden, grove exist).

## Phase A: free and working (build first)
- [x] T201 `badges.ts` catalogue + earning/expiry rules + `scripts/test-items.mjs`
- [x] T202 Track sit place + duration; award badges on stand; toast + profile section (days left / faded)
- [x] T203 Hook other badge triggers: group bell ring, World Sit, 7-day streak, 3 invites, Seeker sit
- [x] T204 Hall DO lanterns: create (free 1/day/pid, 1 h), welcome list, broadcast, expiry alarm
- [x] T205 Lantern visuals over the lake + "Light a lantern" sheet (preset wishes + first name)
- [x] T206 Stone (108) and tree (64) spot generation; show all spots, owned ones with name + line (from cache)
- [x] T207 Spot detail on tap (owner / available / price)
- [x] T208 Online test: lantern broadcast + expiry

## Phase B: paid (devnet, behind `ITEMS_PAID` flag; test later)
- [x] T210 Order kinds `lantern24`, `lantern7d` via existing checkout → paid lanterns
- [x] T211 Metaplex Core collections (stones, trees) on devnet + treasury key secret
- [x] T212 `/api/spot/order` + verify + mint asset to buyer + cache + broadcast
- [x] T213 `scripts/items-e2e.mjs`: real devnet end-to-end with the treasury key (17/17; minted Stone #54 = 4pXs59mu8KvsoCwCdba956aXu5tFA72FpFwSD3R7xd1T)
- [x] T213b Alarm re-checks paid-but-unconfirmed orders (buyer closed the app mid-payment)
- [x] T214 Ownership refresh from chain (handles transfers / marketplace sales): `syncOwners()` reads each Core asset account (any RPC), every 5 min on `/api/spots` (`?refresh=1` → 20 s); `scripts/chain-e2e.mjs`
- [ ] T215 **[funds]** Devnet: buy a lantern, a stone, a tree from a real wallet; check NFT in wallet
- [ ] T216 **[funds]** Optional badge mint ($1 + fee)

## Later
- [x] T220 Resale royalties: 5% Royalties plugin on both collections to the tip recipient (`scripts/set-royalties.mjs`, devnet done 2026-11-09). In-app listing: later
- [ ] T221 Mainnet switch (Helius key, real treasury, pricing review)

- [x] T222 SKR (Seeker token) payments: currency `SKR` on when `SKR_MINT` is set (mainnet `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, 6 decimals); price = USDC × `SKR_PER_USDC` (default 50); "Pay with" chips on every paid sheet. Devnet has no SKR, so it stays hidden there (verified with a stand-in mint)

## Blocker for live
- [x] T230 (code done: `HELIUS_API_KEY` → Helius for server calls; devnet e2e 17/17 through Helius; live secret set) Solana public RPC refuses Cloudflare Workers (`cf-worker` header → 403). Live needs an RPC key (e.g. Helius free) for `SOLANA_RPC` / `MAINNET_RPC`; local dev routes through the Vite proxy (`/rpc/devnet`).
- [x] T231 (done 2026-11-09: secrets DEV_NET_SOL + HELIUS_API_KEY, collections in wrangler.toml vars; live devnet e2e 17/17) Set `DEV_NET_SOL`, `STONE_COLLECTION`, `TREE_COLLECTION` on the live Worker (`wrangler secret put` / vars) to open sales there.

# NEAR Hackathon submission kit

Rules: https://nearhackathon.com/HACKATHON.md (re-read before submitting; checked 2026-11-13).
Deadline: **2026-11-14 23:59 UTC**. Submit **once**: the form at https://nearhackathon.com/#apply, or the API. Fix mistakes only through https://nearhackathon.com/request-changes. Never submit twice; the same repo is rejected with 409.

## Form fields

| Field | Value | Status |
|---|---|---|
| Project name (2–80) | Quiet Hall: your AI pet works the market while you rest | ready |
| Team lead (2–80) | **[owner fills in]** | owner |
| Email (≤160; private) | **[owner fills in]** | owner |
| Team size | `1` | confirm |
| Tracks | `games` (main); also `nfts` and `agents` | confirm |
| NEAR wallet (mainnet, receives the prize) | **[owner's mainnet account, e.g. tedorg.near]** | owner |
| Repository link (public) | **[GitHub URL once published]** | blocked: repo not public yet |
| Demo post link (X) | **[X post URL]** | blocked: post the video first |
| What did you build? (20–2000) | the text below | ready |
| Consent checkbox | tick | owner |
| Website (spam trap) | **leave empty** | n/a |

## "What did you build?" (under 2,000 characters)

> Your pet has a wallet. It trades while you touch grass.
>
> Quiet Hall is an open trading world on NEAR, built as a calm 3D place to rest after a trading day. You sit with strangers, rescue lost meme pets together, and play a free 3-hour trading cup in a market whose prices move only when someone trades. There is no token and nothing to grind. Guests play with no wallet, seed phrase or gas.
>
> NPCs with wallets: Biscuit, your AI pet (NEAR AI Cloud), has its own NEAR account. Switch on autopilot and it trades your cup entry under a spending policy you set, and explains every move. A profitable round mints a receipt to its wallet. Kettle, the merchant NPC, prices from net demand and explains why.
>
> An open economy: any AI agent can trade for its player over our MCP server, under the same policy. Sponsors launch airdrops as quests with one prompt: the terms are hashed on NEAR, drops appear live, and finishers get a bound badge plus the sponsor's claim link. Agents also read live NEAR Intents solver quotes for the real market.
>
> NEAR is the tamper-evident record: NEP-171 receipts for rescues, trophies and badges; every cup round committed before it starts and settled after, checkable with one script; an AI Pass paid in NEAR and verified on chain.
>
> One command (npm run sim:near) fast-forwards a day of trading by six AI pets, so you can watch the economy move with no developer in the loop. 206 automated checks and 26 contract tests run with no secrets.
>
> Stack: Three.js, Cloudflare Workers with Durable Objects, a Rust NEP-171 contract on testnet, NEAR AI Cloud, NEAR Intents 1Click API.

## X post draft (attach the pitch video)

> Your pet has a wallet. It trades while you touch grass. 🐕
>
> Quiet Hall, built at NEAR HACKATHON @NEARProtocol #NEARHackathon
> • an AI pet (NEAR AI) that trades your cup entry under your rules
> • bring your own agent over MCP
> • airdrops as quests, launched with one prompt
> • every round committed and settled on NEAR
> No wallet needed to play.
>
> Play: https://quiet-hall-near.ted-233.workers.dev
> Code: https://github.com/tuenguyenhd/quiet-hall
>
> (optional tags: @NearLegion @NearBuilders @near_ai)

**Video plan (about 90 s):**
1. Quick join and sit.
2. Follow the lanterns, help Shibby with a second player sitting too, and show the receipt on the explorer.
3. Type a prompt in Claude Code (MCP) and watch the drops appear live in the Courtyard; collect 3 and get the badge plus claim.
4. Tap 🐶, ask Biscuit for a 📈 Trading tip, switch on autopilot and show a trade with its reason; open the Market for Kettle's reasoning and the NEAR Intents board.
5. Show the Coming Soon district (Clans, Events).

There is no length limit, but keep it short.

## Checklist

| # | Item | Status |
|---|---|---|
| 1 | Public repo with LICENSE (MIT) | Done: https://github.com/tuenguyenhd/quiet-hall |
| 2 | README with problem, product and NEAR fit; do-X-see-Y run steps; no secrets needed | `NEAR.md`: hook, track table, Try it steps (2026-11-14) |
| 3 | Reproducible from a fresh clone; AI screening runs it | `npm ci`, `npm run check`, `npm run build:near`, `npm run test:near` (8 suites, 195 checks) and `npm run sim:near` pass (2026-11-14) |
| 4 | Only work done in the window; diff link | Whole repo is from 2026-11-09 (window opened 2026-10-19) |
| 5 | Libraries and AI tools listed | `NEAR.md` "Built during the hackathon" |
| 6 | No keys or secrets anywhere in the repo history | Scanned 2026-11-14: none |
| 7 | Hosted demo up to 2026-11-18, ideally 2026-11-25 | Live. **Re-deploy after the trading-agents commits** (`npm run deploy:near`) |
| 8 | Production contract has `mint_badge` / `commit_campaign` | Done 2026-11-14 (code hash `GaFR12…`) |
| 9 | `CAMPAIGN_ADMIN_KEY` and `NEARAI_API_KEY` secrets on the live Worker, plus a demo drop | Done 2026-11-14 ("Welcome drop: find 3 lost Doges") |
| 10 | X post with video, built at NEAR HACKATHON, @NEARProtocol, #NEARHackathon | Owner posts the pitch video |
| 11 | Mainnet NEAR account for the prize | Owner |
| 12 | Submit once (form or API) | Owner, last step |

# NEAR Hackathon submission kit

Rules: https://nearhackathon.com/HACKATHON.md (re-read before submitting; checked 2026-11-13).
Deadline: **2026-11-14 23:59 UTC**. Submit **once**: the form at https://nearhackathon.com/#apply, or the API. Fix mistakes only through https://nearhackathon.com/request-changes. Never submit twice; the same repo is rejected with 409.

## Form fields

| Field | Value | Status |
|---|---|---|
| Project name (2–80) | Quiet Hall: rest after a trading day | ready |
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

## "What did you build?" (about 1,500 characters)

> Quiet Hall is a calm 3D world for traders: you come to rest after a trading day. You sit with strangers in the hall, rescue lost meme pets together in Meme Valley, and play a free 3-hour trading game in a market whose prices only players move. There is no token and no currency to grind. Guests play with no wallet, no seed phrase and no gas.
>
> Your one pet, Biscuit, is an AI companion on NEAR AI Cloud. It reads the live market and your trading-game position to give play-chip tips, and it talks you down after a rough day, in your language. 10 free chats a day; an AI Pass paid in NEAR (checked on chain) unlocks more.
>
> NEAR is the game's public, tamper-evident record. Rescues, crafts, trophies and sponsor badges are bound NEP-171 receipts, minted to an account id the server derives for each player, so most players never notice the chain. Each trading-game round is committed on NEAR before it starts and settled after it ends, and anyone can re-check it with a script. Prices are posted hourly. An optional NEAR login (NEAR Connect plus one NEP-413 signed message) moves receipts to your own .near account and takes your progress to any phone.
>
> New for sponsors and agents: airdrops as play. An AI agent connects to our MCP server and writes one prompt, such as "drop 20 BONK memes in the Courtyard, collect 3 for a Bonk Hunter badge". Validated drops then appear in the world for every player. The terms are hashed on NEAR before going live, completions mint a bound badge, and the sponsor's own reward link goes only to the player who finished it. We never hold sponsor tokens.
>
> Stack: Three.js on the phone, a Cloudflare Worker with Durable Objects (one chain writer with idempotent job ids), a Rust NEP-171 contract on testnet, and NEAR AI Cloud. It has 189 automated checks plus 26 contract tests, and one command reproduces them with no secrets.

## X post draft (needs the video or screenshots)

> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon
>
> Quiet Hall: a calm 3D world where traders rest after the market. Rescue meme pets together, chat with an AI pet that gives trading-game tips (NEAR AI), play a free trading game proven on NEAR, and collect sponsored drops an AI agent launched with one prompt (MCP).
> No wallet needed to play. [demo link] [repo link]
>
> (optional tags: @NearLegion @NearBuilders)

**Video plan (about 90 s):**
1. Quick join and sit.
2. Follow the lanterns, help Shibby with a second player sitting too, and show the receipt on the explorer.
3. Type a prompt in Claude Code (MCP) and watch the drops appear live in the Courtyard; collect 3 and get the badge plus claim.
4. Tap 🐶, ask Biscuit for a 📈 Trading tip, then join the trading game and show a settled round with `verify-round`.
5. Show the Coming Soon district (Clans, Events).

There is no length limit, but keep it short.

## Checklist

| # | Item | Status |
|---|---|---|
| 1 | Public repo with LICENSE (MIT) | LICENSE added; **the repo is not on GitHub yet (owner)** |
| 2 | README with problem, product and NEAR fit; do-X-see-Y run steps; no secrets needed | `NEAR.md` updated (2026-11-13) |
| 3 | Reproducible from a fresh clone; AI screening runs it | Verified 2026-11-13 on a fresh clone: `npm ci`, `npm run check`, `npm run build:near` and `npm run test:near` all pass (6 suites, 166 checks). 2026-11-14 with the AI companion: 7 suites, 178 checks pass (re-run the fresh clone after the merge) |
| 4 | Only work done in the window; diff link | Whole repo is from 2026-11-09 (window opened 2026-10-19); `git log main..near-hackathon` |
| 5 | Libraries and AI tools listed | `NEAR.md` "Built during the hackathon" |
| 6 | No keys or secrets anywhere in the repo history | Scanned 2026-11-13: none. `.env.production` holds only the public Worker URL. Note: commit author emails become public with the repo |
| 7 | Hosted demo up to 2026-11-18, ideally 2026-11-25 | Live, but it runs an **older build**. Deploy `drops-integration` (owner OK) |
| 8 | Production contract has `mint_badge` / `commit_campaign` | Test contract only. **Upgrade the production contract (owner OK)** |
| 9 | `CAMPAIGN_ADMIN_KEY` secret on the live Worker, plus a demo sponsor campaign | After the deploy (owner OK) |
| 10 | X post with video, built at NEAR HACKATHON, @NEARProtocol, #NEARHackathon | Owner records and posts |
| 11 | Mainnet NEAR account for the prize | Owner |
| 12 | Submit once (form or API) | Owner, last step |

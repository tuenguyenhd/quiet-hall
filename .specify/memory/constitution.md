# Quiet Hall Constitution

## Core principles

1. **Calm first.** Every feature must make sitting together feel calmer, not busier. No chat, no
   leaderboards of money, no pop-ups during a sit.
2. **Free to join, free to sit.** No account, wallet or payment is needed to walk, sit, collect or invite.
   Crypto is optional and additive (gold light, minting, tips).
3. **Working world first.** Each feature ships in a playable state with mocks before any on-chain step.
   On-chain work (wallet connect, minting, buying) sits behind a flag and is tested last, on devnet.
4. **Testable without hardware.** Every story has an automated check (script or headless Chrome).
   Anything that needs a Seeker or a funded wallet is marked **[device]** or **[funds]** and is never blocking.
5. **Original art only.** Never copy another app's assets or logos (e.g. Sansa). Use our own procedural
   art or CC0 assets with the source recorded in `public/assets/CREDITS.md`. Meme style is *inspired by*
   Solana culture, never a copy of a specific meme character or project logo.
6. **Light on phones.** First load under ~5 MB, 30+ fps on a mid-range Android, 3D paused during a sit.
7. **No gambling mechanics.** Paying never buys odds, random drops or rank. Collectibles are earned by
   sitting and visiting places, not bought blind.

## Quality gates (every feature)
- `npm run check` (types, app + worker) passes.
- `node scripts/online-test.mjs <url>` passes for anything touching presence.
- Headless screenshot review at 412×915 (`scripts/shots.mjs`) for anything visual.
- Live deploy only after the gates pass (Cloudflare Worker + Vercel).

## Governance
Specs live in `specs/NNN-name/` as `spec.md` (what and why), `plan.md` (how), `tasks.md` (ordered tasks).
Amend this file when a principle changes; note the date.

*Ratified 2026-11-09*

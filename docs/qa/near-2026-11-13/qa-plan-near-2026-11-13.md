# QA Plan: Quiet Hall NEAR edition, 2026-11-13

Branch: drops-integration @ 8694a50 (worktree .worktrees/drops-int)
Deadline: NEAR hackathon submission 2026-11-14 23:59 UTC
Config: qa.level minimal, team.size individual
Smoke check: PENDING (being run this cycle). Report expected at docs/qa/near-2026-11-13/smoke-2026-11-13.md
Open bugs: none on file (no bug files exist in this repo; "none on file" is not the same as "none exist")

## 1. QA Strategy

Rules applied at qa.level minimal:
- Automated tests are not required per story. A Logic/Integration story with no test is WAIVED and gets its acceptance criteria walked manually.
- UI and Visual/Feel screenshots are NOT waived. Each UI screen touched needs a retained screenshot.
- Existing scripts (scripts/near-*.mjs, cargo test) are still run in smoke as a free signal. A failing script is a finding even though the test requirement is waived.
- Config/Data is ADVISORY per story, but the smoke check itself is a build gate (blocking).

| Area | Type | Automated Required | Manual Required | Blocker? |
|---|---|---|---|---|
| F1 Welcome card | UI | No (none exists) | Yes: walk flow, screenshot each state | Yes (screenshot evidence) |
| F2 NEAR login/logout | Integration | Waived (near-login-test.mjs exists, run in smoke) | Yes: guest-side prompts, logout state; wallet popup out of scope | Yes if near-login-test fails; evidence for UI states |
| F3 Meme Valley | Logic/Integration | Waived (near-valley-test.mjs exists) | Yes: walk gathering, wish sit, rescue, craft, pet follow | No for missing test; yes if a core loop is broken (S1/S2) |
| F4 No currency | Logic | Waived (near-economy-test.mjs exists) | Yes: grep UI for Leaves wording, check zero payouts, craft free | No for missing test; yes if currency remains in a live path |
| F5 Market Cup | Integration + UI | Waived (near-market-test.mjs exists) | Yes: Cup screens, plain trade refusal, screenshot | Yes (UI screenshot) |
| F6 PumpHall + duels | Integration | Waived (near-duel-test.mjs + economy pump checks exist) | Yes: guest login prompt, UI states; logged-in pick/duel via server tests only | No for missing test; yes if script fails |
| F7 Sponsored drops | Integration + UI | Waived (near-campaign-test.mjs exists) | Yes: drops zone, pick, progress, guest login prompt, screenshot | Yes (headline hackathon feature, UI screenshot) |
| F8 MCP server | Integration | Waived (near-mcp-test.mjs exists) | Light: one curl of each tool plus a bad-key and a rate-limit call | No for missing test; yes if script fails |
| F9 Contract methods | Logic | Waived (cargo test in contracts/items exists) | None beyond reviewing cargo test output | Yes if cargo test fails (testnet contract is the submission artifact) |
| F10 Coming Soon + Lookout | UI | No | Yes: screenshot each district mock and preview; no Leaves wording | Yes (screenshot evidence) |
| F11 HUD, quest sheet, Rescue Book, Bag | UI | No | Yes: screenshot each screen | Yes (screenshot evidence) |
| F12 Build/config | Config/Data | tsc + build:near run via smoke | None | Yes: smoke is a build-health gate |

Smoke line: PENDING (being run this cycle). No manual QA starts until it reads PASS or PASS WITH WARNINGS.
Open bugs line: none on file.

## 2. Test Plan

### 2.1 Scope
All 12 feature areas above, on branch drops-integration @ 8694a50, tested against the local dev server in headless Chrome (CDP, 412x915 mobile viewport) plus the existing automated scripts run in smoke. Logged-in-only UI flows are verified through server tests plus the guest-side prompts, because wallet signing cannot be automated.

### 2.2 Story Classification Table

| ID | Area | Type | Existing evidence |
|---|---|---|---|
| F1 | Welcome card | UI | none |
| F2 | NEAR login (NEP-413) + logout, worker/nearlogin.ts | Integration | scripts/near-login-test.mjs |
| F3 | Meme Valley | Logic/Integration | scripts/near-valley-test.mjs |
| F4 | No currency | Logic | scripts/near-economy-test.mjs |
| F5 | Market Cup | Integration + UI | scripts/near-market-test.mjs |
| F6 | PumpHall + duels | Integration | scripts/near-duel-test.mjs, economy test |
| F7 | Sponsored drops | Integration + UI | scripts/near-campaign-test.mjs |
| F8 | MCP server | Integration | scripts/near-mcp-test.mjs |
| F9 | Contract mint_badge, commit_campaign | Logic | cargo test, contracts/items |
| F10 | Coming Soon + Lookout | UI | none |
| F11 | HUD, quest sheet, Rescue Book, Bag | UI | none |
| F12 | Build/config | Config/Data | tsc, npm run build:near |

Mixed types (F5, F7) carry the stricter evidence of both types.

### 2.3 Automated Test Requirements
At qa.level minimal, no new tests are required and none are written this cycle (one-day window).
- Run in smoke (signal only, not a requirement): all scripts/near-*.mjs, tsc check, npm run build:near, cargo test in contracts/items.
- WAIVED, covered under Manual instead (acceptance criteria walked): F1, F10, F11 (no automated test exists, all UI). For F2-F9 the existing script is the primary evidence; the manual walk is a supplement.
- Any script failure in smoke is triaged as a bug even though tests are waived. Do not skip or disable a failing script.

### 2.4 Manual QA Scope
Viewport 412x915 mobile via CDP. Capture and retain one screenshot per screen/state in docs/qa/near-2026-11-13/evidence/ (see Concerns on path).

**F1 Welcome card**
- Quick join enters hall with an auto "degen" name.
- Name entry accepts input; 16-char max enforced (try 17+ chars, emoji, empty, whitespace-only).
- Pet look pick selects and persists into the hall.
- Enter hall transitions without console errors.
- Screenshots: card default, name entered, pet picked.

**F2 NEAR login / logout**
- Guest sees login entry points; login button opens the NEAR Connect flow (stop at the popup, do not automate).
- Logout (via server-test-created or fixture session if available) returns to guest state and clears the login UI.
- Rely on near-login-test.mjs for signature verify: valid, tampered, expired/replayed message.

**F3 Meme Valley**
- Gathering nodes appear per-player (personal stock) and deplete/respawn as designed.
- Wish: sitting starts a 1-minute timer; leaving early cancels; completion registers the "sat" flag.
- Co-rescue with a second client completes and credits both.
- Crafting Moon Collar is free and consumes only materials; pet follows after craft.

**F4 No currency**
- No "Leaves" wording or counter anywhere in HUD, quest sheet, Rescue Book, Bag, Market, Lookout, Coming Soon, or MCP/campaign text.
- Sitting, rescue, login and Cup entry pay nothing; Cup join is gated by the "sat" flag (blocked before sitting, allowed after).

**F5 Market Cup**
- Market shows Market Cup only; plain trade attempt is refused with a clear message.
- Free play chips granted; top 3 trophies shown; round committed/settled state visible with receipt link.
- Screenshots: Market Cup screen, refusal message, trophies.

**F6 PumpHall + duels**
- Guest tapping BTC/NEAR up/down is asked to log in.
- Logged-in pick and 1v1 duel (incl. win celebration) verified through near-duel-test.mjs and economy pump checks only. Note this gap in the report.

**F7 Sponsored drops**
- Campaign zone drops render; pick works only within reach, not from far away.
- Progress counts to N; completion shows bound badge and sponsor claim link/code only for the completer.
- Guest is asked to log in at the collect/completion step.
- Supply cap exhausted state is shown; end broadcast appears when campaign ends.
- Screenshots: drop in zone, progress, guest login prompt, cap exhausted, end broadcast.

**F8 MCP server (POST /api/near/mcp)**
- One call per tool (6) returns a valid response; invalid sponsor key rejected; repeated calls hit the rate limit.
- Prompt-to-draft mock parser returns a draft for a sample prompt and a sane error for gibberish.
- Confirm sponsor key is not echoed in responses or logs.

**F9 Contract**
- Review cargo test output: mint_badge and commit_campaign tests pass, including job-id idempotency (same job-id twice = one mint/commit) and soulbound (transfer refused).
- Test contract only; no production contract.

**F10 Coming Soon + Lookout**
- Each Coming Soon district mock and Lookout preview opens, shows sample data, is clearly marked as sample, and has no Leaves wording.
- Screenshot each.

**F11 HUD, quest sheet, Rescue Book, Bag**
- HUD fits 412x915 with no overlap or clipped text.
- Quest sheet shows lost frens quest and the sponsored drops section.
- Rescue Book tabs: frens, drip, badges, receipt links (links well-formed, point to testnet explorer).
- Bag opens, lists items, empty state is sane.
- Screenshot each screen.

**F12 Build/config**
- Confirm smoke results for tsc and npm run build:near; confirm the dev server boots from a clean build with no console errors on load.

### 2.5 Out of Scope
- Design-only features in design/gdd/near-player-journey.md, not built: tutorial, chapters/stamps, AI characters, AI Pass, plain-word renames, sponsor SDK.
- Mainnet.
- Real wallet popups and signing (covered by near-login-test.mjs with a testnet key).
- Production contract (test contract only).
- Performance, soak, device matrix, localization and store-listing checks (not part of this one-day cycle).

### 2.6 Entry Criteria
- Smoke report exists at docs/qa/near-2026-11-13/smoke-2026-11-13.md with verdict PASS or PASS WITH WARNINGS. FAIL means no manual QA.
- Build is stable (npm run build:near succeeds; dev server boots).
- Feature code complete on drops-integration @ 8694a50; no further feature commits during the cycle (fixes only, which restart the affected area's checks).

### 2.7 Exit Criteria
- Smoke PASS or PASS WITH WARNINGS (warnings listed).
- Every UI area (F1, F2 states, F5, F7, F10, F11) has retained screenshots on disk.
- Each area's acceptance walk completed and marked pass/fail in the sign-off report.
- Zero open S1 bugs. Open S2/S3 are listed as known risks with a call from the user (at minimal they do not auto-fail; S2 in F7, F2, F9 should be weighed against the submission).
- Known gaps recorded: logged-in UI for F2/F6/F7 not visually verified.
- Sign-off report with open bug list produced; bugs filed via /bug-report.

## 3. Risks and Notes
- Single tester and one day left; prioritise F7, F2, F9 (hackathon-facing and on-chain) first, then F5, F11, then the rest.
- Logged-in-only UI (win celebration, badge/claim reveal after completion) has no visual evidence; accepted gap.

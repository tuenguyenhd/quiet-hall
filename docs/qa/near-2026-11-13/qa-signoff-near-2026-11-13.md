## QA Sign-Off Report: Quiet Hall NEAR edition (drops-integration)

**Date**: 2026-11-13
**Build**: drops-integration @ 8694a50
**Config**: qa.level minimal, team.size individual. The scope is 12 feature areas; this repo has no story files. Plan: `qa-plan-near-2026-11-13.md`.
**Smoke check**: PASS (`smoke-2026-11-13.md`):

- `npm run check` OK, `npm run build:near` OK.
- `cargo test` 26/26.
- Test suites: economy 29/29, valley 23/23, market 29/29, duel 14/14, campaign 36/36, mcp 35/35.
- login 11/11, with a real testnet signature against the test contract.
- All suites ran on a fresh fast-clock Worker with the mirror in mock mode.

### Test Coverage Summary
| Area | Type | Auto Test | Manual QA | Result |
|---|---|---|---|---|
| F1 Welcome / quick join / names | UI | n/a | 4/4 UI cases: fits 412x915, Log in with NEAR is present, no Leaves or bonus text, Quick join enters as a guest (evidence/f1-welcome/) | PASS |
| F2 NEAR login / logout | Integration | login-test 11/11: forged, foreign-key, expired and wrong-network refusals; second-device restore | The login button on the welcome card is confirmed. The wallet popup and logged-in UI were not checked visually, because a headless browser can't sign | PASS WITH NOTES |
| F3 Meme Valley | Logic / Integration | valley-test 23/23 | Test waived at minimal; acceptance criteria walked | PASS |
| F4 No currency | Logic + UI | economy-test 29/29 | No 🍃 pill, no Leaves line in the Bag | PASS |
| F5 Market (Cup only) | Integration + UI | market-test 29/29 | Guest Market sheet: the lock button opens the login card; Cup-only text; no quantity chips or trade buttons; signs say "free play chips" (evidence/f4f5-market/) | PASS WITH NOTES (BUG-0001) |
| F6 PumpHall picks + duels | Integration | duel-test 14/14, plus the economy-test pump checks | The win celebration was not checked visually (it needs a login) | PASS WITH NOTES |
| F7 Sponsored drops | Integration + UI | campaign-test 36/36 | 2 real PEPE picks (1/5, 2/5), the 🎁 2 chip, the Sponsored drops quest section. The guest goal prompt was checked only on simulated replies (evidence/f7-drops/) | PASS WITH NOTES (BUG-0003, BUG-0004) |
| F8 MCP server | Integration | mcp-test 35/35 | Test waived at minimal; acceptance criteria walked | PASS |
| F9 Contract | Logic | cargo test 26/26; a real testnet `mint_badge` was verified on 2026-11-11 | Test waived at minimal; acceptance criteria walked | PASS |
| F10 Coming Soon | UI | n/a | All 4 site explainers opened by real taps. 17 tabs and 6 Lookout previews are clean of Leaves, 🍃, SOL and Solana. The PREVIEW ribbons and sample-data banner are visible (evidence/f10-coming-soon/) | PASS |
| F11 HUD / sheets | UI | n/a | Quest sheet, Bag and Rescue Book (evidence/f11-hud/) | PASS WITH NOTES (BUG-0001, BUG-0002) |
| F12 Build / config | Config/Data | check and build OK | Smoke PASS | PASS |

**UI totals:** 23/23 cases PASS on the rerun.
- The first run had 2 FAIL and 7 NOT RUN. The cause was a hung local Worker and a bug in the test script, not the build. Everything was rerun after a Worker restart.
- No console errors on any page.
- The evidence sign-off rows are unsigned.

### Bugs Found
| ID | Area | Severity | Status |
|---|---|---|---|
| BUG-0001: Market and Rescue Book show "Loading…" forever when the Worker can't be reached | F5, F11 | S3-Medium (P2) | Open |
| BUG-0002: Top-left HUD pills truncate or overlap at 412 px | F11 | S4-Low (P3) | Open |
| BUG-0003: Arrival hints and toasts cover the 🎁 count and the 🛒 button for a few seconds | F7, F11 | S4-Low (P3) | Open |
| BUG-0004: A drop in front of a lost fren loses the tap to the fren (seen once) | F7 | S4-Low (P3) | Open |

No bugs were on file before this cycle. No S1 or S2 bugs are open.

### Known gaps (not tested)
- **NEAR wallet popup and logged-in UI (F2):** not checked visually. The server side is covered by login-test.
- **PumpHall win celebration (F6):** not checked visually; it needs a login.
- **Live 5/5 drop claim (F7):** not run, to avoid flooding testnet. The server side is covered by campaign-test.
- **Real-clock timing and the live mirror:** the suites used a fast clock and a mock mirror, so neither was exercised.
- **Network failure:** observed only by accident, which is how BUG-0001 was found. No planned failure cases were run.
- **BUG-0004 frequency:** not established.

### Verdict: APPROVED WITH CONDITIONS
**Conditions**:
1. Fix BUG-0001 (S3), or have the user explicitly defer it to polish with the reason recorded.
2. Fix BUG-0002, BUG-0003 and BUG-0004 (S4), or explicitly defer them to polish.
3. The user signs the evidence sign-off rows.
4. Accept the known gaps for this phase. Walk the logged-in UI, the win celebration and the live 5/5 claim on a device that can sign before any release gate.

### Next Step
Resolve the conditions before advancing. S3 and S4 bugs may be deferred to polish.

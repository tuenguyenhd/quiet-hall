# UI test cases: Quiet Hall NEAR edition, 2026-11-13

- **Story type**: UI (HUD, sheets, welcome card), with Integration touch points (Worker, drops)
- **Evidence location**: `docs/qa/near-2026-11-13/evidence/<area>/` (retained JPEG screenshots, quality 75)
- **Gate level**: BLOCKING (UI evidence)
- **Build**: Vite dev server `http://127.0.0.1:5174` (NEAR edition, branch worktree `drops-int`), Worker `127.0.0.1:8788`
- **Platform**: headless Chrome (new headless, SwiftShader WebGL) over CDP, mobile viewport 412x915 @1x, `mobile: true`
- **Input**: real CDP mouse taps (`Input.dispatchMouseEvent`) at element centres or projected 3D points. Sheet close used `element.click()`.
- **Console**: `console.error` and `Runtime.exceptionThrown` were collected for every page load.
- **Harness**: scratchpad scripts `qa13/lib.mjs`, `f1.mjs`, `f1b.mjs`, `f45.mjs`, `f7f10.mjs` (run 1), `rerun.mjs`, `pepe.mjs` (run 2), all outside the repo.

## Environment history (run 1) and rerun (run 2)

**Run 2 (rerun, same day):** the coordinator restarted the Worker on the same saved state. `GET /api/near/campaigns` then returned both live campaigns: PEPE (`cmp-mwbqzrrdnm0i`, valley, goal 5) and BONK (`cmp-mwbqzrr2hgj0`, court, goal 3). The presence pill read "1–3 here · 0 sitting". I reran every case that had failed or not run, using scripts `qa13/rerun.mjs` and `qa13/pepe.mjs` (2 browser sessions). For the cases below, the **Actual** field is from run 2 where it says so. The run 1 observations are kept as **Run 1 (ENV)** lines.

**Run 1 environment blocker (history):**

**The Worker at 127.0.0.1:8788 did not respond during this run.** The port accepts TCP connections, but `GET /`,
`/api/whoami` and `/api/campaigns` each timed out after 15 s with no response, called directly and through the Vite proxy
(`/api/health` timed out after 5 s). The `workerd` and `wrangler dev` processes were alive (state S, up 1 d 19 h). The last
lines of the Worker log were from 09:03. As instructed, I did not restart the server.

What this changed:
- The presence pill showed **"Offline · solo sit ok"** on every page.
- No live sponsored campaigns arrived (`__drops.mine()` was empty and the quest chip showed no 🎁 count at `at=court`).
  For that reason **F7 was run with the DEV hook** `__drops.inject(__drops.sample({zone:'court', goal:3}))`. Server replies
  were simulated with `__drops.reply(...)`, but the taps, walking and client `cpick` sends were real. Any result that
  depends on the live BONK or PEPE campaigns is marked NOT RUN.
- The Market sheet and the Rescue Book stayed on "Loading…" (see BUG-A).

In run 1, these cases were marked RERUN. All of them were rerun in run 2.

---

## F1: Welcome card (no autoenter)

## Test Case: F1-01 — Welcome card fits 412x915
**Precondition**: Fresh profile, `http://127.0.0.1:5174/` with no URL params, 412x915 mobile viewport.
**Steps**:
  1. Open the URL and wait 9 s.
  2. Measure `#welcome` scrollHeight/clientHeight, the card rect and the document scrollWidth.
  3. Screenshot.
**Expected Result**: The whole card is visible without vertical or horizontal scrolling. No element is clipped.
**Pass Criteria**: `#welcome.scrollHeight <= clientHeight`, `document.scrollWidth == 412`, and the card rect lies inside the viewport.
**Actual**: `#welcome` scrollHeight 915 = clientHeight 915. scrollWidth 412. The card rect is x16 y243 w380 h429 (bottom 672, inside 915). Title, "gm. Sit together in silence.", "Log in with NEAR", the login note, "Look: auto · change", "Quick join as guest →" and "Privacy · Terms" are all visible.
**Result**: PASS — `evidence/f1-welcome/01-welcome.jpg`

## Test Case: F1-02 — "Log in with NEAR" present
**Precondition**: As F1-01.
**Steps**:
  1. Query `#near-login-welcome`.
**Expected Result**: The button is visible and labelled "Log in with NEAR".
**Pass Criteria**: The button exists, has a non-zero rect and its text matches.
**Actual**: `#near-login-welcome` reads "Log in with NEAR" at rect 43,443 326x48. The NEAR logo is visible. Not tapped, because wallet login cannot be automated.
**Result**: PASS — `evidence/f1-welcome/01-welcome.jpg`

## Test Case: F1-03 — Login note has no currency or bonus copy
**Precondition**: As F1-01.
**Steps**:
  1. Read the `#welcome` innerText and the title/aria/placeholder attributes.
  2. Search for "🍃", "Leaves", "bonus", "SOL" and "Solana".
**Expected Result**: None of these strings are present.
**Pass Criteria**: 0 hits.
**Actual**: The note reads "Play PumpHall and the Market Cup · claim sponsor drops · keep progress on any phone · testnet account?". The scan found 0 hits.
**Result**: PASS — `evidence/f1-welcome/01-welcome.jpg`

## Test Case: F1-04 — Quick join enters the hall as guest
**Precondition**: As F1-01.
**Steps**:
  1. Real tap at the centre of `#btn-enter` ("Quick join as guest →").
  2. Wait 4 s.
  3. Check `#welcome`, `#hud`, `#near-bar` and `__qh.me()`.
**Expected Result**: The welcome card is hidden, the HUD is shown with the NEAR bar (🎒 📖 🛒 Log in), and the avatar is in the hall.
**Pass Criteria**: `#welcome` has class `hidden` and display none, `#hud` is not hidden, `#near-bar` has 4 buttons, and `__qh.me()` is truthy.
**Actual**: `#welcome` is "overlay hidden" with display none. `#hud` is visible. The `#near-bar` text is "🎒 📖 🛒 Log in". The avatar spawned in the Courtyard, with the hint "Tap to walk · drag to look · 🐾 top-left: rescue a lost fren to get a pet". No console errors.
**Result**: PASS — `evidence/f1-welcome/02-entered-hall.jpg`. Cosmetic issues seen here: BUG-B, BUG-C.

---

## F4/F5: No currency, Market Cup only

## Test Case: F4-01 — HUD has no 🍃 pill
**Precondition**: `?autoenter&at=bazaar`, guest.
**Steps**:
  1. Load and wait 10 s.
  2. List the `#hud .pill` and `#near-bar` children with their text.
  3. Run the text scan.
**Expected Result**: No Leaves or 🍃 pill.
**Pass Criteria**: 0 hits for 🍃 or "Leaves" in the HUD.
**Actual**: The pills are presence, bell, invite, sound, place, world, wallet 👛, chat, install, badges 🏅 0, 🎒, 📖, 🛒, "Log in" and the quest chip "🐾 Rescue a fren". There is no 🍃 pill. The scan found 0 hits.
**Result**: PASS — `evidence/f4f5-market/01-hud-at-bazaar.jpg`

## Test Case: F4-02 — Bag sheet has no Leaves line
**Precondition**: Guest in the hall, with an empty bag.
**Steps**:
  1. Real tap on 🎒 `#near-bag`.
  2. Read `#near-body`.
**Expected Result**: The Bag lists items only, with no Leaves balance.
**Pass Criteria**: 0 hits for "Leaves" or 🍃 in the sheet.
**Actual**: "🎒 Bag — Empty. Tap rocks, yarn and shrooms in Meme Valley … 🐾 How to get a pet: the Meme Valley quest … What you gather is for lost frens' wishes and the Workbench." The scan found 0 hits. Seen twice: at Courtyard (F1 flow) and at bazaar.
**Result**: PASS — `evidence/f1-welcome/03-bag-after-enter.jpg`, `evidence/f11-hud/01-bag.jpg`

## Test Case: F5-01 — Market sheet shows Cup-only copy and the guest lock button
**Precondition**: `?autoenter&at=bazaar`, guest, avatar inside the trade zone, Worker reachable.
**Steps**:
  1. Real tap on 🛒 `#near-market`.
  2. Wait up to 30 s for the sheet.
  3. Read the sheet text and check `#near-market-login`, `button[data-qty]` and `button[data-side]`.
**Expected Result**: The "🛒 Market" sheet shows the Market Cup copy, the guest lock button "🔒 Log in with NEAR to play the Market Cup", no quantity chips, and no "Leaves".
**Pass Criteria**: The lock button exists with that text, there are 0 `data-qty` chips, and there are 0 Leaves hits.
**Run 1 (ENV)**: The Worker was hung. The sheet stayed on "🛒 Market / Loading prices…" for about 30 s, with no lock button and no Cup copy (BUG-A). `evidence/f4f5-market/02-market-sheet-guest.jpg`
**Actual (run 2)**: The sheet loaded within a few seconds. The text, in order:
- The lock button `#near-market-login`: "🔒 Log in with NEAR to play the Market Cup".
- "🏆 Market Cup: everyone starts a round with the same free play chips; the best traders when it ends win trophies recorded on NEAR."
- "This Market Cup round ends in 46:55 · 0 entrants. Free: 200 play chips, trophies for the top 3." and the button "Join this round".
- "LIVE TOP 10 / No entrants yet: be the first."
- The note that prices move with players' trades and each round is committed on NEAR.
- "Play money. No cash value. Free to enter."

There were 0 trade buttons and 0 qty chips. The Leaves/🍃/SOL/Solana scan found 0 hits.
**Result**: PASS — `evidence/f4f5-market/10-rerun-market-sheet-guest.jpg`, `10b-rerun-market-sheet-bottom.jpg`

## Test Case: F5-02 — Tap the guest lock opens the login perks card
**Precondition**: F5-01 shows `#near-market-login`.
**Steps**:
  1. Real tap on the lock button.
**Expected Result**: The login perks card opens with "The Market Cup needs a login".
**Pass Criteria**: The sheet text contains "Market Cup needs a login".
**Run 1 (ENV)**: NOT RUN. The button was never rendered.
**Actual (run 2)**: A real tap on the lock opened the "🔒 The Market Cup needs a login" sheet. It reads "Quick join is for looking around. Log in with NEAR to play for real:" and lists the perks (PumpHall, Market Cup, sponsor rewards, keep bag on any phone…).
**Result**: PASS — `evidence/f4f5-market/11-rerun-lock-tapped.jpg`

## Test Case: F5-03 — Quantity chips hidden until joined
**Precondition**: The Market sheet is loaded and the guest is not in the Cup.
**Steps**:
  1. Count `#near-body button[data-qty]`.
**Expected Result**: 0 chips.
**Pass Criteria**: count == 0.
**Run 1 (ENV)**: Inconclusive, because the sheet never loaded.
**Actual (run 2)**: With the sheet fully loaded, the guest is not in the Cup. There were 0 `data-qty` chips and 0 `data-side` trade buttons, and `#near-cup-join` "Join this round" was present.
**Result**: PASS — `evidence/f4f5-market/10-rerun-market-sheet-guest.jpg`

## Test Case: F5-04 — In-world market signs read "Market Cup · free play chips"
**Precondition**: `?autoenter&at=bazaar`.
**Steps**:
  1. Close the sheet.
  2. Screenshot the world at the Market entrance.
**Expected Result**: The entrance sign reads "🛒 Market / Market Cup · free play chips", and no sign mentions Leaves.
**Pass Criteria**: That text is legible in the screenshot.
**Actual**: The entrance sign is in view but cropped by the camera. "…arket" and "…free play chips" are legible and the left part is off-screen. No Leaves text is visible on it. The Market Cup board ("free entry · 200 play chips") was not in frame.
**Result**: PASS (partial: the sign is cropped, but the visible wording matches and has no Leaves) — `evidence/f4f5-market/04-market-world-signs.jpg`

---

## F7: Sponsored drops (guest)

## Test Case: F7-01 — Live campaigns appear at the Courtyard
**Precondition**: The Worker is up with the BONK (court, goal 3) and PEPE (valley, goal 5) campaigns live. `?autoenter&at=court`.
**Steps**:
  1. Load and wait 10 s.
  2. Check `__drops.mine()`, the quest chip and the screen.
**Expected Result**: Glowing BONK bubbles at the Courtyard, and the chip shows a 🎁 count.
**Pass Criteria**: The chip contains "🎁" and drop sprites are visible.
**Run 1 (ENV)**: No campaigns arrived and the chip had no 🎁. `evidence/f7-drops/01-court-no-live-campaigns.jpg`
**Actual (run 2)**: Rerun at `?autoenter&at=valley`, as the coordinator asked. Both live campaigns were received on the client: `__drops.spots()` returned 20 PEPE sprites and 20 BONK sprites. The chip read "🐾 Find 🪨 0/2 · 0/2 🎁 2". Glowing green 🐸 bubbles are visible across Meme Valley, along with a "Sponsored by 🐸 PEPE" sign. I did not revisit the BONK sprites at `at=court` in run 2. The 🎁 2 count confirms the client holds the live BONK campaign.
**Result**: PASS — `evidence/f7-drops/10-live-pepe-valley.jpg`

## Test Case: F7-02 — (simulated campaign) drops render and the chip shows 🎁
**Precondition**: `?autoenter&at=court`. `__drops.reset()`, then inject the sample campaign `{id:'cmp-qa-bonk', zone:'court', goal:3}` through the DEV hook.
**Steps**:
  1. Inject the campaign and wait 2 s.
  2. Count the drop sprites and read the chip.
**Expected Result**: Glowing 🐕 bubbles in the Courtyard, and the chip shows 🎁 1.
**Pass Criteria**: spots > 0 and the chip contains "🎁 1".
**Actual**: 20 drop sprites were rendered as glowing orange 🐕 bubbles, visible left and right of the path. The chip read "🐾 Rescue a fren 🎁 1". In the screenshot the 🎁 badge is partly covered by the place hint toast (BUG-C).
**Result**: PASS (simulated data) — `evidence/f7-drops/02-sim-drops-court-hud.jpg`

## Test Case: F7-03 — Tapping a drop walks to it and picks it (toast n/3)
**Precondition**: F7-02 done.
**Steps**:
  1. Project the nearest on-screen drop to screen coordinates.
  2. Real tap on it.
  3. Wait for a client `cpick` in `__drops.sent`.
  4. Simulate the server reply `cpicked ok got:k goal:3`.
  5. Repeat 3 times.
**Expected Result**: The avatar walks to each drop, the client sends `cpick`, and the toast shows "🐕 k/3 BONK memes".
**Pass Criteria**: 3 `cpick` sends, and the toasts read 1/3, 2/3 and 3/3.
**Actual**: Drops 10, 2 and 0 were tapped. Each tap produced `{"t":"cpick","c":"cmp-qa-bonk","d":N}` after the walk. The toasts were "🐕 1/3 BONK memes", "🐕 2/3 BONK memes" and "🐕 3/3 BONK memes".
**Result**: PASS (the server reply was simulated) — `evidence/f7-drops/03-after-pick-1.jpg`, `03-after-pick-2.jpg`, `03-after-pick-3.jpg`

## Test Case: F7-04 — Goal reached as guest shows a login prompt, not a claim
**Precondition**: F7-03, with the 3rd reply carrying `got:3, goal:3, login:true`. The player is a guest.
**Steps**:
  1. Wait 1.2 s.
  2. Read the sheet.
**Expected Result**: A login prompt opens instead of a claim.
**Pass Criteria**: The sheet contains "Log in with NEAR to claim" and no "Claim badge" button.
**Actual**: The sheet reads "🔒 Log in with NEAR to claim your badge — You collected 3/3 BONK memes! The Bonk Hunter badge is a NEAR receipt bound to your account, and BONK's reward comes with it…". Below that are the perks list, the "Log in with NEAR" button and "One free signature: no transaction, no fee, nothing moved." The scan found 0 hits.
**Result**: PASS (simulated server reply; the real Worker path was not exercised) — `evidence/f7-drops/04-after-goal-guest.jpg`

## Test Case: F7-05 — Quest sheet shows "Sponsored drops"
**Precondition**: The F7-02 campaign has been injected and is complete.
**Steps**:
  1. Real tap on `#near-quest-chip`.
  2. Read `.q-drops`.
**Expected Result**: A "🎁 Sponsored drops" section lists the campaign, its progress and a guest claim CTA.
**Pass Criteria**: `.q-drops` exists and contains "Sponsored drops".
**Actual**: "🎁 Sponsored drops LIVE · 🐕 BONK hunt · by BONK · Courtyard · Find 3 BONK memes in the Courtyard · 3/3 BONK memes · ⏳ ends in 2 d 23 h · 🏅 412 of 500 left · + sponsor reward · [Log in to claim] · Badges are NEAR receipts bound to you. Sponsors give their own rewards; we never hold tokens."
**Result**: PASS (simulated data) — `evidence/f7-drops/05-quest-sheet-drops-section.jpg`, `05b-quest-sheet-drops-scrolled.jpg`

## Test Case: F7-06 — PEPE campaign in Meme Valley (collect 5)
**Precondition**: The Worker is up with the PEPE campaign live.
**Steps**:
  1. Load `?autoenter&at=valley`.
  2. Check the drops.
**Expected Result**: 🐸 drops are visible, with goal 5.
**Pass Criteria**: The chip shows 🎁, and the toast after a pick shows "1/5".
**Run 1 (ENV)**: NOT RUN, because the Worker was unreachable.
**Actual (run 2)**:
- **First attempt (`rerun.mjs`)**: I tapped the nearest projected drop (#12). The tap opened Shibby's fren sheet ("Grant the wish…") instead, and no `cpick` was sent. That drop was drawn in front of the lost fren Shibby, so the fren took the tap (see BUG-D). `evidence/f7-drops/11-live-pick-1.jpg`
- **Second attempt (`pepe.mjs`)**: For each pick I framed the camera 5 m from a single drop and made a real tap.
  - Drop 0: the client sent `cpick`, the real Worker replied, and the toast read "🐸 1/5 PEPE token".
  - Drop 1: the toast read "🐸 2/5 PEPE token".
  - `__drops.mine()` = `{"cmp-mwbqzrrdnm0i":{"p":[0,1],"got":2,"goal":5}}`.
- **Quest sheet after the picks**: it shows "PEPE: collect 5 PEPE token · by PEPE · Meme Valley · 2/5 PEPE token · ⏳ ends in 28 h 23 min · 🏅 50 of 50 left · Show me the way". It also shows "BONK: collect 3 BONK meme · Courtyard · 0/3 · 🏅 99 of 100 left · + sponsor reward".
- **Not exercised**: the live goal completion (5/5 → login prompt). I stopped at 2 picks to avoid flooding the testnet contract. The guest login prompt is covered by F7-04 with a simulated reply.
- No console errors.

**Result**: PASS — `evidence/f7-drops/13-live-pepe-pick-1.jpg`, `13-live-pepe-pick-2.jpg`, `14-live-quest-drops-after-picks.jpg`, `12-live-quest-drops.jpg`

---

## F10: Coming Soon

## Test Case: F10-01 — Coming Soon district signs with PREVIEW ribbons
**Precondition**: `?autoenter&at=soon`.
**Steps**:
  1. Load and wait 10 s.
  2. Teleport the avatar 6 m in front of each of the four signs (cabal, arena, bazaar, vault).
  3. Screenshot each.
**Expected Result**: The site signs carry PREVIEW ribbons.
**Pass Criteria**: At least one sign with a legible PREVIEW ribbon in the evidence.
**Run 1**: Inconclusive, because the harness could not frame the signs. `evidence/f10-coming-soon/01-soon-arrival.jpg`, `02-sign-*.jpg`
**Actual (run 2)**: I fixed the locator. It now moves the avatar along the camera's forward direction so the sign is in front of the camera. In the close-up, three signs are legible, each with a yellow "PREVIEW · NOT LIVE YET" ribbon band and a corner "PREVIEW" ribbon:
- "🏮 Cabal Camp / clans"
- "🏟 Event Arena / …s · Trade Fair"
- "Event Arena · Trade Fair"

The Event Arena banner also carries the "PREVIEW" corner ribbon.
**Result**: PASS — `evidence/f10-coming-soon/11-sign-closeup-ribbon.jpg`

## Test Case: F10-02 — Open at least 2 site explainers, with no 🍃/Leaves/SOL
**Precondition**: As F10-01.
**Steps**:
  1. Real tap on each sign's projected screen point.
  2. Wait for the "Preview · sample data" sheet.
  3. Click through every tab and search the text.
**Expected Result**: The explainers open with the banner "Preview · sample data · not live yet", and no tab contains 🍃, "Leaves", "SOL" or "Solana".
**Pass Criteria**: ≥ 2 explainers opened and 0 hits.
**Run 1**: NOT RUN. Root cause: a script bug. A negative coordinate made `p.x--71`, which is a JS syntax error.
**Actual (run 2)**: All 4 explainers opened from real taps on each sign's projected screen point:

| Explainer | Tabs |
|---|---|
| 🏮 Cabal Camp | What / Roster / Leaderboard / Chat / Why NEAR |
| 🏟 Event Arena | Schedule / Tournament / Prizes / Trade Fair / Why NEAR |
| 🧺 Sitting Bazaar | What / Stalls / Swap sheet / Why NEAR |
| 🗿 The Vault | What / Sample chat / Why NEAR |

- Each sheet opens with the banner "PREVIEW · SAMPLE DATA · NOT LIVE YET". The banner is rendered uppercase by CSS. The automated case-sensitive check reported `banner:false`, but the visible header text confirms the banner on all 4.
- I clicked through all 17 tabs and searched their text for Leaves, 🍃, \bSOL\b and Solana: 0 hits.
- The document-wide scan after closing also had 0 hits.
- No console errors.

**Result**: PASS — `evidence/f10-coming-soon/10-cabal-explainer.jpg`, `10-arena-explainer.jpg`, `10-bazaar-explainer.jpg`, `10-vault-explainer.jpg`

## Test Case: F10-03 — Lookout telescope "Coming next" previews show the sample-data banner
**Precondition**: `?autoenter&at=lookout`, avatar next to the telescope (LOOKOUT + (4,6) = (4,-134)).
**Steps**:
  1. Tap the telescope.
  2. Check for "🔭 Coming next" and "Preview: sample data".
  3. Open each preview and check that the banner persists.
**Expected Result**: The sheet opens, and every preview screen shows the "Preview: sample data" banner with no 🍃/Leaves/SOL.
**Pass Criteria**: The sheet opens, every preview has the banner, and there are 0 hits.
**Run 1**: NOT RUN, because of the same script bug. `evidence/f10-coming-soon/04-lookout-telescope.jpg`, `05-coming-next-sheet.jpg`
**Actual (run 2)**:
- A real tap on the telescope (projected at about 208,350) opened "🔭 Coming next" with the banner "PREVIEW: SAMPLE DATA".
- It lists 6 previews: Cabal Hall (clans), Sitting Bazaar (player market), Whale Order (community event), Calm the FUD Golem (co-op raid), Trade feed and trader card (social trading) and Agent Cup (AI traders). The footer reads "These screens show what is being built next. Nothing here is live yet."
- All 6 previews opened, and each had 0 hits for Leaves/🍃/SOL/Solana.
- I saw the yellow "PREVIEW: SAMPLE DATA" banner on the list and on the Cabal Hall preview. The automated banner check returned false on all 6 because it was case-sensitive against uppercased text. So for the other 5 previews the banner is assumed from the shared template and was not individually confirmed.

**Result**: PASS (partial: banner seen on 1 of 6 previews; content checked on 6 of 6) — `evidence/f10-coming-soon/12-coming-next-sheet.jpg`, `13-coming-next-preview.jpg`

---

## F11: HUD and sheets

## Test Case: F11-01 — Rescue Book opens with frens list and receipts note
**Precondition**: Guest in the hall (`at=bazaar`).
**Steps**:
  1. Real tap on 📖 `#near-book`.
  2. Read the sheet.
**Expected Result**: The "📖 Rescue Book" sheet shows the frens list and a receipts note.
**Pass Criteria**: The sheet contains the frens list and the receipts note.
**Run 1 (ENV)**: The sheet stayed on "📖 Rescue Book / Loading…" (BUG-A). `evidence/f11-hud/02-rescue-book.jpg`
**Actual (run 2)**: "📖 Rescue Book", with the following content:
- Frens list:
  - "🐕 Shibby not yet · Find in Meme Valley →"
  - "🐸 Froggo not yet · Find in Meme Valley →"
- "BADGES: No badges yet. A sponsored drop is live: tap 🎁 on the quest chip."
- Receipts note: "Your frens and drip are recorded on NEAR testnet under an account made for you: 402d1f…2f63. You never need a wallet; log in to use your own. Receipts are bound to you and cannot be sold."

The scan found 0 hits.
**Result**: PASS — `evidence/f11-hud/10-rerun-rescue-book.jpg`, `10b-rerun-rescue-book-bottom.jpg`

## Test Case: F11-02 — Quest sheet (🐾 chip): lost frens quest with steps and "Show me the way"
**Precondition**: Guest, no rescues yet.
**Steps**:
  1. Real tap on `#near-quest-chip`.
  2. Read the sheet and `#q-go`.
**Expected Result**: The lost frens quest shows 0/2, its 4 steps and the "Show me the way →" button.
**Pass Criteria**: All present.
**Actual**: The sheet shows "🐾 Lost frens of Meme Valley", "0/2 frens rescued" and "Next: Meme Valley is north-east… Follow the lanterns." It has the `#q-go` button "Show me the way →" and 4 steps: Go to Meme Valley / Gather what a fren wants / Grant the wish, sit 1 min / Your new pet. It has cards for Shibby (🪨 0/2, 🧘 1 min) and Froggo (🍄 0/1, 🧘 1 min), the guest note "…recorded on NEAR under an account made for you. Log in…", and a Season 2 preview (Bonk Pup, Wojak, Popcat). The scan found 0 hits.
**Result**: PASS — `evidence/f11-hud/03-quest-sheet.jpg`

## Test Case: F11-03 — Bag opens
**Precondition**: Guest.
**Steps**:
  1. Real tap on 🎒.
**Expected Result**: The Bag sheet opens.
**Pass Criteria**: The sheet is open with the heading "🎒 Bag".
**Actual**: It opened. The content is as in F4-02.
**Result**: PASS — `evidence/f11-hud/01-bag.jpg`

---

## Regression sweep: "Leaves", "🍃", "SOL", "Solana" (and "bonus")

Method: `document.body.innerText`, plus every `title`, `aria-label` and `placeholder` attribute, searched for `Leaves|leaves|🍃|\bSOL\b|Solana|bonus` on each screen.

| Screen | Hits |
|---|---|
| Welcome card (F1-01) | 0 |
| Hall HUD after Quick join (F1-04) | 0 |
| Bag sheet, Courtyard (F1) | 0 |
| HUD at bazaar (F4-01) | 0 |
| Market sheet, loading state (F5-01) | 0 (the rendered state was "Loading prices…" only) |
| Bag sheet (F11-03) | 0 |
| Rescue Book, loading state (F11-01) | 0 (loading state only) |
| Quest sheet (F11-02) | 0 |
| Drops login prompt (F7-04) | 0 |
| Coming Soon district world + HUD, at each of 4 sign spots | 0 |
| Market sheet, fully loaded + login perks (run 2) | 0 |
| Rescue Book loaded (run 2) | 0 |
| Quest sheet with live PEPE/BONK drops (run 2) | 0 |
| 4 site explainers, all 17 tabs (run 2) | 0 |
| Telescope "Coming next" list + 6 previews (run 2) | 0 |

**Result**: PASS. 0 hits on every screen.

## Console errors and uncaught exceptions

| Page | console.error | exceptions |
|---|---|---|
| `/` (welcome) | 0 | 0 |
| `/` → Quick join | 0 | 0 |
| `?autoenter&at=bazaar` (market, bag, book, quest) | 0 | 0 |
| `?autoenter&at=court` (simulated drops) | 0 | 0 |
| `?autoenter&at=soon` | 0 | 0 |
| `?autoenter&at=lookout` | 0 | 0 |
| Run 2: `at=bazaar` (market, book), `at=valley` (live drops, ×2 sessions), `at=soon`, `at=lookout` | 0 | 0 |

Note: in run 1, with the Worker hung, the client logged no errors. That fits BUG-A: the failure is silent.

---

## Summary

| Area | Cases | Pass | Fail | Not run |
|---|---|---|---|---|
| F1 Welcome | 4 | 4 | 0 | 0 |
| F4/F5 Currency + Market | 6 | 6 (F5-04 partial: sign cropped) | 0 | 0 |
| F7 Drops | 6 | 6 (F7-02..05 on simulated data; F7-01 and F7-06 live) | 0 | 0 |
| F10 Coming Soon | 3 | 3 (F10-03 partial: banner seen on 1 of 6 previews) | 0 | 0 |
| F11 HUD/sheets | 3 | 3 | 0 | 0 |
| Regression sweep | 1 | 1 | 0 | — |
| **Total** | **23** | **23** | **0** | **0** |

Run 1 had 2 FAILs (F5-01, F11-01) and 7 NOT RUN, all caused by the hung Worker or my script bug. Every one of them passed on the run 2 rerun.
Not exercised in either run: real NEAR login (wallet signing), and the live campaign completing to its goal (5/5) with the real Worker.

---

## Defects

### BUG-A — Market sheet and Rescue Book stay on "Loading…" forever when the Worker is unreachable, and the guest Market Cup lock button is never shown
- **Area / System**: NEAR client sheets (`src/near/index.ts`, Market and Rescue Book)
- **Severity**: S3 (proposed; this is a degraded offline path, and the core sit loop still works)
- **Frequency**: 1/1 (the Worker was hung for the whole run)
- **Repro**:
  1. Make the Worker unreachable (here `127.0.0.1:8788` accepted TCP but never replied).
  2. Open `?autoenter&at=bazaar` as a guest.
  3. Tap 🛒 and wait 30 s. Tap 📖.
- **Expected**: After a timeout, an error or retry message ("Market is offline, try again"). The guest lock "🔒 Log in with NEAR to play the Market Cup" and the Cup copy, which do not need prices, are still shown.
- **Actual**: "🛒 Market / Loading prices…" with no lock button, no Cup copy and no timeout. The Rescue Book shows "Loading…" with no timeout. The console has no error.
- **Evidence**: `evidence/f4f5-market/02-market-sheet-guest.jpg`, `evidence/f11-hud/02-rescue-book.jpg`
- **Note**: This may be by design. The engineers should confirm whether `econ`/quotes gate the whole render. With the Worker restarted (run 2), both sheets load correctly, so this finding only concerns the unreachable-Worker path. It is still valid.

### BUG-B — Top-left HUD pills overlap and truncate at 412 px
- **Area / System**: HUD layout (`#presence`, `#place`, `#groupbell`)
- **Severity**: S4
- **Frequency**: 6/6 hall screenshots
- **Repro**:
  1. Open `?autoenter` (any place) at 412x915.
- **Expected**: The presence and place pills are fully readable and do not collide with the 🔔 pill.
- **Actual**: The place pill truncates to "Cour…", "Mark…", "Comi…" and "Mem…" (runs 1 and 2). In run 1, the longer presence text "Offline · solo sit ok" ran under the yellow 🔔 pill. In run 2, the shorter "1 here · 0 sitting" fits.
- **Evidence**: `evidence/f1-welcome/02-entered-hall.jpg`, `evidence/f4f5-market/04-market-world-signs.jpg`, `evidence/f10-coming-soon/02-sign-cabal.jpg`

### BUG-C — Arrival hint and place toast cover the quest chip's 🎁 badge and the right-hand 🛒 button
- **Area / System**: HUD toasts/hint vs NEAR bar and quest chip
- **Severity**: S4 (transient, and it clears when the toast expires)
- **Frequency**: seen in 4 of 4 arrival screenshots in run 1. Seen again in run 2 at `at=valley`: the "🐸 1/5 PEPE token" toast covers the 🎁 2 badge (`evidence/f7-drops/13-live-pepe-pick-1.jpg`)
- **Repro**:
  1. Open `?autoenter&at=court` with a live drop campaign (or after Quick join).
  2. Look at the HUD in the first seconds.
- **Expected**: The toast does not hide interactive HUD elements or their badges.
- **Actual**: The place toast ("A lost fren is waiting in Meme Valley…") sits over the quest chip's 🎁 count. In the Courtyard after Quick join, the yellow hint banner covers the 🛒 button at the right.
- **Evidence**: `evidence/f7-drops/02-sim-drops-court-hud.jpg`, `evidence/f1-welcome/02-entered-hall.jpg`

### BUG-D — A drop drawn in front of a lost fren cannot be picked from that angle: the tap opens the fren sheet
- **Area / System**: Sponsored drops vs fren tap targets (`src/near/campaigns.ts` tap priority)
- **Severity**: S4 (the workaround is to tap the drop from another angle; observed once)
- **Frequency**: 1/1 for this specific overlap (PEPE drop #12 in front of Shibby, `at=valley`)
- **Repro**:
  1. Open `?autoenter&at=valley` with the PEPE campaign live.
  2. Find a glowing 🐸 drop that is drawn over Shibby's model.
  3. Tap the bubble.
- **Expected**: The visible bubble in front is picked. (Alternatively, if frens win taps by design, this is not a defect.)
- **Actual**: Shibby's sheet ("Grant the wish") opened. No `cpick` was sent and the drop stayed.
- **Evidence**: `evidence/f7-drops/11-live-pick-1.jpg`, `10-live-pepe-valley.jpg` (drops around Shibby)

### ENV-1 (not a product defect) — Worker at 127.0.0.1:8788 hung
Reported for the owner. The process was alive but no HTTP request got a response for 15 s or more, and the last log entry was at 09:03. I did not restart it, as instructed. The coordinator restarted it before run 2.

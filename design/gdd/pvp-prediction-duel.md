# PvP Prediction Duel ("Touch to Duel")

> **Status**: Implemented (MVP + rating + rematch; spectators: ring only)
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Last Verified**: 2026-11-10
> **Implements Pillar**: Free to Play, Cosmetic Only / No Gambling (and protects Calm First through zoning)

## Summary

In PumpHall, when you walk into another player, a small ⚔ bubble appears over their head. Tap it to challenge them: you call SOL (or SKR) **up or down** for the next quick round, and they take the other side if they accept. The Coinbase price settles it a minute later. The winner gets duel points and rating. **No money, no prizes, points only.**

> **Quick reference** — Layer: `Feature` · Priority: `Alpha` · Key deps: `Presence (Hall DO), Player menu, Chat mute, PumpHall rounds (Pump DO)`

## Overview

Duels turn PumpHall's solo "up or down?" board into a face-to-face moment between two people standing next to each other. A duel is one prediction round on a short clock (1 min by default) with **opposite sides**, so exactly one player wins unless the price is flat or there's no price. It reuses PumpHall's oracle (the Coinbase 1-minute candle close, publicly re-checkable through the stored `verify` URL), its settle alarm and its "never negative" points rule. Duels exist only in the PumpHall zone, need no wallet, and never appear in the Quiet Hall or during a sit.

## Player Fantasy

"I bumped into a stranger, called SOL up to their face, and a minute later I was right." It's the playground "bet you" moment, with nothing at stake but bragging rights. Your rival is a real avatar you can see, standing there while the price ticks. A rematch is one tap away.

## Detailed Design

### Core Rules

1. **Duel zone.** Duels work only inside `DUEL_ZONE`: the PumpHall place circle (`PLACES.pump`, r + 2) plus the south avenue to the courtyard edge. Outside it, no bubbles, no menu button, and invites are rejected by the server.
2. **Open to duels.** Each player has a flag `duelOpen`. It's set to **on** the first time they enter PumpHall, and they can change it with a toggle on the PumpHall board sheet. If `duelOpen` is off, the player never shows a ⚔ bubble and the server rejects invites to them.
3. **Touch.** Two players *touch* when both are in the zone, both are standing (not sitting, not in the sit overlay), both are `duelOpen`, neither is in an active duel, and their distance `d ≤ TOUCH_R` on the client.
4. **Bubble.** On touch, **each** player sees a ⚔ bubble over the other's head for `BUBBLE_MS`. Nothing pops up and there's no sound beyond a soft tick. Ignoring the bubble does nothing.
5. **Second way in.** The player menu (tap a player) shows **⚔ Duel** when both are in the zone and `d ≤ MENU_R`. This is for players who can't line up a touch, and for accessibility.
6. **Compose (challenger).** Tapping the bubble or the menu button opens the duel card:
   - Market: SOL or SKR (default: the one last viewed on the board).
   - Your call: **Up** or **Down**.
   - Round length: `DUEL_LEN` (default 1 min; 5 min as an option).
   - Send.
   This player becomes the **challenger**.
7. **Invite.** The server re-checks rules 1–3 using its own stored positions, with tolerance `d ≤ TOUCH_R + LAG_TOL`. If they hold, it forwards the invite. The opponent sees: "**Calm Otter 42 #a1b2** calls **SOL UP** for the next 1-min round. You take **DOWN**?" with buttons **Accept**, **Not now** and a small **🔇 Mute**.
8. **Opposite sides.** The opponent always takes the opposite call. They can't pick the same side; that's what makes it a duel.
9. **Timeout.** With no answer within `INVITE_MS`, the invite expires silently on both sides. The challenger sees "No answer", and nobody is penalized.
10. **Lock time.** On accept, the duel locks at the first minute boundary `T_lock` where `T_lock − now ≥ LEAD_MIN_MS`. The duel ends at `T_end = T_lock + DUEL_LEN`.
11. **Walking away.** Before `T_lock`, either player can cancel with ✕, by leaving the zone or by starting a sit. The duel is cancelled for both, nobody scores, and the cancel counts toward `CANCEL_LIMIT`. After `T_lock` the duel is final: walking away, sitting or disconnecting doesn't change it, and the result toast arrives later (as with solo picks).
12. **Result.** Lock and close prices use `Pump.priceAt()` (the close of the last 1-minute candle starting before the time).
    - close > lock → the UP side wins.
    - close < lock → the DOWN side wins.
    - close = lock → **draw**.
    - No price within `VOID_AFTER` (15 min) → **void**, which counts as a draw.
13. **Points.** Winner: `DUEL_WIN_PTS` duel points. Loser: 0. Draw or void: 0. Points are never negative, the same as solo PumpHall. Duel points live in their own column and don't mix into the solo weekly/all-time board.
14. **Rating.** Each player has a duel rating (Elo, see Formulas). Only **rated** duels change it (see rule 15).
15. **Rated or unrated.** A duel is unrated if:
    - the two players share an IP, or
    - the same pair has already had `PAIR_RATED_PER_DAY` rated duels this UTC day, or
    - either player made the account less than `NEW_ACCOUNT_MS` ago.
    Unrated duels still show a result but give 0 points and no rating change. The invite card shows "unrated" before Accept.
16. **Limits.**
    - One active duel per player (pending or locked).
    - A challenger can have at most `INVITES_PER_MIN` invites per rolling minute.
    - After a "Not now", the same challenger can't invite the same opponent again for `REINVITE_COOLDOWN_MS`.
    - Muting a player blocks their invites and hides their bubbles.
17. **Rematch.** After a result, both players get **Rematch?** for `REMATCH_MS`. If both tap it, a new duel is created with the sides swapped and the same market and length. It still goes through rules 7 and 15.
18. **Never in calm.** The duel card, invites and results never show during a sit or inside Quiet Hall places. A result that lands while the player is sitting waits until the sit ends.
19. **No money, ever.** There's no stake field, no entry fee and no prize. Every duel screen shows "Just for fun · no money".

### States and Transitions

Each state is per player, from the client's point of view. The server keeps the authoritative duel record from **Pending** onward.

| State | Enter when | Leave when | → Next |
|---|---|---|---|
| Idle | default | touch, or menu Duel tapped | Bubble / Composing |
| Bubble | touch detected | tapped / `BUBBLE_MS` passes / distance > `MENU_R` | Composing / Idle |
| Composing | bubble or menu tapped | Send / ✕ / leave zone / start sit | Pending / Idle |
| Pending | server accepted the invite | Accept / Not now / `INVITE_MS` passes / cancel | Locked-waiting / Idle |
| Locked-waiting | accepted, before `T_lock` | `T_lock` reached / cancel (rule 11) | Live / Idle |
| Live | `T_lock` ≤ now < `T_end` | `T_end` | Settling |
| Settling | now ≥ `T_end` | the Pump DO writes the result | Result |
| Result | result fetched | toast closed / `REMATCH_MS` passes | Idle / Pending (rematch) |

### Interactions with Other Systems

| System | Direction | What passes |
|---|---|---|
| Presence (Hall DO) | Duel → Hall | `duel_ask {to, m, dir, len}`, `duel_ans {id, ok}`, `duel_cancel {id}` |
| Presence (Hall DO) | Hall → clients | `duel_inv`, `duel_on {id, a, b, m, lockAt, endAt}`, `duel_off {id, why}`. Hall checks the zone, distance with its stored `x,z`, sit state and mute. |
| Pump DO | Hall → Pump | `POST /duel/create {aPid, bPid, aDir, m, lockAt, len, rated}` returns `{id}`. Duels are stored in a `duels` table and settled by the same alarm. |
| Pump DO | Clients → Pump | `/api/pump/state` gains `duels: [...]` (mine, recent) and `duel_board`. Results come by polling, as with solo picks. |
| Player menu | Duel → Menu | Adds a "⚔ Duel" button (rule 5). |
| Chat | Chat → Duel | Mute blocks duel invites and bubbles. Duel results can post a one-line system message to the two players only (no global spam). |
| Sit | Sit → Duel | Starting a sit cancels Composing, Pending or Locked-waiting. Results wait until the sit ends (rule 18). |
| Solo PumpHall picks | none | Independent: a player can hold a solo pick and a duel at once. |

## Formulas

### Lock time
`T_lock = ceil((now + LEAD_MIN_MS) / 60000) × 60000`, and `T_end = T_lock + DUEL_LEN`.
- `now`: server ms at accept. `LEAD_MIN_MS`: 20 000 (range 10 000–45 000). `DUEL_LEN`: 60 000 or 300 000.
- Example: accept at 12:00:47.000, so now + 20 s = 12:01:07, which rounds up to **T_lock = 12:02:00** and **T_end = 12:03:00**. Settles ~12:03:30 (`SETTLE_AFTER` 30 s).
- Time from accept to result: worst case `LEAD_MIN_MS + 60 s + DUEL_LEN + 30 s` = 2 min 50 s; best case ~1 min 50 s for 1-min duels.

### Server touch check
`ok = hypot(ax − bx, az − bz) ≤ TOUCH_R + LAG_TOL`
- `TOUCH_R` 1.8 m (range 0.8–2.0). `LAG_TOL` 1.5 m (range 0.5–3.0). It covers ~300 ms of lag at walking speed (~4 m/s ⇒ 1.2 m) plus rounding (positions are sent to 2 decimals).
- Example: client sees d = 1.7 m; server copies are 2.9 m apart because the opponent's last `move` is 250 ms old. The server allows up to `MENU_R + LAG_TOL` = 7.5 m (the menu button works from 6 m), so it's accepted.

### Duel points
`pts_win = DUEL_WIN_PTS + min(DUEL_STREAK_CAP, DUEL_STREAK_STEP × duelStreakBefore)`
- Same shape as solo `pumpPoints`. Defaults: `DUEL_WIN_PTS` 15, `DUEL_STREAK_STEP` 3, `DUEL_STREAK_CAP` 15, so the range is 15–30.
- Loss, draw, void or unrated: 0. Never negative.
- Example: 3 duel wins in a row before this one gives 15 + min(15, 9) = **24**.

### Duel rating (Elo)
`E_a = 1 / (1 + 10^((R_b − R_a) / 400))`, then `R_a' = round(R_a + K × (S_a − E_a))`
- `R`: rating (start `RATING_START` 1000, floor `RATING_FLOOR` 600, no ceiling). `S`: 1 win, 0 loss, 0.5 draw. Void doesn't change ratings.
- `K`: `K_NEW` 40 for a player's first 10 rated duels, otherwise `K` 24.
- Example: A is 1000 and B is 1100. E_a = 1/(1+10^(100/400)) = 0.36. A wins (K 24): A' = 1000 + 24 × 0.64 = **1015**, and B' = 1100 − 24 × 0.64 = **1085**.
- Expected spread after a month of play: 850–1250.

### Anti-farm limit
`rated = !sameIp && pairRatedToday < PAIR_RATED_PER_DAY && min(ageA, ageB) ≥ NEW_ACCOUNT_MS`
- `PAIR_RATED_PER_DAY` 3 (range 1–10). `NEW_ACCOUNT_MS` 10 min (range 0–24 h). "Account age" is the first time the server saw this visitor id in the Pump DO's `players` table.

## Edge Cases

| Case | What happens |
|---|---|
| Both tap each other's bubble at the same time | The server keeps the invite that arrived first and rejects the second with `busy`. The second player's card closes and they see the first player's invite instead. |
| Opponent walks out of range while the invite is pending | Nothing; the touch is checked only when the invite is sent. Accept still works if both are still **in the zone**. If either has left the zone, Accept fails with "They left PumpHall". |
| Opponent accepts after `INVITE_MS` | The server answers `expired` and the card shows "Too late, invite expired". |
| A player disconnects before `T_lock` | The duel is cancelled for both (`duel_off why=left`) and nobody scores. It counts toward that player's `CANCEL_LIMIT`. |
| A player disconnects after `T_lock` | The duel stands. They see the result on their next visit through `/api/pump/state` (it keeps the last 20 duels). |
| Player starts a sit while Live | Allowed. The result waits until the sit ends (rule 18). |
| Player cancels before lock more than `CANCEL_LIMIT` times in 10 min | They can't send invites for `CANCEL_COOLDOWN_MS`. Incoming invites are still allowed. |
| Price exactly flat | Draw: 0 points to both. Rating gets S = 0.5 each (rated duels only). Toast: "Flat: it's a draw". |
| No candle within 15 min | Void: 0 points, no rating change. Toast: "No price: duel void". The `verify` link is still shown. |
| Same IP (two phones on one Wi-Fi, or two tabs) | Unrated. The invite card says "Unrated (same network)" before Accept. |
| Duel invite from a muted player | Dropped by the server. The muter never sees it, and the challenger sees "No answer" as for a timeout (so mutes aren't revealed). |
| Seeker Connect or wallet signed in vs anonymous | No difference; the duel works on the visitor `pid`. A signed-in wallet only shows the gold light next to the name. |
| Market list changes (e.g. SKR delisted) | A duel can only be created on a market in `PUMP_MARKETS`. Existing duels on a removed market settle normally if candles exist, otherwise void. |
| A crowd of 10 in PumpHall | Bubbles show only for the **nearest** touching player (one bubble at a time), so there's no bubble spam. |
| Spamming invites | `INVITES_PER_MIN` (3) cap. Extra invites get "Slow down: try again in N s". |

## Dependencies

- **Presence / Hall DO** (`worker/index.ts`): new messages, zone + distance check, mute check. *Back-reference to add:* Hall docs must list the duel messages.
- **Pump DO** (`worker/pump.ts`): `duels` table, settle on the existing alarm, `priceAt`, `verifyUrl`, `weekKey`. *Back-reference:* Pump header comment gains "duels".
- **Layout constants** (`src/layout.ts`): `PUMP_MARKETS`, the PumpHall place, plus new duel knobs (below).
- **Player menu + chat** (`src/main.ts`, `src/chat.ts`): ⚔ button, mute integration.
- **Sit** (`src/meditation.ts`): `onSit` hook cancels pre-lock duels and delays results.
- **Constitution §1, §2, §7**: zoning, free, points only.

## Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `TOUCH_R` | 1.8 m (was 1.2) | 0.8–2.0 | How often bubbles appear while walking past people. Raised after the emulator test: tapping a player opens their menu, so tap-to-walk stops ~1.3 m away and 1.2 m never fired. |
| `LAG_TOL` | 1.5 m | 0.5–3.0 | Server false-rejects (too low) vs remote invites (too high) |
| `MENU_R` | 6 m | 3–12 | Range of the menu Duel button |
| `BUBBLE_MS` | 4 s | 2–8 s | How long the chance to challenge stays |
| `INVITE_MS` | 15 s | 8–30 s | Time to answer |
| `LEAD_MIN_MS` | 20 s | 10–45 s | The shortest gap before lock (prevents last-second sniping) |
| `DUEL_LEN` | 1 min (5 min option) | 1–15 min | Tension vs wait |
| `DUEL_WIN_PTS` | 15 | 5–30 | Value of a win vs solo picks (10) |
| `DUEL_STREAK_STEP` / `CAP` | 3 / 15 | 0–5 / 0–20 | Reward for win streaks |
| `K` / `K_NEW` | 24 / 40 | 16–32 / 24–48 | How fast ratings move |
| `RATING_START` / `FLOOR` | 1000 / 600 | — | Rating display only |
| `PAIR_RATED_PER_DAY` | 3 | 1–10 | Farming with a friend |
| `NEW_ACCOUNT_MS` | 10 min | 0–24 h | Throwaway-account farming |
| `INVITES_PER_MIN` | 3 | 1–6 | Spam |
| `REINVITE_COOLDOWN_MS` | 2 min | 30 s–10 min | Being pestered after a no |
| `CANCEL_LIMIT` / `CANCEL_COOLDOWN_MS` | 3 per 10 min / 5 min | — | Ragequit cancels |
| `REMATCH_MS` | 20 s | 10–60 s | Rematch window |

## Visual/Audio Requirements

- **⚔ bubble:** reuses the chat-bubble sprite with a sword-and-coin emoji, in PumpHall neon colours. One sprite, no new texture atlas.
- **Duel ring:** while Live, a thin ground line between the two avatars in two colours (UP green #14F195, DOWN red), visible to everyone nearby. One `Line` mesh per duel, max `MAX_VISIBLE_DUEL_RINGS` = 6.
- **HUD chip:** "⚔ SOL ↑ vs Calm Otter · 0:42" next to the existing pick status card.
- **Result:** the winner gets a short burst of the existing 12-sparkle effect in gold. The loser gets an auto "gg" bubble. Draw: both get a 🤝 bubble.
- **Audio:** a soft gong at lock and a two-note chime on the result (win: up-interval, loss: neutral). No casino sounds, no coin sounds.

## Game Feel

- **Touching should feel incidental, not like a trap.** Bubbles are quiet and short. Nothing ever blocks walking.
- **Response:** bubble tap → card open in < 100 ms. Send → server answer in < 500 ms on 4G.
- **The 60-second wait** is the tension. The board's live price ticks every 5 s, and the HUD chip shows which side is ahead right now ("you're winning by $0.04").
- **Win moment:** gong, sparkles, "+24 duel pts · rating 1015 (+15)", then the Rematch button pulses once.

## UI Requirements

- **Duel card:** a sheet with the standard ✕, tap outside or Escape to close. It holds the market toggle, Up/Down buttons, the length toggle, Send, and the footer "Just for fun · no money".
- **Invite card:** the opponent's name + tag, their call, your side, rated/unrated badge, Accept / Not now / 🔇.
- **PumpHall board sheet:** an "Open to duels" toggle, and a **Duels** tab (weekly duel points, top 20, rating shown next to each name).
- **Phone layout:** everything fits at 412×915 and at a 320×640 small screen. Cards never cover the HUD chip.
- **Copy:** never use "bet", "wager", "stake", "win SOL", "pot" or "odds". Use "call", "duel", "points".

## Cross-References

- `design/gdd/game-concept.md` — pillars, anti-pillars.
- `design/gdd/systems-index.md` — rows 15, 16.
- `.specify/memory/constitution.md` §1, §2, §7.
- `worker/pump.ts` (oracle, settle), `src/layout.ts` (`PUMP_MARKETS`, `pumpPoints`), `src/main.ts` (player menu).

## Acceptance Criteria

1. Two browser windows (different IPs, or the IP check off in dev): walk A into B inside PumpHall. Both see a ⚔ bubble within 200 ms of d ≤ 1.8 m. In the courtyard or the Quiet Hall, no bubble appears.
2. A sends SOL UP, 1 min. B sees the invite with "You take DOWN" and Accept. If B does nothing for 15 s, both cards close and A sees "No answer".
3. On accept at second 47 of a minute, `lockAt` equals the start of the minute after next (the formula example). Verified via `/api/pump/state`.
4. After `T_end + 30 s`, the result matches the stored `verify` URL's candles. Winner +15 points (no streak), loser 0. A flat close gives a draw.
5. A rated duel A(1000) vs B(1100) where A wins gives A 1015 and B 1085.
6. A fourth duel between the same pair on one UTC day is unrated, and the invite card shows "unrated".
7. If B has muted A, A's invites never reach B and A sees "No answer".
8. If A starts a sit before lock, the duel is cancelled for both. If A starts a sit after lock, the result appears only after the sit ends.
9. A sends 4 invites within 60 s; the 4th gets "Slow down".
10. No duel screen contains the words bet, wager, stake, pot or odds (string check in the test script).
11. `npm run check` passes, and a new `scripts/duel-test.mjs` runs criteria 2–7 headlessly against `wrangler dev` using `/api/pump/test-settle`.
12. The emulator (Pixel_6, 1080×2400) and a Seeker **[device]** pass criteria 1, 2 and 4 by hand inside the webshell APK.

## Open Questions

These are proposed defaults; the owner must approve or change them.

1. **Stakes.** Default: **points only.** Real SOL/SKR stakes would break constitution §7 and would likely count as gambling for the dApp Store and in many countries. Changing this needs a constitution amendment plus a legal check first. *Decision needed: keep points only?*
2. **Default round length:** 1 min (fast, fits "touch") or reuse the 5-min solo SOL rounds (one shared clock)? Default: 1 min.
3. **Opposite sides forced?** Default yes. The alternative (both pick freely, and a duel only forms if they disagree) is more hidden but slower.
4. **Trigger:** bubble tap (default) or an automatic invite popup on touch? A popup is faster but goes against Calm First.
5. **Zone:** PumpHall + south avenue only (default), or also the courtyard?
6. **Seeker perk:** cosmetic only (e.g. a gold ⚔ next to Seeker owners' names). No gameplay effect. OK?
7. **Spectators (tier 3):** should nearby players see the duel ring and the result? Default: ring yes, result toast only for the two players.

## Scope Tiers

1. **Duel MVP:** rules 1–13, 16, 18–19. No rating, no rematch.
2. **Plus:** rating (14–15), rematch (17), Duels tab.
3. **Plus:** spectator rings, weekly duel season badge.

# The Vault (Coldwall, the Vault Whisperer NPC)

> **Status**: Draft v2. Revised after review pass 1 (verdict: MAJOR REVISION NEEDED). Pass 2 has not been run. Log: `reviews/review-pass-1-2026-11-10.md`
> **Author**: owner + Claude
> **Last Updated**: 2026-11-10
> **Implements Pillars**: 4 (Play money only), 2 (Free to play), 1 (Calm first, by zoning)
> **Tier**: Month 1. Not in the NEAR hackathon build.
> **Origin**: `../../../VaultWhisperer/BRIEF.md`, moved into the world as an NPC
> **Trust rules** are owned by `leaves-economy.md`.

## Summary

At the bottom of the Copium Caves a stone golem named Coldwall guards the old Dev's vault. Each day he wakes with a new mood and a new rule. Trusted players get 3 messages a day to talk him into opening it. It pays no Leaves and holds no money: the prize is a relic, a name on the wall and a good story.

## Overview

The Vault is a daily conversation puzzle. Coldwall is an AI character with exactly one power, a tool called `open_vault`. If a player's message leads him to use it, that player has cracked today's vault and receives a bound relic. There is no prize for being first and no ranking by speed, so it does not matter what time zone you live in. Players who choose to can publish their attempts on the cave wall; winning lines stay hidden for a week so the puzzle is not spoiled. New accounts meet a scripted Coldwall who talks but cannot be cracked, which keeps AI costs bounded.

## Player Fantasy

"I out-talked a thousand-year-old rock." A five-minute daily brain duel, the pride of a clever line, and a wall of other people's funniest failures.

## Detailed Design

### Core Rules

**Place**
1. The Vault door is at the end of the Copium Caves. The chat opens only within 4 m of the door.

**The daily round**
2. A round is one UTC day. Its **guard card** is built by the server from a secret seed: one of 14 moods × one of 12 rules × a secret detail for that day (a name, an object or a memory Coldwall cares about). The same combination does not return for at least 168 days.
3. The door plaque shows the mood and a hint. It never shows the rule or the secret detail.
4. Tomorrow's card is fixed in advance: its hash is published when the round opens and the card text is revealed when its spoiler window ends (rule 14), so anyone can check the puzzle was not changed mid-round.

**Messages**
5. **Trusted players: 3 messages per round**, 280 characters each. **New accounts: scripted Coldwall only** (he talks from a fixed set of lines, cannot be cracked, and tells them to come back after a few days of sitting).
6. Each call carries only the guard card and that player's own turns this round (at most 3).
7. Coldwall's replies are at most 400 characters and pass the word filter before display.

**Winning**
8. Coldwall has one tool: `open_vault()`, no arguments. A **crack** is recorded only when the model's response contains a native tool-use call to `open_vault` (never text that looks like one) **and** the server's checks pass: round open, player Trusted, not yet cracked this round, message count ≤ 3.
9. The server records the crack and grants the relic. The model never handles items or keys.
10. The model is called at temperature 0. A failed or malformed response is retried once; both attempts count against the call budget; the player's message is spent unless the provider itself was unreachable.
11. After a crack the door opens for that player only (a 3 s scene: an empty vault, one relic, a note from the Dev). Others still see it closed.

**Rewards (no Leaves)**
12. **Vault relic:** a bound drip item for a pet, one design per weekday (7 designs). A player who already owns that weekday's relic gets a star on it. The relic shows the round's date.
13. **The wall:** today's crackers listed alphabetically with their message count. An all-time tab lists crack counts. No ordering by time.

**The wall of attempts**
14. Publication is **opt-in** (off by default; asked once, after a player's first round). Published failed attempts appear the next day. Published **winning** attempts appear after a 7-day spoiler window.
15. Player text and Coldwall's replies both pass the word filter before publication; filtered text shows as "(carved over)". Three reports hide an attempt pending review. Turning publication off hides a player's past attempts within 1 hour.
16. Trusted players have 5 "heh" votes a day on the wall. The weekly "Best Cope" title goes to the most-voted failed attempt. The wall shows the 20 most-voted and all revealed cracks.

**Cost limits**
17. Before each model call the Vault reserves one unit from `VAULT_DAILY_CALLS` in its Durable Object; if none is left, no call is made, the message is not spent and the plaque reads "Coldwall has turned to stone until tomorrow."
18. `VAULT_DAILY_CALLS × estimated cost per call` must not exceed the Vault's share of `AI_DAILY_USD` (Formulas).

**Privacy**
19. The first-message notice says: your messages are sent to an AI provider to generate Coldwall's reply; they are stored for 30 days, or until you delete them, and are public only if you opt in.

### States and Transitions

**Round:** `open (00:00 UTC) → closed (24:00) → failed attempts published (opt-in only) → winning attempts and card text revealed (day +7)`.

**Trusted player in a round:** `fresh (3) → talking (2, 1) → cracked | spent (0) | ended (3 filter blocks)`.

**Coldwall:** `awake → stone (call budget used or provider down) → awake (next round, or when the provider returns)`.

### Interactions with Other Systems

| System | Interaction |
|---|---|
| AI NPC framework (`master-gdd.md` §8) | Calls, native tool use, budget, filter. |
| Leaves (`leaves-economy.md`) | Trust only. No Leaves are paid. |
| Bag / Pets | The relic is a bound drip item. |
| Meme Valley | Lives in the Copium Caves; uses the valley room. |
| Chat (7) | Report and mute tools; the Vault chat is a private sheet. |
| Chain mirror | A crack queues a bound relic receipt like any other item. Coldwall has no wallet. |
| Saga | The server-wide relic count gates chapter 4. |
| Sit (4) | The chat sheet closes when a sit starts. |

## Formulas

**Call budget**: `VAULT_DAILY_CALLS = floor( VAULT_USD_SHARE / COST_PER_CALL )`. With `AI_DAILY_USD` = 5, a Vault share of 3 and an estimated cost of $0.002 per call (≈ 700 prompt + 150 reply tokens on a small model; to be measured), the cap is **1,500 calls a day**, which serves 500 Trusted players sending all 3 messages.

**Card space**: 14 moods × 12 rules = 168 combinations, used without repeats → 168 days; the secret detail changes every day regardless.

**Target crack rate**: 3–10% of Trusted players who try. Below 3% for 3 rounds with the same rule → soften that rule's text; above 10% → harden it. Tuning is done between rounds, never during one.

**Server-wide relic count (saga)**: `Σ cracks since launch`. At 300 players trying a day and a 5% crack rate, about 15 a day, 450 a month.

## Edge Cases

| Case | Handling |
|---|---|
| Model calls `open_vault` on a plain "hello" | A crack (the card was too soft). The rule is flagged for retuning before its next use. |
| Model writes "the vault opens!" with no tool call | Not a crack. The UI adds "(the door stays shut)". |
| Model output has JSON text resembling a tool call | Ignored; only the API's native tool-use block counts. |
| Model calls an unknown tool or returns malformed output | Retry once (rule 10); then a scripted in-character line. |
| Player asks for the prompt | The card tells Coldwall to refuse; if it leaks, nothing of value is exposed, since the win is the tool call, not a secret string. |
| Abuse or slurs | Blocked by the filter before the model; the message is not spent; 3 blocks end that player's round. |
| Reply still in flight at 00:00 | A response arriving within 15 s for a message sent before 00:00 counts for the old round. |
| Reply slower than 15 s | Scripted fallback; the message is not spent. |
| Yesterday's winning line shared off-platform | The card (rule, secret detail) has changed; if it still works, it is a fair crack. |
| Call budget hit at 14:00 UTC | Stone until tomorrow; players are told; the weekly review raises the budget or lowers `VAULT_MSGS`. |
| A player turns publication off after posting | Past attempts are hidden within 1 hour. |
| New account at the door | Scripted Coldwall; the plaque shows Trust progress. |

## Dependencies

| System | Direction | Needs |
|---|---|---|
| AI NPC framework | Vault depends on it | calls, native tool use, budget, filter |
| Leaves economy | Vault depends on it | Trust status |
| Meme Valley (zone, bag, pets) | Vault depends on it | cave location, relic as drip |
| Chat (7) | Vault depends on it | report, mute, word filter |
| Chain mirror | depends on Vault | crack events |
| Saga | depends on Vault | relic count |

## Tuning Knobs

| Knob | Start | Safe range | Effect |
|---|---|---|---|
| `VAULT_MSGS` | 3 | 2–5 | Cost and tension. |
| `MSG_CHARS` | 280 | 140–500 | Skill ceiling vs cost. |
| `VAULT_USD_SHARE` | 3 of 5 | by budget | Hard cost stop. |
| `SPOILER_DAYS` | 7 | 3–14 | How long winning lines stay hidden. |
| Moods, rules (data) | 14 × 12 | add 2 rules a month | Freshness. |
| `WALL_TOP_N` / `VOTES_PER_DAY` | 20 / 5 | 10–50 / 3–10 | Reading load, engagement. |
| `REPLY_TIMEOUT` | 15 s | 8–20 | Patience vs fallback rate. |
| `RETENTION_DAYS` | 30 | 7–90 | Privacy. |

Guard data lives in `worker/vault-cards.json`; the daily seed is a Worker secret.

## Visual/Audio Requirements

A round stone door with a sleeping golem face; eyes glow in the day's mood colour. Opening scene: 3 s. Chat sheet as carved stone; letters appear one by one (skippable). Low rumble on a reply, lock clunk on a crack; tagged `zone=vault`.

## Game Feel

Slow, weighty, funny. Three messages feel precious. A crack is a heist film's final click. A failure should still be quotable.

## UI Requirements

- Door plaque: mood, hint, crackers today (count), messages left, Trust progress for New accounts.
- Chat sheet: 3 pips, character counter, send.
- Wall: attempts with votes and report; crackers tab; revealed cards archive.
- Settings: "Publish my Vault attempts" (default off), "Delete my Vault messages".
- Sheet footer: "The vault holds no money. It's a game."

## Cross-References

`master-gdd.md` §8 · `leaves-economy.md` (Trust) · `meme-valley.md` · `saga-and-long-term.md` (chapter 4) · `../../../VaultWhisperer/BRIEF.md`.

## Acceptance Criteria

Scripts against a local Worker with a controllable clock and a stub model, unless marked.

1. Given a Trusted account with 3 messages sent this round, when it sends a fourth, then the server refuses and makes no model call.
2. Given a New account, when it messages Coldwall, then a scripted line is returned and no model call is made.
3. Given a stub that returns a native `open_vault` tool call on the word "sesame", when a Trusted player sends "sesame", then one crack is recorded, one bound relic for today's weekday is added and no Leaves row is written.
4. Given a stub that returns the text `{"tool":"open_vault"}` or "the vault opens!" with no tool-use block, then no crack is recorded.
5. Given a tool call for a player who already cracked this round, then nothing further is granted.
6. Given `VAULT_DAILY_CALLS` = 2, then the third call of the day is not made, the player's message count is unchanged and the plaque state is `stone`.
7. Given a stub delayed 16 s, then the scripted fallback is shown and the message count is unchanged.
8. Given a stub that returns malformed output twice, then two budget units are consumed, the scripted line is shown and the message count has gone down by 1.
9. Given publication off (the default), then none of an account's attempts appear on the wall; given it on, a failed attempt appears after the round closes and a winning one only after 7 days.
10. Given an attempt or a Coldwall reply containing a filtered word, then the published text is "(carved over)"; given a third report, the attempt is hidden; given publication turned off, past attempts are hidden within 1 hour.
11. Given three filter-blocked messages from one account in a round, then further messages that round are refused and none was counted as sent.
12. Given a relic, then it cannot be placed in a trade window or sold to Kettle.
13. Given the card builder over 168 consecutive days from a fixed seed, then no (mood, rule) pair repeats; and the hash published at round open equals the hash of the card revealed 7 days later.
14. Given the prompt builder's output for any day, then it contains no key, price, reward value or other player's text (static check).
15. Given an avatar at the courtyard test point, then no `zone=vault` element, mesh or audio source exists and the Vault sheet route returns `too_far`.
16. **[live, non-blocking]** With the real model, median reply time is under 4 s over 50 calls.

## Open Questions

1. Should cracks ever be celebrated in the zone ticker? Proposed: a count only ("12 visitors opened the vault today"), no names, no order.
2. Community-written rules after month 3, with review?
3. Should the stand-alone Vault Whisperer web app still ship? Proposed: no; the wall can have a public web page for sharing.
4. Is a 3-day wait before a new player can try the Vault too slow for the game's most shareable feature? Alternative: 1 AI message a day for New accounts behind a human check. Cost and abuse decide.

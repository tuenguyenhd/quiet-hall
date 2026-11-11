# Quiet Hall NEAR: Player Journey, Tutorial and AI Characters

> **Status**: Draft v1 for the owner to fill in. Design only: nothing here is built yet.
> **Last Updated**: 2026-11-11
> **Parent doc**: `edition-near.md` (this doc replaces its onboarding and economy wording where they differ)
> **How to use this doc**: every part ends with **✏️ Your notes**. Add details there; anything marked **[TBD]** is a decision still open.

---

## 0. Decisions already made

| # | Decision | Why |
|---|---|---|
| D1 | **No currency (no Leaves).** Rewards are pets, pet gifts, trophies, badges and milestone stamps. | Leaves had no real use; sitting should be calm, not a grind. (Built on `drops-integration`, commit `a949d69`.) |
| D2 | **Plain words for players.** Meme names stay only as flavour (subtitles, item names). | New players did not understand "Meme Valley", "fren", "wish", "drip", "Cup". |
| D3 | **Tutorial is very short: 2 steps, ~20 seconds, skippable.** Everything else is taught the first time the player meets it, in one bubble. | Long tutorials get skipped; teach in context instead. |
| D4 | **The game is a journey of chapters with milestones**, one goal at a time on the HUD. | Players need to know "what do I do now?" at every moment. |
| D5 | **AI characters: your pet is an AI companion; Monk Bao, Kettle and the lost pets talk with AI.** | Makes the world feel alive and guides players in their own words. |
| D6 | **AI provider: Claude API first** (owner's key), with hard limits. NEAR AI Cloud stays as the second option. | Owner has a Claude key; quality and safety. |
| D7 | **No AI vault puzzle.** The Vault site is removed from Coming Soon. | Not needed. |

✏️ **Your notes:**

---

## 1. Word list (what the player sees)

| Old / internal word | Player word | One-line meaning (used in tooltips) |
|---|---|---|
| Fren | **Pet** | An animal that follows you and talks to you. |
| Meme Valley | **Pet Valley** (subtitle "Meme Valley") | Where lost pets wait for help. North-east of the Courtyard. |
| Wish | **Pet's request** | What a lost pet asks you to bring. |
| Grant wish | **Help** | Give the items, then sit with the pet for 1 minute. |
| Co-rescue | **Help together** | Anyone sitting nearby when a pet is helped gets it too. |
| Node (rock, yarn, shroom) | **Pick spot** | Tap to pick an item. It grows back. |
| Workbench / craft | **Gift table / Make** | Turn items into a gift for your pet. |
| Drip (Moon Collar) | **Pet gift** | Something your pet wears. |
| Bag | **Bag** | Items you picked. |
| Market Cup | **Trading game** | Free 3-hour contest with play chips. Best 3 win a trophy. |
| Kettle | **Kettle (Market keeper)** | Runs the trading game. |
| PumpHall up/down | **Price guess** | Guess if Bitcoin or NEAR goes up or down next round. |
| Duel | **1-vs-1 guess** | Same game against one person. |
| Sponsored drop | **Collect event** | Glowing items in a place: collect N, get a badge and a reward. |
| Rescue Book | **My Collection** | Your pets, gifts, trophies, badges and stamps. |
| Receipt / NEP-171 token | **Saved on NEAR** | Proof it is yours, kept on the NEAR blockchain. |
| Milestone | **Stamp** | A step of your journey, shown in My Collection. |
| Bell / world sit | **Bell time** | Every few hours everyone sits together for a minute. |

Rules: never show "NFT", "token", "wallet address", "NEP" to players. Say "Saved on NEAR".

✏️ **Your notes:**

---

## 2. The journey at a glance

```
 TUTORIAL (20 s · Skip)  1. Tap to walk  2. Tap Sit           ★ S1 WELCOME
        ▼
 CH 1  GET YOUR FIRST PET (Pet Valley)                         ★ S2 GOT A PET
        ▼   pet becomes your AI companion, guides from here
 CH 2  MAKE A GIFT (Gift table)                                ★ S3 FIRST GIFT → map opens
        ▼
 CH 3  EXPLORE (any order)
        🛒 Market: trading game                                ★ S4 FIRST TRADING GAME
        📈 PumpHall: price guess + 1-vs-1                      ★ S5 FIRST PRICE GUESS
        🎁 Collect event                                       ★ S6 FIRST BADGE
        ▼
 CH 4  COME BACK DAILY (3 daily goals, 2nd pet, bell time)     ★ S7 7-DAY VISITOR
        ▼
 COMING SOON (look only): Clans · Events · Swap market · Pet adventures
```

### Stamps (milestones)

| ID | Stamp | Trigger (server-checked) | Reward | Saved on NEAR? | Needs login? |
|---|---|---|---|---|---|
| S1 | Welcome | Tutorial done or skipped | Goal chip appears | No | No |
| S2 | Got a pet | First pet helped home | Pet follows you; AI companion on | Yes (pet) | No (login prompt after) |
| S3 | First gift | First Moon Collar made | Pet wears it; map opens 3 places | Yes (gift) | No |
| S4 | First trading game | Finish one trading-game round | Trophy if top 3 | Yes (trophy, if won) | Yes |
| S5 | First price guess | One guess settled in PumpHall | Name on the board | No | Yes |
| S6 | First badge | Complete one collect event | Badge + sponsor reward | Yes (badge) | Yes |
| S7 | 7-day visitor | Played on 7 different UTC days | Special pet look [TBD] | [TBD] | No |

Every stamp: celebration card (big emoji, one line, confetti like the PumpHall win) + the stamp appears in My Collection.

✏️ **Your notes:** (more stamps? e.g. "Helped together", "Second pet", "Bell time x3")

---

## 3. Tutorial (first visit only)

**Goal:** the player can walk and sit, and sees where their goal is. Nothing more.

| Step | Bubble (Monk Bao, 1 line) | What the player does | Done when |
|---|---|---|---|
| 1 | "👆 Tap the ground to walk." | Taps; avatar walks to a glowing circle 6 m away | Inside the circle |
| 2 | "🧘 Tap Sit. Just breathe." | Taps Sit; a 10-second ring fills | Ring full (standing up early restarts the ring) |
| ★ | "You're ready. Your goal is up here ↑" | The 📜 goal chip pulses once | Stamp S1 |

- **Starts:** after the welcome card (name + pet look) → Enter.
- **Skip:** a small "Skip" link on every bubble. Skipping gives S1 too.
- **Replay:** 📜 Journey sheet → "Replay tutorial".
- **Returning players** (S1 already on the account): never shown again, on any device once logged in.
- **No text walls:** max 8 words per bubble; big arrow pointing at the real button.
- **Edge cases:** the player taps Sit first (count it, jump to ★); the player is on desktop (the bubble says "Click" instead of "Tap"); the hall is crowded (the glow circle avoids other players).

✏️ **Your notes:**

---

## 4. Chapter 1: Get your first pet (Pet Valley)

**Goal:** the player gets a pet in under 5 minutes. This is the heart of the game.

**Beats:**
1. **Hook (Courtyard):** Bao: "A puppy is lost in Pet Valley. Follow the lanterns." Lanterns light a path north-east. HUD goal: `📜 Find the lost puppy ▸`.
2. **Arrive (Valley Gate):** first time in the valley, one bubble: "This is Pet Valley. Lost pets wait here."
3. **Meet Shibby:** sad, sitting by a torn map. Tap → AI talk (or written line for guests): his story + "Can you bring me 2 Moon Rocks? 🪨". Goal: `Pick 2 Moon Rocks 0/2`.
4. **Pick:** first pick spot shows "Tap to pick". Rocks glow while the goal needs them.
5. **Help:** goal: `Bring them to Shibby`. Tap Shibby → **Help** → sit beside him 1 minute (ring timer). Others sitting nearby are helped too ("Help together").
6. **★ S2 Got a pet:** celebration card: "Shibby is your pet! He'll follow you everywhere." Shibby joins, says his first companion line.
7. **Login moment #1 (guests only):** after the card: "Keep Shibby forever: log in with NEAR (free, 1 signature)". [Log in] [Later].

**Rules:** pick spots are personal (your picks never empty someone else's); one help per pet per day; standing up early returns the items.

**Edge cases:** the player already has Shibby (skip to Ch 2); the player walks away during the minute (items back, "Try again"); someone else helps Shibby while you sit nearby (you get him too, and the goal jumps ahead).

✏️ **Your notes:** (Shibby's story? 2 rocks enough? should the first pet be chosen by the player?)

---

## 5. Chapter 2: Make a gift

**Goal:** teach gathering more than one kind of item, and making something.

1. Shibby (AI): "Brr… I'm cold. Could you make me a collar?" Goal: `Make a Moon Collar for Shibby`.
2. Sub-goals shown in order: `Pick 1 Rug Yarn 🧶` → `Pick 3 Moon Rocks` → `Go to the Gift table`.
3. Gift table (first visit bubble: "Make gifts here"): Make → **★ S3 First gift**: Shibby wears the collar, a short happy animation; "Saved on NEAR" note.
4. Then: "The map has new places!" The 🗺 map highlights Market, PumpHall, and any live collect event.

**No cost** other than the items (D1).

✏️ **Your notes:** (more gifts later? gifts per pet?)

---

## 6. Chapter 3: Explore (any order)

Each place has a **first-visit intro**: one bubble from its character, and one small goal.

### 6a. 🛒 Market: the trading game
- Kettle (AI): "Welcome! A free trading game: everyone gets 200 play chips. Buy low, sell high. Best 3 win a trophy."
- Goal: `Join a trading game round` → `Make 3 trades` → `Wait for the round to end` (round every 3 h; the HUD shows time left).
- **★ S4** when the round ends (trophy card if top 3, "You finished #12, try again!" otherwise).
- Rules: play chips only, free, nothing to lose. Kettle never gives real trading advice.

### 6b. 📈 PumpHall: price guess
- Bubble: "Will Bitcoin go up or down in the next round?"
- Goal: `Make 1 price guess` → **★ S5** when it settles. Then an optional goal: `Try a 1-vs-1 guess` (bump into someone).
- The pet reacts (AI): cheers on a win, teases gently on a loss.

### 6c. 🎁 Collect events (sponsored drops)
- When a collect event is live, the pet says: "I smell 🐕 drops in the Courtyard!" Goal: `Collect 3 🐕 (0/3)`.
- **★ S6** on completion: badge card + the sponsor's link or code (only for this player).
- New players see collect events **from Chapter 3**; earlier, only if a drop is right where they walk (bonus, not a goal).

**Login moment #2:** S4, S5, S6 need a NEAR login. Tapping their goal as a guest opens "Log in to play" with what it unlocks.

✏️ **Your notes:**

---

## 7. Chapter 4: Come back daily

- **Pet greeting (AI):** first visit of the day: "gm! Yesterday we won a trophy. Today…"
- **3 daily goals** (reset 00:00 UTC), drawn from a pool, given by the pet in its own words:

| Pool | Example goal |
|---|---|
| Calm | Sit at bell time · Sit 3 minutes |
| Valley | Pick 5 items · Help a pet today |
| Play | Play one trading game round · Make 2 price guesses |
| Social | Help together with someone · Greet 3 people |
| Collect | Finish a collect event (only when one is live) |

  Reward: a daily stamp; 3/3 done → a small pet animation [TBD].
- **Second pet: Froggo** (harder request, e.g. 3 shrooms + 2 yarn). Unlocks after S3.
- **Bell time:** the HUD bell counts down; everyone sitting at the bell gets a "together" moment.
- **★ S7 7-day visitor** after 7 different days (not in a row; no streak pressure).

✏️ **Your notes:** (goal pool, rewards for daily goals)

---

## 8. Coming Soon (look only)

South-west district, each site shows a sign "Coming soon" and preview screens with sample data:

| Site | What it will be |
|---|---|
| 🏮 Clans (Cabal Camp) | Groups with a home, banner and team trading game |
| 🏟 Events (Event Arena) | Seasonal events, team contests, trade fair |
| 🧺 Swap market (Sitting Bazaar) | Swap items with other players while you sit |
| 🐾 Pet adventures (new) | Send your pet out; it comes back with a story (AI) and an item |

The Vault (AI puzzle) is removed (D7).

✏️ **Your notes:**

---

## 9. Screens and UI

| Element | What it shows | Notes |
|---|---|---|
| **Goal chip (HUD, top-left)** | `📜 <current goal> <progress> ▸` | Replaces the 🐾 chip. One goal at a time. Tap → Journey sheet. Pulses when a goal changes. |
| **Journey sheet** | Chapters (✓ done / ● now / 🔒 locked), the current goal with **Show me the way**, daily goals, stamps row | "Replay tutorial" at the bottom |
| **Map 🗺** | Places; locked ones greyed with "Unlocks in Chapter X"; live collect events marked 🎁 | Tap a place → walk there |
| **My Collection** (was Rescue Book) | Pets, gifts, trophies, badges, stamps; "Saved on NEAR" links | |
| **Celebration card** | Big emoji, one line, confetti, [Nice!] | Reuse PumpHall `celebrate()` |
| **Talk bubble** | Character portrait, 1–2 lines, [💬 Reply] [Close] | For AI and written lines |
| **First-time bubbles** | One line next to the thing, max 8 words | Shown once per account |

✏️ **Your notes:** (sketches, colors)

---

## 10. AI characters

### 10a. Cast

| Character | Where | Personality | Knows (given by the server) | Never does |
|---|---|---|---|---|
| 🧘 **Monk Bao** | Courtyard | Calm, warm, short sentences, a little funny | Player's chapter, current goal, places | Long lectures; talks about money |
| 🐕 **Your pet** (Shibby, Froggo…) | Follows you | Each pet its own voice (Shibby: loyal, excited; Froggo: lazy, sarcastic, "comfy") | Your name, pets, gifts, stamps, today's goals, last few events (won a trophy, helped together) | Pretends to be human; asks for personal info |
| 🫖 **Kettle** | Market | Cheerful shopkeeper, loves price jokes | Current prices, the round, your rank | Real trading or investment advice; says a coin will go up |
| 🐸 **Lost pets** | Pet Valley | Sad but hopeful, tell their story | Their request, who helped them before | Gives away the request answer for free |

### 10b. How talking works
- Tap a character → **💬 Talk**. A few suggested replies as buttons ("What do I do?", "Tell me a story", "Where is the Market?") plus free text (max 120 characters).
- Replies are **1–2 lines** (max ~200 characters), in character, and can include one **action hint** the game turns into a button (e.g. `[Show me the way: Market]`).
- The pet also **speaks on its own** at key moments (stamps, first visit of the day, a collect event nearby). These use **written lines first** and AI only when there is budget left.

### 10c. Memory (companion)
- Per player and pet, the server keeps a short **memory card** (max ~10 facts): name, stamps, best trading rank, last 3 notable events, and the player's chosen pet nickname.
- Facts come **from game events only**, never from free chat text. Nothing personal is stored. Deleted when the player resets.

### 10d. Provider and model
- **Claude API first** (owner's key), from the Worker with the official TypeScript SDK (`@anthropic-ai/sdk`).
- **Model:** `claude-opus-5-5` (default), effort `low` for short replies. **[TBD owner]:** `claude-haiku-5-5` is much cheaper for chat ($0.10 / $0.50 per million tokens vs $4 / $20 for Opus 5.5) and may be good enough for 1–2 lines; decide after a test.
- **Refusal handling:** server-side fallbacks on; if Claude declines or fails, the character uses a written line.
- **Second provider:** NEAR AI Cloud (`LLM_BASE_URL`, already set up for drafting drops) can be switched on per character. [TBD whether to use it as the fallback.]
- **Key:** stored only as a Cloudflare secret (`ANTHROPIC_API_KEY`), never in code or the client.

### 10e. Guardrails (hard limits)

| Guard | Value (tuning knob) |
|---|---|
| Who gets AI chat | Logged-in players. Guests: **3 AI replies a day**, then written lines [TBD] |
| Per player | 20 AI replies / day; 1 reply every 3 s |
| Per character | Pet auto-lines: max 5 AI lines / player / day |
| Global | Daily spend cap ($ [TBD], e.g. $5/day) and 2,000 replies/day; when reached, everyone gets written lines until 00:00 UTC |
| Request size | Max 120-char player message; max output ~200 characters |
| Input safety | Player text goes through `cleanChat` first, and is passed as data, never as instructions (prompt-injection safe) |
| Output safety | Checked by `cleanChat` again; no links, no wallet addresses, no prices-as-advice; anything failing → written line |
| Topics | Stays in the game world; money / investment questions get "I only know play chips!" |
| Kill switch | A var `AI_MODE=off|mock|claude|nearai` to turn AI off instantly |
| Logs | Count tokens and cost per day; no chat text is stored beyond 24 h [TBD] |

### 10f. Cost estimate (to check after a test)
- One reply ≈ 1,500 input tokens (character card + memory + recent lines, mostly cached) + ~60 output tokens.
- **Prompt caching:** the character's fixed card goes first and is cached; only the memory card and the new message change. This makes repeated replies much cheaper.
- At 20 replies/player/day and 100 daily players = 2,000 replies/day. With Haiku 5.5 this is cents per day; with Opus 5.5 roughly a few dollars per day before caching. [Measure in a test before choosing.]

✏️ **Your notes:** (voices, sample lines, which characters get AI first)

---

## 11. Login moments (never at the door)

| When | Message | Why it is a good moment |
|---|---|---|
| After S2 (first pet) | "Keep Shibby forever: log in with NEAR" | They just got something they love |
| Tapping Market / PumpHall / collect goals | "Log in to play: free, 1 signature" | They want to play |
| After 3 AI replies as a guest | "Log in to keep talking with Shibby" | They enjoy the companion |
| Collect event finished as a guest | "Log in to claim your reward" | Reward waiting |

✏️ **Your notes:**

---

## 12. Data the server keeps (for later build)

- `journey(acct)`: tutorial done, stamps (id + time), current chapter, first-time bubbles seen, daily goals (day + 3 goals + progress), days played.
- `ai_memory(acct, pet)`: up to 10 facts, updated by game events.
- `ai_usage(day)`: replies and tokens per player and in total (for the caps).
- All checks (stamps, goals) happen on the server, from the same events the game already sends.

✏️ **Your notes:**

---

## 13. Tuning knobs

| Knob | Default |
|---|---|
| Tutorial sit length | 10 s |
| Shibby's request | 2 Moon Rocks |
| Moon Collar recipe | 3 Moon Rocks + 1 Rug Yarn |
| Daily goals per day | 3 |
| Stamp S7 days | 7 (not in a row) |
| AI replies per player per day | 20 (guests 3) |
| AI global daily cap | $ [TBD] / 2,000 replies |
| Max reply length | ~200 characters |

---

## 14. Acceptance criteria (for the build)

1. A new player finishes the tutorial in under 30 seconds, or skips it in one tap.
2. A new player gets a pet (S2) in under 5 minutes without reading anything longer than one line.
3. At any time, the goal chip shows exactly one next goal, and "Show me the way" walks there.
4. No player-facing screen uses the words Leaves, fren, wish, drip, NFT, token or wallet address.
5. Every stamp shows a celebration card once and appears in My Collection.
6. With AI off or the cap reached, every character still speaks (written lines); nothing breaks.
7. The AI never outputs a link, a wallet address or investment advice (tested with a list of tricky prompts).
8. A guest is asked to log in only at the moments in section 11.

---

## 15. Open questions

1. Model: Opus 5.5 or Haiku 5.5 for chat (test both)?
2. Global AI spend cap per day?
3. Should guests get a few AI replies, or written lines only?
4. Pet nickname: can players rename their pet?
5. Reward for S7 and for 3/3 daily goals?
6. Does the first pet stay Shibby, or does the player choose between Shibby and Froggo?

## 16. Build order (later, after this doc is approved)

1. Journey state + goal chip + Journey sheet + stamps (server and UI).
2. Tutorial (2 steps) and first-time bubbles; plain-word renames.
3. Chapter 1–2 goals wired to existing valley events.
4. AI characters: pet companion first, then Bao, Kettle, lost pets; guardrails and kill switch from day one.
5. Chapter 3 intros and login moments; daily goals; map locks.
6. Coming Soon update (remove the Vault, add Pet adventures).

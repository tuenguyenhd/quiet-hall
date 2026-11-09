# Spec 005: A bigger, more real world

## Why
Sansa's pull is a place you wander and come back to. One hall is not enough to explore. People need
several calm places, each with its own mood and somewhere to sit.

## Places
| Place | Mood | Sit spots | Signature |
|---|---|---|---|
| Main Hall (exists) | together, ritual | 12 cushions | bowl, moon window |
| Stone Garden | focus | 3 benches facing raked sand | raked ring patterns, 3 stones, moss |
| Lake | open, breath | dock end, 2 boulders | wide water with ripples, wooden dock, lilies, reeds |
| Maple Grove | warm, rest | bench under trees, swing | red/orange maples, falling leaves |
| Tea House | small, cozy | 4 floor cushions | low table, steam |
| Lookout | quiet, alone | 1 flat rock | high ground, view of mountains |

## User stories
1. **Explore (P1).** From the hall path, signposts lead to each place; a mini-map pill shows where you are.
2. **Sit anywhere marked (P1).** Every bench, cushion, rock or dock end is tappable: walk there, sit, open the sit sheet.
   Others see you sitting there.
3. **Place moods (P2).** Each place has its own ambient sound layer (water, wind in leaves, birds) that fades with distance.
4. **Feels real (P1).** Soft sky gradient, light that changes with time of day, moving water, swaying grass,
   falling leaves, no floating objects, consistent scale. Judged by screenshot review loops.
5. **Still light (P1).** Stays within the phone budget (constitution 6); `?low` keeps working.

## Acceptance
- Screenshot set `scripts/shots.mjs` shows each place from the player's eye view, reviewed each loop.
- Tapping each sit spot in headless Chrome moves the player there and opens the sit sheet.
- FPS ≥ 30 in headless Chrome profile at 412×915 (rough proxy); real check on Seeker **[device]**.

# Backlog

Ideas waiting for a spec. Move an item into `specs/NNN-*/` when it is picked up.

| # | Idea | Money | Spec |
|---|---|---|---|
| B1 | **Pets + blessings**: get a pet that follows you; pet/bless the Doge (Shibu) and other NPC frens to receive a bless effect | Paid | [specs/008-pets-blessings](specs/008-pets-blessings/spec.md) |

## Bugs

| # | Bug | Seen | Likely cause / fix |
|---|---|---|---|
| BUG1 | **Signpost text cut off**: two-line sign by the hall shows "laple Gr / Lookou" — the words run past both edges of the board ([screenshot](docs/bugs/BUG1-signpost-text.png)). A rock model also sits right against the sign post. | 2026-11-09, desktop, sign west of the hall ("← Maple Grove / ↑ Lookout") | `textTexture()` in `src/build.ts` sets font size from canvas *height* (`h × 0.42`); a 2-line board is 512×340 px, so the font is ~143 px and the text is wider than 512 px. Fix: shrink the font until the widest line fits (`measureText`), wider canvas for 2-line boards, redraw after fonts load. Keep instanced rocks/bushes off signposts (add signs to the `blocked` check in `world-assets.ts` / rock scatter). Check all 4 signs after. |

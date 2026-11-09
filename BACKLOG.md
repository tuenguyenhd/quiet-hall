# Backlog

Ideas waiting for a spec. Move an item into `specs/NNN-*/` when it is picked up.

| # | Idea | Money | Spec |
|---|---|---|---|
| ~~B1~~ | ~~**Pets + blessings**~~ → **built 2026-11-09** (pets free, blessings 1 h free / 24 h paid) | Paid | [specs/008-pets-blessings](specs/008-pets-blessings/spec.md) |

| ~~B2~~ | **Perf: done 2026-11-09**: robed avatars baked to a few meshes, scenery culled per 32 m cell, animated models culled. Left: per-avatar distance LOD, one skeleton per animal, instanced lanterns, merged hall props | – | – |
| ~~B3~~ | **Downloads: done 2026-11-09**: models 10.5 → 5.3 MB (`scripts/optimize-glb.mjs`: meshopt + unused clips; scenery textures 256 px). Left: KTX2/WebP textures (needs sharp), load husky/maple after entering | – | – |
| ~~B4~~ | **Polish: done 2026-11-09**: pet try-on, hall back mural, cairn, husky rest pose, smaller chibis, Low Poly Cat removed, narrower fren bubbles | – | – |

## Bugs

| # | Bug | Seen | Likely cause / fix |
|---|---|---|---|
| ~~BUG1~~ | **FIXED 2026-11-09** · **Signpost text cut off**: two-line sign by the hall shows "laple Gr / Lookou" — the words run past both edges of the board ([screenshot](docs/bugs/BUG1-signpost-text.png)). A rock model also sits right against the sign post. | 2026-11-09, desktop, sign west of the hall ("← Maple Grove / ↑ Lookout") | `textTexture()` in `src/build.ts` sets font size from canvas *height* (`h × 0.42`); a 2-line board is 512×340 px, so the font is ~143 px and the text is wider than 512 px. Fix: shrink the font until the widest line fits (`measureText`), wider canvas for 2-line boards, redraw after fonts load. Keep instanced rocks/bushes off signposts (add signs to the `blocked` check in `world-assets.ts` / rock scatter). Check all 4 signs after. |

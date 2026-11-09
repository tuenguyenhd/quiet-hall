# Backlog

Ideas waiting for a spec. Move an item into `specs/NNN-*/` when it is picked up.

| # | Idea | Money | Spec |
|---|---|---|---|
| ~~B1~~ | ~~**Pets + blessings**~~ → **built 2026-11-09** (pets free, blessings 1 h free / 24 h paid) | Paid | [specs/008-pets-blessings](specs/008-pets-blessings/spec.md) |

| B2 | **Perf, bigger jobs (QA 2026-11-09)**: merge the robed avatar parts into 1–2 meshes + distance LOD (crowd of 20 normal mode still ~970 calls); split instanced vegetation into culling cells and simplify maple (7.4k tris) / pine; one skeleton per animal; real bounding spheres instead of `frustumCulled=false`; instance lanterns; merge hall props / cushions | – | – |
| B3 | **Smaller downloads**: compress GLB textures (KTX2/WebP) + meshopt, strip unused clips from shiba/husky (24 clips, 4–5 used), load husky/maple after entering (first load 5.4 MB GLB). Needs a project dev dependency (`@gltf-transform/cli`); ask first | – | – |
| B4 | **Polish (QA)**: pet preview in the pet sheet; Lookout looks at the hall's plain back wall (give the back a mural / round window); husky "sit" uses standing Idle_2; lookout cairn stones float; chibi pool characters get huge heads at 1.55 m; "Low Poly Cat" Degen roll overlaps the Kitty pick; fren bubble can run off-screen | – | – |

## Bugs

| # | Bug | Seen | Likely cause / fix |
|---|---|---|---|
| ~~BUG1~~ | **FIXED 2026-11-09** · **Signpost text cut off**: two-line sign by the hall shows "laple Gr / Lookou" — the words run past both edges of the board ([screenshot](docs/bugs/BUG1-signpost-text.png)). A rock model also sits right against the sign post. | 2026-11-09, desktop, sign west of the hall ("← Maple Grove / ↑ Lookout") | `textTexture()` in `src/build.ts` sets font size from canvas *height* (`h × 0.42`); a 2-line board is 512×340 px, so the font is ~143 px and the text is wider than 512 px. Fix: shrink the font until the widest line fits (`measureText`), wider canvas for 2-line boards, redraw after fonts load. Keep instanced rocks/bushes off signposts (add signs to the `blocked` check in `world-assets.ts` / rock scatter). Check all 4 signs after. |

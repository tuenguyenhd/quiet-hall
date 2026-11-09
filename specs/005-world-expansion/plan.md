# Plan 005: World expansion

## Layout (top view, metres; hall stays at the centre, spawn at z = +18)
```
                 Lookout (0, -48)  high rock
                        |
   Maple Grove (-34,-18) ── Main Hall (0,-8) ── Tea House (30,-16)
            \               |  path                 /
   Lake (-30, 18) ── courtyard (0, 2) ── Stone Garden (26, 16)
                         spawn (0, 18)
```
- World radius grows from 40 m to 62 m; ground becomes a larger disc with gentle hills outside paths.
- Paths: flat stone strips (instanced) from the courtyard to each place, with a signpost at each fork.

## Code structure
- `src/world.ts` keeps the core (ground, light, sky, hall). New `src/places/*.ts` modules each export
  `build(ctx): Place` with `{ name, center, radius, seats: Seat[], obstacles, update(t, dt) }`.
- Generic `Seat { pos, facing, kind }`; one tap handler for all seats (replaces cushion-only code).
- `world.placeAt(x, z)` → current place name for the HUD pill and ambient mixing.
- Ambient: synthesised layers in `audio.ts` (water = filtered noise + slow LFO, leaves = high-passed noise,
  birds = short chirps on random timers), volume by distance to each place.

## Realism (loop until screenshots look right)
1. Sky dome with vertical gradient + sun disc; hemisphere/sun tinted by time of day (local clock; night theme stays).
2. Water: custom material with animated normal ripples (no textures), fresnel tint, soft edge.
3. Grass: instanced tufts (cards) near paths, wind sway in the vertex shader; density lower on `?low`.
4. Trees: pines + maples with 2–3 colour variants, slight sway; falling leaf particles in the grove.
5. Ground: vertex-colour variation (moss/dirt), small rocks/pebbles instanced along path edges.
6. Post: ACES tone mapping (exists), light fog, cheap vignette via CSS; no heavy post-processing.

## Performance budget
Draw calls < 150, triangles < 300k, shadow map 1024–2048, instancing for anything repeated > 10×.

# Tasks 005: World expansion

## Phase A: foundation
- [x] T101 Generic seats: `Seat` type, tap any seat → walk → sit sheet; migrate hall cushions
- [x] T102 Bigger ground (r = 62) with hills outside paths; bounds + obstacles updated
- [x] T103 Path network + signposts to each place
- [x] T104 `scripts/shots.mjs`: screenshots from fixed viewpoints (`?cam=<place>`) for review loops

## Phase B: places (each independently testable)
- [x] T110 [P] Lake: water material, dock with seat at the end, boulders, lilies, reeds
- [x] T111 [P] Stone Garden: raked sand rings (procedural texture), 3 stones, benches ×3
- [x] T112 [P] Maple Grove: maple trees, bench, swing, falling leaves
- [x] T113 [P] Tea House: small pavilion, low table, 4 cushions, steam particles
- [x] T114 [P] Lookout: raised rock with one seat and a view
- [x] T115 HUD place pill ("Lake", "Stone Garden" …) + entering toast once

## Phase C: realism loop (repeat until review passes)
- [x] T120 Sky dome gradient + sun, time-of-day tint
- [x] T121 Grass tufts with wind sway (instanced)
- [x] T122 Ground colour variation, pebbles along paths
- [ ] T123 Ambient layers per place (water, leaves, birds)
- [x] T124 Review loop: shots → list issues → fix → shots (stop when no issues, max 4 loops)

## Phase D: verify
- [x] T130 `npm run check`, online test, shots review, deploy
- [ ] T131 **[device]** FPS and feel on a Seeker

## Notes
- Draw calls 130-330 per view (budget 150): merge static hall/lantern meshes if a Seeker drops below 30 fps (T131).

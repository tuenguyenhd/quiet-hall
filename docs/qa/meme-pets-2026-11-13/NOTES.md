# Meme-archetype pets: fit test (2026-11-13, exploration, branch meme-pets)

Original characters built from primitives in `scripts/meme-pets.mjs` (no logos, no text, no copy of any artwork):
**Biscuit** (Shiba-style pup, red bandana), **Lily** (chill half-lidded frog, lily-pad hat), **Pip** (cream-and-ginger
cat that pops its mouth open, blue collar and bell). Shipped pets and spawns are unchanged; preview is dev-only `?pets=meme`
(swaps shiba to memeShiba, husky to memeCat and frog to memeFrog for wanderers, the player pet and the lost-fren pets).

Rebuild: `node scripts/meme-pets.mjs && node scripts/optimize-glb.mjs public/models/meme/*.glb`

| Model | Tris | GLB (meshopt) | Draw calls | Clips | vs current |
|---|---|---|---|---|---|
| meme-shiba.glb | 1070 | 37 KB | 1 | Idle, Idle_2, Walk, Sit | shiba.glb 1950 tris, 413 KB, 6 draw calls |
| meme-frog.glb | 1114 | 35 KB | 1 | Idle, Hop | frog.glb 4920 tris, 163 KB, 4 draw calls |
| meme-cat.glb | 1052 | 37 KB | 1 | Idle (with mouth pop), Walk, Sit | (husky.glb 1920 tris, 448 KB) |

One SkinnedMesh with vertex colours and rigid one-bone parts; material roughness 0.415 / metalness 0.4, the same
values as the Quaternius set, so the meme pets take the scene light the same way. No console errors in either variant.

## Screenshots (412x915, headless Chrome with SwiftShader, NEAR edition, dev server on :5180)

- `closeup-current.jpg` / `closeup-meme.jpg`: wanderers moved in front of the player, zoom 4.5, Shiba pet
- `closeup-frogpet-*.jpg`: the frog as the player's pet. `closeup-catpet-*.jpg`: the husky slot as pet, which is the cat in meme mode
- `court-*.jpg`, `lake-*.jpg`: the default `?at=` views. The wanderers are mostly off-screen there, so the close-ups are the real comparison
- `iter-v1-closeup-meme.jpg`: first pass, with a thin cream cat that read grey and goat-like. `iter-v2-catpet-allginger.jpg`: second pass, an all-ginger cat too close to the Shiba
- `memeview.mjs`: the CDP capture script. Usage: `node memeview.mjs http://localhost:5180 <outdir>`
- The run is in low-power mode (SwiftShader), so only half the wanderers spawn in some shots. That is not caused by the pets.

## Verdicts

- **Biscuit (Shiba): fits.** It reads straight away as a Shiba on a phone. The chibi head and the eyes, nose and tongue are readable at pet distance, the red bandana adds a clear spot of colour, and the soft orange sits well on the courtyard stone. Sit looks good. As a pet (SCALE 0.62) it is about the size of the current Shiba pet. As a wanderer it looks smaller than the big Quaternius dogs even at KINDS height 1.0, because of the chibi proportions. That is fine for a pet but not if it is meant to replace the adult wanderers.
- **Lily (frog): fits, needs small polish.** The silhouette and green read well, and it is cuter and much lighter than frog.glb (1.1k vs 4.9k tris). From behind or at range, the lily-pad hat reads as a dark-green tuft, and the half-lidded "chill" eyes only show face-on. Try a lighter or yellower pad, or swap the hat for a small bright scarf. The Hop clip moves the body only and never leaves the ground track, which matches how animals.ts moves it.
- **Pip (cat): needs work, now close.** v1 (thin legs, all cream) read as a goat. v2 (all ginger) looked like a second Shiba. v3 (chunky cream with a ginger cap, ears and tail) reads as a cat and stands apart from the Shiba. The open-mouth "pop" is only visible face-on and up close. Make the mouth larger or add a bigger head tilt so the gag reads at phone scale, and ask art-director whether a non-orange coat (for example a soft grey tabby) would separate it better from the Shiba.

## What to change next

1. Art-director call on the cat coat colour and the frog prop (palette is their call; the generator takes a hex per part).
2. A bigger pop on the cat mouth, maybe a short scale-up of the whole head when it pops.
3. If these become real pets: add PETS entries, CREDITS (original, project-owned) and pick SCALE from a face-on lineup. The `?lineup=pets` view puts the row behind the avatar at default zoom, so it was not useful here.
4. Optional: a second idle for the frog and cat (look-around), to match the Shiba's Idle_2.

---

## Polish pass (same day, after the go-ahead)

Changes:
- **Pip (cat) v4:** grey-and-white tabby. The darker stripes on the back, head cap and tail rings are per-face vertex colours (a `shade` hook on `Rig.part`), so it is still 1 material and 1 draw call. The pop is bigger: the mouth is a dark oval below the muzzle that opens to about 1.3–1.45x, is held for about 0.9 s, and the nose tips up 0.32 rad during the pop. 1076 tris, 38 KB.
- **Lily (frog):** the dark pad is now a bright light-green lily pad with a darker rim, sitting almost flat, with a small pink 5-petal flower on top. The half-lidded eyes are unchanged. 1218 tris, 38 KB.
- **Biscuit:** model unchanged. Its wandering-dog instance is raised to KINDS height 1.15 (was 1.0) so it sits closer to the CC0 dogs. Pet scale is unchanged.
- **NEAR edition wiring (this branch only):** the new `petModel()` in `src/animals.ts` maps the pet keys shiba → memeShiba and frog → memeFrog when `NEAR_BUILD`. That covers the lost frens in Meme Valley (Shibby, Froggo), the rescued pets and other players' pets. The Seeker edition is unchanged. The wandering animals still use CC0 unless `?pets=meme`. New dev-only `?pets=cc0` shows the old CC0 pets in the NEAR edition, for comparison.

Screenshots (`polish-*`): `-current` = `?pets=cc0`, `-meme` = `?pets=meme` for the court close-ups. For the valley and fren shots, `-meme` is the plain NEAR default, which shows that the edition wiring works.
- `polish-closeup-{current,meme}.jpg`: wanderers plus the Shiba pet
- `polish-closeup-frogpet-*`: frog pet. `polish-closeup-catpet-*`: husky slot as pet, which is Pip in meme mode
- `polish-valley-*`: Meme Valley overview
- `polish-fren-shibby-*`, `polish-fren-froggo-*`: lost frens, viewed from beside the player (the fren pet sits beside its anchor)
- `memeview2.mjs`: the capture script

Verdicts after the polish:
- **Biscuit: fits.**
- **Pip: fits.** The tabby reads as a cat at once and no longer competes with the Shiba. The open-mouth, nose-up pop is visible at pet distance.
- **Lily: fits.** The pink flower and light pad read from behind and three-quarter view. At valley distance the frog is small, as the CC0 frog was.
- No console errors.

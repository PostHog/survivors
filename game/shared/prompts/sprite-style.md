# Sprite style guide (Claude-drawn art)

How Claude makes prospect sprites: start from a CC0 base, edit it as a text grid, look at it, fix it.
Tools: `tools/pixel.py` (browse / grab / render / lint / palette). Assets: `~/games/assets` (see CATALOG.md there).

## Workflow (every sprite)

1. **Brief the sprite in one line**: concept, signature feature, brand colour role.
   "Data Ticket: a friendly paper-ticket ghost; signature = text lines + a green stamp; paper is lavender-white."
2. **Pick a base** from the CC0 packs whose *silhouette and pose* already fit (browse the contact sheets).
   Match the slot size: 16x16 enemies, 64x64 boss, 24x24 player. Prefer Ninja Adventure for creatures,
   0x72 for dungeon monsters, Kenney for objects/tiles/UI. Only draw from scratch for props no pack has.
3. **Grab it** into a `.sprite` text grid (`pixel.py grab`), 2 frames for anything animated.
4. **Edit**: recolour the legend first (cheap, big win), then change pixels for the signature feature.
5. **Render and look** (`pixel.py render`, then view the `-review.png`). Answer the checklist below in words.
6. **Fix** what the checklist found. Stop after 3 passes; ship the best one.
7. **Lint** (`pixel.py lint --bg <arena floor>`) must print OK.

## Rules

- **Palette**: keep the base pack's shading family; bring the brand in as the *hero* colour on roughly
  20-40% of the pixels, not everywhere. Every colour is a ramp of 3 (shadow, base, highlight). Shift hue
  along the ramp: shadows cooler and more saturated, highlights warmer and lighter. Max ~8 colours at 16px.
- **Light** comes from the top-left: 1-2 px highlight clusters top-left of each form, shadow bottom-right.
- **Outline**: dark outline around the silhouette (the packs use #141b1b). Inside the sprite, separate
  forms with a darker shade of the fill, not the outline colour (selective outlining).
- **Signature feature**: one idea per sprite that survives at 1x (a stamp, flag tiles, a coin). If you
  can't see it in the 1x strip of the review, it doesn't exist; make it bigger or higher-contrast.
- **Silhouette**: every enemy in a game must be distinguishable by silhouette alone (review's white strip).
- **Skin tones** stay natural human ramps (the pack's own skin colours or real-world browns/peaches).
  Never let a recolour or brand token touch skin; check every face for green, grey, red or purple casts.
- **Faces** make things friendly: two dark eyes, optionally a 1px highlight. No teeth, no blood, no weapons.
- **Animation**: 2 frames = squash/stretch or a 1px bob; outline stays intact; nothing flickers.
- **Avoid**: pillow shading (shade hugging the outline evenly), banding (parallel staircases), jaggies
  (uneven line steps; use regular 1-1, 2-2 steps), orphan pixels, dithering at 16px, text (unreadable
  under ~5px tall), logos, real people's likenesses from photos.
- **Tone**: the prospect's world, affectionately. Obstacles are cute problems, never something gross or
  scary; the prospect's brand colours are used on the good stuff and the problems alike, respectfully.

## Review checklist (answer each after every render)

1. At 1x on the arena floor, can I tell what it is? Name it without the caption.
2. Is the signature feature visible at 1x?
3. Does it read as the same style as its neighbours (other enemies, the player)?
4. Silhouette distinct from the other enemies?
5. Outline closed? Any orphan pixels, jaggies, banding, pillow shading?
6. Brand colour present but not overwhelming? Contrast against the floor OK on dark and light?
7. Do the frames animate (not identical, not jittery)?
8. People: natural skin tone, friendly expression, no accidental likeness to a real person?

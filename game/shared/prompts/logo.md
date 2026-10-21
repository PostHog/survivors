# The splash screen logo (all kits)

Every game opens on a ~2 second splash screen, then the title. There are two kinds:

- **PostHog** (the default): the 8-bit PostHog logo, which is the logomark plus the wordmark. Nothing to make.
- **The prospect's logo**: their logo as pixel art, with a small "powered by [PostHog logo] PostHog" line under it.
  This is the optional `logo` slot (128x48, 1 frame), which every kit has.

## Making the prospect's logo (offer the person 2-4 options)

1. **Find their real logo.** In order of preference:
   - an SVG or transparent PNG from their site header, footer or press/brand page (look for `logo` in the HTML, or the
     `og:image` / `apple-touch-icon`);
   - a large favicon as the last resort.
   Prefer the version made for dark backgrounds, if they have one, because the splash is dark. Download it to
   `prospects/<name>-logo.<ext>`. Only ever use the prospect's own logo; never another company's.
2. **Make the options:**

       uv run -q --with pillow --with playwright python pipeline/tools/pixel.py logo prospects/<name>-logo.svg \
           prospects/<name>-logo-options --theme prospects/<name>-themes/<kit>.json

   This writes `logo-a.sprite` .. `logo-d.sprite` and `logo-options.png`, which shows all four on the game's real splash
   background:
   - **A, detailed:** the logo's own colours, as much detail as 128x48 allows.
   - **B, chunky:** half resolution, doubled. This is the most 8-bit look.
   - **C, light:** any colour too dark for the splash background is made light. Use it for dark logos.
   - **D, one colour:** a silhouette in the theme's accent colour (or light).
3. **Look at `logo-options.png` yourself**, then show it to the person and ask which they want: A-D, or the PostHog
   splash instead. Drop any option that's illegible (thin strokes lost, a dark logo invisible on the dark background),
   so you offer 2-4 good ones. If the person isn't around to ask, pick the most legible, usually A, or C for a dark
   logo, and say so.
4. **Copy the choice** into the art folder as `logo.sprite`, e.g.
   `cp prospects/<name>-logo-options/logo-a.sprite prospects/<name>-art/<kit>/logo.sprite`. `build-game --art`
   installs it. To get the PostHog splash, don't copy anything.
5. **After building,** check the splash shot in the game check's `contact.png`: the logo is legible, centred, and
   the "powered by PostHog" line sits under it.

If the logo is a very long wordmark, it comes out small. That's fine. Don't hand-edit it into something it isn't. A
logo with fine detail (thin script, tiny text under the mark) usually reads better as B, or as just the mark if
their brand has a standalone icon.

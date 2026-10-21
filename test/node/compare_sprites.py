"""Reference check for the TypeScript renderer: every PNG the Worker code wrote must match the game's own Python build
(shared/sprites.py build(): what the original pipeline used to render a prospect's game) pixel for pixel, for every slot.
    python compare_sprites.py <game_dir> <dir_with_ts_pngs> <theme.json>"""
import json, os, sys, tempfile
game, out, theme_path = sys.argv[1:4]
sys.path.insert(0, os.path.join(game, "shared"))
import sprites
from PIL import Image

theme = json.load(open(theme_path))
ref_dir = tempfile.mkdtemp(prefix="ref-")
written = sprites.build(os.path.join(game, "bug-survivors"), ref_dir, theme)

ours = {f[:-4] for f in os.listdir(out) if f.endswith(".png")}
bad = 0
if ours != set(written):
    bad += 1
    print("SLOT SETS DIFFER: only ours", sorted(ours - set(written)), "only reference", sorted(set(written) - ours))
for slot in sorted(ours & set(written)):
    got = Image.open(os.path.join(out, slot + ".png")).convert("RGBA")
    ref = Image.open(written[slot]).convert("RGBA")
    if got.size != ref.size or list(got.getdata()) != list(ref.getdata()):
        bad += 1
        print("MISMATCH", slot, got.size, ref.size)
print(f"{len(ours & set(written)) - bad}/{len(written)} slots identical")
sys.exit(1 if bad else 0)

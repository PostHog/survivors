"""Plays the default game into a late, busy moment and saves frames from it, for the README header and the share image.

    npm run build && (cd public && python3 -m http.server 8761) &
    uv run --with playwright python scripts/screenshot.py http://localhost:8761/ /tmp/frames
    cp /tmp/frames/frame5.png docs/gameplay.png    # pick the frame you like
    uv run --with pillow --with fonttools --with brotli python game/bug-survivors/tools/make_icons.py   # adds the title; writes docs/header.png and og.png

The game's debug hooks (window.__game.debug) maxes out the weapons and spawns the boss and a swarm. Achievement and
level toasts crowd the top of the screen for a while after that, so it waits them out, then takes twelve frames in a row:
which one is clean enough is a judgement call, and it changes from run to run. Frames are 2400x1260.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8761/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/frames"


def wait(page, expr, timeout=30000):
    for _ in range(timeout // 200):  # polling: wait_for_function would eval(), which the page's policy forbids
        if page.evaluate(f"(() => {{ try {{ return !!({expr}); }} catch (e) {{ return false; }} }})()"):
            return
        page.wait_for_timeout(200)
    raise TimeoutError(expr)


import os
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=2)
    page.goto(BASE)
    wait(page, "window.__game && window.__game.ready && window.__game.state === 'title'")
    page.wait_for_timeout(1500)
    page.keyboard.press("Enter")
    wait(page, "__game.state === 'howto'", 10000)
    page.wait_for_timeout(1200)
    page.keyboard.press("Enter")
    wait(page, "!['Title', 'HowTo', 'Boot', 'Splash'].includes(__game.scene)", 10000)
    wait(page, "typeof __game.debug.god === 'function'")
    page.wait_for_timeout(1000)
    page.evaluate("""(() => { const d = __game.debug; d.god(true); d.holdLevels(true); d.giveAll(); d.maxAll(); d.passives(5);
      d.evolveAll(); d.wave(5); d.autopilot(true); })()""")
    page.wait_for_timeout(22000)  # let the toasts go
    page.evaluate("__game.debug.spawnBoss()")
    page.wait_for_timeout(1500)
    page.evaluate("__game.debug.bossHp(400); __game.debug.bossHere(170); __game.debug.flood(200)")
    for i in range(12):
        page.wait_for_timeout(700)
        page.screenshot(path=f"{OUT}/frame{i}.png")
    browser.close()
print("frames in", OUT)

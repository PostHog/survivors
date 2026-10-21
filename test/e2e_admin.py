"""Browser test of the admin app, run by `npm run e2e` against a Worker that has DEV_LOGIN_EMAIL set and a scripted fake AI provider.

Signs in, makes a game, adds an AI key, chats (the fake provider calls the theme, sprite and scene tools), watches the live preview,
edits the theme by hand, uploads a logo, resets the password, visits the game as the prospect would, and deletes it. Fails on any
console error, policy violation or failed request.

    uv run -q --with playwright --with pillow python test/e2e_admin.py <base_url> <out_dir> <fake_llm_url>
"""
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image, ImageDraw
from playwright.sync_api import expect, sync_playwright

BASE, OUT, LLM = (sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3].rstrip("/"))
KEY = "sk-ant-e2e-0123456789"
problems = []


def watch(page, label):
    def on_console(m):
        if m.type not in ("error", "warning") or "GL Driver Message" in m.text:
            return
        problems.append(f"[{label}] console {m.type}: {m.text} ({m.location.get('url', '')})")

    page.on("console", on_console)
    page.on("pageerror", lambda e: problems.append(f"[{label}] page error: {e}"))
    page.on("requestfailed", lambda r: problems.append(f"[{label}] request failed: {r.url}") if "favicon" not in r.url else None)
    page.on("response", lambda r: problems.append(f"[{label}] HTTP {r.status}: {r.url}")
            if r.status >= 400 and "favicon" not in r.url and r.request.resource_type != "document" and "/unlock" not in r.url else None)


def logo_png():
    """A company logo as it would arrive: a green disc and an orange bar on an opaque white background."""
    im = Image.new("RGB", (300, 120), "white")
    d = ImageDraw.Draw(im)
    d.ellipse([30, 20, 110, 100], fill=(10, 125, 90))
    d.rectangle([140, 45, 270, 75], fill=(244, 87, 46))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def fake_requests():
    return json.load(urllib.request.urlopen(f"{LLM}/__requests"))


def wait_game(frame_owner, timeout=30000):
    """The game inside the preview iframe has booted. (Polling via evaluate: the page's policy forbids eval.)"""
    for _ in range(timeout // 250):
        for f in frame_owner.frames:
            if "/g/" in f.url and f != frame_owner.main_frame:
                try:
                    if f.evaluate("!!(window.__game && window.__game.ready)"):
                        return f
                except Exception:
                    pass
        frame_owner.wait_for_timeout(250)
    raise TimeoutError("the preview game never booted")


os.makedirs(OUT, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1500, "height": 950})
    page = ctx.new_page()
    watch(page, "admin")

    # 1. sign in (the dev sign-in stands in for PostHog) and see the games
    page.goto(f"{BASE}/admin")
    expect(page.get_by_role("heading", name="Games")).to_be_visible()
    expect(page.get_by_test_id("who")).to_have_text("e2e@posthog.com")
    page.screenshot(path=f"{OUT}/admin-1-games.png")
    print("signed in; games list OK")

    # 2. make a game
    page.get_by_test_id("new-game").click()
    page.locator("#name").fill("Acme Rockets")
    page.locator("#domain").fill("https://www.AcmeRockets.com/pricing")
    page.get_by_test_id("create-game").click()
    link = page.get_by_test_id("created-url").input_value()
    password = page.get_by_test_id("created-password").input_value()
    assert "/g/acme-rockets-" in link, link
    assert password.count("-") == 3, password
    page.screenshot(path=f"{OUT}/admin-2-created.png")
    page.get_by_test_id("open-new-game").click()
    expect(page.get_by_test_id("game-title")).to_have_text("Acme Rockets")
    slug = link.rstrip("/").split("/")[-1]
    game_id = page.url.rstrip("/").split("/")[-1]
    print("game created:", slug)

    # 3. no key yet: the chat asks for one; the key is kept in this browser only
    expect(page.get_by_test_id("need-key")).to_be_visible()
    page.get_by_test_id("ai-settings").click()
    page.locator("#apikey").fill(KEY)
    page.get_by_role("button", name="Save").click()
    expect(page.get_by_test_id("need-key")).to_be_hidden()
    stored = page.evaluate("localStorage.getItem('survivors.llm.v1')")
    assert KEY in stored, "the key is kept in localStorage"
    print("key saved in localStorage")

    # 4. chat: the fake provider changes the theme, redraws a bug and checks the scene
    page.get_by_test_id("chat-input").fill("Make it green for Acme Rockets and redraw the first bug.")
    page.keyboard.press("Enter")
    expect(page.get_by_text("Done: the game is green")).to_be_visible(timeout=30000)
    for title in ("Changed the theme", "Drew the first bug", "Checked the whole scene"):
        expect(page.get_by_text(title).first).to_be_visible()
    expect(page.get_by_test_id("tool-picture").first).to_be_visible()  # the agent's pictures are shown inline
    assert page.get_by_test_id("tool-picture").count() >= 2
    page.screenshot(path=f"{OUT}/admin-3-chat.png")

    asked = fake_requests()
    assert asked[0]["headers"]["x-api-key"] == KEY, "this person's key reached the provider"
    assert asked[0]["body"]["model"] == "claude-sonnet-5-5"
    assert "Acme Rockets" in json.dumps(asked[0]["body"]["system"])
    last = json.dumps(asked[1]["body"]["messages"][-1])
    assert '"type": "image"' in last.replace('"type":"image"', '"type": "image"'), "the model was shown the sprite it drew"
    print("chat OK: tools ran, pictures shown, key sent in a header:", len(asked), "provider calls")

    # 5. the live preview reloaded with the new theme
    page.get_by_role("tab", name="Preview").click()
    frame = wait_game(page)
    assert frame.evaluate("document.title") == "Acme: Launch Day", frame.evaluate("document.title")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/admin-4-preview.png")
    print("preview shows the themed game")

    # 6. the conversation survives a reload
    page.reload()
    expect(page.get_by_text("Done: the game is green")).to_be_visible(timeout=15000)
    print("conversation restored after reload")

    # 7. edit the theme by hand
    page.get_by_role("tab", name="Theme").click()
    expect(page.get_by_test_id("field-title")).to_have_value("Acme: Launch Day")
    expect(page.get_by_test_id("field-palette.primary")).to_have_value("#0a7d5a")
    page.get_by_test_id("field-title").fill("x")
    page.get_by_test_id("save-theme").click()
    expect(page.get_by_role("alert").first).to_be_visible()  # refused: too short
    page.get_by_test_id("field-title").fill("Acme: Launch Day")
    page.get_by_test_id("field-tagline").fill("A gift for the Acme team")
    page.get_by_test_id("save-theme").click()
    expect(page.get_by_text("Theme saved")).to_be_visible()
    served = page.request.get(f"{BASE}/g/{slug}/theme/theme.json").json()
    assert served["tagline"] == "A gift for the Acme team", served["tagline"]
    page.screenshot(path=f"{OUT}/admin-5-theme.png")
    print("theme edit OK")

    # 8. sprites: the bug is marked redrawn, and the editor opens on its grid
    page.get_by_role("tab", name="Sprites").click()
    expect(page.get_by_test_id("slot-enemy_1")).to_contain_text("redrawn")
    expect(page.get_by_test_id("slot-boss")).to_contain_text("default art")
    page.get_by_test_id("edit-enemy_1").click()
    assert "size 16x16" in page.get_by_test_id("sprite-text").input_value()
    page.keyboard.press("Escape")

    # 9. the logo is converted in the browser, and one of four options is chosen
    page.get_by_test_id("upload-logo").click()
    page.get_by_test_id("logo-file").set_input_files(files=[{"name": "acme.png", "mimeType": "image/png", "buffer": logo_png()}])
    expect(page.get_by_test_id("logo-options")).to_be_visible(timeout=15000)
    assert page.get_by_test_id("logo-options").locator("button").count() == 4
    page.screenshot(path=f"{OUT}/admin-6-logo.png")
    page.get_by_test_id("logo-option-a").click()
    expect(page.get_by_text("Logo saved")).to_be_visible()
    expect(page.get_by_test_id("slot-logo")).to_contain_text("redrawn")
    manifest = page.request.get(f"{BASE}/g/{slug}/theme/manifest.json").json()
    assert "logo" in manifest["sprites"], "the game now loads the logo"
    print("logo conversion OK")

    # 10. share: reset the password; the prospect needs the new one, and the old one no longer works
    page.get_by_role("tab", name="Share").click()
    expect(page.get_by_test_id("share-url")).to_have_value(link)
    page.get_by_test_id("reset-password").click()
    fresh = page.get_by_test_id("new-password").locator("input").first.input_value()
    assert fresh and fresh != password
    prospect = b.new_context(viewport={"width": 960, "height": 600})
    pp = prospect.new_page()
    watch(pp, "prospect")
    pp.goto(link)
    assert pp.title() == "Password required", pp.title()
    pp.fill("input[name=password]", password)
    pp.click("button")
    assert "Wrong password" in pp.inner_text("body")
    pp.fill("input[name=password]", fresh)
    pp.click("button")
    for _ in range(120):
        if pp.evaluate("!!(window.__game && window.__game.ready)"):
            break
        pp.wait_for_timeout(250)
    assert pp.evaluate("document.title") == "Acme: Launch Day"
    pp.screenshot(path=f"{OUT}/admin-7-prospect.png")
    print("prospect view with the new password OK")

    # 11. scores are empty, then delete the game
    page.get_by_role("tab", name="Scores").click()
    expect(page.get_by_text("No scores yet")).to_be_visible()
    page.get_by_role("tab", name="Game").click()
    page.get_by_test_id("delete-game").click()
    page.get_by_test_id("confirm-delete").click()
    expect(page.get_by_role("heading", name="Games")).to_be_visible()
    assert page.get_by_test_id("game-card").filter(has_text="Acme Rockets").count() == 0
    gone = b.new_context().new_page()
    assert gone.goto(link).status == 404
    print("delete OK")
    b.close()

# These failures are the point of the test, not problems: an invalid theme (422), a wrong password (401), the password page itself.
# Anything else is real.
def deliberate(p):
    gate_page = re.search(r"401.*\(https?://[^)/]+/g/[a-z0-9-]+/?\)$", p)  # the password page is served as a 401 on purpose
    return bool(gate_page) or ("/api/prospects/" in p and "/theme" in p and "422" in p) or ("/unlock" in p and "401" in p)


real = [p for p in problems if not deliberate(p)]
if real:
    print("PROBLEMS:")
    print("\n".join(sorted(set(real))))
    sys.exit(1)
print("admin e2e passed; screenshots in", OUT)

"""Browser check against a running `wrangler dev` (npm run dev): the password flow, then the real game booting under the
CSP, for a gated prospect game and for the default game on the root. Fails on any console error, CSP violation or failed
request. Needs the seed from scripts/seed-dev.mts (slug ledgerly-test1, password otter-maple-42).

    uv run -q --with playwright python test/e2e.py [base_url] [out_dir]
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787").rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/e2e"
SLUG, PASSWORD = "ledgerly-test1", "otter-maple-42"
problems = []


def watch(page, label):
    def on_console(m):
        if m.type not in ("error", "warning") or "GL Driver Message" in m.text:  # GPU perf hints from headless Chromium
            return
        where = m.location.get("url", "")
        if m.text.startswith("Failed to load resource") and where.rstrip("/").endswith(("/g/" + SLUG, "/unlock")):
            return  # the password page itself is served as a 401 on purpose
        problems.append(f"[{label}] console {m.type}: {m.text} ({where})")
    page.on("console", on_console)
    page.on("pageerror", lambda e: problems.append(f"[{label}] page error: {e}"))
    page.on("requestfailed", lambda r: problems.append(f"[{label}] request failed: {r.url}") if "favicon" not in r.url else None)
    page.on("response", lambda r: problems.append(f"[{label}] HTTP {r.status}: {r.url}")
            if r.status >= 400 and "favicon" not in r.url and "/unlock" not in r.url and r.request.resource_type != "document" else None)


posthog_requests = []


def stub_posthog(context):
    """The games send analytics to PostHog once a key is pressed. A test must not do that to the real project, so PostHog's hosts are answered
    here instead. The browser still applies the page's policy first: a script it would refuse never reaches this handler."""
    def answer(route):
        posthog_requests.append(route.request.url)
        script = route.request.url.endswith(".js")
        route.fulfill(status=200, content_type="application/javascript" if script else "application/json", body="/* stub */" if script else "{}")
    context.route(re.compile(r"https://[^/]*posthog\.com/.*"), answer)


def wait(page, expr, timeout=30000):
    """Poll with evaluate (CDP): page.wait_for_function would eval() the string, which the page's CSP rightly refuses."""
    for _ in range(timeout // 200):
        if page.evaluate(f"(() => {{ try {{ return !!({expr}); }} catch (e) {{ return false; }} }})()"):
            return
        page.wait_for_timeout(200)
    raise TimeoutError(f"timed out waiting for: {expr}")


def check_headers(headers, label, guide=None, indexable=False):
    """Every response is under the strict script policy, and kept out of search engines: all but the public home page and guide."""
    if indexable == ("noindex" in headers.get("x-robots-tag", "")):
        problems.append(f"[{label}] {'noindex on a page meant for search' if indexable else 'missing noindex'}: {headers.get('x-robots-tag')}")
    csp = headers.get("content-security-policy", "")
    if "script-src 'self'" not in csp:
        problems.append(f"[{label}] script policy missing: {csp[:80]}")
    if guide is not None and ("'sha256-" in csp) != guide:
        problems.append(f"[{label}] guide inline-script hash {'missing' if guide else 'present'} in policy")


def exercise_guide(target, label):
    """The guide's one inline script must run under the policy. The theme button already reads "Theme: auto" in the raw HTML,
    so only a click that changes it, with the page's data-theme following, proves the script is alive. (The guide remembers its
    theme in localStorage, so the starting state depends on what ran before: the test only needs it to change.)"""
    wait(target, "!!document.getElementById('theme')", 5000)
    before = target.evaluate("document.getElementById('theme').textContent")
    target.evaluate("document.getElementById('theme').click()")  # one of two theme buttons is hidden per layout
    wait(target, f"document.getElementById('theme').textContent !== {before!r}", 3000)
    wait(target, "(document.getElementById('theme').textContent.split(': ')[1] === 'auto') === !document.documentElement.dataset.theme", 3000)
    loaded = target.evaluate("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))")
    if "IBM Plex Sans" not in loaded:
        problems.append(f"[{label}] the guide's self-hosted fonts did not load: {loaded}")
    print(f"  [{label}] guide script runs under the policy; fonts loaded: {sorted(set(loaded))}")


def open_guide_from_game(page, label):
    """Title -> GUIDE -> Enter: the game opens guide.html in an iframe over itself.
    The title menu applies its selection on Enter; YOLO is locked on a fresh save, so RUN -> MERCH -> GUIDE is two presses."""
    for _ in range(2):
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(250)
    page.keyboard.press("Enter")
    wait(page, "!!document.querySelector('iframe')", 10000)
    frame = None
    for _ in range(50):  # the iframe exists before it has loaded its page
        frame = next((f for f in page.frames if f != page.main_frame and "guide" in f.url), None)
        if frame:
            break
        page.wait_for_timeout(100)
    assert frame, f"[{label}] the guide iframe never loaded: {[f.url for f in page.frames]}"
    exercise_guide(frame, f"{label}, opened from the game")


def boot(page, label, shot, guide_check=False):
    wait(page, "window.__game && window.__game.ready", 30000)
    wait(page, "window.__game.state === 'title'", 30000)
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/{shot}-title.png")
    state = page.evaluate("({fallbacks: __game.fallbacks, themeIssues: __game.themeIssues, title: document.title})")
    if guide_check:
        open_guide_from_game(page, label)
        page.reload()
        wait(page, "window.__game && window.__game.ready && window.__game.state === 'title'", 30000)
        page.wait_for_timeout(800)
    page.keyboard.press("Enter")
    wait(page, "window.__game.state === 'howto'", 10000)
    page.wait_for_timeout(900)  # the how-to screen ignores keys for a moment
    page.keyboard.press("Enter")
    wait(page, "!['Title', 'HowTo', 'Boot', 'Splash'].includes(__game.scene)", 10000)
    for key in ("ArrowRight", "ArrowDown"):  # move a little, like a player
        page.keyboard.down(key)
        page.wait_for_timeout(700)
        page.keyboard.up(key)
    page.wait_for_timeout(2500)
    page.screenshot(path=f"{OUT}/{shot}-play.png")
    run = page.evaluate("({scene: __game.scene, state: __game.state, elapsed: __game.elapsed, fps: __game.fps})")
    print(f"  [{label}] in game:", run)
    if run["elapsed"] <= 0:
        problems.append(f"[{label}] game is not running: {run}")
    return state


with sync_playwright() as pw:
    import os
    os.makedirs(OUT, exist_ok=True)
    b = pw.chromium.launch()

    # 1. gated game, anonymous: the gate, and nothing of the game behind it
    ctx = b.new_context(viewport={"width": 960, "height": 600})
    stub_posthog(ctx)
    page = ctx.new_page()
    watch(page, "gated")
    page.goto(f"{BASE}/g/{SLUG}/")
    assert page.title() == "Password required", page.title()
    assert page.evaluate("typeof window.__game") == "undefined", "game code loaded before the password"
    page.screenshot(path=f"{OUT}/gate.png")
    page.fill("input[name=password]", "wrong-password")
    page.click("button")
    assert "Wrong password" in page.inner_text("body"), page.inner_text("body")
    page.fill("input[name=password]", f"  {PASSWORD.upper()} ")  # forgiving about case and spaces
    page.click("button")
    page.wait_for_url(f"{BASE}/g/{SLUG}/")
    state = boot(page, "gated", "gated", guide_check=True)
    check_headers(ctx.request.get(f"{BASE}/g/{SLUG}/").headers, "gated page", guide=False)
    guide = ctx.request.get(f"{BASE}/g/{SLUG}/guide.html")
    check_headers(guide.headers, "gated guide", guide=True)
    gp = ctx.new_page()
    watch(gp, "gated guide")
    gp.goto(f"{BASE}/g/{SLUG}/guide.html")
    exercise_guide(gp, "gated, direct")
    assert state["title"] == "Ledgerly: Invoice Defense", state
    private = page.evaluate("({seo: document.querySelectorAll('[data-seo]').length, ld: document.querySelectorAll('script[type=\"application/ld+json\"]').length, canonical: !!document.querySelector('link[rel=canonical]'), robots: document.querySelector('meta[name=robots]')?.content})")
    if private != {"seo": 0, "ld": 0, "canonical": False, "robots": "noindex, nofollow, noarchive"}:
        problems.append(f"a prospect's page carries the public SEO tags: {private}")
    assert not state["fallbacks"], f"slots fell back to defaults: {state['fallbacks']}"
    assert not state["themeIssues"], state["themeIssues"]
    print("gated game OK:", state["title"])

    # the same browser keeps access; a fresh one does not
    page.goto(f"{BASE}/g/{SLUG}/theme/theme.json")
    assert "Ledgerly" in page.inner_text("body")
    fresh = b.new_context().new_page()
    assert fresh.goto(f"{BASE}/g/{SLUG}/theme/theme.json").status == 401
    print("cookie scoped to the unlocking browser OK")

    # 2. the default game on the root: public, uncustomized
    root_ctx = b.new_context(viewport={"width": 960, "height": 600})
    stub_posthog(root_ctx)
    page2 = root_ctx.new_page()
    watch(page2, "root")
    root = page2.goto(f"{BASE}/")
    check_headers(root.headers, "root page (static assets, _headers)", guide=False, indexable=True)
    state = boot(page2, "root", "root", guide_check=True)
    rg = page2.context.new_page()
    watch(rg, "root guide")
    guide_resp = rg.goto(f"{BASE}/guide.html")
    check_headers(guide_resp.headers, "root guide (static assets, _headers)", guide=True, indexable=True)
    exercise_guide(rg, "root, direct")
    robots = page2.context.request.get(f"{BASE}/robots.txt")
    if "Sitemap: https://survivors.posthog.com/sitemap.xml" not in robots.text() or "Disallow: /\n" in robots.text():
        problems.append(f"robots.txt: {robots.text()!r}")
    if "https://survivors.posthog.com/guide" not in page2.context.request.get(f"{BASE}/sitemap.xml").text():
        problems.append("sitemap.xml does not list the guide")
    seo = page2.evaluate("""({
      title: document.title,
      canonical: document.querySelector('link[rel=canonical]')?.href,
      robots: document.querySelector('meta[name=robots]')?.content,
      og: document.querySelector('meta[property="og:image"]')?.content,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)['@type']),
    })""")
    if seo != {"title": "Bug Survivors: a free browser game from PostHog", "canonical": "https://survivors.posthog.com/", "robots": "index, follow, max-image-preview:large", "og": "https://survivors.posthog.com/og.png", "ld": ["VideoGame", "Organization", "WebSite"]}:
        problems.append(f"root page SEO tags: {seo}")  # the title must survive the game's own boot too: the game keeps it on the home page
    for asset in ("og.png", "favicon.png", "apple-touch-icon.png"):
        if page2.context.request.get(f"{BASE}/{asset}").status != 200:
            problems.append(f"/{asset} is missing")
    assert state["title"] == "Bug Survivors: a free browser game from PostHog", state
    assert not state["fallbacks"], state["fallbacks"]
    if not any(u.endswith("/static/array.js") for u in posthog_requests):
        problems.append(f"the game never loaded PostHog's script (is the policy blocking it?): {posthog_requests}")
    print("root game OK:", state["title"])
    b.close()

if problems:
    print("PROBLEMS:")
    print("\n".join(sorted(set(problems))))
    sys.exit(1)
print("e2e passed; screenshots in", OUT)

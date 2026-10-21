// The player's guide (public/guide.html, built from GUIDE.md by tools/build_guide.py), opened over the game from the
// title's GUIDE choice. It's a page in an iframe, so it scrolls and reads like a web page on the web and in the Android
// app alike, and the game underneath keeps its state. BACK, ESC (in or out of the guide) or the Android back button close it.

let open: HTMLDivElement | null = null;

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeGuide(); }
}
function onMsg(e: MessageEvent) {
  if (e.data && e.data.guide === 'close') closeGuide();
}

export function closeGuide(): boolean {
  if (!open) return false;
  open.remove();
  open = null;
  removeEventListener('keydown', onKey, true);
  removeEventListener('message', onMsg);
  document.querySelector('canvas')?.focus();
  return true;
}

export function openGuide() {
  if (open) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:#131418;'
    + 'touch-action:auto;-webkit-user-select:text;user-select:text;';
  const bar = document.createElement('div');
  bar.style.cssText = 'flex:none;display:flex;align-items:center;gap:12px;padding:6px 10px;padding-top:max(6px,env(safe-area-inset-top));'
    + 'padding-left:max(10px,env(safe-area-inset-left));background:#1d1f27;border-bottom:2px solid #f54e00;'
    + 'font:600 14px system-ui,-apple-system,sans-serif;color:#e9e8e1;';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = '← BACK TO GAME';
  back.style.cssText = 'min-height:36px;padding:6px 14px;border-radius:8px;border:1px solid #f54e00;background:#f54e00;color:#fff;'
    + 'font:700 13px system-ui,-apple-system,sans-serif;letter-spacing:.04em;cursor:pointer;';
  back.onclick = () => closeGuide();
  const title = document.createElement('span');
  title.textContent = 'Bug Survivors guide';
  bar.append(back, title);
  const frame = document.createElement('iframe');
  frame.src = 'guide.html';
  frame.title = 'Bug Survivors guide';
  frame.style.cssText = 'flex:1;width:100%;border:0;background:#131418;';
  wrap.append(bar, frame);
  // In fullscreen only the fullscreen element shows, so the guide goes inside it.
  (document.fullscreenElement ?? document.body).append(wrap);
  open = wrap;
  addEventListener('keydown', onKey, true);
  addEventListener('message', onMsg);
  frame.addEventListener('load', () => frame.contentWindow?.focus());
}

// The Android app's back button (kit.ts __appBack) asks this first: true = it closed the guide.
(window as any).__overlayBack = closeGuide;

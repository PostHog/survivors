// The password page. Deliberately generic: it must not reveal which company the game is for.
export function unlockPage(error?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Password required</title>
<style>
html,body{margin:0;height:100%;background:#15141f;color:#eee;font:16px/1.4 ui-monospace,Menlo,Consolas,monospace}
body{display:flex;align-items:center;justify-content:center}
form{width:min(92vw,340px);display:grid;gap:14px;text-align:center}
h1{font-size:15px;letter-spacing:.14em;text-transform:uppercase;margin:0;color:#f9bd2b}
input,button{font:inherit;padding:12px;border:2px solid #f9bd2b;background:#000;color:#fff;border-radius:0}
button{background:#f9bd2b;color:#000;cursor:pointer;font-weight:700}
.err{color:#ff7a7a;margin:0;font-size:14px}
</style></head><body><form method="post" action="unlock">
<h1>Password required</h1>
${error ? `<p class="err">${error}</p>` : ''}
<input name="password" type="password" autocomplete="current-password" autofocus required aria-label="Password">
<button>Play</button></form></body></html>`;
}

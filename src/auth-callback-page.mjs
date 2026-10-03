import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const assets = process.env.ZYRA_STANDALONE === '1' && process.env.ZYRA_ROOT
  ? join(process.env.ZYRA_ROOT, 'src', 'auth-assets')
  : fileURLToPath(new URL('./auth-assets/', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function image(file) {
  const mime = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  try { return `data:${mime};base64,${readFileSync(join(assets, file)).toString('base64')}`; } catch { return null; }
}
const zyra = image('zyra.png');
const marks = new Map(readdirSync(join(assets, 'plugins')).filter(file => /\.(png|svg|jpg)$/u.test(file)).map(file => [file.replace(/\.[^.]+$/u, ''), `plugins/${file}`]));
marks.set('chatgpt', 'chatgpt.svg');
export const AUTH_CALLBACK_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'
});
/** Offline return page. Never receives codes, tokens or raw provider errors. */
export function renderAuthCallbackPage({ serviceName = 'Account', serviceKey, failed = false } = {}) {
  const key = serviceKey || serviceName.toLowerCase().replace(/[^a-z0-9]+/gu, '-');
  const mark = marks.has(key) ? image(marks.get(key)) : null, name = escape(serviceName);
  const accent = ({ notion: '#ddd6c8', gmail: '#e9928a', 'google-drive': '#75cda2', 'google-calendar': '#87b8f4', chatgpt: '#69c8a7' })[key] || '#91cdbf';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${failed ? 'Sign-in not completed' : 'Return to Zyra'}</title><style>
  :root{color-scheme:dark;--accent:${accent};--bg:#10171b;--text:#eeeee8;--muted:#99a6ad}*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:480px;padding:48px 28px;text-align:center;animation:arrive .6s ease both}.brands{display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:40px}.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:600}.brand img{width:40px;height:40px;object-fit:contain}.separator{height:30px;width:1px;background:#ffffff26}.status{color:var(--accent);font-size:12px;font-weight:600;margin-bottom:12px}h1{font-size:28px;line-height:1.25;letter-spacing:-.04em;font-weight:600;margin:0}p{font-size:14px;line-height:1.7;color:var(--muted);margin:12px 0 0}.footnote{font-size:12px;margin-top:32px}@keyframes arrive{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media(prefers-color-scheme:light){:root{color-scheme:light;--bg:#f8f9f7;--text:#182228;--muted:#5a6c76}.separator{background:#18222826}.status{color:#347765}}@media(prefers-reduced-motion:reduce){main{animation:none}}
  </style></head><body><main><div class="brands"><span class="brand">${zyra ? `<img src="${zyra}" alt="">` : ''}Zyra</span><span class="separator" aria-hidden="true"></span><span class="brand">${mark ? `<img src="${mark}" alt="">` : ''}${name}</span></div><div class="status">${failed ? 'Sign-in not completed' : 'Sign-in received'}</div><h1>${failed ? 'Let’s try that again' : 'You can return to Zyra'}</h1><p>${failed ? 'Return to the app to reconnect your account.' : `Zyra is finishing your ${name} connection.<br>The app will confirm when it’s ready.`}</p><p class="footnote">You can close this tab.</p></main></body></html>`;
}

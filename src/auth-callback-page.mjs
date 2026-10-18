import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const assets = process.env.ZYRA_STANDALONE === '1' && process.env.ZYRA_ROOT
  ? join(process.env.ZYRA_ROOT, 'src', 'auth-assets')
  : fileURLToPath(new URL('./auth-assets/', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function asset(file, mime) {
  try { return `data:${mime};base64,${readFileSync(join(assets, file)).toString('base64')}`; } catch { return null; }
}
function image(file) { return asset(file, file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/png'); }
const zyra = image('zyra.png');
const font = asset('bricolage-grotesque.woff2', 'font/woff2');
const marks = new Map(readdirSync(join(assets, 'plugins')).filter(file => /\.(png|svg|jpg)$/u.test(file)).map(file => [file.replace(/\.[^.]+$/u, ''), `plugins/${file}`]));
marks.set('chatgpt', 'chatgpt.svg');

export const AUTH_CALLBACK_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'
});

/** Offline return page. A received callback is not yet a verified connection. */
export function renderAuthCallbackPage({ serviceName = 'Account', serviceKey, failed = false } = {}) {
  const key = serviceKey || serviceName.toLowerCase().replace(/[^a-z0-9]+/gu, '-');
  const mark = marks.has(key) ? image(marks.get(key)) : null;
  const title = failed ? 'Sign-in not completed' : 'Return to Zyra';
  const message = failed ? 'Return to Zyra to try again.' : `${escape(serviceName)} sign-in received.<br>You can close this tab.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${title}</title><style>
  ${font ? `@font-face{font-family:"Bricolage Grotesque";src:url("${font}") format("woff2");font-style:normal;font-weight:200 800;font-display:swap}` : ''}
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:#000;color:#ededed;font-family:"Bricolage Grotesque","Hanken Grotesk",system-ui,sans-serif}main{width:100%;max-width:360px;padding:32px 24px;text-align:center}.marks{display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:24px}.marks img{width:28px;height:28px;object-fit:contain;filter:grayscale(1)}.marks .zyra-mark{filter:grayscale(1) brightness(4)}.marks .chatgpt-mark{filter:invert(1)}.separator{width:1px;height:24px;background:#333}h1{margin:0;font-size:22px;line-height:1.35;letter-spacing:-.035em;font-weight:500}p{margin:10px 0 0;color:#a1a1a1;font-size:14px;line-height:1.65}
  </style></head><body><main><div class="marks">${zyra ? `<img class="zyra-mark" src="${zyra}" alt="Zyra">` : '<span>Zyra</span>'}<span class="separator" aria-hidden="true"></span>${mark ? `<img${key === 'chatgpt' ? ' class="chatgpt-mark"' : ''} src="${mark}" alt="${escape(serviceName)}">` : `<span>${escape(serviceName)}</span>`}</div><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

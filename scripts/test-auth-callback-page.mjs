import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderAuthCallbackPage, AUTH_CALLBACK_HEADERS } from '../src/auth-callback-page.mjs';
for (const serviceName of ['Notion', 'Gmail', 'Google Drive', 'Google Calendar', 'ChatGPT']) {
  const html = renderAuthCallbackPage({ serviceName });
  assert.equal((html.match(/<img /gu) || []).length, 2, `${serviceName} keeps the paired brand marks`);
  assert.match(html, /class="separator" aria-hidden="true"/);
  assert.match(html, /font-family:"Bricolage Grotesque"/);
  assert.match(html, /data:font\/woff2;base64,/);
  assert.match(html, /color-scheme:dark/);
  assert.match(html, /background:#000/);
  assert.doesNotMatch(html, /prefers-color-scheme|class="brands"|class="status"|class="footnote"|animation:/);
  assert.equal((html.match(/<h1>/gu) || []).length, 1);
  assert.equal((html.match(/<p>/gu) || []).length, 1);
  assert.ok(html.includes(`${serviceName} sign-in received.`) && html.includes('You can close this tab.'));
  assert.ok(!html.includes('<script') && !html.includes('https://'));
}
const escaped = renderAuthCallbackPage({ serviceName: '<img onerror="evil">' });
assert.ok(escaped.includes('&lt;img') && !escaped.includes('<img onerror'));
const failed = renderAuthCallbackPage({ failed: true });
assert.ok(failed.includes('Sign-in not completed') && !failed.includes('sign-in received'));
assert.equal(AUTH_CALLBACK_HEADERS['Cache-Control'], 'no-store');
assert.match(AUTH_CALLBACK_HEADERS['Content-Security-Policy'], /default-src 'none';.*img-src data:; font-src data:/u);
console.log('Minimal monochrome callback, paired marks, app font, escaping and privacy headers passed.');

const root = mkdtempSync(path.join(tmpdir(), 'zyra-callback-assets-'));
try {
  const assets = path.join(root, 'src', 'auth-assets');
  mkdirSync(path.join(assets, 'plugins'), { recursive: true });
  writeFileSync(path.join(assets, 'zyra.png'), 'fixture-zyra-mark');
  writeFileSync(path.join(assets, 'plugins', 'notion.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(path.join(assets, 'bricolage-grotesque.woff2'), 'fixture-app-font');
  const code = `
    import assert from 'node:assert/strict';
    const { renderAuthCallbackPage } = await import(${JSON.stringify(new URL('../src/auth-callback-page.mjs', import.meta.url).href)});
    const html = renderAuthCallbackPage({ serviceName: 'Notion' });
    assert.ok(html.includes('Notion sign-in received.'));
    assert.equal((html.match(/<img /gu) || []).length, 2);
    assert.ok(html.includes(${JSON.stringify(Buffer.from('fixture-zyra-mark').toString('base64'))}));
    assert.ok(html.includes(${JSON.stringify(Buffer.from('fixture-app-font').toString('base64'))}));
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root, env: { ...process.env, ZYRA_ROOT: root, ZYRA_STANDALONE: '1' }, windowsHide: true
  });
  console.log('Callback embeds logos and app font from extracted runtime resources.');
} finally {
  assert.ok(path.resolve(root).startsWith(path.join(path.resolve(tmpdir()), 'zyra-callback-assets-')), 'cleanup stays inside the owned temporary fixture directory');
  rmSync(root, { recursive: true, force: true });
}

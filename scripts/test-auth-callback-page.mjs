import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderAuthCallbackPage, AUTH_CALLBACK_HEADERS } from '../src/auth-callback-page.mjs';
for (const serviceName of ['Notion', 'Gmail', 'Google Drive', 'Google Calendar', 'ChatGPT']) {
  const html = renderAuthCallbackPage({ serviceName });
  assert.equal((html.match(/<img /gu) || []).length, 2, `${serviceName} has Zyra and service marks`);
  assert.ok(html.includes('Sign-in received') && html.includes('You can close this tab.'));
  assert.ok(!html.includes('<script') && !html.includes('https://'));
}
const failed = renderAuthCallbackPage({ serviceName: '<img onerror="evil">', failed: true });
assert.ok(failed.includes('&lt;img') && !failed.includes('<img onerror'));
assert.ok(failed.includes('Sign-in not completed') && !failed.includes('Sign-in received'));
assert.equal(AUTH_CALLBACK_HEADERS['Cache-Control'], 'no-store');
assert.match(AUTH_CALLBACK_HEADERS['Content-Security-Policy'], /default-src 'none';.*img-src data:/u);
console.log('Shared offline callback branding, errors, escaping and privacy headers passed.');

const root = mkdtempSync(path.join(tmpdir(), 'zyra-callback-assets-'));
try {
  const assets = path.join(root, 'src', 'auth-assets');
  mkdirSync(path.join(assets, 'plugins'), { recursive: true });
  const mark = '<svg xmlns="http://www.w3.org/2000/svg"><title>synthetic-extracted-mark</title></svg>';
  writeFileSync(path.join(assets, 'zyra.png'), 'synthetic-extracted-brand');
  writeFileSync(path.join(assets, 'plugins', 'notion.svg'), mark);
  const code = `
    import assert from 'node:assert/strict';
    const { renderAuthCallbackPage } = await import(${JSON.stringify(new URL('../src/auth-callback-page.mjs', import.meta.url).href)});
    const html = renderAuthCallbackPage({ serviceName: 'Notion' });
    assert.ok(html.includes(${JSON.stringify(Buffer.from('synthetic-extracted-brand').toString('base64'))}));
    assert.ok(html.includes(${JSON.stringify(Buffer.from(mark).toString('base64'))}));
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root, env: { ...process.env, ZYRA_ROOT: root, ZYRA_STANDALONE: '1' }, windowsHide: true
  });
  console.log('Callback logos resolve from extracted runtime resources outside the checkout.');
} finally {
  assert.ok(path.resolve(root).startsWith(path.join(path.resolve(tmpdir()), 'zyra-callback-assets-')), 'cleanup stays inside the owned temporary fixture directory');
  rmSync(root, { recursive: true, force: true });
}

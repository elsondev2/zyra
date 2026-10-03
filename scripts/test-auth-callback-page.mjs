import assert from 'node:assert/strict';
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

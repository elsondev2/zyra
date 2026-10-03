import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redeemCodexResetCredit } from '../../src/chatgpt-account.mjs';

const accountServiceSource = readFileSync(new URL('../src/main/assistant/zyra-account-service.ts', import.meta.url), 'utf8');
assert.match(accountServiceSource, /redeemCodexResetCredit\(creditId, \{ stateDirectory \}\)/,
  'reset redemption must use the same Desktop account as the availability check');

const originalFetch = globalThis.fetch;
let requested = false;
globalThis.fetch = async (_url, init) => {
  requested = true;
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-dev-access');
  assert.equal(new Headers(init?.headers).get('ChatGPT-Account-Id'), 'fixture-dev-account');
  return new Response(JSON.stringify({ code: 'ok', windows_reset: 1 }), { status: 200 });
};
try {
  const result = await redeemCodexResetCredit('fixture-credit', {
    authStorage: {
      getApiKey: async () => 'fixture-dev-access',
      get: () => ({ type: 'oauth', access: 'fixture-dev-access', accountId: 'fixture-dev-account' }),
    },
  });
  assert.equal(result.code, 'ok');
  assert.equal(requested, true);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Account reset uses the active Desktop credential namespace: ok');

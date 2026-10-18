import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZyraCredentialStore } from '../src/zyra-auth-store.mjs';
import { resolveProviderAuth } from '../src/runtime/providers/src/auth/resolve.js';

const root = await mkdtemp(join(tmpdir(), 'zyra-auth-refresh-race-'));
const authPath = join(root, 'credentials', 'auth.json');
const first = new ZyraCredentialStore({ authPath });
const second = new ZyraCredentialStore({ authPath });
const expired = { type: 'oauth', access: 'fixture-old-access', refresh: 'fixture-old-refresh', expires: Date.now() - 1000 };
const fresh = { ...expired, access: 'fixture-new-access', refresh: 'fixture-rotated-refresh', expires: Date.now() + 3600000 };
const context = { env: async () => undefined, fileExists: async () => false };
let refreshes = 0;
const provider = { id: 'openai-codex', auth: { oauth: {
    refresh: async () => { refreshes++; await new Promise(resolve => setTimeout(resolve, 40)); return fresh; },
    toAuth: credential => ({ apiKey: credential.access }),
} } };
try {
    await first.modify('openai', async () => ({ type: 'api_key', key: 'fixture-unrelated-key' }));
    await first.modify(provider.id, async () => expired);
    const results = await Promise.all([first, second].map(store => resolveProviderAuth(provider, store, context)));
    assert.deepEqual(results.map(result => result?.auth.apiKey), [fresh.access, fresh.access], 'both stale readers must reuse the single rotated credential, not sign out the second request');
    assert.equal(refreshes, 1, 'refresh rotation remains globally serialized');
    assert.deepEqual(second.read(provider.id), fresh, 'a refresh no-op cannot delete the stored OAuth credential');
    assert.equal(second.read('openai').key, 'fixture-unrelated-key');

    const before = await readFile(authPath, 'utf8');
    const unchanged = await second.modify(provider.id, async current => { current.access = 'fixture-uncommitted-edit'; return undefined; });
    assert.deepEqual(unchanged, fresh, 'undefined returns the authoritative credential, not a mutated callback copy');
    assert.equal(await readFile(authPath, 'utf8'), before, 'undefined does not rewrite or mutate the credential file');
    assert.equal(await second.modify('missing-provider', async () => undefined), undefined);
    assert.equal(await readFile(authPath, 'utf8'), before, 'missing-entry no-op cannot create a credential');
    await assert.rejects(second.modify(provider.id, async () => { throw new Error('Synthetic refresh failure'); }), /Synthetic refresh failure/);
    assert.deepEqual(first.read(provider.id), fresh, 'failed refresh keeps the previous credential');

    await first.modify(provider.id, async () => expired);
    const logoutRace = {
        read: async (id, options) => { const stale = first.read(id, options); await second.delete(id); return stale; },
        modify: first.modify.bind(first),
    };
    assert.equal(await resolveProviderAuth(provider, logoutRace, context), undefined, 'explicit logout wins over a refresh waiting on the lock');
    assert.equal(first.read(provider.id), undefined, 'an absent credential must not be resurrected');
    assert.equal(refreshes, 1, 'logout race never refreshes revoked local auth');
    assert.equal(first.read('openai').key, 'fixture-unrelated-key', 'logout remains provider-specific');
    await first.delete('openai');
    await first.delete('openai');
    assert.deepEqual(await first.list(), [], 'explicit deletion still works and is idempotent');
    console.log('Credential refresh race: real OAuth resolver, concurrent file stores, no-op preservation, rollback and explicit logout safety passed.');
} finally { await rm(root, { recursive: true, force: true }); }

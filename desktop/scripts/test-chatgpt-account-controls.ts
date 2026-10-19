import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { ProviderWorkerClient } from '../src/main/setup/provider-worker-client'
import { OpenAIConnectionService } from '../src/main/setup/openai-connection-service'

// Bun on Windows ignores WorkerOptions.env for inherited keys. Start the whole
// fixture with an OS-level temporary namespace before creating its real worker.
const isolatedRoot = process.argv[2] === '--fixture-state' ? process.argv[3] : undefined
const root = isolatedRoot ?? await mkdtemp(join(tmpdir(), 'zyra-account-controls-'))
if (!isolatedRoot) {
    let status = 1
    try {
        const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--fixture-state', root], {
            env: { ...process.env, ZYRA_STATE_DIR: root, OPENAI_API_KEY: '' }, stdio: 'inherit', timeout: 60_000
        })
        if (child.error) throw child.error
        status = child.status ?? 1
    } finally { await rm(root, { recursive: true, force: true }) }
    process.exit(status)
}
assert.ok(resolve(root) === resolve(process.env.ZYRA_STATE_DIR || ''), 'Fixture process and worker must use the same temporary namespace.')
assert.ok(resolve(dirname(root)) === resolve(tmpdir()) && basename(root).startsWith('zyra-account-controls-'), 'Refusing a non-temporary fixture directory.')
assert.equal((await readdir(root)).length, 0, 'Refusing to seed credentials into existing state.')
const { chatGptIdentity } = await import('../../src/chatgpt-account-pool.mjs')
const { ZyraCredentialStore, createZyraCredentialAuthStorage } = await import('../../src/zyra-auth-store.mjs')
const store = new ZyraCredentialStore({ authPath: join(root, 'credentials', 'auth.json') })
const auth = await createZyraCredentialAuthStorage({ credentialStore: store })
const token = (id: string) => `fixture.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: id }, 'https://api.openai.com/profile': { email: `${id}@example.test` } })).toString('base64url')}.fixture`
const changes: string[] = []
let defaultModel = 'openai-codex/fixture-model'
const client = new ProviderWorkerClient(() => new Worker(pathToFileURL(resolve(import.meta.dir, '../../src/desktop-provider-worker.mjs')), { env: { ...process.env, ZYRA_STATE_DIR: root, OPENAI_API_KEY: '' } }))
const service = new OpenAIConnectionService({
    loadSdk: async () => client.sdk,
    loadAccount: async () => ({ buildChatGptAccountStatus: async () => { throw Error('An unusable primary must not hide a healthy second account') } }),
    openExternal: () => { throw Error('This fixture must never open a sign-in page') },
    getAssistantDefaultModel: async () => defaultModel,
    setAssistantDefaultModel: async value => { defaultModel = value },
    onCredentialChanged: async provider => { changes.push(provider) }
})
try {
    for (const id of ['a', 'b']) await auth.loginOAuth('openai-codex', { type: 'oauth', accountId: id, access: token(id), refresh: `fixture-refresh-${id}`, expires: Date.now() + 3600000 })
    const snapshot = await service.getChatGptAccounts()
    assert.equal(snapshot.accounts.length, 2)
    const fixtureIds = new Set(['a', 'b'].map(id => chatGptIdentity({ accountId: id, access: token(id) }).id))
    assert.ok(snapshot.accounts.every(account => fixtureIds.has(account.id)), 'Refusing to mutate accounts outside this temporary fixture.')
    assert.equal(snapshot.policy.strategy, 'balanced')
    assert.ok(!JSON.stringify(snapshot).includes('fixture-refresh'))
    const [a, b] = snapshot.accounts
    await store.modify('openai-codex', async current => ({ ...current, pool: { ...current.pool, requiresLogin: true } }))
    assert.equal((await service.getConnectionsStatus()).chatgpt.verified, true, 'Connection status sees the healthy secondary account.')
    const selected = await service.updateChatGptAccounts({ action: 'policy', policy: { ...snapshot.policy, accountMode: 'selected', accountIds: [b.id] } })
    assert.deepEqual(selected.policy.accountIds, [b.id])
    const paused = await service.updateChatGptAccounts({ action: 'enabled', accountId: b.id, enabled: false })
    assert.equal(paused.accounts.find(account => account.id === b.id)?.state, 'paused')
    await service.updateChatGptAccounts({ action: 'enabled', accountId: b.id, enabled: true })
    const remaining = await service.updateChatGptAccounts({ action: 'remove', accountId: a.id, confirmed: true })
    assert.equal(remaining.accounts.length, 1)
    assert.equal(remaining.accounts[0].id, b.id)
    assert.equal(remaining.accounts[0].primary, true)
    assert.equal(defaultModel, 'openai-codex/fixture-model', 'Removing one account keeps subscription preferences while another remains.')
    const last = await service.updateChatGptAccounts({ action: 'remove', accountId: b.id, confirmed: true })
    assert.equal(last.accounts.length, 0)
    assert.equal(defaultModel, '', 'Last-account removal follows existing disconnect/default fallback.')
    assert.equal(changes.length, 5)
    console.log('Limits controls -> connection service -> real provider worker -> isolated credential/policy files, promotion and last-account fallback: ok')
} finally { await client.dispose(); await rm(root, { recursive: true, force: true }) }

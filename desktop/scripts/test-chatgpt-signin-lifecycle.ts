import assert from 'node:assert/strict'
import { OpenAIConnectionService } from '../src/main/setup/openai-connection-service'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(accept => { resolve = accept })
    return { promise, resolve }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const usable = { status: { configured: true }, tokenExpiresAt: '2099-01-01T00:00:00Z' }
function sdk(loginZyraAuth: (provider: string, options: Record<string, unknown>) => Promise<unknown>) {
    return { loginZyraAuth, configureZyraOpenAIApiKey: async () => ({}), verifyZyraOpenAIApiAuth: async () => ({}), getZyraAuthStatus: async () => ({ status: { configured: false } }), removeZyraAuth: async () => undefined }
}

// A status check is not a user-requested login. It must not consume the click.
const statusRead = deferred<typeof usable>()
let checks = 0
let opens = 0
const checking = new OpenAIConnectionService({
    openExternal: () => { opens++ },
    loadAccount: async () => ({ buildChatGptAccountStatus: async () => ++checks === 1 ? statusRead.promise : usable }),
    loadSdk: async () => sdk(async (_provider, options) => { await (options.onAuth as Function)({ url: 'https://auth.fixture.invalid' }) })
})
const status = checking.getStatus()
const reconnect = checking.connectChatGpt('browser', 'expired-fixture')
await tick()
statusRead.resolve(usable)
await Promise.all([status, reconnect])
const openedDuringCheck = opens

// Stored/verified credentials complete sign-in without waiting on attached chats.
const refresh = deferred<void>()
let changed = false
const completed = new OpenAIConnectionService({
    openExternal: () => undefined,
    onCredentialChanged: async () => { changed = true; await refresh.promise },
    loadAccount: async () => ({ buildChatGptAccountStatus: async () => usable }),
    loadSdk: async () => sdk(async () => undefined)
})
let settled = false
const login = completed.connectChatGpt().then(result => { settled = true; return result })
await tick(); await tick()
assert.equal(changed, true, 'live chat credentials are still refreshed')
const wasSettled = settled
refresh.resolve()
assert.equal((await login).verified, true)
assert.equal(wasSettled, true, 'a slow attached chat must not hold the successful sign-in action open')
assert.equal(openedDuringCheck, 1, 'clicking sign-in during verification must actually launch OAuth, not return the status-check result')
// A superseded read cannot cache "connected" after a disconnect has finished.
const staleRead = deferred<typeof usable>()
let connected = true
let reads = 0
const stale = new OpenAIConnectionService({
    openExternal: () => undefined,
    loadAccount: async () => ({ buildChatGptAccountStatus: async () => ++reads === 1 ? staleRead.promise : connected ? usable : { status: { configured: false } } }),
    loadSdk: async () => ({ ...sdk(async () => undefined), removeZyraAuth: async () => { connected = false } })
})
const previous = stale.getStatus()
await stale.disconnect('chatgpt')
staleRead.resolve(usable)
await previous
assert.equal((await stale.getStatus()).verified, false, 'a late pre-disconnect check cannot restore the verified cache')
console.log('ChatGPT sign-in owns its request, skips slow chat refresh and isolates stale verification: ok')

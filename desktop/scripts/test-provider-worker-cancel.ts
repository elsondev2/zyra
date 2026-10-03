import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { Worker } from 'node:worker_threads'
import { ProviderWorkerClient } from '../src/main/setup/provider-worker-client'

const messages: Array<{ id?: number; operation: string; targetId?: number }> = []
let authCallbacks = 0
class WorkerFixture extends EventEmitter {
    unref() {}
    async terminate() { return 0 }
    postMessage(message: { id?: number; operation: string; targetId?: number }) {
        messages.push(message)
        if (message.operation === 'loginZyraAuth') {
            queueMicrotask(() => this.emit('message', { type: 'auth', id: message.id, info: { url: 'https://auth.fixture.invalid' } }))
        } else if (message.operation === 'cancelRequest') {
            queueMicrotask(() => this.emit('message', { type: 'error', id: message.targetId, error: 'ChatGPT sign-in was cancelled.', code: 'ZYRA_OAUTH_CANCELLED' }))
        } else if (message.operation === 'listModelProviders') {
            queueMicrotask(() => this.emit('message', { type: 'result', id: message.id, result: [] }))
        }
    }
}

const worker = new WorkerFixture()
const client = new ProviderWorkerClient(() => worker as unknown as Worker)
try {
    const controller = new AbortController()
    const login = client.sdk.loginZyraAuth('openai-codex', {
        signal: controller.signal,
        onAuth: () => { authCallbacks += 1 }
    })
    await Promise.resolve()
    assert.equal(authCallbacks, 1)
    controller.abort(Object.assign(new Error('ChatGPT sign-in was cancelled.'), { code: 'ZYRA_OAUTH_CANCELLED' }))
    await assert.rejects(login, (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ZYRA_OAUTH_CANCELLED'))
    assert.equal(messages[1]?.operation, 'cancelRequest')
    assert.equal(messages[1]?.targetId, messages[0]?.id)
    worker.emit('message', { type: 'auth', id: messages[0]?.id, info: { url: 'https://auth.fixture.invalid/late' } })
    assert.equal(authCallbacks, 1, 'late auth events cannot reopen the browser')
    assert.deepEqual(await client.providers.list(), [], 'cancelling sign-in leaves the shared provider worker usable')
} finally {
    await client.dispose()
}

console.log('provider worker sign-in cancellation and late-event isolation: ok')

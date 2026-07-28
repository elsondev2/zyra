import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DesktopAgentServerConnection } from '../src/main/assistant/zyra-agent-server-worker'

class FakeWorker extends EventEmitter {
    activePrompt: ((value: Record<string, unknown>) => void) | null = null
    disposed = false
    isAlive(): boolean { return !this.disposed }
    request(type: string): Promise<Record<string, unknown>> {
        if (type === 'connect') return Promise.resolve({ threadId: 'chat:desktop-test', providerThreadId: sessionPath })
        if (type === 'prompt') return new Promise((resolve) => { this.activePrompt = resolve })
        return Promise.resolve({})
    }
    finishPrompt(value: Record<string, unknown>): void {
        const resolve = this.activePrompt
        this.activePrompt = null
        resolve?.(value)
    }
    sendControlResponse(): boolean { return true }
    dispose(): void { this.disposed = true }
}

const root = path.resolve(import.meta.dirname, '../..')
const stateDirectory = mkdtempSync(path.join(os.tmpdir(), 'zyra-desktop-agent-server-'))
const channel = `desktop-test-${process.pid}-${Date.now()}`
const project = path.join(stateDirectory, 'project')
const sessionPath = path.join(project, '.zyra', 'sessions', 'desktop-test.jsonl')
const catalogModule = await import(pathToFileURL(path.join(root, 'src', 'agent-server', 'catalog.mjs')).href)
const serverModule = await import(pathToFileURL(path.join(root, 'src', 'agent-server', 'server.mjs')).href)
const workers: FakeWorker[] = []
const catalog = new catalogModule.CanonicalChatCatalog({
    stateDirectory,
    channel,
    loadSessionManager: async () => ({ list: async () => [{
        path: sessionPath,
        id: 'chat:desktop-test',
        cwd: project,
        name: 'Desktop server adapter test',
        created: new Date(),
        modified: new Date(),
        messageCount: 1
    }] })
})
const server = new serverModule.ZyraAgentServer({
    root,
    endpoint: 0,
    stateDirectory,
    channel,
    catalog,
    createWorker: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
    }
})

await server.start()
const connection = new DesktopAgentServerConnection(root, { stateDirectory, channel, autoStart: false })
const worker = connection.createWorker(project)
const events: Array<{ event: unknown; metadata: Record<string, unknown> | undefined }> = []
worker.onEvent((event, metadata) => events.push({ event, metadata }))
worker.setControlRequestHandler(async () => ({ accepted: true }))

try {
    const connected = await worker.request('connect', {
        cwd: project,
        localThreadId: 'assistant-thread:desktop-test',
        threadId: 'chat:desktop-test',
        providerThreadId: 'chat:desktop-test',
        model: 'openai-codex/gpt-5.5',
        thinking: 'medium',
        profile: 'default'
    })
    assert.equal(connected.threadId, 'chat:desktop-test')
    const secondWorker = connection.createWorker(project)
    const secondEvents: unknown[] = []
    secondWorker.onEvent((event) => secondEvents.push(event))
    await secondWorker.request('connect', {
        cwd: project,
        localThreadId: 'assistant-thread:desktop-test-copy',
        threadId: 'chat:desktop-test',
        providerThreadId: 'chat:desktop-test'
    })

    const prompt = worker.request('prompt', { prompt: 'continue', turnId: 'turn:desktop-test' })
    await waitUntil(() => workers[0]?.activePrompt !== null)
    workers[0].emit('event', { type: 'message_update', message: { role: 'assistant', content: 'working' } })
    workers[0].finishPrompt({})
    await prompt
    await waitUntil(() => events.length === 2)
    assert.equal((events[0].event as { type: string }).type, 'message_update')
    assert.equal(events[0].metadata?.turnId, 'turn:desktop-test')
    assert.equal((events[1].event as { type: string }).type, 'zyra_server_turn_completed')
    assert.equal(secondEvents.length, 2, 'two local Desktop projections must receive the same canonical events')

    worker.dispose()
    assert.equal(workers[0].disposed, false, 'desktop detach must leave the server-owned worker alive')
    workers[0].emit('event', { type: 'message_update', message: { role: 'assistant', content: 'second projection remains' } })
    await waitUntil(() => secondEvents.length === 3)
    secondWorker.dispose()
    connection.close()

    const reconnectConnection = new DesktopAgentServerConnection(root, { stateDirectory, channel, autoStart: false })
    const reconnectWorker = reconnectConnection.createWorker(project)
    const replay: Array<Record<string, unknown> | undefined> = []
    reconnectWorker.onEvent((_event, metadata) => replay.push(metadata))
    await reconnectWorker.request('connect', {
        cwd: project,
        localThreadId: 'assistant-thread:desktop-test',
        threadId: 'chat:desktop-test',
        providerThreadId: 'chat:desktop-test'
    })
    reconnectWorker.flushReplay()
    assert.equal(replay.length, 3)
    assert.equal(replay[0]?.replay, true)
    assert.equal(replay[0]?.turnId, 'turn:desktop-test')
    reconnectWorker.dispose()
    reconnectConnection.close()
    process.stdout.write('desktop agent-server worker tests passed\n')
} finally {
    connection.close()
    await server.stop('test cleanup')
    rmSync(stateDirectory, { recursive: true, force: true })
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('Timed out waiting for test state.')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AssistantEventStreamPayload } from '../src/shared/assistant/contracts'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH,
    BROWSER_DEVSCOPE_BRIDGE_EVENTS_PATH,
    BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH,
    BROWSER_FILE_BRIDGE_PATH,
    type BrowserDevscopeRelayEvent
} from '../src/shared/browser-assistant-bridge'
import { BrowserAssistantBridge } from '../src/main/assistant/browser-assistant-bridge'
import type { AssistantService } from '../src/main/assistant/service'

const titleBarSource = readFileSync(new URL('../src/renderer/src/components/layout/TitleBar.tsx', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const browserRuntimeSource = readFileSync(new URL('../src/main/browser-client-runtime.ts', import.meta.url), 'utf8')
const assistantHandlersSource = readFileSync(new URL('../src/main/ipc/handlers/assistant-handlers.ts', import.meta.url), 'utf8')
const preloadRelaySource = readFileSync(new URL('../src/preload/browser-devscope-relay.ts', import.meta.url), 'utf8')
const mainRelaySource = readFileSync(new URL('../src/main/browser-devscope-relay.ts', import.meta.url), 'utf8')
const liveDevscopeSource = readFileSync(new URL('../src/renderer/src/lib/browser-devscope-live-adapter.ts', import.meta.url), 'utf8')
assert.equal(titleBarSource.includes('{desktopWindowControlsAvailable ? ('), true, 'browser clients must not render native window buttons')
assert.equal(browserRuntimeSource.includes('onAssistantClientCountChanged: setActiveBrowserAssistantClientCount'), true, 'the live bridge must activate the browser Assistant selection lease')
assert.equal(mainSource.includes("staticRoot: join(__dirname, '../renderer')"), true, 'packaged Desktop must serve its built renderer to the local browser')
assert.equal(mainSource.includes('new BrowserClientRuntime'), true, 'Desktop must supervise the production browser runtime independently of renderer startup')
assert.equal(mainSource.includes("log.info('[BrowserClientHost] ready'"), true, 'the stable local browser URL must be discoverable in Desktop logs')
assert.equal(assistantHandlersSource.includes('withDesktopAssistantSelectionLease(() => getAssistantService().connect(options))'), true, 'Desktop auto-reconnect must not steal a browser-routed chat')
assert.equal(preloadRelaySource.includes('Object.prototype.hasOwnProperty.call'), true, 'the generic relay must only invoke methods owned by the exposed Desktop adapter')
assert.equal(preloadRelaySource.includes("relayEvent('previewTerminal'"), true, 'terminal output must cross the browser event relay')
assert.equal(preloadRelaySource.includes("relayEvent('agentControlState'"), true, 'Agent Control state must cross the browser event relay')
assert.equal(preloadRelaySource.includes('BROWSER_DEVSCOPE_RELAY_READY_CHANNEL'), true, 'preload must announce that native browser actions are ready')
assert.equal(mainRelaySource.includes('waitForReadyTarget'), true, 'browser actions must wait for the Desktop preload instead of being dropped during startup')
assert.equal(liveDevscopeSource.includes('MAX_CONCURRENT_BACKGROUND_BROWSER_ACTIONS = 1'), true, 'background native reads must leave capacity for browser navigation and user actions')
assert.equal(liveDevscopeSource.includes('isPriorityBrowserAction'), true, 'interactive native browser actions must bypass background read backlog')

const allowedOrigin = 'http://localhost:5174'
const capability = 'test-browser-assistant-capability'
const stateDirectory = mkdtempSync(path.join(os.tmpdir(), 'zyra-browser-bridge-test-'))
const descriptorPath = path.join(stateDirectory, 'browser-assistant-bridge.json')
const browserFilePath = path.join(stateDirectory, 'browser-file.txt')
writeFileSync(browserFilePath, 'browser-file-content')
let eventListener: ((payload: AssistantEventStreamPayload) => void) | null = null
let devscopeEventListener: ((event: BrowserDevscopeRelayEvent) => void) | null = null
const browserClientCounts: number[] = []
const service = {
    subscribeExternalEvents(listener: (payload: AssistantEventStreamPayload) => void) {
        eventListener = listener
        return () => { eventListener = null }
    },
    getExternalEventReplay() {
        return { events: [{ eventId: 'event:replay', type: 'session.selected' } as any] }
    },
    async getBootstrap() {
        return {
            snapshot: {
                selectedSessionId: 'session:real',
                sessions: [{ id: 'session:real', title: 'Shared browser session' }]
            },
            status: {
                available: true,
                connected: true,
                selectedSessionId: 'session:real',
                activeThreadId: 'thread:real',
                state: 'idle',
                reason: null
            }
        }
    },
    async getSnapshot() { return { selectedSessionId: 'session:real', sessions: [] } },
    async getStatus() { return { available: true, connected: true, state: 'idle' } }
} as unknown as AssistantService

const bridge = new BrowserAssistantBridge({
    service,
    allowedOrigins: new Set([allowedOrigin]),
    capability,
    descriptorPath,
    port: 0,
    invokeDevscope: async (methodPath, args) => ({ methodPath, args }),
    subscribeDevscopeEvents: (listener) => {
        devscopeEventListener = listener
        return () => { devscopeEventListener = null }
    },
    onAssistantClientCountChanged: (count) => browserClientCounts.push(count),
    persistClipboardImage: async () => 'persisted.png',
    resolveClipboardAttachment: async () => null,
    getVoiceTranscriptionState: async () => ({
        provider: 'codex',
        status: 'ready',
        available: true,
        signedIn: true,
        message: null
    }),
    transcribeVoice: async () => 'transcript'
})

const address = await bridge.start()
const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'))
assert.equal(descriptor.port, address.port)
assert.equal(descriptor.capability, capability, 'bridge discovery must use a per-process capability outside browser code')
const baseUrl = `http://127.0.0.1:${address.port}`
const headers = {
    Origin: allowedOrigin,
    'Content-Type': 'application/json',
    [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: capability
}

try {
    const bootstrapResponse = await fetch(`${baseUrl}${BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ method: 'bootstrap', args: [] })
    })
    assert.equal(bootstrapResponse.status, 200)
    const bootstrap = await bootstrapResponse.json() as any
    assert.equal(bootstrap.ok, true)
    assert.equal(bootstrap.value.snapshot.sessions[0].title, 'Shared browser session', 'browser bootstrap must use the live AssistantService')
    assert.equal(bootstrapResponse.headers.get('access-control-allow-origin'), allowedOrigin)

    const devscopeResponse = await fetch(`${baseUrl}${BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: ['selectFolder'], args: [] })
    })
    const devscope = await devscopeResponse.json() as any
    assert.equal(devscope.ok, true)
    assert.deepEqual(devscope.value, { methodPath: ['selectFolder'], args: [] }, 'browser-native actions must relay through the real Desktop adapter')

    const browserFileSource = pathToFileURL(browserFilePath).href.replace(/^file:/, 'zyra:')
    const browserFileResponse = await fetch(`${baseUrl}${BROWSER_FILE_BRIDGE_PATH}?source=${encodeURIComponent(browserFileSource)}`, {
        headers
    })
    assert.equal(browserFileResponse.status, 200)
    assert.equal(await browserFileResponse.text(), 'browser-file-content', 'browser clients must be able to render host files through the protected bridge')
    assert.equal(browserFileResponse.headers.get('content-type'), 'application/octet-stream')
    assert.equal(browserFileResponse.headers.get('accept-ranges'), 'bytes')

    const browserFileRange = await fetch(`${baseUrl}${BROWSER_FILE_BRIDGE_PATH}?source=${encodeURIComponent(browserFileSource)}`, {
        headers: { ...headers, Range: 'bytes=8-11' }
    })
    assert.equal(browserFileRange.status, 206)
    assert.equal(await browserFileRange.text(), 'file')
    assert.equal(browserFileRange.headers.get('content-range'), 'bytes 8-11/20')

    const prototypeTraversal = await fetch(`${baseUrl}${BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: ['constructor', 'constructor'], args: [] })
    })
    assert.equal(prototypeTraversal.status, 400, 'browser action paths must reject prototype traversal')

    const rejectedOrigin = await fetch(`${baseUrl}${BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://example.com' },
        body: JSON.stringify({ method: 'bootstrap', args: [] })
    })
    assert.equal(rejectedOrigin.status, 403, 'non-renderer origins must not access local sessions')

    const invalidCapability = await fetch(`${baseUrl}${BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers: { ...headers, [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: 'wrong-capability' },
        body: JSON.stringify({ method: 'bootstrap', args: [] })
    })
    assert.equal(invalidCapability.status, 403, 'browser bridge requests must carry the current process capability')

    const missingClientHeader = await fetch(`${baseUrl}${BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'bootstrap', args: [] })
    })
    assert.equal(missingClientHeader.status, 403, 'state-changing bridge requests must require a preflighted client header')

    const eventController = new AbortController()
    const eventResponse = await fetch(`${baseUrl}${BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH}`, {
        headers: {
            Origin: allowedOrigin,
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
            [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: capability
        },
        signal: eventController.signal
    })
    assert.equal(eventResponse.status, 200)
    assert.equal(eventResponse.headers.get('content-type')?.startsWith('text/event-stream'), true)
    assert.equal(browserClientCounts.at(-1), 1, 'an open browser event stream must own the Assistant selection lease')
    assert.ok(eventListener, 'event stream must subscribe to AssistantService events')
    eventListener!({ events: [{ eventId: 'event:browser', type: 'session.selected' } as any] })
    const reader = eventResponse.body!.getReader()
    const decoder = new TextDecoder()
    let eventText = ''
    for (let attempt = 0; attempt < 4 && !eventText.includes('event:browser'); attempt += 1) {
        const chunk = await reader.read()
        if (chunk.done) break
        eventText += decoder.decode(chunk.value)
    }
    assert.equal(eventText.includes('event:replay'), true, 'browser reconnects must replay the bounded AssistantService event journal')
    assert.equal(eventText.includes('event:browser'), true, 'live AssistantService events must reach the browser stream')
    eventController.abort()
    await reader.cancel().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(browserClientCounts.at(-1), 0, 'closing the browser stream must release the Assistant selection lease')

    const devscopeEventController = new AbortController()
    const devscopeEventResponse = await fetch(`${baseUrl}${BROWSER_DEVSCOPE_BRIDGE_EVENTS_PATH}`, {
        headers: {
            Origin: allowedOrigin,
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
            [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: capability
        },
        signal: devscopeEventController.signal
    })
    assert.equal(devscopeEventResponse.status, 200)
    assert.ok(devscopeEventListener, 'the bridge must subscribe to trusted Desktop events')
    devscopeEventListener!({ event: 'previewTerminal', payload: { sessionId: 'terminal:1', data: 'ready' } })
    const devscopeReader = devscopeEventResponse.body!.getReader()
    const devscopeDecoder = new TextDecoder()
    let devscopeEventText = ''
    for (let attempt = 0; attempt < 3 && !devscopeEventText.includes('terminal:1'); attempt += 1) {
        const chunk = await devscopeReader.read()
        if (chunk.done) break
        devscopeEventText += devscopeDecoder.decode(chunk.value)
    }
    assert.equal(devscopeEventText.includes('previewTerminal'), true, 'trusted Desktop events must reach browser subscribers')
    assert.equal(browserClientCounts.at(-1), 0, 'non-Assistant event streams must not claim Assistant selection')
    devscopeEventController.abort()
    await devscopeReader.cancel().catch(() => undefined)

    const replayController = new AbortController()
    const replayResponse = await fetch(`${baseUrl}${BROWSER_DEVSCOPE_BRIDGE_EVENTS_PATH}`, {
        headers: {
            Origin: allowedOrigin,
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
            [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: capability
        },
        signal: replayController.signal
    })
    const replayReader = replayResponse.body!.getReader()
    const replayDecoder = new TextDecoder()
    let replayText = ''
    for (let attempt = 0; attempt < 3 && !replayText.includes('terminal:1'); attempt += 1) {
        const replayChunk = await replayReader.read()
        if (replayChunk.done) break
        replayText += replayDecoder.decode(replayChunk.value)
    }
    assert.equal(replayText.includes('terminal:1'), true, 'browser action events must replay after a short disconnect')
    assert.equal(replayText.includes('streamId'), true, 'replayed events must carry a process identity for client deduplication')
    assert.equal(replayText.includes('sequence'), true, 'replayed events must carry a monotonic sequence')
    replayController.abort()
    await replayReader.cancel().catch(() => undefined)

    console.log('Browser assistant bridge: ok')
} finally {
    await bridge.stop()
    assert.equal(existsSync(descriptorPath), false, 'stopping Desktop must remove browser bridge discovery')
    rmSync(stateDirectory, { recursive: true, force: true })
}

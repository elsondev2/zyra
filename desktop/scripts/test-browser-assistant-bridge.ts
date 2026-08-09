import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AssistantEventStreamPayload } from '../src/shared/assistant/contracts'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH,
    BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH
} from '../src/shared/browser-assistant-bridge'
import { BrowserAssistantBridge } from '../src/main/assistant/browser-assistant-bridge'
import type { AssistantService } from '../src/main/assistant/service'

const titleBarSource = readFileSync(new URL('../src/renderer/src/components/layout/TitleBar.tsx', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const assistantHandlersSource = readFileSync(new URL('../src/main/ipc/handlers/assistant-handlers.ts', import.meta.url), 'utf8')
const preloadRelaySource = readFileSync(new URL('../src/preload/browser-devscope-relay.ts', import.meta.url), 'utf8')
const liveDevscopeSource = readFileSync(new URL('../src/renderer/src/lib/browser-devscope-live-adapter.ts', import.meta.url), 'utf8')
assert.equal(titleBarSource.includes('{desktopWindowControlsAvailable ? ('), true, 'browser clients must not render native window buttons')
assert.equal(mainSource.includes('onAssistantClientCountChanged: setActiveBrowserAssistantClientCount'), true, 'the live bridge must activate the browser Assistant selection lease')
assert.equal(assistantHandlersSource.includes('withDesktopAssistantSelectionLease(() => getAssistantService().connect(options))'), true, 'Desktop auto-reconnect must not steal a browser-routed chat')
assert.equal(preloadRelaySource.includes('Object.prototype.hasOwnProperty.call'), true, 'the generic relay must only invoke methods owned by the exposed Desktop adapter')
assert.equal(liveDevscopeSource.includes('MAX_CONCURRENT_BACKGROUND_BROWSER_ACTIONS = 1'), true, 'background native reads must leave capacity for browser navigation and user actions')
assert.equal(liveDevscopeSource.includes('isPriorityBrowserAction'), true, 'interactive native browser actions must bypass background read backlog')

const allowedOrigin = 'http://localhost:5174'
const capability = 'test-browser-assistant-capability'
const stateDirectory = mkdtempSync(path.join(os.tmpdir(), 'zyra-browser-bridge-test-'))
const descriptorPath = path.join(stateDirectory, 'browser-assistant-bridge.json')
let eventListener: ((payload: AssistantEventStreamPayload) => void) | null = null
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

    console.log('Browser assistant bridge: ok')
} finally {
    await bridge.stop()
    assert.equal(existsSync(descriptorPath), false, 'stopping Desktop must remove browser bridge discovery')
    rmSync(stateDirectory, { recursive: true, force: true })
}

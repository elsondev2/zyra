import assert from 'node:assert/strict'
import type { DevScopeApi, DevScopePreviewTerminalEvent } from '../src/shared/contracts/devscope-api'
import { BROWSER_DEVSCOPE_BRIDGE_EVENTS_PATH } from '../src/shared/browser-assistant-bridge'
import { createLiveBrowserDevscopeAdapter } from '../src/renderer/src/lib/browser-devscope-live-adapter'
import { projectLocalFileUrl } from '../src/renderer/src/lib/browser-file-url'

const globalWithWindow = globalThis as typeof globalThis & { window?: typeof globalThis }
const previousWindow = globalWithWindow.window
globalWithWindow.window = globalThis
const previousFetch = globalThis.fetch
let requestedUrl = ''
let eventRequestCount = 0
let lastActionBody = ''
let lastStreamController: ReadableStreamDefaultController<Uint8Array> | null = null
const runtimeStatus = { phase: 'ready', connection: 'connected', lastConfirmedAt: new Date().toISOString() }

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input)
    if (!requestedUrl.endsWith(BROWSER_DEVSCOPE_BRIDGE_EVENTS_PATH)) {
        lastActionBody = String(init?.body || '')
        return new Response(JSON.stringify({
            ok: true,
            value: lastActionBody.includes('runtimeActivation') ? runtimeStatus : { success: true, state: { active: false, grants: [], pendingGrants: [] } }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        })
    }
    eventRequestCount += 1
    const signal = init?.signal
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            lastStreamController = controller
            controller.enqueue(new TextEncoder().encode([
                'data: {"event":"previewTerminal","payload":{"sessionId":"terminal:browser","type":"output","data":"hello"},"streamId":"stream:test","sequence":1}',
                'data: {"event":"previewTerminal","payload":{"sessionId":"terminal:browser","type":"output","data":"duplicate"},"streamId":"stream:test","sequence":1}',
                'data: {"event":"previewTerminal","payload":{"sessionId":"terminal:browser","type":"output","data":"world"},"streamId":"stream:test","sequence":2}',
                ''
            ].join('\n\n')))
            signal?.addEventListener('abort', () => {
                try { controller.close() } catch {}
            }, { once: true })
        }
    })
    return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
    })
}) as typeof fetch

let guestConfigFallbackCalls = 0
let guestBindFallbackCalls = 0
const base = {
    runtimeActivation: {
        getState: async () => ({ phase: 'idle' as const }),
        onStateChange: () => () => undefined
    },
    onPreviewTerminalEvent: () => () => undefined,
    agentControl: {
        getState: async () => ({ success: false as const, error: 'Agent control requires Desktop.' }),
        bindBrowserTab: async () => {
            guestBindFallbackCalls += 1
            return { success: false as const, error: 'Integrated Browser requires Electron.' }
        },
        onCursorChange: () => () => undefined,
        onStateChange: () => () => undefined
    },
    getBrowserPreviewConfig: async () => {
        guestConfigFallbackCalls += 1
        return { success: false as const, error: 'Integrated Browser requires Electron.' }
    }
} as unknown as DevScopeApi
const adapter = createLiveBrowserDevscopeAdapter(base)

try {
    assert.notEqual(adapter.runtimeActivation, base.runtimeActivation, 'browser clients relay real runtime status instead of an idle stub')
    assert.deepEqual(await adapter.runtimeActivation.getState(), runtimeStatus)
    assert.ok(lastActionBody.includes('runtimeActivation'))
    const projectedFileUrl = projectLocalFileUrl('zyra:///C:/workspace/preview image.png')
    assert.equal(projectedFileUrl.includes('/v1/files/content?source='), true)
    assert.equal(decodeURIComponent(projectedFileUrl).includes('zyra:///C:/workspace/preview image.png'), true)
    assert.equal(projectLocalFileUrl('https://example.com/image.png'), 'https://example.com/image.png')

    const received = new Promise<DevScopePreviewTerminalEvent[]>((resolve, reject) => {
        const events: DevScopePreviewTerminalEvent[] = []
        const timeout = setTimeout(() => reject(new Error('Browser terminal events were not delivered.')), 2_000)
        const unsubscribe = adapter.onPreviewTerminalEvent((event) => {
            events.push(event)
            if (events.length < 2) return
            clearTimeout(timeout)
            unsubscribe()
            resolve(events)
        })
    })
    const events = await received
    assert.equal(events[0].sessionId, 'terminal:browser')
    assert.equal(events[0].type, 'output')
    assert.deepEqual(events.map((event) => event.data), ['hello', 'world'], 'replayed event sequences must be delivered exactly once')
    assert.equal(requestedUrl.endsWith(BROWSER_DEVSCOPE_BRIDGE_EVENTS_PATH), true)
    assert.equal(eventRequestCount, 1, 'all browser native event listeners must share one supervised stream')

    const guestConfig = await adapter.getBrowserPreviewConfig()
    assert.equal(guestConfig.success, false)
    assert.equal(guestConfigFallbackCalls, 1, 'Electron guest APIs must remain intentionally gated in Chrome')
    assert.equal(eventRequestCount, 1, 'gated Electron guest APIs must not reach the Desktop relay')

    assert.equal(typeof adapter.onboarding.onChanged, 'function', 'new live setup namespaces must expose typed event subscriptions even when the fallback adapter is older')
    const onboardingState = await adapter.onboarding.getState()
    assert.equal(onboardingState.success, true)
    assert.equal(lastActionBody.includes('onboarding'), true)
    assert.equal(lastActionBody.includes('getState'), true)

    const controlState = await adapter.agentControl.getState()
    assert.equal(controlState.success, true, 'browser clients must use the live Agent Control state')
    assert.equal(lastActionBody.includes('agentControl'), true)
    assert.equal(lastActionBody.includes('getState'), true)
    const guestBind = await adapter.agentControl.bindBrowserTab({ guestWebContentsId: 7, tabId: 'browser:1', threadId: 'thread:1' })
    assert.equal(guestBind.success, false)
    assert.equal(guestBindFallbackCalls, 1, 'Electron guest binding must remain gated in Chrome')
    await new Promise((resolve) => setTimeout(resolve, 0))

    let unsubscribeRuntime = () => {}
    const disconnected = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Runtime relay did not report transport loss')), 2000)
        unsubscribeRuntime = adapter.runtimeActivation.onStateChange(state => {
            if (state.connection === 'connected') queueMicrotask(() => lastStreamController?.close())
            if (state.connection === 'disconnected') {
                clearTimeout(timeout)
                assert.equal(state.phase, 'failed')
                unsubscribeRuntime()
                resolve()
            }
        })
    })
    await disconnected
    console.log('Browser DevScope live adapter: real runtime status and disconnected stream recovery: ok')
} finally {
    globalThis.fetch = previousFetch
    if (previousWindow) globalWithWindow.window = previousWindow
    else delete globalWithWindow.window
}

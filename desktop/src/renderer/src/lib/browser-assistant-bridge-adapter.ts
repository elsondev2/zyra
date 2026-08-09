import type { AssistantEventStreamPayload } from '@shared/assistant/contracts'
import type { DevScopeApi, DevScopeAssistantApi } from '@shared/contracts/devscope-api'
import {
    BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH,
    BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX,
    type BrowserAssistantBridgeInvokeResponse,
    type BrowserAssistantBridgeMethod
} from '@shared/browser-assistant-bridge'

const RECONNECT_DELAY_MS = 1_000

async function invokeBrowserAssistantBridge<T>(method: BrowserAssistantBridgeMethod, args: unknown[]): Promise<T> {
    const response = await fetch(`${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}${BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
        },
        body: JSON.stringify({ method, args })
    })
    const payload = await response.json() as BrowserAssistantBridgeInvokeResponse
    if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? `Browser bridge request failed (${response.status}).` : payload.error)
    }
    return payload.value as T
}

type RemoteAssistantMethod = BrowserAssistantBridgeMethod & keyof DevScopeAssistantApi
type AssistantMethod<M extends RemoteAssistantMethod> = DevScopeAssistantApi[M] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : never

function remoteAssistantMethod<M extends RemoteAssistantMethod>(method: M): AssistantMethod<M> {
    return ((...args: unknown[]) => invokeBrowserAssistantBridge(method, args)) as AssistantMethod<M>
}

type BrowserAssistantSnapshot = Awaited<ReturnType<DevScopeAssistantApi['getSnapshot']>>
type BrowserAssistantBootstrap = Awaited<ReturnType<DevScopeAssistantApi['bootstrap']>>

function decodeRoutePart(value: string | undefined): string | null {
    if (!value) return null
    try {
        return decodeURIComponent(value)
    } catch {
        return null
    }
}

function projectBrowserRouteSnapshot(snapshot: BrowserAssistantSnapshot): BrowserAssistantSnapshot {
    const parts = window.location.hash.replace(/^#/, '').split('/').filter(Boolean)
    if (parts[0] !== 'assistant' || parts[1] !== 'chat') return snapshot
    const sessionId = decodeRoutePart(parts[2])
    const requestedThreadId = parts[3] === 'thread' ? decodeRoutePart(parts[4]) : null
    const sessionIndex = sessionId
        ? snapshot.sessions.findIndex((session) => session.id === sessionId)
        : -1
    if (sessionIndex < 0) return snapshot

    const session = snapshot.sessions[sessionIndex]
    const threadId = requestedThreadId && session.threads.some((thread) => thread.id === requestedThreadId)
        ? requestedThreadId
        : session.activeThreadId
    const sessions = threadId && session.activeThreadId !== threadId
        ? snapshot.sessions.map((entry, index) => index === sessionIndex ? { ...entry, activeThreadId: threadId } : entry)
        : snapshot.sessions
    if (snapshot.selectedSessionId === session.id && sessions === snapshot.sessions) return snapshot
    return { ...snapshot, selectedSessionId: session.id, sessions }
}

async function getBrowserBootstrap(): Promise<BrowserAssistantBootstrap> {
    const bootstrap = await invokeBrowserAssistantBridge<BrowserAssistantBootstrap>('bootstrap', [])
    const snapshot = projectBrowserRouteSnapshot(bootstrap.snapshot)
    const session = snapshot.sessions.find((entry) => entry.id === snapshot.selectedSessionId) || null
    const statusMatchesRoute = Boolean(
        session
        && bootstrap.status.selectedSessionId === session.id
        && bootstrap.status.activeThreadId === session.activeThreadId
    )
    return {
        ...bootstrap,
        snapshot,
        status: statusMatchesRoute
            ? bootstrap.status
            : {
                ...bootstrap.status,
                connected: false,
                selectedSessionId: session?.id || null,
                activeThreadId: session?.activeThreadId || null,
                state: 'disconnected'
            }
    }
}

async function getBrowserSnapshot(): Promise<BrowserAssistantSnapshot> {
    return projectBrowserRouteSnapshot(
        await invokeBrowserAssistantBridge<BrowserAssistantSnapshot>('getSnapshot', [])
    )
}

function waitForReconnect(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve()
            return
        }
        const timer = window.setTimeout(done, RECONNECT_DELAY_MS)
        function done() {
            window.clearTimeout(timer)
            signal.removeEventListener('abort', done)
            resolve()
        }
        signal.addEventListener('abort', done, { once: true })
    })
}

async function consumeAssistantEventStream(
    callback: (payload: AssistantEventStreamPayload) => void,
    signal: AbortSignal
): Promise<void> {
    while (!signal.aborted) {
        try {
            const response = await fetch(`${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}${BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH}`, {
                headers: {
                    [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
                },
                cache: 'no-store',
                signal
            })
            if (!response.ok || !response.body) throw new Error(`Browser event bridge returned ${response.status}.`)
            // An empty payload is a renderer-local stream-ready signal. It lets
            // the browser reclaim its routed session only after the main-process
            // lease is active, without inventing a domain event.
            callback({ events: [] })
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            while (!signal.aborted) {
                const result = await reader.read()
                if (result.done) break
                buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
                let boundary = buffer.indexOf('\n\n')
                while (boundary >= 0) {
                    const block = buffer.slice(0, boundary)
                    buffer = buffer.slice(boundary + 2)
                    const data = block
                        .split('\n')
                        .filter((line) => line.startsWith('data:'))
                        .map((line) => line.slice(5).trimStart())
                        .join('\n')
                    if (data) callback(JSON.parse(data) as AssistantEventStreamPayload)
                    boundary = buffer.indexOf('\n\n')
                }
            }
        } catch (error) {
            if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        }
        await waitForReconnect(signal)
    }
}

export function createBrowserAssistantBridgeAdapter(): DevScopeApi['assistant'] {
    return {
        subscribe: async () => ({ success: true as const }),
        unsubscribe: async () => ({ success: true as const }),
        bootstrap: getBrowserBootstrap,
        getSnapshot: getBrowserSnapshot,
        getFleetSnapshot: remoteAssistantMethod('getFleetSnapshot'),
        agentAction: remoteAssistantMethod('agentAction'),
        workflowAction: remoteAssistantMethod('workflowAction'),
        getStatus: remoteAssistantMethod('getStatus'),
        getAccountOverview: remoteAssistantMethod('getAccountOverview'),
        redeemAccountReset: remoteAssistantMethod('redeemAccountReset'),
        getSessionTurnUsage: remoteAssistantMethod('getSessionTurnUsage'),
        listModels: remoteAssistantMethod('listModels'),
        connect: remoteAssistantMethod('connect'),
        disconnect: remoteAssistantMethod('disconnect'),
        createSession: remoteAssistantMethod('createSession'),
        selectSession: remoteAssistantMethod('selectSession'),
        selectThread: remoteAssistantMethod('selectThread'),
        getThreadDetailBootstrap: remoteAssistantMethod('getThreadDetailBootstrap'),
        getHistoryPage: remoteAssistantMethod('getHistoryPage'),
        getReviewIndex: remoteAssistantMethod('getReviewIndex'),
        getTurnDetail: remoteAssistantMethod('getTurnDetail'),
        searchTurns: remoteAssistantMethod('searchTurns'),
        renameSession: remoteAssistantMethod('renameSession'),
        archiveSession: remoteAssistantMethod('archiveSession'),
        deleteSession: remoteAssistantMethod('deleteSession'),
        deleteMessage: remoteAssistantMethod('deleteMessage'),
        clearLogs: remoteAssistantMethod('clearLogs'),
        setSessionProjectPath: remoteAssistantMethod('setSessionProjectPath'),
        setPlaygroundRoot: remoteAssistantMethod('setPlaygroundRoot'),
        createPlaygroundLab: remoteAssistantMethod('createPlaygroundLab'),
        deletePlaygroundLab: remoteAssistantMethod('deletePlaygroundLab'),
        attachSessionToPlaygroundLab: remoteAssistantMethod('attachSessionToPlaygroundLab'),
        approvePendingPlaygroundLabRequest: remoteAssistantMethod('approvePendingPlaygroundLabRequest'),
        declinePendingPlaygroundLabRequest: remoteAssistantMethod('declinePendingPlaygroundLabRequest'),
        getPathForFile: () => '',
        persistClipboardImage: remoteAssistantMethod('persistClipboardImage'),
        resolveClipboardAttachment: remoteAssistantMethod('resolveClipboardAttachment'),
        newThread: remoteAssistantMethod('newThread'),
        sendPrompt: remoteAssistantMethod('sendPrompt'),
        interruptTurn: remoteAssistantMethod('interruptTurn'),
        respondApproval: remoteAssistantMethod('respondApproval'),
        respondUserInput: remoteAssistantMethod('respondUserInput'),
        startRealtimeVoice: async () => ({ success: false as const, error: 'Realtime voice currently requires the Zyra desktop window.' }),
        sendRealtimeVoiceMessage: async () => ({ success: false as const, error: 'Realtime voice currently requires the Zyra desktop window.' }),
        ingestRealtimeVoiceEvent: async () => ({ success: false as const, error: 'Realtime voice currently requires the Zyra desktop window.' }),
        stopRealtimeVoice: async () => ({ success: true as const }),
        onRealtimeVoiceEvent: () => () => {},
        getVoiceTranscriptionState: remoteAssistantMethod('getVoiceTranscriptionState'),
        transcribeVoice: remoteAssistantMethod('transcribeVoice'),
        onEvent: (callback: (payload: AssistantEventStreamPayload) => void) => {
            const controller = new AbortController()
            void consumeAssistantEventStream(callback, controller.signal)
            return () => controller.abort()
        }
    }
}

import { ipcRenderer } from 'electron'
import type { DevScopeApi } from '../shared/contracts/devscope-api'
import {
    BROWSER_DEVSCOPE_RELAY_EVENT_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_READY_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_REQUEST_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL,
    isBrowserDevscopeBridgePath,
    type BrowserDevscopeEventName,
    type BrowserDevscopeRelayEvent,
    type BrowserDevscopeRelayRequest,
    type BrowserDevscopeRelayResponse
} from '../shared/browser-assistant-bridge'

function sendResponse(response: BrowserDevscopeRelayResponse): void {
    ipcRenderer.send(BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL, response)
}

export function installBrowserDevscopeRelay(devscope: DevScopeApi): void {
    const relayEvent = (event: BrowserDevscopeEventName, payload: unknown) => {
        const message: BrowserDevscopeRelayEvent = { event, payload }
        ipcRenderer.send(BROWSER_DEVSCOPE_RELAY_EVENT_CHANNEL, message)
    }
    const eventSubscriptions: Array<() => () => void> = [
        () => devscope.agentControl.onCursorChange((payload) => relayEvent('agentControlCursor', payload)),
        () => devscope.agentControl.onStateChange((payload) => relayEvent('agentControlState', payload)),
        () => devscope.onGitCloneProgress((payload) => relayEvent('gitCloneProgress', payload)),
        () => devscope.onPreviewTerminalEvent((payload) => relayEvent('previewTerminal', payload)),
        () => devscope.onPythonPreviewEvent((payload) => relayEvent('pythonPreview', payload))
    ]
    for (const subscribe of eventSubscriptions) {
        try {
            subscribe()
        } catch {
            // Browser event forwarding is optional until the owning IPC handler is registered.
        }
    }

    ipcRenderer.on(BROWSER_DEVSCOPE_RELAY_REQUEST_CHANNEL, (_event, request: BrowserDevscopeRelayRequest) => {
        if (!request || typeof request.requestId !== 'string' || !isBrowserDevscopeBridgePath(request.path) || !Array.isArray(request.args)) {
            if (request && typeof request.requestId === 'string') {
                sendResponse({ requestId: request.requestId, ok: false, error: 'Browser action request is invalid.' })
            }
            return
        }

        const root = devscope as unknown as Record<string, unknown>
        const namespaceName = request.path[0]
        if (!Object.prototype.hasOwnProperty.call(root, namespaceName)) {
            sendResponse({ requestId: request.requestId, ok: false, error: `Browser action ${request.path.join('.')} is unavailable.` })
            return
        }
        const owner = request.path.length === 1
            ? root
            : root[namespaceName] as Record<string, unknown> | undefined
        const methodName = request.path[request.path.length - 1]
        const method = owner && Object.prototype.hasOwnProperty.call(owner, methodName)
            ? owner[methodName]
            : undefined
        if (typeof method !== 'function') {
            sendResponse({ requestId: request.requestId, ok: false, error: `Browser action ${request.path.join('.')} is unavailable.` })
            return
        }

        void Promise.resolve(method.apply(owner, request.args)).then((value) => {
            sendResponse({ requestId: request.requestId, ok: true, value })
        }).catch((error) => {
            sendResponse({
                requestId: request.requestId,
                ok: false,
                error: error instanceof Error ? error.message : 'Browser action failed.'
            })
        })
    })
    ipcRenderer.send(BROWSER_DEVSCOPE_RELAY_READY_CHANNEL)
}

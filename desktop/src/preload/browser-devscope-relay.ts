import { ipcRenderer } from 'electron'
import type { DevScopeApi } from '../shared/contracts/devscope-api'
import {
    BROWSER_DEVSCOPE_RELAY_REQUEST_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL,
    isBrowserDevscopeBridgePath,
    type BrowserDevscopeRelayRequest,
    type BrowserDevscopeRelayResponse
} from '../shared/browser-assistant-bridge'

function sendResponse(response: BrowserDevscopeRelayResponse): void {
    ipcRenderer.send(BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL, response)
}

export function installBrowserDevscopeRelay(devscope: DevScopeApi): void {
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
}

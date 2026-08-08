import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainEvent, type WebContents } from 'electron'
import {
    BROWSER_DEVSCOPE_RELAY_REQUEST_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL,
    isBrowserDevscopeBridgePath,
    type BrowserDevscopeRelayRequest,
    type BrowserDevscopeRelayResponse
} from '../shared/browser-assistant-bridge'

const BROWSER_ACTION_TIMEOUT_MS = 5 * 60_000

type PendingBrowserAction = {
    senderId: number
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

export class BrowserDevscopeRelay {
    private readonly pending = new Map<string, PendingBrowserAction>()
    private disposed = false

    constructor(private readonly getTarget: () => WebContents | null) {
        ipcMain.on(BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL, this.handleResponse)
    }

    invoke(path: string[], args: unknown[]): Promise<unknown> {
        if (this.disposed) return Promise.reject(new Error('The browser action bridge is stopped.'))
        if (!isBrowserDevscopeBridgePath(path) || !Array.isArray(args)) {
            return Promise.reject(new Error('Browser action request is invalid.'))
        }
        const target = this.getTarget()
        if (!target || target.isDestroyed()) {
            return Promise.reject(new Error('The Zyra Desktop window is unavailable.'))
        }

        const requestId = randomUUID()
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId)
                reject(new Error(`Browser action ${path.join('.')} timed out.`))
            }, BROWSER_ACTION_TIMEOUT_MS)
            timer.unref?.()
            this.pending.set(requestId, { senderId: target.id, resolve, reject, timer })
            const request: BrowserDevscopeRelayRequest = { requestId, path, args }
            try {
                target.send(BROWSER_DEVSCOPE_RELAY_REQUEST_CHANNEL, request)
            } catch (error) {
                clearTimeout(timer)
                this.pending.delete(requestId)
                reject(error instanceof Error ? error : new Error('Browser action could not reach Desktop.'))
            }
        })
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        ipcMain.removeListener(BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL, this.handleResponse)
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(new Error('The browser action bridge stopped.'))
        }
        this.pending.clear()
    }

    private readonly handleResponse = (event: IpcMainEvent, response: BrowserDevscopeRelayResponse): void => {
        if (!response || typeof response.requestId !== 'string') return
        const pending = this.pending.get(response.requestId)
        if (!pending || pending.senderId !== event.sender.id) return
        clearTimeout(pending.timer)
        this.pending.delete(response.requestId)
        if (response.ok) pending.resolve(response.value)
        else pending.reject(new Error(response.error || 'Browser action failed.'))
    }
}

import { randomUUID } from 'node:crypto'
import { type IpcMainEvent, type WebContents } from 'electron'
import { ipcMain } from './ipc/trusted-ipc'
import {
    BROWSER_DEVSCOPE_RELAY_EVENT_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_READY_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_REQUEST_CHANNEL,
    BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL,
    isBrowserDevscopeBridgePath,
    isBrowserDevscopeRelayEvent,
    type BrowserDevscopeRelayEvent,
    type BrowserDevscopeRelayRequest,
    type BrowserDevscopeRelayResponse
} from '../shared/browser-assistant-bridge'

const BROWSER_ACTION_TIMEOUT_MS = 5 * 60_000
const BROWSER_RELAY_READY_TIMEOUT_MS = 15_000

type BrowserRelayReadyWaiter = {
    resolve: (target: WebContents) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

type PendingBrowserAction = {
    senderId: number
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

export class BrowserDevscopeRelay {
    private readonly pending = new Map<string, PendingBrowserAction>()
    private readonly eventListeners = new Set<(event: BrowserDevscopeRelayEvent) => void>()
    private readonly readyWaiters = new Set<BrowserRelayReadyWaiter>()
    private readySenderId: number | null = null
    private disposed = false

    constructor(private readonly getTarget: () => WebContents | null) {
        ipcMain.on(BROWSER_DEVSCOPE_RELAY_RESPONSE_CHANNEL, this.handleResponse)
        ipcMain.on(BROWSER_DEVSCOPE_RELAY_EVENT_CHANNEL, this.handleEvent)
        ipcMain.on(BROWSER_DEVSCOPE_RELAY_READY_CHANNEL, this.handleReady)
    }

    subscribeEvents(listener: (event: BrowserDevscopeRelayEvent) => void): () => void {
        if (this.disposed) return () => undefined
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    async invoke(path: string[], args: unknown[]): Promise<unknown> {
        if (this.disposed) throw new Error('The browser action bridge is stopped.')
        if (!isBrowserDevscopeBridgePath(path) || !Array.isArray(args)) {
            throw new Error('Browser action request is invalid.')
        }
        const target = await this.waitForReadyTarget()
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
        ipcMain.removeListener(BROWSER_DEVSCOPE_RELAY_EVENT_CHANNEL, this.handleEvent)
        ipcMain.removeListener(BROWSER_DEVSCOPE_RELAY_READY_CHANNEL, this.handleReady)
        this.eventListeners.clear()
        for (const waiter of this.readyWaiters) {
            clearTimeout(waiter.timer)
            waiter.reject(new Error('The browser action bridge stopped.'))
        }
        this.readyWaiters.clear()
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(new Error('The browser action bridge stopped.'))
        }
        this.pending.clear()
    }

    private waitForReadyTarget(): Promise<WebContents> {
        if (this.disposed) return Promise.reject(new Error('The browser action bridge is stopped.'))
        const target = this.getTarget()
        if (target && !target.isDestroyed() && target.id === this.readySenderId) return Promise.resolve(target)

        return new Promise<WebContents>((resolve, reject) => {
            const waiter: BrowserRelayReadyWaiter = {
                resolve,
                reject,
                timer: setTimeout(() => {
                    this.readyWaiters.delete(waiter)
                    reject(new Error('The Zyra Desktop window is still starting. Try again shortly.'))
                }, BROWSER_RELAY_READY_TIMEOUT_MS)
            }
            waiter.timer.unref?.()
            this.readyWaiters.add(waiter)
        })
    }

    private readonly handleReady = (event: IpcMainEvent): void => {
        const target = this.getTarget()
        if (!target || target.isDestroyed() || event.sender.id !== target.id) return
        this.readySenderId = target.id
        for (const waiter of this.readyWaiters) {
            clearTimeout(waiter.timer)
            waiter.resolve(target)
        }
        this.readyWaiters.clear()
    }

    private readonly handleEvent = (event: IpcMainEvent, message: unknown): void => {
        const target = this.getTarget()
        if (!target || target.isDestroyed() || event.sender.id !== target.id || !isBrowserDevscopeRelayEvent(message)) return
        for (const listener of this.eventListeners) listener(message)
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

import {
    ipcMain as electronIpcMain,
    type IpcMain,
    type IpcMainEvent,
    type IpcMainInvokeEvent,
    type WebContents
} from 'electron'
import { TrustedIpcSenderPolicy } from './trusted-ipc-policy'

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any
type EventListener = (event: IpcMainEvent, ...args: any[]) => void

const senderPolicy = new TrustedIpcSenderPolicy()
const wrappedListeners = new Map<string, Map<EventListener, EventListener>>()

export function registerTrustedIpcSender(
    sender: WebContents,
    allowsUrl: (url: string) => boolean
): void {
    senderPolicy.register(sender, allowsUrl)
    sender.once('destroyed', () => senderPolicy.unregister(sender))
}

export function assertTrustedIpcEvent(event: IpcMainEvent | IpcMainInvokeEvent): void {
    const decision = senderPolicy.decide(event)
    if (decision.trusted) return
    const error = new Error(`Zyra rejected privileged IPC from an untrusted renderer (${decision.reason}).`) as Error & { code?: string }
    error.code = 'UNTRUSTED_IPC_SENDER'
    throw error
}

function trustedInvokeHandler(handler: InvokeHandler): InvokeHandler {
    return (event, ...args) => {
        assertTrustedIpcEvent(event)
        return handler(event, ...args)
    }
}

function trustedEventListener(handler: EventListener): EventListener {
    return (event, ...args) => {
        try {
            assertTrustedIpcEvent(event)
        } catch {
            return
        }
        handler(event, ...args)
    }
}

/**
 * Drop-in ipcMain facade. Every handler registered through it validates the
 * exact sender WebContents, main frame, and local renderer URL before the
 * application handler can observe arguments or perform privileged work.
 */
export const ipcMain = new Proxy(electronIpcMain, {
    get(target, property, receiver) {
        if (property === 'handle' || property === 'handleOnce') {
            return (channel: string, handler: InvokeHandler) => property === 'handle'
                ? target.handle(channel, trustedInvokeHandler(handler))
                : target.handleOnce(channel, trustedInvokeHandler(handler))
        }
        if (property === 'on' || property === 'addListener' || property === 'once' || property === 'prependListener' || property === 'prependOnceListener') {
            return (channel: string, handler: EventListener) => {
                const wrapped = trustedEventListener(handler)
                const channelListeners = wrappedListeners.get(channel) || new Map<EventListener, EventListener>()
                channelListeners.set(handler, wrapped)
                wrappedListeners.set(channel, channelListeners)
                if (property === 'once') target.once(channel, wrapped)
                else if (property === 'prependListener') target.prependListener(channel, wrapped)
                else if (property === 'prependOnceListener') target.prependOnceListener(channel, wrapped)
                else target.on(channel, wrapped)
                return receiver
            }
        }
        if (property === 'removeListener') {
            return (channel: string, handler: EventListener) => {
                const channelListeners = wrappedListeners.get(channel)
                const wrapped = channelListeners?.get(handler) || handler
                channelListeners?.delete(handler)
                if (channelListeners?.size === 0) wrappedListeners.delete(channel)
                target.removeListener(channel, wrapped)
                return receiver
            }
        }
        if (property === 'removeAllListeners') {
            return (channel?: string) => {
                if (channel === undefined) wrappedListeners.clear()
                else wrappedListeners.delete(channel)
                if (channel === undefined) target.removeAllListeners()
                else target.removeAllListeners(channel)
                return receiver
            }
        }

        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
    }
}) as IpcMain

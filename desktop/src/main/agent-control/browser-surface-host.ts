import { randomUUID } from 'node:crypto'
import type {
    BrowserSurfaceOpenAcknowledgement,
    BrowserSurfaceOpenCompletion,
    BrowserSurfaceOpenRequest
} from '../../shared/agent-control/protocol'
import type { ControlPrincipal, ControlTarget } from '../../shared/agent-control/contracts'
import { AgentControlError } from './control-errors'

const BROWSER_SURFACE_ACCEPT_TIMEOUT_MS = 8_000
const BROWSER_SURFACE_REGISTER_TIMEOUT_MS = 20_000
const MAX_PENDING_BROWSER_SURFACE_REQUESTS = 8
const MAX_SETTLED_BROWSER_SURFACE_REQUESTS = 64

type BrowserTarget = Extract<ControlTarget, { kind: 'zyra-browser' }>

type PendingSurfaceRequest = {
    request: BrowserSurfaceOpenRequest
    resolve: (target: BrowserTarget) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
    phase: 'sent' | 'accepted'
    signal?: AbortSignal
    abort?: () => void
}

export class BrowserSurfaceHost {
    private readonly pending = new Map<string, PendingSurfaceRequest>()
    private readonly settled = new Set<string>()
    private disposed = false

    constructor(private readonly options: {
        send: (request: BrowserSurfaceOpenRequest) => void
        resolveTarget: (targetId: string) => ControlTarget
        makeId?: () => string
        timeoutMs?: number
    }) {}

    openTab(
        principal: ControlPrincipal,
        reveal: boolean,
        signal?: AbortSignal
    ): Promise<BrowserTarget> {
        if (this.disposed) {
            return Promise.reject(new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'The Browser surface host is unavailable.'))
        }
        if (this.pending.size >= MAX_PENDING_BROWSER_SURFACE_REQUESTS) {
            return Promise.reject(new AgentControlError('CONTROL_QUEUE_FULL', 'Too many Browser tabs are waiting to open.'))
        }
        const id = this.options.makeId?.() || randomUUID()
        const threadId = principal.type === 'root' ? principal.threadId : principal.parentThreadId
        const request: BrowserSurfaceOpenRequest = {
            version: 1,
            requestId: `browser-open:${id}`,
            threadId,
            tabId: `browser:agent:${id}`,
            reveal,
            requestedBy: principal
        }
        return new Promise((resolve, reject) => {
            const rejectPending = (error: Error) => {
                const pending = this.takePending(request.requestId)
                if (!pending) return
                reject(error)
            }
            const timer = this.makeTimeout(request.requestId, 'sent')
            const abort = () => rejectPending(new AgentControlError('CONTROL_CANCELLED', 'Opening the Browser tab was cancelled.'))
            this.pending.set(request.requestId, { request, resolve, reject, timer, phase: 'sent', signal, abort })
            if (signal?.aborted) {
                abort()
                return
            }
            signal?.addEventListener('abort', abort, { once: true })
            try {
                this.options.send(request)
            } catch (error) {
                rejectPending(error instanceof Error ? error : new Error('Could not contact the Browser workspace.'))
            }
        })
    }

    acknowledge(value: BrowserSurfaceOpenAcknowledgement): boolean {
        const requestId = String(value?.requestId || '')
        const pending = this.pending.get(requestId)
        if (!pending) {
            if (this.settled.has(requestId)) return false
            throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The Browser open request is no longer active.')
        }
        this.assertMatchesRequest(pending, value)
        if (pending.phase === 'accepted') return false
        pending.phase = 'accepted'
        clearTimeout(pending.timer)
        pending.timer = this.makeTimeout(requestId, 'accepted')
        return true
    }

    completeRegisteredTarget(target: ControlTarget): boolean {
        if (target.kind !== 'zyra-browser') return false
        const pending = [...this.pending.values()].find((entry) => entry.request.tabId === target.tabId)
        if (!pending) return false
        const taken = this.takePending(pending.request.requestId)
        if (!taken) return false
        taken.resolve(target)
        return true
    }

    complete(value: BrowserSurfaceOpenCompletion): boolean {
        const requestId = String(value?.requestId || '')
        const pending = this.pending.get(requestId)
        if (!pending) {
            if (this.settled.has(requestId)) return false
            throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The Browser open request is no longer active.')
        }
        this.assertMatchesRequest(pending, value)
        if (!value.success) {
            const taken = this.takePending(requestId)
            taken?.reject(new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', value.error || 'The Browser tab could not be opened.'))
            return Boolean(taken)
        }
        let target: ControlTarget
        try {
            target = this.options.resolveTarget(value.targetId)
        } catch {
            const taken = this.takePending(requestId)
            taken?.reject(new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The opened Browser tab did not register as a trusted control target.'))
            return Boolean(taken)
        }
        if (target.kind !== 'zyra-browser' || target.tabId !== pending.request.tabId) {
            const taken = this.takePending(requestId)
            taken?.reject(new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser response resolved to a different control target.'))
            return Boolean(taken)
        }
        return this.completeRegisteredTarget(target)
    }

    cancelPending(reason = 'Browser surface requests were cancelled.'): void {
        for (const requestId of [...this.pending.keys()]) {
            const pending = this.takePending(requestId)
            pending?.reject(new AgentControlError('CONTROL_CANCELLED', reason))
        }
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.cancelPending('The Browser surface host closed.')
    }

    private assertMatchesRequest(
        pending: PendingSurfaceRequest,
        value: { threadId: string; tabId: string }
    ): void {
        if (value.threadId !== pending.request.threadId || value.tabId !== pending.request.tabId) {
            throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser response does not match its requested thread and tab.')
        }
    }

    private makeTimeout(requestId: string, phase: PendingSurfaceRequest['phase']): NodeJS.Timeout {
        const configured = this.options.timeoutMs
        const defaultTimeout = phase === 'sent' ? BROWSER_SURFACE_ACCEPT_TIMEOUT_MS : BROWSER_SURFACE_REGISTER_TIMEOUT_MS
        const timeoutMs = Math.max(1_000, Math.min(25_000, configured || defaultTimeout))
        const timer = setTimeout(() => {
            const pending = this.takePending(requestId)
            if (!pending) return
            pending.reject(new AgentControlError(
                'CONTROL_TIMEOUT',
                phase === 'sent'
                    ? 'The selected thread did not acknowledge its Browser tab request in time.'
                    : 'The Browser tab was accepted but did not register as a trusted control target in time.'
            ))
        }, timeoutMs)
        timer.unref?.()
        return timer
    }

    private takePending(requestId: string): PendingSurfaceRequest | undefined {
        const pending = this.pending.get(requestId)
        if (!pending) return undefined
        clearTimeout(pending.timer)
        pending.signal?.removeEventListener('abort', pending.abort!)
        this.pending.delete(requestId)
        this.markSettled(requestId)
        return pending
    }

    private markSettled(requestId: string): void {
        this.settled.add(requestId)
        while (this.settled.size > MAX_SETTLED_BROWSER_SURFACE_REQUESTS) {
            const oldest = this.settled.values().next().value
            if (!oldest) break
            this.settled.delete(oldest)
        }
    }
}

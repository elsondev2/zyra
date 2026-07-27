import { randomUUID } from 'node:crypto'
import type {
    BrowserSurfaceOpenCompletion,
    BrowserSurfaceOpenRequest
} from '../../shared/agent-control/protocol'
import type { ControlPrincipal, ControlTarget } from '../../shared/agent-control/contracts'
import { AgentControlError } from './control-errors'

const BROWSER_SURFACE_OPEN_TIMEOUT_MS = 12_000
const MAX_PENDING_BROWSER_SURFACE_REQUESTS = 8

type PendingSurfaceRequest = {
    request: BrowserSurfaceOpenRequest
    resolve: (target: Extract<ControlTarget, { kind: 'zyra-browser' }>) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
    signal?: AbortSignal
    abort?: () => void
}

export class BrowserSurfaceHost {
    private readonly pending = new Map<string, PendingSurfaceRequest>()
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
    ): Promise<Extract<ControlTarget, { kind: 'zyra-browser' }>> {
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
                const pending = this.pending.get(request.requestId)
                if (!pending) return
                clearTimeout(pending.timer)
                pending.signal?.removeEventListener('abort', pending.abort!)
                this.pending.delete(request.requestId)
                reject(error)
            }
            const timer = setTimeout(() => rejectPending(new AgentControlError(
                'CONTROL_TIMEOUT',
                'The selected thread did not finish opening its Browser tab in time.'
            )), Math.max(1_000, Math.min(30_000, this.options.timeoutMs || BROWSER_SURFACE_OPEN_TIMEOUT_MS)))
            timer.unref?.()
            const abort = () => rejectPending(new AgentControlError('CONTROL_CANCELLED', 'Opening the Browser tab was cancelled.'))
            this.pending.set(request.requestId, { request, resolve, reject, timer, signal, abort })
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

    complete(value: BrowserSurfaceOpenCompletion): void {
        const requestId = String(value?.requestId || '')
        const pending = this.pending.get(requestId)
        if (!pending) throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The Browser open request is no longer active.')
        if (value.threadId !== pending.request.threadId || value.tabId !== pending.request.tabId) {
            throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser response does not match its requested thread and tab.')
        }
        clearTimeout(pending.timer)
        pending.signal?.removeEventListener('abort', pending.abort!)
        this.pending.delete(requestId)
        if (!value.success) {
            pending.reject(new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', value.error || 'The Browser tab could not be opened.'))
            return
        }
        let target: ControlTarget
        try {
            target = this.options.resolveTarget(value.targetId)
        } catch {
            pending.reject(new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The opened Browser tab did not register as a trusted control target.'))
            return
        }
        if (target.kind !== 'zyra-browser' || target.tabId !== pending.request.tabId) {
            pending.reject(new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser response resolved to a different control target.'))
            return
        }
        pending.resolve(target)
    }

    cancelPending(reason = 'Browser surface requests were cancelled.'): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.signal?.removeEventListener('abort', pending.abort!)
            pending.reject(new AgentControlError('CONTROL_CANCELLED', reason))
        }
        this.pending.clear()
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.cancelPending('The Browser surface host closed.')
    }
}

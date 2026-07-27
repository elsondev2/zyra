import { CONTROL_BOUNDS } from '../../shared/agent-control/policy'
import { AgentControlError } from './control-errors'

type QueueEntry = {
    run: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
    signal?: AbortSignal
}

type TargetQueue = { running: boolean; entries: QueueEntry[] }

export class ActionQueue {
    private readonly queues = new Map<string, TargetQueue>()
    private generation = 0

    enqueue<T>(targetId: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        const queue = this.queues.get(targetId) || { running: false, entries: [] }
        this.queues.set(targetId, queue)
        if (queue.entries.length >= CONTROL_BOUNDS.maxPendingActionsPerTarget) {
            return Promise.reject(new AgentControlError('CONTROL_QUEUE_FULL', 'Too many actions are pending for this target.', { retryable: true }))
        }
        const generation = this.generation
        return new Promise<T>((resolve, reject) => {
            queue.entries.push({
                run: async () => {
                    if (generation !== this.generation || signal?.aborted) throw new AgentControlError('CONTROL_CANCELLED', 'Control action was cancelled.')
                    return run()
                },
                resolve: resolve as (value: unknown) => void,
                reject,
                signal
            })
            void this.drain(targetId, queue)
        })
    }

    cancelAll(reason = 'Control actions were cancelled.'): void {
        this.generation += 1
        for (const queue of this.queues.values()) {
            for (const entry of queue.entries.splice(0)) {
                entry.reject(new AgentControlError('CONTROL_CANCELLED', reason))
            }
        }
    }

    private async drain(targetId: string, queue: TargetQueue): Promise<void> {
        if (queue.running) return
        queue.running = true
        try {
            while (queue.entries.length > 0) {
                const entry = queue.entries.shift()!
                if (entry.signal?.aborted) {
                    entry.reject(new AgentControlError('CONTROL_CANCELLED', 'Control action was cancelled.'))
                    continue
                }
                try {
                    entry.resolve(await entry.run())
                } catch (error) {
                    entry.reject(error)
                }
            }
        } finally {
            queue.running = false
            if (queue.entries.length === 0) this.queues.delete(targetId)
        }
    }
}

export type AssistantActivityDeltaStreamKind =
    | 'reasoning_text'
    | 'reasoning_summary_text'
    | 'command_output'
    | 'file_change_output'

export type AssistantActivityDeltaEntry = {
    sessionId: string
    threadId: string
    activityId: string
    turnId: string | null
    itemId?: string
    streamKind: AssistantActivityDeltaStreamKind
    delta: string
    occurredAt: string
}

export type AssistantActivityDeltaTarget = {
    threadId: string
    activityId?: string
}

type AssistantActivityDeltaBufferOptions = {
    flushDelayMs: number
    onFlush: (entry: AssistantActivityDeltaEntry) => void
}

function getBufferKey(threadId: string, activityId: string): string {
    return `${threadId}:${activityId}`
}

export class AssistantActivityDeltaBuffer {
    private readonly flushDelayMs: number
    private readonly onFlush: (entry: AssistantActivityDeltaEntry) => void
    private readonly entries = new Map<string, AssistantActivityDeltaEntry>()
    private flushTimer: NodeJS.Timeout | null = null

    constructor(options: AssistantActivityDeltaBufferOptions) {
        this.flushDelayMs = options.flushDelayMs
        this.onFlush = options.onFlush
    }

    queue(entry: AssistantActivityDeltaEntry): void {
        const key = getBufferKey(entry.threadId, entry.activityId)
        const existing = this.entries.get(key)
        if (existing) {
            existing.delta = `${existing.delta}${entry.delta}`
            existing.occurredAt = entry.occurredAt
            existing.turnId = entry.turnId
            existing.itemId = entry.itemId
            existing.sessionId = entry.sessionId
            existing.streamKind = entry.streamKind
            return
        }

        this.entries.set(key, { ...entry })
        this.scheduleFlush()
    }

    flush(target?: AssistantActivityDeltaTarget): void {
        const keys = target
            ? [...this.entries.entries()]
                .filter(([, entry]) => (
                    entry.threadId === target.threadId
                    && (!target.activityId || entry.activityId === target.activityId)
                ))
                .map(([key]) => key)
            : [...this.entries.keys()]

        for (const key of keys) {
            const entry = this.entries.get(key)
            if (!entry) continue
            this.entries.delete(key)
            this.onFlush(entry)
        }

        if (this.entries.size === 0) {
            this.clearFlushTimer()
        } else if (!target) {
            this.scheduleFlush()
        }
    }

    dispose(): void {
        this.flush()
        this.clearFlushTimer()
    }

    private scheduleFlush(): void {
        if (this.flushTimer) return
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null
            this.flush()
        }, this.flushDelayMs)
        this.flushTimer.unref?.()
    }

    private clearFlushTimer(): void {
        if (!this.flushTimer) return
        clearTimeout(this.flushTimer)
        this.flushTimer = null
    }
}

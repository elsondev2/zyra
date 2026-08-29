type AssistantTextDeltaEntry = {
    sessionId: string
    threadId: string
    messageId: string
    turnId: string | null
    delta: string
    occurredAt: string
}

type AssistantTextDeltaTarget = {
    threadId: string
    messageId?: string
}

type AssistantTextDeltaBufferOptions = {
    flushDelayMs: number
    onFlush: (entry: AssistantTextDeltaEntry) => void
}

function getBufferKey(threadId: string, messageId: string): string {
    return `${threadId}:${messageId}`
}

export class AssistantTextDeltaBuffer {
    private readonly flushDelayMs: number
    private readonly onFlush: (entry: AssistantTextDeltaEntry) => void
    private readonly entries = new Map<string, AssistantTextDeltaEntry>()
    private readonly startedMessages = new Map<string, Pick<AssistantTextDeltaEntry, 'threadId' | 'messageId'>>()
    private flushTimer: NodeJS.Timeout | null = null

    constructor(options: AssistantTextDeltaBufferOptions) {
        this.flushDelayMs = options.flushDelayMs
        this.onFlush = options.onFlush
    }

    queue(entry: AssistantTextDeltaEntry): void {
        const key = getBufferKey(entry.threadId, entry.messageId)
        if (!this.startedMessages.has(key)) {
            this.startedMessages.set(key, {
                threadId: entry.threadId,
                messageId: entry.messageId
            })
            this.onFlush({ ...entry })
            return
        }

        const existing = this.entries.get(key)
        if (existing) {
            existing.delta = `${existing.delta}${entry.delta}`
            existing.occurredAt = entry.occurredAt
            existing.turnId = entry.turnId
            existing.sessionId = entry.sessionId
            return
        }

        this.entries.set(key, { ...entry })
        this.scheduleFlush()
    }

    flush(target?: AssistantTextDeltaTarget): void {
        const keys = target
            ? [...this.entries.entries()]
                .filter(([, entry]) => (
                    entry.threadId === target.threadId
                    && (!target.messageId || entry.messageId === target.messageId)
                ))
                .map(([key]) => key)
            : [...this.entries.keys()]

        for (const key of keys) {
            const entry = this.entries.get(key)
            if (!entry) continue
            this.entries.delete(key)
            this.onFlush(entry)
        }

        if (target) {
            for (const [key, message] of this.startedMessages) {
                if (message.threadId !== target.threadId) continue
                if (target.messageId && message.messageId !== target.messageId) continue
                this.startedMessages.delete(key)
            }
        }

        if (this.entries.size === 0) {
            this.clearFlushTimer()
        } else if (!target) {
            this.scheduleFlush()
        }
    }

    dispose(): void {
        this.flush()
        this.startedMessages.clear()
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

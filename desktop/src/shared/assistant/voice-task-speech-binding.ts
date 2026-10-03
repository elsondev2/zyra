/** Correlates a dispatched private result with the provider's next logical reply.
 * No transcript wording is used: the voice may paraphrase the result freely.
 */
export class VoiceTaskSpeechBinding {
    private pendingTaskId: string | null = null
    private readonly taskByTurn = new Map<string, string>()
    private readonly seenAssistantTurns = new Set<string>()

    dispatched(taskId: string): void {
        this.pendingTaskId = taskId
    }

    bind(payload: Record<string, unknown>): string | undefined {
        // A user interruption can redirect the next response; never attach an
        // unrelated conversational reply to an unstarted task delivery.
        if (payload.type === 'input_audio_buffer.speech_started') this.pendingTaskId = null
        const turn = payload.turn && typeof payload.turn === 'object'
            ? payload.turn as Record<string, unknown> : null
        const id = typeof turn?.id === 'string' ? turn.id : typeof payload.turn_id === 'string' ? payload.turn_id : ''
        if (!id) return undefined
        if (payload.type === 'turn.created' && (turn?.role || payload.role) === 'assistant'
            && !this.seenAssistantTurns.has(id)) {
            this.seenAssistantTurns.add(id)
            if (this.pendingTaskId) {
                this.taskByTurn.set(id, this.pendingTaskId)
                this.pendingTaskId = null
                if (this.taskByTurn.size > 128) this.taskByTurn.delete(this.taskByTurn.keys().next().value!)
            }
            if (this.seenAssistantTurns.size > 128) this.seenAssistantTurns.delete(this.seenAssistantTurns.values().next().value!)
        }
        return this.taskByTurn.get(id)
    }

    clear(): void {
        this.pendingTaskId = null
        this.taskByTurn.clear()
        this.seenAssistantTurns.clear()
    }
}

import type { AssistantActivity } from '../../../shared/assistant/contracts'

export type VoiceStrongTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export function buildVoiceStrongTaskActivity(input: {
    taskId: string
    sourceProviderItemId: string
    startedAt: string
    occurredAt: string
    status: VoiceStrongTaskStatus
    summary: string
    detail: string
}): AssistantActivity {
    return {
        id: `voice-strong-task:${input.taskId}`,
        kind: 'voice.strong-task',
        tone: input.status === 'failed' ? 'error' : input.status === 'cancelled' ? 'warning' : 'tool',
        summary: input.summary,
        detail: input.detail.slice(0, 4000),
        turnId: input.taskId,
        createdAt: input.startedAt,
        payload: {
            status: input.status,
            taskId: input.taskId,
            source: 'voice',
            sourceProviderItemId: input.sourceProviderItemId,
            startedAt: input.startedAt,
            updatedAt: input.occurredAt,
            completedAt: input.status === 'running' ? null : input.occurredAt
        }
    }
}

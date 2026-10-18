import type { AssistantActivity } from './contracts'
import { isSupportingAgentMessage } from '../../../../src/threads/message-origin.mjs'

export { isSupportingAgentMessage }

export function projectThreadMessage(value: unknown, fallbackCreatedAt: string, timelineSequence?: number): AssistantActivity | null {
    if (!value || typeof value !== 'object' || isSupportingAgentMessage(value)) return null
    const data = value as Record<string, unknown>
    const messageId = typeof data.messageId === 'string' ? data.messageId : ''
    const senderThreadId = typeof data.senderThreadId === 'string' ? data.senderThreadId : ''
    const recipientThreadId = typeof data.recipientThreadId === 'string' ? data.recipientThreadId : ''
    const text = typeof data.text === 'string' ? data.text : ''
    if (!messageId || !senderThreadId || !recipientThreadId || !text) return null
    const senderLabel = typeof data.senderLabel === 'string' && data.senderLabel.trim() ? data.senderLabel.slice(0, 120) : 'Zyra'
    const createdAt = typeof data.createdAt === 'string' && Number.isFinite(Date.parse(data.createdAt)) ? data.createdAt : fallbackCreatedAt
    return {
        id: `zyra-thread-message:${messageId}`, kind: 'thread-message', tone: 'info',
        summary: `Message from ${senderLabel} in another thread`, detail: text,
        turnId: null, timelineSequence, createdAt,
        payload: { category: 'thread-message', messageId, senderThreadId, senderCanonicalThreadId: data.senderCanonicalThreadId, senderConversationKind: data.senderConversationKind, senderLabel, recipientThreadId, text, createdAt,
            ...(data.origin === 'delegation' ? { origin: 'delegation', taskLabel: data.taskLabel } : {}) },
    }
}

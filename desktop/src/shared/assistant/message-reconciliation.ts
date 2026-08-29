import type { AssistantMessage } from './contracts'
import {
    isSerializedClipboardAttachment,
    parseSerializedAssistantMessage,
    type SerializedAssistantAttachment
} from './message-attachments'

const USER_REPLAY_WINDOW_MS = 5 * 60_000
const ASSISTANT_REPLAY_WINDOW_MS = 10 * 60_000

function isCanonicalProjectedMessage(message: AssistantMessage): boolean {
    return !message.id.startsWith('assistant-message-') || message.id.includes('pi-message:')
}

function replayWindowMs(role: AssistantMessage['role']): number {
    return role === 'user' ? USER_REPLAY_WINDOW_MS : ASSISTANT_REPLAY_WINDOW_MS
}

function isImageAttachment(attachment: SerializedAssistantAttachment): boolean {
    return String(attachment.type || '').trim().toUpperCase() === 'IMAGE'
        || String(attachment.mime || '').trim().toLowerCase().startsWith('image/')
}

function isCanonicalMediaAttachment(attachment: SerializedAssistantAttachment): boolean {
    const path = String(attachment.path || '').replace(/\\/g, '/').toLowerCase()
    return /canonical zyra transcript/i.test(String(attachment.origin || ''))
        || path.includes('/assistant/canonical-media/')
}

function normalizedAttachmentSize(attachment: SerializedAssistantAttachment): string {
    return String(attachment.size || '').replace(/[^0-9]/g, '')
}

function imageReplaySignature(attachment: SerializedAssistantAttachment): string {
    return [
        'image',
        String(attachment.mime || '').trim().toLowerCase(),
        normalizedAttachmentSize(attachment)
    ].join(':')
}

function reconcileReplayAttachments(attachments: SerializedAssistantAttachment[]): SerializedAssistantAttachment[] {
    const reconciled: SerializedAssistantAttachment[] = []
    for (const attachment of attachments) {
        if (isImageAttachment(attachment) && isCanonicalMediaAttachment(attachment)) {
            const signature = imageReplaySignature(attachment)
            const matchingOriginal = reconciled.find((candidate) => (
                isImageAttachment(candidate)
                && !isCanonicalMediaAttachment(candidate)
                && imageReplaySignature(candidate) === signature
            ))
            if (matchingOriginal) continue
        }
        reconciled.push(attachment)
    }
    return reconciled
}

function messageReplayTextIdentity(text: string): string {
    const parsed = parseSerializedAssistantMessage(text)
    if (parsed.attachments.length === 0) return text
    const attachmentIdentity = reconcileReplayAttachments(parsed.attachments).map((attachment) => {
        if (isImageAttachment(attachment)) return imageReplaySignature(attachment)
        return [
            String(attachment.type || '').trim().toLowerCase(),
            String(attachment.mime || '').trim().toLowerCase(),
            normalizedAttachmentSize(attachment),
            String(attachment.name || '').trim().toLowerCase(),
            isSerializedClipboardAttachment(attachment) ? 'clipboard' : String(attachment.path || '').trim().toLowerCase()
        ].join(':')
    })
    return `${parsed.body}\u0000${attachmentIdentity.join('\u0001')}`
}

export function findAssistantMessageReplayDuplicateIds(messages: AssistantMessage[]): string[] {
    const canonicalMessages = messages.filter(isCanonicalProjectedMessage)
    const textIdentityById = new Map(messages.map((message) => [message.id, messageReplayTextIdentity(message.text)]))
    return messages.flatMap((message) => {
        if (isCanonicalProjectedMessage(message)) return []
        const createdAt = Date.parse(message.createdAt)
        if (!Number.isFinite(createdAt)) return []
        const duplicate = canonicalMessages
            .filter((candidate) => {
                const candidateCreatedAt = Date.parse(candidate.createdAt)
                if (
                    candidate.role !== message.role
                    || textIdentityById.get(candidate.id) !== textIdentityById.get(message.id)
                    || !Number.isFinite(candidateCreatedAt)
                    || Math.abs(candidateCreatedAt - createdAt) > replayWindowMs(message.role)
                ) return false
                if (message.role !== 'user') return true
                if (candidateCreatedAt < createdAt - 1_000) return false
                return !messages.some((boundary) => {
                    if (boundary.id === message.id || boundary.id === candidate.id || boundary.role !== 'user') return false
                    const boundaryCreatedAt = Date.parse(boundary.createdAt)
                    return Number.isFinite(boundaryCreatedAt)
                        && boundaryCreatedAt > createdAt
                        && boundaryCreatedAt < candidateCreatedAt
                })
            })
            .sort((left, right) => (
                Math.abs(Date.parse(left.createdAt) - createdAt) - Math.abs(Date.parse(right.createdAt) - createdAt)
                || left.createdAt.localeCompare(right.createdAt)
                || left.id.localeCompare(right.id)
            ))[0]
        return duplicate ? [message.id] : []
    })
}

export function reconcileAssistantMessageReplays(messages: AssistantMessage[]): AssistantMessage[] {
    const removedIds = new Set(findAssistantMessageReplayDuplicateIds(messages))
    return removedIds.size > 0 ? messages.filter((message) => !removedIds.has(message.id)) : messages
}

export function preserveCanonicalUserReplayBoundaries(
    existing: readonly AssistantMessage[],
    canonical: readonly AssistantMessage[]
): AssistantMessage[] {
    const optimisticUsers = existing.filter((message) => message.role === 'user' && !isCanonicalProjectedMessage(message))
    if (optimisticUsers.length === 0) return canonical.slice()
    return canonical.map((message) => {
        if (message.role !== 'user' || !isCanonicalProjectedMessage(message)) return message
        const replayIds = new Set(findAssistantMessageReplayDuplicateIds([...optimisticUsers, message]))
        const optimistic = optimisticUsers
            .filter((candidate) => replayIds.has(candidate.id))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0]
        if (!optimistic || optimistic.createdAt >= message.createdAt) return message
        return { ...message, createdAt: optimistic.createdAt }
    })
}

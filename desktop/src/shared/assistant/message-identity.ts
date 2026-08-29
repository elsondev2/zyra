import type { AssistantMessage } from './contracts'

const PI_ASSISTANT_MESSAGE_ID_PREFIX = 'pi-message:assistant:'
const DESKTOP_ASSISTANT_MESSAGE_ID_PREFIX = 'assistant-message-'

/**
 * Canonical presence reports Pi provider item IDs, while the Desktop read model
 * stores assistant messages under its domain ID. Keep both live and persisted
 * references in the Desktop namespace before comparing them.
 */
export function normalizeAssistantMessageReferenceId(reference: string | null | undefined): string | null {
    const normalized = String(reference || '').trim()
    if (!normalized) return null
    if (normalized.startsWith(PI_ASSISTANT_MESSAGE_ID_PREFIX)) {
        return `${DESKTOP_ASSISTANT_MESSAGE_ID_PREFIX}${normalized}`
    }
    return normalized
}

export function resolveAssistantMessageReferenceId(
    messages: readonly AssistantMessage[],
    reference: string | null | undefined
): string | null {
    const rawReference = String(reference || '').trim()
    if (!rawReference) return null
    const normalizedReference = normalizeAssistantMessageReferenceId(rawReference)
    const match = messages.find((message) => (
        message.role === 'assistant'
        && (
            message.id === rawReference
            || message.id === normalizedReference
            || message.providerItemId === rawReference
        )
    ))
    return match?.id || null
}

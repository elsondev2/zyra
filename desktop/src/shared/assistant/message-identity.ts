import type { AssistantMessage } from './contracts'
export { normalizeCanonicalMessageSourceId } from '../../../../src/message-identity.mjs'

const ZYRA_ASSISTANT_MESSAGE_ID_PREFIX = 'zyra-message:assistant:'
const LEGACY_PI_ASSISTANT_MESSAGE_ID_PREFIX = 'pi-message:assistant:'
const DESKTOP_ASSISTANT_MESSAGE_ID_PREFIX = 'assistant-message-'


/**
 * Canonical presence reports stable assistant message IDs, while the Desktop
 * read model stores assistant messages under its domain ID.
 */
export function normalizeAssistantMessageReferenceId(reference: string | null | undefined): string | null {
    const normalized = String(reference || '').trim()
        .replace(/^(assistant-message-(?:user-)?)?pi-message:(assistant|user):(\d+)$/, '$1zyra-message:$2:$3')
    if (!normalized) return null
    if (normalized.startsWith(ZYRA_ASSISTANT_MESSAGE_ID_PREFIX)
        || normalized.startsWith(LEGACY_PI_ASSISTANT_MESSAGE_ID_PREFIX)) {
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
            || normalizeAssistantMessageReferenceId(message.id) === normalizedReference
            || normalizeAssistantMessageReferenceId(message.providerItemId) === normalizedReference
        )
    ))
    return match?.id || null
}

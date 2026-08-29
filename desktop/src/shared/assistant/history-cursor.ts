import type { AssistantHistoryCursor } from './contracts/read-model'
import type { AssistantTimelineOrderKey } from './timeline-order'

const ASSISTANT_HISTORY_CURSOR_VERSION = 1

export type DecodedAssistantHistoryCursor = AssistantTimelineOrderKey & {
    version: number
    threadId: string
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function encodeAssistantHistoryCursor(
    threadId: string,
    key: AssistantTimelineOrderKey
): AssistantHistoryCursor {
    const payload = JSON.stringify({
        version: ASSISTANT_HISTORY_CURSOR_VERSION,
        threadId,
        ...key
    })
    return bytesToBase64Url(new TextEncoder().encode(payload))
}

export function decodeAssistantHistoryCursor(
    threadId: string,
    value: string | null | undefined
): DecodedAssistantHistoryCursor | null {
    if (!value) return null
    if (value.length > 4_096) throw new Error('Assistant history cursor is malformed or stale. Reload the newest page.')
    try {
        const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Partial<DecodedAssistantHistoryCursor>
        if (
            parsed.version !== ASSISTANT_HISTORY_CURSOR_VERSION
            || parsed.threadId !== threadId
            || typeof parsed.createdAt !== 'string'
            || typeof parsed.id !== 'string'
            || typeof parsed.kindRank !== 'number'
            || (parsed.timelineSequence !== null && typeof parsed.timelineSequence !== 'number')
        ) throw new Error('invalid')
        return parsed as DecodedAssistantHistoryCursor
    } catch {
        throw new Error('Assistant history cursor is malformed or stale. Reload the newest page.')
    }
}

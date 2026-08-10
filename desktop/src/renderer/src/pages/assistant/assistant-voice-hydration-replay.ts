import type { AssistantMessage } from '@shared/assistant/contracts'
import type { InstructorTranscriptEntry } from './instructor-voice-transcript'

export function filterVoiceHydrationReplay(
    entries: InstructorTranscriptEntry[],
    canonicalMessages: AssistantMessage[],
    voiceStartedAt: string | null
): InstructorTranscriptEntry[] {
    const startedAt = Date.parse(voiceStartedAt || '')
    if (!Number.isFinite(startedAt) || entries.length === 0 || canonicalMessages.length === 0) return entries

    const replayBudget = new Map<string, number>()
    const replayTextsByRole = new Map<'user' | 'assistant', string[]>([
        ['user', []],
        ['assistant', []]
    ])
    for (const message of canonicalMessages) {
        const createdAt = Date.parse(message.createdAt)
        if (Number.isFinite(createdAt) && createdAt > startedAt) continue
        if (message.role !== 'user' && message.role !== 'assistant') continue
        const normalized = normalizeTranscriptText(message.text)
        if (!normalized) continue
        const key = replayKey(message.role, normalized)
        replayBudget.set(key, (replayBudget.get(key) || 0) + 1)
        replayTextsByRole.get(message.role)?.push(normalized)
    }

    return entries.filter((entry) => {
        const role = entry.role === 'user' ? 'user' : 'assistant'
        const normalized = normalizeTranscriptText(entry.text)
        if (!normalized) return true
        const key = replayKey(role, normalized)
        const exactRemaining = replayBudget.get(key) || 0
        if (exactRemaining > 0) {
            if (entry.final) {
                if (exactRemaining === 1) replayBudget.delete(key)
                else replayBudget.set(key, exactRemaining - 1)
            }
            return false
        }
        if (!entry.final) {
            const possibleReplay = replayTextsByRole.get(role)?.some((text) => text.startsWith(normalized))
            if (possibleReplay) return false
        }
        return true
    })
}

function replayKey(role: 'user' | 'assistant', normalizedText: string): string {
    return `${role}\0${normalizedText}`
}

function normalizeTranscriptText(value: string): string {
    return value.replace(/\s+/gu, ' ').trim()
}

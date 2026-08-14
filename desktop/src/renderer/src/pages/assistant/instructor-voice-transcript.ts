export interface InstructorTranscriptImage {
    id: string
    name: string
    dataUrl: string
}

export interface InstructorTranscriptEntry {
    id: string
    role: string
    text: string
    final: boolean
    images?: InstructorTranscriptImage[]
}

type RealtimeTurn = {
    id: string
    role: string
    transcript: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function readRealtimeTurn(value: unknown): RealtimeTurn | null {
    const turn = asRecord(value)
    const id = asNonEmptyString(turn?.id)
    const role = asNonEmptyString(turn?.role)
    if (!id || (role !== 'user' && role !== 'assistant')) return null
    return {
        id,
        role,
        transcript: typeof turn?.transcript === 'string' ? turn.transcript : ''
    }
}

function appendTranscriptDelta(currentValue: string, deltaValue: string): string {
    const current = currentValue
    const delta = current ? deltaValue : deltaValue.trimStart()
    if (!current) return delta
    if (delta.startsWith(current)) return delta
    if (current.endsWith(delta)) return current
    const maxOverlap = Math.min(current.length, delta.length)
    for (let size = maxOverlap; size > 0; size -= 1) {
        if (current.slice(-size) === delta.slice(0, size)) return `${current}${delta.slice(size)}`
    }
    return `${current}${delta}`
}

function updateEntry(
    entries: InstructorTranscriptEntry[],
    id: string,
    update: (entry: InstructorTranscriptEntry) => InstructorTranscriptEntry
): InstructorTranscriptEntry[] {
    const index = entries.findIndex((entry) => entry.id === id)
    if (index < 0) return entries
    const next = entries.slice()
    next[index] = update(entries[index])
    return next
}

/**
 * Applies the identity-bearing transcript events emitted on Codex realtime v3's
 * WebRTC data channel. Turn IDs are the source of truth, so replaying a turn
 * updates its existing bubble while an intentional repeat receives a new ID.
 */
export function applyRealtimeTranscriptEvent(
    entries: InstructorTranscriptEntry[],
    value: unknown
): InstructorTranscriptEntry[] {
    const payload = asRecord(value)
    const type = asNonEmptyString(payload?.type)

    if (type === 'turn.created') {
        const turn = readRealtimeTurn(payload?.turn)
        if (!turn) return entries
        const existing = entries.find((entry) => entry.id === turn.id)
        if (existing) {
            if (existing.final) return entries
            return updateEntry(entries, turn.id, (entry) => ({
                ...entry,
                role: turn.role,
                text: turn.transcript.trimStart() || entry.text
            }))
        }
        return [...entries, {
            id: turn.id,
            role: turn.role,
            text: turn.transcript.trimStart(),
            final: false
        }]
    }

    if (type === 'turn.delta') {
        const turnId = asNonEmptyString(payload?.turn_id)
        const delta = typeof payload?.delta === 'string' ? payload.delta : ''
        if (!turnId || !delta) return entries
        return updateEntry(entries, turnId, (entry) => entry.final ? entry : {
            ...entry,
            text: appendTranscriptDelta(entry.text, delta)
        })
    }

    if (type === 'turn.done') {
        const turn = readRealtimeTurn(payload?.turn)
        if (!turn) return entries
        const text = turn.transcript.trim()
        const existing = entries.find((entry) => entry.id === turn.id)
        if (existing) {
            return updateEntry(entries, turn.id, (entry) => ({
                ...entry,
                role: turn.role,
                text: text || entry.text,
                final: true
            }))
        }
        return [...entries, {
            id: turn.id,
            role: turn.role,
            text,
            final: true
        }]
    }

    const item = asRecord(payload?.item)
    const itemId = asNonEmptyString(item?.id)
        || asNonEmptyString(payload?.item_id)
        || asNonEmptyString(payload?.turn_id)
    const explicitRole = asNonEmptyString(item?.role) || asNonEmptyString(payload?.role)
    if (type === 'conversation.item.created' && itemId && (explicitRole === 'user' || explicitRole === 'assistant')) {
        if (entries.some((entry) => entry.id === itemId)) return entries
        return [...entries, { id: itemId, role: explicitRole, text: '', final: false }]
    }
    if (!itemId) return entries
    const role = explicitRole === 'user' || type?.includes('input_audio_transcription')
        ? 'user'
        : 'assistant'
    const delta = typeof payload?.delta === 'string' ? payload.delta : ''
    if (type?.endsWith('.transcript.delta')
        || type?.endsWith('.audio_transcript.delta')
        || type?.endsWith('.input_audio_transcription.delta')) {
        if (!delta) return entries
        const existing = entries.find((entry) => entry.id === itemId)
        if (!existing) return [...entries, { id: itemId, role, text: delta.trimStart(), final: false }]
        return updateEntry(entries, itemId, (entry) => entry.final ? entry : {
            ...entry,
            role,
            text: appendTranscriptDelta(entry.text, delta)
        })
    }
    if (type?.endsWith('.transcript.done')
        || type?.endsWith('.audio_transcript.done')
        || type?.endsWith('.input_audio_transcription.completed')) {
        const text = String(payload?.transcript ?? payload?.text ?? '').trim()
        const existing = entries.find((entry) => entry.id === itemId)
        if (!existing) return text ? [...entries, { id: itemId, role, text, final: true }] : entries
        return updateEntry(entries, itemId, (entry) => ({
            ...entry,
            role,
            text: text || entry.text,
            final: true
        }))
    }

    return entries
}

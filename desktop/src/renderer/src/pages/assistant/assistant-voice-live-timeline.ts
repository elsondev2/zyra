import type {
    AssistantActivity,
    AssistantMessage,
    AssistantProposedPlan
} from '@shared/assistant/contracts'
import type { InstructorTranscriptEntry } from './instructor-voice-transcript'
import { filterVoiceHydrationReplay } from './assistant-voice-hydration-replay'

export type VoiceLiveTimelineProjection = {
    messages: AssistantMessage[]
    anchors: Map<string, number>
}

export function projectVoiceLiveTimelineMessages(input: {
    transcript: InstructorTranscriptEntry[]
    canonicalMessages: AssistantMessage[]
    activities?: AssistantActivity[]
    proposedPlans?: AssistantProposedPlan[]
    voiceStartedAt: string | null
    previousAnchors?: ReadonlyMap<string, number>
    nowMs?: number
}): VoiceLiveTimelineProjection {
    const committedProviderItems = new Set(input.canonicalMessages
        .map((message) => message.providerItemId)
        .filter((value): value is string => Boolean(value)))
    const projectableTranscript = filterVoiceHydrationReplay(
        input.transcript,
        input.canonicalMessages,
        input.voiceStartedAt
    ).filter((entry) => (
        entry.text.trim()
        && !entry.id.startsWith('local-composer-')
        && !committedProviderItems.has(entry.id)
    ))

    const canonicalEntries = [
        ...input.canonicalMessages,
        ...(input.activities || []),
        ...(input.proposedPlans || [])
    ]
    const latestCanonicalMs = canonicalEntries.reduce((latest, entry) => {
        const createdAt = Date.parse(entry.createdAt)
        return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest
    }, 0)
    const highestSequence = canonicalEntries.reduce(
        (highest, entry) => Math.max(highest, entry.timelineSequence || 0),
        0
    )
    const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now()
    const anchors = new Map<string, number>()
    let previousAnchor = latestCanonicalMs

    const messages = projectableTranscript.map((entry, index): AssistantMessage => {
        const role = entry.role === 'user' ? 'user' : 'assistant'
        const anchorKey = `${role}:${entry.id}`
        const previous = input.previousAnchors?.get(anchorKey)
        const anchor = Math.max(
            Number.isFinite(previous) ? Number(previous) : nowMs + index,
            latestCanonicalMs + index + 1,
            previousAnchor + 1
        )
        previousAnchor = anchor
        anchors.set(anchorKey, anchor)
        const createdAt = new Date(anchor).toISOString()
        return {
            id: `voice-live-${anchorKey}`,
            role,
            text: entry.text,
            turnId: `voice-live-turn-${anchorKey}`,
            streaming: !entry.final,
            timelineSequence: highestSequence + index + 1,
            providerItemId: entry.id,
            modality: 'voice',
            createdAt,
            updatedAt: new Date(anchor + Math.max(1, entry.text.length)).toISOString()
        }
    })

    return { messages, anchors }
}

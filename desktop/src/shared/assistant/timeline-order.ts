import type { AssistantActivity, AssistantMessage, AssistantProposedPlan } from './contracts/read-model'

export type AssistantTimelineRecordKind = 'message' | 'activity' | 'plan'

export interface AssistantTimelineOrderKey {
    createdAt: string
    timelineSequence: number | null
    kindRank: number
    id: string
}

export const ASSISTANT_TIMELINE_KIND_RANK: Record<AssistantTimelineRecordKind, number> = {
    message: 0,
    activity: 1,
    plan: 2
}

export function normalizeAssistantTimelineSequence(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : -1
}

export function compareAssistantTimelineStrings(left: string, right: string): number {
    if (left === right) return 0
    return left < right ? -1 : 1
}

export function compareAssistantTimelineOrderKeys(
    left: AssistantTimelineOrderKey,
    right: AssistantTimelineOrderKey
): number {
    return compareAssistantTimelineStrings(left.createdAt, right.createdAt)
        || normalizeAssistantTimelineSequence(left.timelineSequence) - normalizeAssistantTimelineSequence(right.timelineSequence)
        || left.kindRank - right.kindRank
        || compareAssistantTimelineStrings(left.id, right.id)
}

export function getAssistantTimelineOrderKey(
    kind: AssistantTimelineRecordKind,
    record: AssistantMessage | AssistantActivity | AssistantProposedPlan
): AssistantTimelineOrderKey {
    return {
        createdAt: record.createdAt,
        timelineSequence: record.timelineSequence ?? null,
        kindRank: ASSISTANT_TIMELINE_KIND_RANK[kind],
        id: record.id
    }
}

export function compareAssistantTimelineRecords(
    left: { kind: AssistantTimelineRecordKind; record: AssistantMessage | AssistantActivity | AssistantProposedPlan },
    right: { kind: AssistantTimelineRecordKind; record: AssistantMessage | AssistantActivity | AssistantProposedPlan }
): number {
    return compareAssistantTimelineOrderKeys(
        getAssistantTimelineOrderKey(left.kind, left.record),
        getAssistantTimelineOrderKey(right.kind, right.record)
    )
}

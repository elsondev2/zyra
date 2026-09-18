type Event = Record<string, unknown>
type ReplayEntry = { sequence?: number; event?: unknown; requestContext?: { turnId?: string; localThreadId?: string } | null }
/** Recover current attention when a bounded journal no longer contains its opening event. */
export function recoverAttachmentReplay(attachment: Record<string, unknown>, after: number): { entries: ReplayEntry[]; resetWatermark: boolean } {
    const replay = Array.isArray(attachment.replay) ? attachment.replay as ReplayEntry[] : []
    const latest = Number(attachment.latestSequence) || 0
    const first = replay.length ? Math.min(...replay.map(entry => Number(entry.sequence) || 0)) : latest + 1
    const resetWatermark = latest < after
    const gap = resetWatermark || (latest > after && first > after + 1) || replay.some(entry => (entry.event as Event)?.type === 'zyra_server_event_omitted')
    if (!gap) return { entries: replay, resetWatermark }
    const context = attachment.activeRequestContext as ReplayEntry['requestContext']
    const recovery: ReplayEntry[] = []
    for (const event of [
        ...(Array.isArray(attachment.pendingTools) ? attachment.pendingTools as Event[] : []),
        ...(Array.isArray(attachment.pendingAttention) ? attachment.pendingAttention as Event[] : [])
    ]) {
        const present = replay.some(entry => {
            const candidate = entry.event as Event
            return candidate?.type === event.type && (event.requestId ? candidate.requestId === event.requestId : candidate.toolCallId === event.toolCallId)
        })
        if (!present) recovery.push({ event, requestContext: context })
    }
    const live = attachment.liveMessage as Event | undefined
    if (live && !replay.some(entry => {
        const message = (entry.event as Event)?.message as Event | undefined
        return message && message.role === live.role && (live.id ? message.id === live.id : live.timestamp ? message.timestamp === live.timestamp : JSON.stringify(message) === JSON.stringify(live))
    })) {
        recovery.push({ event: { type: 'message_update', message: attachment.liveMessage }, requestContext: context })
    }
    return { entries: [...replay, ...recovery], resetWatermark }
}

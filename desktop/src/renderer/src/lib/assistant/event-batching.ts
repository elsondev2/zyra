import type { AssistantDomainEvent } from '@shared/assistant/contracts'

function readDelta(event: AssistantDomainEvent): string {
    return String(event.payload['delta'] || '')
}

function readMessageId(event: AssistantDomainEvent): string {
    return String(event.payload['messageId'] || '')
}

function readActivityId(event: AssistantDomainEvent): string {
    const activity = event.payload['activity']
    if (!activity || typeof activity !== 'object') return ''
    return String((activity as Record<string, unknown>)['id'] || '')
}

export function collapseAssistantDeltaEvents(events: AssistantDomainEvent[]): AssistantDomainEvent[] {
    if (events.length < 2) return events

    const collapsed: AssistantDomainEvent[] = []

    for (const event of events) {
        const previous = collapsed[collapsed.length - 1]
        if (
            previous
            && previous.type === 'thread.message.assistant.delta'
            && event.type === 'thread.message.assistant.delta'
            && previous.threadId === event.threadId
            && readMessageId(previous) === readMessageId(event)
        ) {
            collapsed[collapsed.length - 1] = {
                ...event,
                payload: {
                    ...event.payload,
                    delta: `${readDelta(previous)}${readDelta(event)}`
                }
            }
            continue
        }

        if (
            previous
            && previous.type === 'thread.activity.appended'
            && event.type === 'thread.activity.appended'
            && previous.threadId === event.threadId
            && readActivityId(previous)
            && readActivityId(previous) === readActivityId(event)
        ) {
            collapsed[collapsed.length - 1] = event
            continue
        }

        collapsed.push(event)
    }

    return collapsed
}

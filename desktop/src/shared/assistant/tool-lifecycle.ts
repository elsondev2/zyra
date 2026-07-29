import type { AssistantDomainEvent } from './contracts'

export type AssistantToolLifecyclePhase = 'start' | 'update' | 'end'

function readActivityPayload(event: AssistantDomainEvent): Record<string, unknown> | null {
    if (event.type !== 'thread.activity.appended') return null
    const activity = event.payload['activity']
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return null
    const payload = (activity as Record<string, unknown>)['payload']
    return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null
}

export function getAssistantToolLifecyclePhase(event: AssistantDomainEvent): AssistantToolLifecyclePhase | null {
    const phase = readActivityPayload(event)?.['toolLifecyclePhase']
    return phase === 'start' || phase === 'update' || phase === 'end' ? phase : null
}

export function isAssistantToolLifecycleStartEvent(event: AssistantDomainEvent): boolean {
    return getAssistantToolLifecyclePhase(event) === 'start'
}

export type AssistantInterruption = {
    kind: 'stopped' | 'interrupted'
    source: 'agent' | 'user' | 'system'
    threadId?: string
    reason?: 'turn-limit'
}

export function readAssistantInterruption(value: unknown): AssistantInterruption | null {
    if (!value || typeof value !== 'object') return null
    const data = value as Record<string, unknown>
    if (!['stopped', 'interrupted'].includes(String(data.kind)) || !['agent', 'user', 'system'].includes(String(data.source))) return null
    return { kind: data.kind as AssistantInterruption['kind'], source: data.source as AssistantInterruption['source'], ...(typeof data.threadId === 'string' ? { threadId: data.threadId } : {}), ...(data.reason === 'turn-limit' ? { reason: 'turn-limit' as const } : {}) }
}

export function getAssistantInterruptionLabel(value: unknown): string {
    const interruption = readAssistantInterruption(value)
    const verb = interruption?.kind === 'stopped' ? 'Stopped' : 'Interrupted'
    if (interruption?.reason === 'turn-limit') return 'Stopped · Turn limit reached'
    return interruption?.source === 'agent' ? `${verb} by another agent` : verb
}

import type { WorkflowRunState } from '@shared/assistant/contracts'

export type AssistantWorkflowAvatarStyle = 'loops' | 'waves'

export interface AssistantWorkflowIdentity {
    seed: string
    name: string
    avatarStyle: AssistantWorkflowAvatarStyle
}

function stableHash(value: string): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

export function humanizeWorkflowValue(value: string): string {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_.:/]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Workflow'
}

export function resolveAssistantWorkflowIdentity(
    run: Pick<WorkflowRunState, 'workflowRunId' | 'definitionName'>
): AssistantWorkflowIdentity {
    const seed = `zyra-workflow:${run.workflowRunId}`
    return {
        seed,
        name: humanizeWorkflowValue(run.definitionName),
        avatarStyle: stableHash(seed) % 2 === 0 ? 'loops' : 'waves'
    }
}

export function getAssistantWorkflowProgress(run: WorkflowRunState): {
    completedCalls: number
    totalCalls: number
    completedPhases: number
    totalPhases: number
    percentage: number
} {
    const calls = Object.values(run.calls)
    const phases = Object.values(run.phases)
    const completedCalls = calls.filter((call) => call.status === 'completed' || call.status === 'cached').length
    const completedPhases = phases.filter((phase) => phase.status === 'completed' || phase.status === 'cached').length
    const totalCalls = Math.max(calls.length, completedCalls)
    const totalPhases = Math.max(phases.length, completedPhases)
    const numerator = totalCalls > 0 ? completedCalls : completedPhases
    const denominator = totalCalls > 0 ? totalCalls : totalPhases
    const percentage = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
    return { completedCalls, totalCalls, completedPhases, totalPhases, percentage }
}

export function formatAssistantWorkflowElapsed(run: Pick<WorkflowRunState, 'startedAt' | 'completedAt' | 'createdAt'>): string {
    const startedAt = Date.parse(run.startedAt || run.createdAt)
    const completedAt = run.completedAt ? Date.parse(run.completedAt) : Date.now()
    if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return '—'
    const seconds = Math.max(0, Math.round((completedAt - startedAt) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export function formatAssistantWorkflowCost(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value <= 0) return '$0.00'
    const digits = value < 0.01 ? 4 : 2
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(value)
}

export function formatAssistantWorkflowInput(value: unknown): string {
    if (value == null) return 'None'
    if (typeof value === 'string') return value.trim().slice(0, 240) || 'Empty'
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
        const items = value.slice(0, 6).map((item) => formatAssistantWorkflowInput(item))
        return `${items.join(', ')}${value.length > items.length ? ` +${value.length - items.length} more` : ''}`
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).slice(0, 6)
        if (!entries.length) return 'Empty'
        return entries.map(([key, entry]) => `${humanizeWorkflowValue(key)}: ${formatAssistantWorkflowInput(entry)}`).join(' · ')
    }
    return 'Unavailable'
}

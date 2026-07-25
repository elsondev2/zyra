import type { AssistantActivity, FileChangeKind } from '@shared/assistant/contracts'
import { getActivityPatch, type ParsedUserAttachment } from './assistant-timeline-helpers'

export interface AssistantDiffTarget {
    activityId: string
    turnId?: string | null
    filePath: string
    displayPath: string
    patch: string
    previousPath?: string
    createdAt?: string
    isNew?: boolean
    changeKind?: FileChangeKind
    provisional?: boolean
    truncated?: boolean
    unavailableReason?: string
}

export interface AssistantDiffTurnFile {
    target: AssistantDiffTarget
    additions: number
    deletions: number
}

export interface AssistantDiffTurn {
    id: string
    number: number
    prompt: string
    promptAttachments: ParsedUserAttachment[]
    response: string
    agentLabel?: string
    historyUnavailable: boolean
    detailLoaded?: boolean
    searchText: string
    createdAt: string
    updatedAt: string
    files: AssistantDiffTurnFile[]
    changes: AssistantDiffTurnFile[]
    additions: number
    deletions: number
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizePath(value: unknown): string {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function readChange(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

export function resolveAssistantDiffTarget(
    selected: AssistantDiffTarget,
    activity: AssistantActivity | null
): AssistantDiffTarget {
    if (!activity || activity.id !== selected.activityId) return selected
    const payload = activity.payload || {}
    const selectedPath = normalizePath(selected.filePath)
    const changes = Array.isArray(payload.changes) ? payload.changes.map(readChange).filter(Boolean) as Record<string, unknown>[] : []
    const change = changes.find((entry) => {
        const path = normalizePath(entry.path || entry.filePath || entry.file_path)
        const previousPath = normalizePath(entry.previousPath || entry.previous_path)
        return path === selectedPath || previousPath === selectedPath
    })
    const patch = getActivityPatch(activity) || selected.patch
    const status = String(payload.status || '').toLowerCase().replace(/[-_\s]/g, '')
    const authoritative = payload.authoritative === true
    return {
        ...selected,
        patch,
        previousPath: readString(change?.previousPath || change?.previous_path) || selected.previousPath,
        isNew: change?.isNew === true || change?.kind === 'add' || selected.isNew,
        changeKind: change?.kind === 'add' || change?.kind === 'delete' || change?.kind === 'update' || change?.kind === 'move'
            ? change.kind
            : selected.changeKind,
        provisional: status === 'running' || status === 'inprogress' || !authoritative,
        truncated: payload.truncated === true,
        unavailableReason: readString(payload.diffUnavailableReason)
    }
}

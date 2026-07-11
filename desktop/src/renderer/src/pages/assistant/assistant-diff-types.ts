import type { AssistantActivity } from '@shared/assistant/contracts'
import { buildRenderableFileChangePatch } from '@shared/assistant/contracts/file-change'

export interface AssistantDiffTarget {
    activityId: string
    filePath: string
    displayPath: string
    patch: string
    previousPath?: string
    createdAt?: string
    isNew?: boolean
    provisional?: boolean
    truncated?: boolean
    unavailableReason?: string
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
    const rawPatch = readString(payload.patch)
        || readString(payload.previewPatch)
        || readString(change?.diff)
    const patch = buildRenderableFileChangePatch(
        rawPatch,
        payload.changes,
        Array.isArray(payload.paths) ? payload.paths.filter((entry): entry is string => typeof entry === 'string') : [selected.filePath]
    ) || rawPatch || selected.patch
    const status = String(payload.status || '').toLowerCase().replace(/[-_\s]/g, '')
    const authoritative = payload.authoritative === true
    return {
        ...selected,
        patch,
        previousPath: readString(change?.previousPath || change?.previous_path) || selected.previousPath,
        isNew: change?.isNew === true || change?.kind === 'add' || selected.isNew,
        provisional: status === 'running' || status === 'inprogress' || !authoritative,
        truncated: payload.truncated === true,
        unavailableReason: readString(payload.diffUnavailableReason)
    }
}

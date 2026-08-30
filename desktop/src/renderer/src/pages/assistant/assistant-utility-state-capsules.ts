import type { UIEvent } from 'react'
import type {
    AssistantUtilityDiffSelection,
    AssistantUtilityScrollAnchor,
    AssistantUtilityStateCapsule,
    AssistantUtilityWorkspaceKind
} from '@shared/assistant/utility-window'
import { sanitizeAssistantUtilityStateCapsule } from '@shared/assistant/utility-window'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'

export function capsuleWorkspaceForInspectorKind(kind: string): AssistantUtilityStateCapsule['workspace'] | null {
    if (kind === 'control') return 'details'
    if (kind === 'review') return 'diff'
    if (kind === 'explorer' || kind === 'resources' || kind === 'agents' || kind === 'turn') return kind
    return null
}

export function sanitizeRendererCapsule(
    capsule: AssistantUtilityStateCapsule | null | undefined,
    workspace: AssistantUtilityWorkspaceKind
): AssistantUtilityStateCapsule | undefined {
    return sanitizeAssistantUtilityStateCapsule(capsule, workspace)
}

export function toAssistantUtilityDiffSelection(target: AssistantDiffTarget | null | undefined): AssistantUtilityDiffSelection | undefined {
    if (!target?.filePath) return undefined
    return {
        turnId: target.turnId || undefined,
        activityId: target.activityId || undefined,
        filePath: target.filePath,
        previousPath: target.previousPath || undefined
    }
}

function normalizePath(value: string | undefined): string {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

export function resolveAssistantUtilityDiffSelection(
    turns: AssistantDiffTurn[],
    selection: AssistantUtilityDiffSelection | null | undefined
): AssistantDiffTarget | null {
    if (!selection) return null
    const wantedPath = normalizePath(selection.filePath)
    const wantedPreviousPath = normalizePath(selection.previousPath)
    const candidates = selection.turnId
        ? turns.filter((turn) => turn.id === selection.turnId)
        : turns
    for (const turn of candidates) {
        for (const change of turn.changes) {
            const target = change.target
            if (selection.activityId && target.activityId === selection.activityId) return target
            const paths = [target.filePath, target.previousPath].map(normalizePath)
            if (paths.includes(wantedPath) || (wantedPreviousPath && paths.includes(wantedPreviousPath))) return target
        }
        for (const file of turn.files) {
            const target = file.target
            const paths = [target.filePath, target.previousPath].map(normalizePath)
            if (paths.includes(wantedPath) || (wantedPreviousPath && paths.includes(wantedPreviousPath))) return target
        }
    }
    return null
}

function scrollKey(element: HTMLElement): string | null {
    const explicit = element.dataset.assistantCapsuleScroll
        || element.closest<HTMLElement>('[data-assistant-capsule-scroll]')?.dataset.assistantCapsuleScroll
    if (explicit) return explicit.slice(0, 192)
    const ariaLabel = element.getAttribute('aria-label')
    if (ariaLabel) return `aria:${ariaLabel}`.slice(0, 192)
    const role = element.getAttribute('role')
    if (role === 'tree' || role === 'table' || role === 'listbox') return `role:${role}`
    return null
}

export function captureAssistantUtilityScrollAnchor(event: UIEvent<HTMLElement>): AssistantUtilityScrollAnchor | null {
    const element = event.target
    if (!(element instanceof HTMLElement)) return null
    const key = scrollKey(element)
    if (!key || element.scrollHeight <= element.clientHeight) return null
    return { key, offset: Math.max(0, Math.floor(element.scrollTop)) }
}

export function restoreAssistantUtilityScrollAnchor(root: HTMLElement | null, anchor: AssistantUtilityScrollAnchor | undefined): void {
    if (!root || !anchor) return
    const apply = () => {
        const candidates = [root, ...root.querySelectorAll<HTMLElement>('*')]
        const marker = candidates.find((candidate) => (
            candidate.dataset.assistantCapsuleScroll === anchor.key
            || (!candidate.closest<HTMLElement>('[data-assistant-capsule-scroll]') && scrollKey(candidate) === anchor.key)
        ))
        if (!marker) return
        const element = marker.scrollHeight > marker.clientHeight
            ? marker
            : [marker, ...marker.querySelectorAll<HTMLElement>('*')].find((candidate) => candidate.scrollHeight > candidate.clientHeight)
        if (element) element.scrollTop = Math.min(anchor.offset, Math.max(0, element.scrollHeight - element.clientHeight))
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(apply))
}

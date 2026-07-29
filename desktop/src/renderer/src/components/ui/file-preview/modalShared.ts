import type { DevScopePreviewTerminalSessionSummary } from '@shared/contracts/devscope-api'
import type { GitLineMarker } from './gitDiff'
import type { PreviewFile } from './types'

export type PendingIntent = 'close' | 'preview' | 'external'
export type LocalDiffPreview = {
    additions: number
    deletions: number
    markers: GitLineMarker[]
}
export type PythonOutputSource = 'stdout' | 'stderr' | 'system'
export type PythonOutputEntry = {
    id: number
    source: PythonOutputSource
    text: string
    at: number
}
export type PreviewTerminalSessionItem = DevScopePreviewTerminalSessionSummary & {
    hasUnreadOutput?: boolean
}
export type PreviewTerminalState = 'idle' | 'connecting' | 'active' | 'exited' | 'error'
export type TerminalPanelPhase = 'hidden' | 'entering' | 'visible' | 'exiting'

export const LEFT_PANEL_MIN_WIDTH = 256
export const LEFT_PANEL_MAX_WIDTH = 460
export const RIGHT_PANEL_MIN_WIDTH = 240
export const RIGHT_PANEL_MAX_WIDTH = 520
export const PYTHON_OUTPUT_MAX_CHARS = 200_000
export const PYTHON_OUTPUT_MIN_HEIGHT = 96
export const PREVIEW_TERMINAL_MIN_HEIGHT = 140
export const TERMINAL_PANEL_ANIMATION_MS = 220

export function countLines(value: string): number {
    if (!value) return 0

    let count = 1
    for (let index = 0; index < value.length; index += 1) {
        if (value.charCodeAt(index) === 10) count += 1
    }
    return count
}

export function createPythonPreviewSessionId(): string {
    return `py-prev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createPreviewTerminalSessionId(): string {
    return `preview-term-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function readCssVariable(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || fallback
}

export function formatRelativeActivity(timestamp: number): string {
    const deltaMs = Math.max(0, Date.now() - timestamp)
    const seconds = Math.floor(deltaMs / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    return `${hours}h`
}

export function mapTerminalStatusToState(status?: string | null): PreviewTerminalState {
    if (status === 'running') return 'active'
    if (status === 'error') return 'error'
    if (status === 'exited') return 'exited'
    return 'idle'
}

export function isEditableFileType(fileType: PreviewFile['type']): boolean {
    return fileType === 'md'
        || fileType === 'json'
        || fileType === 'csv'
        || fileType === 'code'
        || fileType === 'text'
        || fileType === 'html'
}

export function buildLocalDiffPreview(previousContent: string, nextContent: string): LocalDiffPreview {
    const previousLines = previousContent.split(/\r?\n/)
    const nextLines = nextContent.split(/\r?\n/)

    let prefix = 0
    const minLength = Math.min(previousLines.length, nextLines.length)
    while (prefix < minLength && previousLines[prefix] === nextLines[prefix]) {
        prefix += 1
    }

    let suffix = 0
    while (
        suffix < (previousLines.length - prefix)
        && suffix < (nextLines.length - prefix)
        && previousLines[previousLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
    ) {
        suffix += 1
    }

    const removedCount = Math.max(0, previousLines.length - prefix - suffix)
    const addedCount = Math.max(0, nextLines.length - prefix - suffix)
    const markers: GitLineMarker[] = []

    if (addedCount > 0 && removedCount > 0) {
        for (let index = 0; index < addedCount; index += 1) {
            markers.push({ line: prefix + index + 1, type: 'modified' })
        }
    } else if (addedCount > 0) {
        for (let index = 0; index < addedCount; index += 1) {
            markers.push({ line: prefix + index + 1, type: 'added' })
        }
    } else if (removedCount > 0) {
        markers.push({ line: Math.max(1, prefix + 1), type: 'deleted' })
    }

    return {
        additions: addedCount,
        deletions: removedCount,
        markers
    }
}

import type { PreviewFile, PreviewMediaSource } from './types'

export type PreviewNavigationEntry = {
    file: PreviewFile
    extension: string
    mediaItems: PreviewMediaSource[]
}

export type PreviewNavigationState = {
    entries: PreviewNavigationEntry[]
    index: number
}

function normalizePath(filePath: string): string {
    return String(filePath || '').trim().replace(/\\/g, '/').toLowerCase()
}

export function previewNavigationEntriesMatch(
    left: PreviewNavigationEntry | undefined,
    right: PreviewNavigationEntry | undefined
): boolean {
    if (!left || !right) return false
    return normalizePath(left.file.path) === normalizePath(right.file.path)
}

export function createPreviewNavigationState(entry: PreviewNavigationEntry): PreviewNavigationState {
    return { entries: [entry], index: 0 }
}

export function recordPreviewNavigationEntry(
    state: PreviewNavigationState,
    entry: PreviewNavigationEntry
): PreviewNavigationState {
    const currentEntry = state.entries[state.index]
    if (previewNavigationEntriesMatch(currentEntry, entry)) {
        const entries = state.entries.slice()
        entries[state.index] = entry
        return { entries, index: state.index }
    }

    const entries = [...state.entries.slice(0, state.index + 1), entry]
    return { entries, index: entries.length - 1 }
}

export function movePreviewNavigationToIndex(
    state: PreviewNavigationState,
    index: number
): PreviewNavigationState {
    if (index < 0 || index >= state.entries.length || index === state.index) return state
    return { ...state, index }
}

export function getPreviewNavigationTarget(
    state: PreviewNavigationState,
    offset: -1 | 1
): { entry: PreviewNavigationEntry; index: number } | null {
    const index = state.index + offset
    const entry = state.entries[index]
    return entry ? { entry, index } : null
}

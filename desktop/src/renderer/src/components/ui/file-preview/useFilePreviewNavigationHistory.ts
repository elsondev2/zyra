import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getFileExtensionFromName } from '@/lib/filesystem/fileSystemPaths'
import type { PreviewFile, PreviewMediaItem, PreviewOpenOptions } from './types'
import {
    createPreviewNavigationState,
    getPreviewNavigationTarget,
    movePreviewNavigationToIndex,
    previewNavigationEntriesMatch,
    recordPreviewNavigationEntry,
    type PreviewNavigationEntry,
    type PreviewNavigationState
} from './preview-navigation-history'

type UseFilePreviewNavigationHistoryInput = {
    file: PreviewFile
    mediaItems: PreviewMediaItem[]
    onNavigate?: (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => Promise<void>
    onBeforeNavigate?: (filePath: string) => void
    requestExternalIntent: (intent: () => void | Promise<void>) => void
}

function resolveNavigationExtension(file: PreviewFile): string {
    return getFileExtensionFromName(file.name)
        || getFileExtensionFromName(file.path)
        || (file.type === 'md' ? 'md' : file.type === 'code' ? file.language || 'txt' : file.type)
}

function buildNavigationEntry(file: PreviewFile, mediaItems: PreviewMediaItem[]): PreviewNavigationEntry {
    return {
        file: { ...file },
        extension: resolveNavigationExtension(file),
        mediaItems: mediaItems.map(({ name, path, extension, thumbnailPath }) => ({
            name,
            path,
            extension,
            thumbnailPath
        }))
    }
}

function buildNavigationOptions(entry: PreviewNavigationEntry): PreviewOpenOptions {
    return {
        startInEditMode: entry.file.startInEditMode === true,
        focusLine: entry.file.focusLine || undefined,
        mediaItems: entry.mediaItems,
        targetKind: entry.file.type === 'directory' ? 'directory' : 'file',
        openNavigator: entry.file.openNavigator === true
    }
}

export function useFilePreviewNavigationHistory({
    file,
    mediaItems,
    onNavigate,
    onBeforeNavigate,
    requestExternalIntent
}: UseFilePreviewNavigationHistoryInput) {
    const currentEntry = useMemo(
        () => buildNavigationEntry(file, mediaItems),
        [file, mediaItems]
    )
    const [navigationState, setNavigationState] = useState<PreviewNavigationState>(() => (
        createPreviewNavigationState(currentEntry)
    ))
    const navigationStateRef = useRef(navigationState)
    const pendingNavigationRef = useRef<{ index: number; entry: PreviewNavigationEntry } | null>(null)

    const updateNavigationState = useCallback((
        updater: (current: PreviewNavigationState) => PreviewNavigationState
    ) => {
        setNavigationState((current) => {
            const next = updater(current)
            navigationStateRef.current = next
            return next
        })
    }, [])

    useEffect(() => {
        updateNavigationState((current) => {
            const pending = pendingNavigationRef.current
            if (pending && previewNavigationEntriesMatch(pending.entry, currentEntry)) {
                pendingNavigationRef.current = null
                const moved = movePreviewNavigationToIndex(current, pending.index)
                const entries = moved.entries.slice()
                entries[moved.index] = currentEntry
                return { entries, index: moved.index }
            }
            if (pending) pendingNavigationRef.current = null
            return recordPreviewNavigationEntry(current, currentEntry)
        })
    }, [currentEntry, updateNavigationState])

    const navigateBy = useCallback((offset: -1 | 1) => {
        if (!onNavigate) return
        const target = getPreviewNavigationTarget(navigationStateRef.current, offset)
        if (!target) return

        requestExternalIntent(() => {
            pendingNavigationRef.current = target
            updateNavigationState((current) => movePreviewNavigationToIndex(current, target.index))
            onBeforeNavigate?.(target.entry.file.path)
            return onNavigate(
                { name: target.entry.file.name, path: target.entry.file.path },
                target.entry.extension,
                buildNavigationOptions(target.entry)
            )
        })
    }, [onBeforeNavigate, onNavigate, requestExternalIntent, updateNavigationState])

    return {
        canNavigateBack: Boolean(onNavigate && navigationState.index > 0),
        canNavigateForward: Boolean(onNavigate && navigationState.index < navigationState.entries.length - 1),
        navigateBack: useCallback(() => navigateBy(-1), [navigateBy]),
        navigateForward: useCallback(() => navigateBy(1), [navigateBy])
    }
}

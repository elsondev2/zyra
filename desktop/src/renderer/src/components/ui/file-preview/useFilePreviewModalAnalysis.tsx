import { useCallback, useDeferredValue, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { buildLocalDiffPreview } from './modalShared'
import { isMediaPreviewType } from './utils'
import type { PreviewFile } from './types'

export function scanPreviewInspectorStats(content: string): {
    totalFileLines: number
    longLineCount: number
    trailingWhitespaceCount: number
} {
    if (!content) return { totalFileLines: 0, longLineCount: 0, trailingWhitespaceCount: 0 }
    const lines = content.split(/\r?\n/)
    let longLineCount = 0
    let trailingWhitespaceCount = 0
    for (const line of lines) {
        if (line.length > 120) longLineCount += 1
        if (/[ \t]+$/.test(line)) trailingWhitespaceCount += 1
    }
    return { totalFileLines: lines.length, longLineCount, trailingWhitespaceCount }
}

export function useFilePreviewModalAnalysis(input: {
    file: PreviewFile
    mode: 'preview' | 'edit'
    isExpanded: boolean
    rightPanelOpen: boolean
    viewport: 'responsive' | string
    presetWidth: number
    sourceContent: string
    draftContent: string
    isDirty: boolean
}) {
    const {
        file,
        mode,
        isExpanded,
        rightPanelOpen,
        viewport,
        presetWidth,
        sourceContent,
        draftContent,
        isDirty
    } = input

    const activeContent = mode === 'edit' ? draftContent : sourceContent
    const deferredDraftContent = useDeferredValue(draftContent)
    const deferredActiveContent = useDeferredValue(activeContent)
    const analysisContent = mode === 'edit' ? deferredActiveContent : activeContent
    const isHtml = file.type === 'html'
    const isCompactHtmlViewport = isHtml && viewport !== 'responsive' && presetWidth <= 768
    const isHtmlRenderedPreview = isHtml && mode === 'preview'
    const shouldBuildInspectorStats = isExpanded && rightPanelOpen
    const previewResetKey = isMediaPreviewType(file.type)
        ? `media:${viewport}:${mode}`
        : `${file.path}:${file.type}:${viewport}:${mode}`

    const localDiffPreview = useMemo(() => {
        if (mode !== 'edit' || !isDirty) return null
        return buildLocalDiffPreview(sourceContent, deferredDraftContent)
    }, [deferredDraftContent, isDirty, mode, sourceContent])

    const inspectorStats = useMemo(
        () => shouldBuildInspectorStats
            ? scanPreviewInspectorStats(analysisContent)
            : { totalFileLines: 0, longLineCount: 0, trailingWhitespaceCount: 0 },
        [analysisContent, shouldBuildInspectorStats]
    )
    const { totalFileLines, longLineCount, trailingWhitespaceCount } = inspectorStats
    const jsonDiagnostic = useMemo(() => {
        if (!shouldBuildInspectorStats) return null
        if (file.type !== 'json') return null
        try {
            JSON.parse(analysisContent)
            return { ok: true, message: 'Valid JSON structure' }
        } catch (error: any) {
            return { ok: false, message: error?.message || 'Invalid JSON syntax' }
        }
    }, [analysisContent, file.type, shouldBuildInspectorStats])

    const isEditorToolsEnabled = mode === 'edit'
    const getEditorToolButtonClass = useCallback((isActive = false) => cn(
        'inline-flex items-center justify-center rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        isEditorToolsEnabled
            ? isActive
                ? 'border-sky-400/45 bg-sky-500/10 text-sky-200 hover:bg-sky-500/15'
                : 'border-sparkle-border-secondary bg-sparkle-bg text-sparkle-text-secondary hover:border-sparkle-border hover:bg-sparkle-card-hover hover:text-sparkle-text'
            : 'border-transparent bg-sparkle-bg/45 text-sparkle-text-muted/80 cursor-not-allowed opacity-70'
    ), [isEditorToolsEnabled])

    return {
        activeContent,
        totalFileLines,
        isCompactHtmlViewport,
        isHtmlRenderedPreview,
        previewResetKey,
        localDiffPreview,
        longLineCount,
        trailingWhitespaceCount,
        jsonDiagnostic,
        isEditorToolsEnabled,
        getEditorToolButtonClass
    }
}

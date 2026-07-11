import { useCallback, useMemo, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
    buildLocalDiffPreview,
    countLines,
    extractOutlineItems,
    type OutlineItem
} from './modalShared'
import { isMediaPreviewType } from './utils'
import type { PreviewFile } from './types'

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
    previewSurfaceRef: RefObject<HTMLDivElement | null>
    setFocusLine: (line: number | null) => void
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
        isDirty,
        previewSurfaceRef,
        setFocusLine
    } = input

    const activeContent = mode === 'edit' ? draftContent : sourceContent
    const isHtml = file.type === 'html'
    const isCompactHtmlViewport = isHtml && viewport !== 'responsive' && presetWidth <= 768
    const isHtmlRenderedPreview = isHtml && mode === 'preview'
    const shouldBuildOutline = isExpanded && (file.type === 'md' || file.type === 'text' || file.type === 'code' || file.type === 'html')
    const shouldBuildInspectorStats = isExpanded && rightPanelOpen
    const previewResetKey = isMediaPreviewType(file.type)
        ? `media:${viewport}:${mode}`
        : `${file.path}:${file.type}:${viewport}:${mode}`

    const localDiffPreview = useMemo(() => {
        if (mode !== 'edit' || !isDirty) return null
        return buildLocalDiffPreview(sourceContent, draftContent)
    }, [draftContent, isDirty, mode, sourceContent])

    const totalFileLines = useMemo(
        () => shouldBuildInspectorStats ? countLines(activeContent) : 0,
        [activeContent, shouldBuildInspectorStats]
    )
    const outlineItems = useMemo(
        () => shouldBuildOutline ? extractOutlineItems(activeContent, file.type) : [],
        [activeContent, file.type, shouldBuildOutline]
    )
    const longLineCount = useMemo(
        () => shouldBuildInspectorStats
            ? activeContent.split(/\r?\n/).filter((line) => line.length > 120).length
            : 0,
        [activeContent, shouldBuildInspectorStats]
    )
    const trailingWhitespaceCount = useMemo(
        () => shouldBuildInspectorStats
            ? activeContent.split(/\r?\n/).filter((line) => /[ \t]+$/.test(line)).length
            : 0,
        [activeContent, shouldBuildInspectorStats]
    )
    const jsonDiagnostic = useMemo(() => {
        if (!shouldBuildInspectorStats) return null
        if (file.type !== 'json') return null
        try {
            JSON.parse(activeContent)
            return { ok: true, message: 'Valid JSON structure' }
        } catch (error: any) {
            return { ok: false, message: error?.message || 'Invalid JSON syntax' }
        }
    }, [activeContent, file.type, shouldBuildInspectorStats])

    const isEditorToolsEnabled = mode === 'edit'
    const getEditorToolButtonClass = useCallback((isActive = false) => cn(
        'inline-flex items-center justify-center rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        isEditorToolsEnabled
            ? isActive
                ? 'border-sky-400/45 bg-sky-500/10 text-sky-200 hover:bg-sky-500/15'
                : 'border-sparkle-border-secondary bg-sparkle-bg text-sparkle-text-secondary hover:border-sparkle-border hover:bg-sparkle-card-hover hover:text-sparkle-text'
            : 'border-transparent bg-sparkle-bg/45 text-sparkle-text-muted/80 cursor-not-allowed opacity-70'
    ), [isEditorToolsEnabled])

    const handleOutlineItemSelect = useCallback((item: OutlineItem) => {
        if (mode === 'edit') {
            setFocusLine(item.line)
            return
        }
        if (file.type === 'md') {
            const root = previewSurfaceRef.current
            if (!root) return
            const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, ' ').trim()
            const targetLabel = normalize(item.label)
            const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
            const directMatch = headings.find((heading) => normalize(heading.textContent || '') === targetLabel)
                || headings.find((heading) => normalize(heading.textContent || '').includes(targetLabel))
            if (directMatch) {
                directMatch.scrollIntoView({ block: 'center', behavior: 'smooth' })
                return
            }
        }

        setFocusLine(item.line)
    }, [file.type, mode, previewSurfaceRef, setFocusLine])

    return {
        activeContent,
        totalFileLines,
        isCompactHtmlViewport,
        isHtmlRenderedPreview,
        previewResetKey,
        localDiffPreview,
        outlineItems,
        longLineCount,
        trailingWhitespaceCount,
        jsonDiagnostic,
        isEditorToolsEnabled,
        getEditorToolButtonClass,
        handleOutlineItemSelect
    }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react'
import { useThemeRevision } from '@/lib/use-theme-revision'
import { OfficePreviewToolbar } from './OfficePreviewToolbar'
import {
    createOfficePreviewViewer,
    type OfficePreviewPosition,
    type OfficePreviewType,
    type OfficePreviewViewer
} from './officePreviewViewer'

function describeOfficePreviewError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || '')
    const normalized = message.toLowerCase()
    if (normalized.includes('password') || normalized.includes('encrypted')) {
        return 'This Office file is password-protected. Open it in your installed Office application.'
    }
    if (normalized.includes('resource') || normalized.includes('limit') || normalized.includes('archive')) {
        return 'This document exceeded the safe resource limits for an embedded preview.'
    }
    if (normalized.includes('fetch') || normalized.includes('404') || normalized.includes('not found')) {
        return 'The Office file could not be read. It may have moved or been deleted.'
    }
    return message || 'The Office document could not be rendered.'
}

export default function OfficePreviewContent({
    filePath,
    fileName,
    type
}: {
    filePath: string
    fileName: string
    type: OfficePreviewType
}) {
    const themeRevision = useThemeRevision()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const viewerRef = useRef<OfficePreviewViewer | null>(null)
    const searchGenerationRef = useRef(0)
    const [reloadToken, setReloadToken] = useState(0)
    const [ready, setReady] = useState(false)
    const [fatalError, setFatalError] = useState<string | null>(null)
    const [renderWarning, setRenderWarning] = useState<string | null>(null)
    const [position, setPosition] = useState<OfficePreviewPosition | null>(null)
    const [scale, setScale] = useState(1)
    const [query, setQuery] = useState('')
    const [resultCount, setResultCount] = useState<number | null>(null)
    const [activeResult, setActiveResult] = useState(0)
    const [searching, setSearching] = useState(false)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        let disposed = false
        let viewer: OfficePreviewViewer | null = null
        setReady(false)
        setFatalError(null)
        setRenderWarning(null)
        setPosition(null)
        setScale(1)
        setResultCount(null)
        setActiveResult(0)
        container.replaceChildren()

        void (async () => {
            try {
                const [createdViewer, fileResult] = await Promise.all([
                    createOfficePreviewViewer(type, container, {
                        onPositionChange: (nextPosition) => { if (!disposed) setPosition(nextPosition) },
                        onScaleChange: (nextScale) => { if (!disposed) setScale(nextScale) },
                        onRenderError: (error) => { if (!disposed) setRenderWarning(describeOfficePreviewError(error)) }
                    }),
                    window.devscope.readBinaryFile(filePath)
                ])
                viewer = createdViewer
                if (disposed) {
                    viewer.destroy()
                    return
                }
                viewerRef.current = viewer
                if (!fileResult.success) throw new Error(fileResult.error || 'The Office file could not be read.')
                await viewer.load(fileResult.data)
                if (disposed) return
                setPosition(viewer.getPosition())
                setScale(viewer.getScale())
                setReady(true)
            } catch (error) {
                if (!disposed) setFatalError(describeOfficePreviewError(error))
            }
        })()

        return () => {
            disposed = true
            searchGenerationRef.current += 1
            if (viewerRef.current === viewer) viewerRef.current = null
            viewer?.destroy()
            container.replaceChildren()
        }
    }, [filePath, reloadToken, themeRevision, type])

    const runViewerAction = useCallback((action: (viewer: OfficePreviewViewer) => void | Promise<void>) => {
        const viewer = viewerRef.current
        if (!viewer) return
        void Promise.resolve(action(viewer)).catch((error) => setRenderWarning(describeOfficePreviewError(error)))
    }, [])

    const updateQuery = useCallback((nextQuery: string) => {
        setQuery(nextQuery)
        setResultCount(null)
        setActiveResult(0)
        searchGenerationRef.current += 1
        if (!nextQuery.trim()) viewerRef.current?.clearFind()
    }, [])

    const search = useCallback(() => {
        const viewer = viewerRef.current
        const normalizedQuery = query.trim()
        if (!viewer || !normalizedQuery) {
            viewer?.clearFind()
            setResultCount(null)
            setActiveResult(0)
            return
        }
        const generation = searchGenerationRef.current + 1
        searchGenerationRef.current = generation
        setSearching(true)
        void viewer.findText(normalizedQuery).then(async (count) => {
            if (searchGenerationRef.current !== generation) return
            setResultCount(count)
            setActiveResult(count > 0 ? 1 : 0)
            if (count > 0) await viewer.findNext()
        }).catch((error) => {
            if (searchGenerationRef.current === generation) setRenderWarning(describeOfficePreviewError(error))
        }).finally(() => {
            if (searchGenerationRef.current === generation) setSearching(false)
        })
    }, [query])

    const moveSearchResult = useCallback((direction: 'previous' | 'next') => {
        const viewer = viewerRef.current
        if (!viewer || !resultCount) return
        const action = direction === 'previous' ? viewer.findPrevious() : viewer.findNext()
        void action.then(() => {
            setActiveResult((current) => direction === 'previous'
                ? (current <= 1 ? resultCount : current - 1)
                : (current >= resultCount ? 1 : current + 1))
        }).catch((error) => setRenderWarning(describeOfficePreviewError(error)))
    }, [resultCount])

    return (
        <div className="office-preview-root flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--office-preview-desk)]">
            <OfficePreviewToolbar
                type={type}
                ready={ready}
                position={position}
                scale={scale}
                query={query}
                onQueryChange={updateQuery}
                resultCount={resultCount}
                activeResult={activeResult}
                searching={searching}
                onSearch={search}
                onPreviousResult={() => moveSearchResult('previous')}
                onNextResult={() => moveSearchResult('next')}
                onZoomOut={() => runViewerAction((viewer) => viewer.zoomOut())}
                onZoomIn={() => runViewerAction((viewer) => viewer.zoomIn())}
                onFitWidth={() => runViewerAction((viewer) => viewer.fitWidth())}
                onFitPage={() => runViewerAction((viewer) => viewer.fitPage())}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden" aria-label={`${type.toUpperCase()} preview for ${fileName}`} />
                {!ready && !fatalError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--office-preview-desk)]">
                        <div className="flex items-center gap-2 text-[11px] text-sparkle-text-muted">
                            <RefreshCw className="size-3.5 animate-spin" />
                            <span>Rendering {type.toUpperCase()} locally…</span>
                        </div>
                    </div>
                ) : null}
                {fatalError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--office-preview-desk)] px-8">
                        <div className="max-w-md text-center">
                            <AlertTriangle className="mx-auto size-6 text-[color-mix(in_srgb,var(--status-warning)_72%,var(--color-text))]" />
                            <h3 className="mt-3 text-sm font-medium text-sparkle-text">Office preview unavailable</h3>
                            <p className="mt-1.5 text-xs leading-5 text-sparkle-text-muted">{fatalError}</p>
                            <div className="mt-4 flex items-center justify-center gap-2">
                                <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--surface-divider)] px-2.5 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><RotateCcw className="size-3" />Retry</button>
                                <button type="button" onClick={() => { void window.devscope.openFile(filePath) }} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-2.5 text-[10px] font-medium text-[var(--accent-on-primary)] hover:brightness-110"><ExternalLink className="size-3" />Open externally</button>
                            </div>
                        </div>
                    </div>
                ) : null}
                {renderWarning && ready ? (
                    <button type="button" onClick={() => setRenderWarning(null)} className="absolute inset-x-3 bottom-3 z-20 flex min-h-8 items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--status-warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,var(--surface-floating))] px-3 py-1.5 text-left text-[10px] text-sparkle-text-secondary shadow-xl" title="Dismiss warning">
                        <AlertTriangle className="size-3.5 shrink-0 text-[color-mix(in_srgb,var(--status-warning)_72%,var(--color-text))]" />
                        <span className="line-clamp-2">{renderWarning}</span>
                    </button>
                ) : null}
            </div>
        </div>
    )
}

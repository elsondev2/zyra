import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowUpRight, Copy, ExternalLink, FileClock, Globe2, Image as ImageIcon, Library, LoaderCircle, Search, X } from 'lucide-react'
import type { AssistantUtilityResourcesStateCapsule } from '@shared/assistant/utility-window'
import { getFileUrl } from '@/components/ui/file-preview/utils'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import { usePreviewVirtualWindow } from '@/components/ui/file-preview/usePreviewVirtualWindow'
import { MarkdownSiteIcon, resolveExternalMarkdownHost } from '@/components/ui/markdown/InlineTargets'
import { cn } from '@/lib/utils'
import AssistantAttachmentPreviewModal from './AssistantAttachmentPreviewModal'
import type { ComposerContextFile } from './assistant-composer-types'
import { getContentTypeTag, getContextFileMeta, toKbLabel } from './assistant-composer-utils'
import { openAssistantFileTarget } from './assistant-file-navigation'
import { buildAssistantResourceIndex, type AssistantResource, type AssistantResourceSource } from './assistant-resource-index'
import {
    AssistantResourcesLibrary,
    resourceSourceBadgeClass,
    resourceSourceBadgeLabel,
    type ResourceKindFilter,
    type ResourceSourceFilter,
    type ResourceTurnFilter
} from './AssistantResourcesLibrary'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'
import { isClipboardAttachmentReference } from './assistant-timeline-helpers'
import { captureAssistantUtilityScrollAnchor, restoreAssistantUtilityScrollAnchor } from './assistant-utility-state-capsules'

type ResourceFilter = ResourceKindFilter
const RESOURCE_TABLE_ROW_HEIGHT = 52
const RESOURCE_FILTERS: Array<{ id: ResourceFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'images', label: 'Images' },
    { id: 'links', label: 'Links' }
]

function parseAttachmentSize(value: string | null | undefined): number | undefined {
    const size = Number.parseInt(String(value || ''), 10)
    return Number.isFinite(size) && size >= 0 ? size : undefined
}

function inlineImageData(resource: AssistantResource): string | null {
    const candidates = [resource.attachment?.content, resource.attachment?.preview]
    return candidates.find((value) => String(value || '').toLowerCase().startsWith('data:image/')) || null
}

function buildInlineImagePreview(resource: AssistantResource): ComposerContextFile | null {
    const attachment = resource.attachment
    const dataUrl = inlineImageData(resource)
    if (!attachment || !dataUrl) return null
    return {
        id: `${resource.id}:preview`,
        path: dataUrl,
        name: attachment.displayName || attachment.name || resource.title,
        mimeType: attachment.mime || dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/*',
        kind: 'image',
        previewDataUrl: dataUrl,
        sizeBytes: parseAttachmentSize(attachment.size),
        source: attachment.isClipboard ? 'paste' : 'manual'
    }
}

function resourceMatchesFilter(resource: AssistantResource, filter: ResourceFilter): boolean {
    return filter === 'all' || resource.kind === filter.slice(0, -1)
}

function directImageSource(resource: AssistantResource): string | null {
    if (resource.url) return resource.url
    const inlineData = inlineImageData(resource)
    if (inlineData) return inlineData
    const path = String(resource.path || resource.attachment?.path || '').trim()
    if (!path || isClipboardAttachmentReference(path)) return null
    return getFileUrl(path)
}

const ResourceImagePreview = memo(function ResourceImagePreview({ resource }: { resource: AssistantResource }) {
    const immediateSource = directImageSource(resource)
    const [resolvedSource, setResolvedSource] = useState<string | null>(immediateSource)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        setResolvedSource(immediateSource)
        setFailed(false)
        if (immediateSource) return
        const reference = String(resource.attachment?.path || '').trim()
        if (!isClipboardAttachmentReference(reference)) return
        let cancelled = false
        void window.devscope.assistant.resolveClipboardAttachment({ reference }).then((result) => {
            if (!cancelled && result.success && result.path) setResolvedSource(getFileUrl(result.path))
        }).catch(() => {
            if (!cancelled) setFailed(true)
        })
        return () => { cancelled = true }
    }, [immediateSource, resource.attachment?.path])

    if (!resolvedSource || failed) {
        return <span className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(139,92,246,0.18),transparent_65%)]"><ImageIcon size={25} className="text-violet-200/45" /></span>
    }
    return <img src={resolvedSource} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed(true)} />
})

export const AssistantResourcesWorkspace = memo(function AssistantResourcesWorkspace({
    turns,
    projectPath,
    onOpenPreview,
    onOpenPreviewInNewTab,
    onOpenUrl,
    onOpenDiff,
    onOpenTurn,
    stateCapsule,
    onStateCapsuleChange
}: {
    turns: AssistantDiffTurn[]
    projectPath: string | null
    onOpenPreview: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenPreviewInNewTab: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenUrl: (url: string) => void
    onOpenDiff: (target: AssistantDiffTarget) => void
    onOpenTurn: (turnId: string) => void
    stateCapsule?: AssistantUtilityResourcesStateCapsule
    onStateCapsuleChange?: (capsule: AssistantUtilityResourcesStateCapsule) => void
}) {
    const rootRef = useRef<HTMLElement | null>(null)
    const [workspaceWidth, setWorkspaceWidth] = useState(0)
    const [query, setQuery] = useState(stateCapsule?.query || '')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())
    const [filter, setFilter] = useState<ResourceFilter>(stateCapsule?.kindFilter || 'all')
    const [sourceFilter, setSourceFilter] = useState<ResourceSourceFilter>(stateCapsule?.sourceFilter || 'all')
    const [turnFilter, setTurnFilter] = useState<ResourceTurnFilter>(stateCapsule?.turnFilter || 'all')
    const [selectedResourceId, setSelectedResourceId] = useState<string | null>(stateCapsule?.selectedResourceId || null)
    const [scrollAnchor, setScrollAnchor] = useState(stateCapsule?.scrollAnchor)
    const pendingHydrationRef = useRef(stateCapsule)
    const [error, setError] = useState<string | null>(null)
    const [openingResourceId, setOpeningResourceId] = useState<string | null>(null)
    const [previewFile, setPreviewFile] = useState<ComposerContextFile | null>(null)
    const resourceIndex = useMemo(() => buildAssistantResourceIndex({ turns, projectPath }), [projectPath, turns])
    const kindCounts = useMemo(() => Object.fromEntries(RESOURCE_FILTERS.map(({ id }) => [
        id,
        resourceIndex.resources.filter((resource) => resourceMatchesFilter(resource, id)).length
    ])) as Record<ResourceFilter, number>, [resourceIndex.resources])
    const availableTypeFilters = useMemo(() => RESOURCE_FILTERS.filter((entry) => entry.id !== 'all' && kindCounts[entry.id] > 0), [kindCounts])
    const availableResourceFilters = useMemo(() => [RESOURCE_FILTERS[0]!, ...availableTypeFilters], [availableTypeFilters])
    const showResourceFilters = availableTypeFilters.length > 1
    const sourceCounts = useMemo(() => ({
        attached: resourceIndex.resources.filter((resource) => resource.sources.includes('attached')).length,
        generated: resourceIndex.resources.filter((resource) => resource.sources.includes('generated')).length,
        changed: resourceIndex.resources.filter((resource) => resource.sources.includes('changed')).length,
        mentioned: resourceIndex.resources.filter((resource) => resource.sources.includes('mentioned')).length
    } satisfies Record<AssistantResourceSource, number>), [resourceIndex.resources])
    const turnOptions = useMemo(() => {
        const turnsById = new Map<string, { id: string; number: number; count: number }>()
        for (const resource of resourceIndex.resources) {
            const seen = new Set<string>()
            for (const origin of resource.origins) {
                if (seen.has(origin.turnId)) continue
                seen.add(origin.turnId)
                const current = turnsById.get(origin.turnId)
                if (current) current.count += 1
                else turnsById.set(origin.turnId, { id: origin.turnId, number: origin.turnNumber, count: 1 })
            }
        }
        return [...turnsById.values()].sort((left, right) => right.number - left.number)
    }, [resourceIndex.resources])
    const visibleResources = useMemo(() => resourceIndex.resources.filter((resource) => (
        resourceMatchesFilter(resource, filter)
        && (sourceFilter === 'all' || resource.sources.includes(sourceFilter))
        && (turnFilter === 'all' || resource.origins.some((origin) => origin.turnId === turnFilter))
        && (!deferredQuery || resource.searchText.includes(deferredQuery))
    )), [deferredQuery, filter, resourceIndex.resources, sourceFilter, turnFilter])
    const wideLayout = workspaceWidth >= 1050
    const { range, scrollElementRef } = usePreviewVirtualWindow({ rowCount: visibleResources.length, rowHeight: RESOURCE_TABLE_ROW_HEIGHT, restoreKey: 'assistant-resources-table' })
    const renderedResources = visibleResources.slice(range.start, range.end)
    const previewMeta = useMemo(() => previewFile ? getContextFileMeta(previewFile) : null, [previewFile])

    useEffect(() => {
        pendingHydrationRef.current = stateCapsule
        if (!stateCapsule) return
        setQuery(stateCapsule.query || '')
        setFilter(stateCapsule.kindFilter || 'all')
        setSourceFilter(stateCapsule.sourceFilter || 'all')
        setTurnFilter(stateCapsule.turnFilter || 'all')
        setSelectedResourceId(stateCapsule.selectedResourceId || null)
        setScrollAnchor(stateCapsule.scrollAnchor)
        restoreAssistantUtilityScrollAnchor(rootRef.current, stateCapsule.scrollAnchor)
    }, [stateCapsule])
    useEffect(() => {
        const pendingHydration = pendingHydrationRef.current
        if (pendingHydration) {
            const hydrated = query === (pendingHydration.query || '')
                && filter === (pendingHydration.kindFilter || 'all')
                && sourceFilter === (pendingHydration.sourceFilter || 'all')
                && turnFilter === (pendingHydration.turnFilter || 'all')
                && selectedResourceId === (pendingHydration.selectedResourceId || null)
            if (!hydrated) return
            pendingHydrationRef.current = undefined
        }
        onStateCapsuleChange?.({
            version: 1,
            workspace: 'resources',
            query,
            kindFilter: filter,
            sourceFilter,
            turnFilter,
            selectedResourceId: selectedResourceId || undefined,
            scrollAnchor
        })
    }, [filter, onStateCapsuleChange, query, scrollAnchor, selectedResourceId, sourceFilter, turnFilter])
    useEffect(() => {
        const root = rootRef.current
        if (!root || typeof ResizeObserver === 'undefined') return
        const updateWidth = () => setWorkspaceWidth(root.clientWidth)
        updateWidth()
        const observer = new ResizeObserver(updateWidth)
        observer.observe(root)
        return () => observer.disconnect()
    }, [])
    useEffect(() => {
        if (filter !== 'all' && (!kindCounts[filter] || !showResourceFilters)) setFilter('all')
    }, [filter, kindCounts, showResourceFilters])
    useEffect(() => {
        if (sourceFilter !== 'all' && sourceCounts[sourceFilter] === 0) setSourceFilter('all')
        if (turnFilter !== 'all' && !turnOptions.some((turn) => turn.id === turnFilter)) setTurnFilter('all')
    }, [sourceCounts, sourceFilter, turnFilter, turnOptions])
    useEffect(() => {
        if (wideLayout) return
        setSourceFilter('all')
        setTurnFilter('all')
        setSelectedResourceId(null)
    }, [wideLayout])
    useEffect(() => {
        if (scrollElementRef.current) scrollElementRef.current.scrollTop = 0
    }, [deferredQuery, filter, scrollElementRef, sourceFilter, turnFilter])

    const openImageResource = useCallback(async (resource: AssistantResource, inNewTab = false) => {
        if (resource.url) {
            onOpenUrl(resource.url)
            return true
        }
        const openPreview = inNewTab ? onOpenPreviewInNewTab : onOpenPreview
        if (resource.path) return openAssistantFileTarget({ target: resource.path, projectPath, openPreview })
        const attachmentPath = String(resource.attachment?.path || '').trim()
        if (isClipboardAttachmentReference(attachmentPath)) {
            const result = await window.devscope.assistant.resolveClipboardAttachment({ reference: attachmentPath })
            if (result.success && result.path) return openAssistantFileTarget({ target: result.path, projectPath, openPreview })
        } else if (attachmentPath) {
            const opened = await openAssistantFileTarget({ target: attachmentPath, projectPath, openPreview })
            if (opened) return true
        }
        const inlinePreview = buildInlineImagePreview(resource)
        if (inlinePreview) {
            setPreviewFile(inlinePreview)
            return true
        }
        return false
    }, [onOpenPreview, onOpenPreviewInNewTab, onOpenUrl, projectPath])

    const openResource = useCallback(async (resource: AssistantResource, inNewTab = false) => {
        setOpeningResourceId(resource.id)
        setError(null)
        try {
            if (resource.kind === 'link' && resource.url) {
                onOpenUrl(resource.url)
                return
            }
            if (!await openImageResource(resource, inNewTab)) setError('This image is no longer available to preview.')
        } catch (openError: unknown) {
            setError(openError instanceof Error ? openError.message : 'Could not open this resource.')
        } finally {
            setOpeningResourceId(null)
        }
    }, [onOpenUrl, openImageResource])

    const copyResource = useCallback(async (resource: AssistantResource) => {
        const value = resource.path || resource.url || resource.attachment?.path || inlineImageData(resource) || resource.title
        try {
            const result = await window.devscope.copyToClipboard(value)
            if (!result.success) setError(result.error || 'Could not copy this resource.')
        } catch (copyError: unknown) {
            setError(copyError instanceof Error ? copyError.message : 'Could not copy this resource.')
        }
    }, [])

    const renderResourcePreview = useCallback((resource: AssistantResource): ReactNode => (
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden">
            <ResourceImagePreview resource={resource} />
            {openingResourceId === resource.id ? <span className="absolute inset-0 flex items-center justify-center bg-black/55"><LoaderCircle size={14} className="animate-spin text-white/85" /></span> : null}
        </span>
    ), [openingResourceId])

    return (
        <section
            ref={rootRef}
            onScrollCapture={(event) => {
                const anchor = captureAssistantUtilityScrollAnchor(event)
                if (anchor) setScrollAnchor(anchor)
            }}
            className="assistant-resources-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]"
            aria-label="Resources workspace"
        >
            <div className="assistant-resources-toolbar flex h-9 shrink-0 items-center gap-1.5 border-b border-white/[0.07] px-2">
                <Library size={12} className="shrink-0 text-[var(--accent-primary)]/75" />
                <div className="assistant-resources-search flex h-6 min-w-0 flex-1 items-center gap-1.5 border border-white/[0.08] bg-white/[0.02] px-2 focus-within:border-[var(--accent-primary)]/30">
                    <Search size={10} className="shrink-0 text-sparkle-text-muted/45" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[10px] text-sparkle-text-secondary outline-none placeholder:text-sparkle-text-muted/40" placeholder="Search images, links, or turns" aria-label="Search chat resources" spellCheck={false} />
                    {query ? <button type="button" onClick={() => setQuery('')} className="inline-flex size-4 items-center justify-center text-sparkle-text-muted hover:text-sparkle-text" title="Clear resource search"><X size={9} /></button> : null}
                </div>
                <span className="assistant-resources-summary hidden shrink-0 font-mono text-[9px] text-sparkle-text-muted/55">{visibleResources.length === resourceIndex.resources.length ? `${visibleResources.length} resources` : `${visibleResources.length} of ${resourceIndex.resources.length}`}</span>
            </div>

            {showResourceFilters && !wideLayout ? (
                <div className="assistant-resources-filters flex h-8 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
                    {availableResourceFilters.map((entry) => <button key={entry.id} type="button" onClick={() => setFilter(entry.id)} aria-pressed={filter === entry.id} className={cn('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[9px] font-medium transition-colors', filter === entry.id ? 'bg-[var(--surface-active)] text-sparkle-text' : 'text-sparkle-text-muted/65 hover:bg-[var(--surface-hover)] hover:text-sparkle-text-secondary')}><span>{entry.label}</span><span className="font-mono text-[7px] text-sparkle-text-muted/45">{kindCounts[entry.id]}</span></button>)}
                </div>
            ) : null}
            {error ? <div className="flex shrink-0 items-center gap-2 border-b border-red-500/15 bg-red-500/[0.06] px-2 py-1 text-[9px] text-red-300"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setError(null)} className="inline-flex size-4 items-center justify-center hover:text-red-100" title="Dismiss"><X size={9} /></button></div> : null}

            {wideLayout ? (
                <AssistantResourcesLibrary
                    resources={visibleResources}
                    allResources={resourceIndex.resources}
                    selectedResourceId={selectedResourceId}
                    kindFilter={filter}
                    sourceFilter={sourceFilter}
                    turnFilter={turnFilter}
                    kindCounts={kindCounts}
                    sourceCounts={sourceCounts}
                    turnOptions={turnOptions}
                    renderPreview={renderResourcePreview}
                    onSelectResource={setSelectedResourceId}
                    onKindFilterChange={setFilter}
                    onSourceFilterChange={setSourceFilter}
                    onTurnFilterChange={setTurnFilter}
                    onOpenResource={(resource, inNewTab) => { void openResource(resource, inNewTab) }}
                    onCopyResource={(resource) => { void copyResource(resource) }}
                    onOpenTurn={onOpenTurn}
                    onOpenDiff={onOpenDiff}
                />
            ) : (
                <ResourceCompactTable
                    resources={visibleResources}
                    renderedResources={renderedResources}
                    rangeStart={range.start}
                    scrollElementRef={scrollElementRef}
                    openingResourceId={openingResourceId}
                    renderPreview={renderResourcePreview}
                    onOpenResource={(resource, inNewTab) => { void openResource(resource, inNewTab) }}
                    onCopyResource={(resource) => { void copyResource(resource) }}
                    onOpenTurn={onOpenTurn}
                    onOpenDiff={onOpenDiff}
                    hasAnyResources={resourceIndex.resources.length > 0}
                />
            )}

            <AssistantAttachmentPreviewModal file={previewFile} meta={previewMeta} contentType={previewFile ? getContentTypeTag(previewFile) : ''} sizeLabel={previewFile ? toKbLabel(previewFile.sizeBytes) : ''} showFormattingWarning={false} readOnly onClose={() => setPreviewFile(null)} />
        </section>
    )
})

function ResourceCompactTable({
    resources,
    renderedResources,
    rangeStart,
    scrollElementRef,
    openingResourceId,
    renderPreview,
    onOpenResource,
    onCopyResource,
    onOpenTurn,
    onOpenDiff,
    hasAnyResources
}: {
    resources: AssistantResource[]
    renderedResources: AssistantResource[]
    rangeStart: number
    scrollElementRef: RefObject<HTMLDivElement | null>
    openingResourceId: string | null
    renderPreview: (resource: AssistantResource) => ReactNode
    onOpenResource: (resource: AssistantResource, inNewTab?: boolean) => void
    onCopyResource: (resource: AssistantResource) => void
    onOpenTurn: (turnId: string) => void
    onOpenDiff: (target: AssistantDiffTarget) => void
    hasAnyResources: boolean
}) {
    return (
        <div ref={scrollElementRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto" style={{ overscrollBehavior: 'contain' }} role="table" aria-label="Chat resources" aria-colcount={6} aria-rowcount={resources.length + 1}>
            {resources.length > 0 ? (
                <div className="min-w-0">
                    <div className="assistant-resources-table-grid sticky top-0 z-10 grid h-7 items-center border-b border-white/[0.08] bg-[color-mix(in_srgb,var(--color-bg)_98%,black)] px-2 text-[8px] font-semibold uppercase tracking-[0.08em] text-sparkle-text-muted/55" role="row" aria-rowindex={1}>
                        <span role="columnheader">Resource</span><span className="assistant-resources-table__type" role="columnheader">Type</span><span className="assistant-resources-table__source" role="columnheader">Source</span><span className="assistant-resources-table__mentions text-center" role="columnheader">Mentions</span><span className="assistant-resources-table__turn text-center" role="columnheader">Turn</span><span className="text-right" role="columnheader">Actions</span>
                    </div>
                    <div role="rowgroup" style={{ height: resources.length * RESOURCE_TABLE_ROW_HEIGHT, position: 'relative' }}>
                        <div style={{ transform: `translateY(${rangeStart * RESOURCE_TABLE_ROW_HEIGHT}px)` }}>
                            {renderedResources.map((resource, rowOffset) => {
                                const location = resource.url || resource.path || resource.attachment?.path || resource.subtitle
                                const host = resource.url ? resolveExternalMarkdownHost(resource.url) : null
                                return (
                                    <div key={resource.id} className="assistant-resources-table-grid group/resource-row grid h-[52px] items-center border-b border-white/[0.055] px-2 text-[9px] hover:bg-white/[0.025]" role="row" aria-rowindex={rangeStart + rowOffset + 2}>
                                        <div className="min-w-0 pr-2" role="cell">
                                            <button type="button" onClick={() => onOpenResource(resource)} className="flex w-full min-w-0 items-center gap-2 text-left" title={location}>
                                                <span className="relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden border border-white/[0.08] bg-black/20">
                                                    {resource.kind === 'image' ? renderPreview(resource) : host ? <MarkdownSiteIcon host={host} className="inline-flex size-4" /> : <Globe2 size={14} className="text-sky-200/70" />}
                                                    {openingResourceId === resource.id ? <span className="absolute inset-0 flex items-center justify-center bg-black/55"><LoaderCircle size={11} className="animate-spin text-white/85" /></span> : null}
                                                </span>
                                                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-sparkle-text-secondary">{resource.title}</span><span className="mt-0.5 block truncate font-mono text-[8px] text-sparkle-text-muted/50">{location}</span></span>
                                            </button>
                                        </div>
                                        <div className="assistant-resources-table__type pr-2 font-medium capitalize text-sparkle-text-muted/70" role="cell">{resource.kind}</div>
                                        <div className="assistant-resources-table__source flex min-w-0 items-center gap-1 overflow-hidden pr-2" role="cell">{resource.sources.slice(0, 2).map((source) => <span key={source} className={cn('shrink-0 border px-1 py-px text-[6px] font-semibold uppercase tracking-[0.04em]', resourceSourceBadgeClass(source))}>{resourceSourceBadgeLabel(source)}</span>)}</div>
                                        <div className="assistant-resources-table__mentions text-center font-mono text-sparkle-text-muted/60" role="cell">{resource.occurrenceCount}</div>
                                        <div className="assistant-resources-table__turn text-center" role="cell"><button type="button" onClick={() => onOpenTurn(resource.latestTurnId)} className="font-mono text-[8px] text-sparkle-text-muted/60 hover:text-sparkle-text">#{resource.latestTurnNumber}</button></div>
                                        <div className="flex items-center justify-end gap-px" role="cell">
                                            <button type="button" onClick={() => onOpenResource(resource, resource.kind === 'image' && !resource.url)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title="Open resource"><ExternalLink size={9} /></button>
                                            {resource.latestDiffTarget ? <button type="button" onClick={() => onOpenDiff(resource.latestDiffTarget!)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title="Open in Review"><FileClock size={9} /></button> : null}
                                            <button type="button" onClick={() => onOpenTurn(resource.latestTurnId)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title={`Open Turn ${resource.latestTurnNumber}`}><ArrowUpRight size={9} /></button>
                                            <button type="button" onClick={() => onCopyResource(resource)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title="Copy resource"><Copy size={9} /></button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center"><div className="max-w-[250px]"><Library size={20} className="mx-auto text-sparkle-text-muted/45" /><h3 className="mt-3 text-[11px] font-semibold text-sparkle-text-secondary">{hasAnyResources ? 'No matching resources' : 'No images or links yet'}</h3><p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/55">{hasAnyResources ? 'Try another search or resource filter.' : 'Images and safe links shared in this chat will appear here.'}</p></div></div>
            )}
        </div>
    )
}

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
    ArrowUpRight,
    Copy,
    ExternalLink,
    FileClock,
    Globe2,
    Image as ImageIcon,
    Library,
    LoaderCircle,
    Search,
    X
} from 'lucide-react'
import { getFileUrl } from '@/components/ui/file-preview/utils'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import { usePreviewVirtualWindow } from '@/components/ui/file-preview/usePreviewVirtualWindow'
import { MarkdownSiteIcon, resolveExternalMarkdownHost } from '@/components/ui/markdown/InlineTargets'
import { cn } from '@/lib/utils'
import AssistantAttachmentPreviewModal from './AssistantAttachmentPreviewModal'
import type { ComposerContextFile } from './assistant-composer-types'
import { getContentTypeTag, getContextFileMeta, toKbLabel } from './assistant-composer-utils'
import { openAssistantFileTarget } from './assistant-file-navigation'
import { getAssistantLinkPreview } from './assistant-link-preview-cache'
import {
    buildAssistantResourceIndex,
    type AssistantResource,
    type AssistantResourceSource
} from './assistant-resource-index'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'
import { isClipboardAttachmentReference } from './assistant-timeline-helpers'

type ResourceFilter = 'all' | 'images' | 'links'
const RESOURCE_CARDS_PER_ROW = 2
const RESOURCE_CARD_HEIGHT = 176
const RESOURCE_CARD_ROW_HEIGHT = 184

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

function sourceBadgeClass(source: AssistantResourceSource): string {
    if (source === 'generated') return 'border-amber-300/20 bg-amber-400/10 text-amber-100/85'
    if (source === 'changed') return 'border-sky-300/20 bg-sky-400/10 text-sky-100/85'
    if (source === 'attached') return 'border-violet-300/20 bg-violet-400/10 text-violet-100/85'
    return 'border-white/10 bg-black/30 text-white/65'
}

function sourceBadgeLabel(source: AssistantResourceSource): string {
    if (source === 'generated') return 'Generated'
    if (source === 'changed') return 'Changed'
    if (source === 'attached') return 'Attached'
    return 'Mentioned'
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
            if (cancelled || !result.success || !result.path) return
            setResolvedSource(getFileUrl(result.path))
        }).catch(() => {
            if (!cancelled) setFailed(true)
        })
        return () => {
            cancelled = true
        }
    }, [immediateSource, resource.attachment?.path])

    if (!resolvedSource || failed) {
        return (
            <span className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(139,92,246,0.18),transparent_65%)]">
                <ImageIcon size={25} className="text-violet-200/45" />
            </span>
        )
    }

    return (
        <img
            src={resolvedSource}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-[1.025]"
            onError={() => setFailed(true)}
        />
    )
})

const ResourceLinkPreview = memo(function ResourceLinkPreview({ resource }: { resource: AssistantResource }) {
    const host = resource.url ? resolveExternalMarkdownHost(resource.url) : null
    const [preview, setPreview] = useState<Awaited<ReturnType<typeof getAssistantLinkPreview>> | undefined>(undefined)
    const [previewImageFailed, setPreviewImageFailed] = useState(false)
    const pathLabel = useMemo(() => {
        if (!resource.url) return ''
        try {
            const parsed = new URL(resource.url)
            return `${parsed.pathname}${parsed.search}` || '/'
        } catch {
            return resource.url
        }
    }, [resource.url])

    useEffect(() => {
        setPreview(undefined)
        setPreviewImageFailed(false)
        if (!resource.url) {
            setPreview(null)
            return
        }
        let cancelled = false
        void getAssistantLinkPreview(resource.url).then((nextPreview) => {
            if (!cancelled) setPreview(nextPreview)
        })
        return () => {
            cancelled = true
        }
    }, [resource.url])

    if (preview?.imageUrl && !previewImageFailed) {
        return (
            <span className="relative flex h-full w-full overflow-hidden bg-black/25 text-left">
                <img
                    src={preview.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-[1.025]"
                    onError={() => setPreviewImageFailed(true)}
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-1.5 pt-7">
                    <span className="block truncate text-[9px] font-semibold text-white/90">{preview.title || resource.title}</span>
                    <span className="mt-0.5 block truncate text-[7px] text-white/55">{preview.siteName || host || pathLabel}</span>
                </span>
            </span>
        )
    }

    return (
        <span className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_20%,color-mix(in_srgb,var(--accent-primary)_18%,transparent),transparent_66%),linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.008))] px-4 text-center">
            <span className={cn('inline-flex size-9 items-center justify-center border border-white/10 bg-black/25 p-2 shadow-lg', preview === undefined && 'animate-pulse')}>
                {host ? <MarkdownSiteIcon host={host} className="inline-flex size-full" /> : <Globe2 className="size-full text-sky-200/70" />}
            </span>
            <span className="mt-2 max-w-full truncate text-[10px] font-semibold text-sparkle-text-secondary">{preview?.title || host || resource.title}</span>
            <span className="mt-0.5 max-w-full truncate text-[7px] text-sparkle-text-muted/45">{preview?.description || pathLabel}</span>
        </span>
    )
})

export const AssistantResourcesWorkspace = memo(function AssistantResourcesWorkspace({
    turns,
    projectPath,
    onOpenPreview,
    onOpenPreviewInNewTab,
    onOpenUrl,
    onOpenDiff,
    onOpenTurn
}: {
    turns: AssistantDiffTurn[]
    projectPath: string | null
    onOpenPreview: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenPreviewInNewTab: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenUrl: (url: string) => void
    onOpenDiff: (target: AssistantDiffTarget) => void
    onOpenTurn: (turnId: string) => void
}) {
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())
    const [filter, setFilter] = useState<ResourceFilter>('all')
    const [error, setError] = useState<string | null>(null)
    const [openingResourceId, setOpeningResourceId] = useState<string | null>(null)
    const [previewFile, setPreviewFile] = useState<ComposerContextFile | null>(null)
    const resourceIndex = useMemo(
        () => buildAssistantResourceIndex({ turns, projectPath }),
        [projectPath, turns]
    )
    const filterCounts = useMemo(() => Object.fromEntries(RESOURCE_FILTERS.map(({ id }) => [
        id,
        resourceIndex.resources.filter((resource) => resourceMatchesFilter(resource, id)).length
    ])) as Record<ResourceFilter, number>, [resourceIndex.resources])
    const visibleResources = useMemo(() => resourceIndex.resources.filter((resource) => (
        resourceMatchesFilter(resource, filter)
        && (!deferredQuery || resource.searchText.includes(deferredQuery))
    )), [deferredQuery, filter, resourceIndex.resources])
    const cardRowCount = Math.ceil(visibleResources.length / RESOURCE_CARDS_PER_ROW)
    const { range, scrollElementRef } = usePreviewVirtualWindow({
        rowCount: cardRowCount,
        rowHeight: RESOURCE_CARD_ROW_HEIGHT
    })
    const previewMeta = useMemo(() => previewFile ? getContextFileMeta(previewFile) : null, [previewFile])

    useEffect(() => {
        if (scrollElementRef.current) scrollElementRef.current.scrollTop = 0
    }, [deferredQuery, filter, scrollElementRef])

    const openImageResource = useCallback(async (resource: AssistantResource, inNewTab = false) => {
        if (resource.url) {
            onOpenUrl(resource.url)
            return true
        }
        const openPreview = inNewTab ? onOpenPreviewInNewTab : onOpenPreview
        if (resource.path) {
            return openAssistantFileTarget({ target: resource.path, projectPath, openPreview })
        }

        const attachmentPath = String(resource.attachment?.path || '').trim()
        if (isClipboardAttachmentReference(attachmentPath)) {
            const result = await window.devscope.assistant.resolveClipboardAttachment({ reference: attachmentPath })
            if (result.success && result.path) {
                return openAssistantFileTarget({ target: result.path, projectPath, openPreview })
            }
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
            const opened = await openImageResource(resource, inNewTab)
            if (!opened) setError('This image is no longer available to preview.')
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

    const renderedResources = visibleResources.slice(
        range.start * RESOURCE_CARDS_PER_ROW,
        Math.min(visibleResources.length, range.end * RESOURCE_CARDS_PER_ROW)
    )

    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]" aria-label="Resources workspace">
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-white/[0.07] px-2">
                <Library size={12} className="shrink-0 text-[var(--accent-primary)]/75" />
                <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 border border-white/[0.08] bg-white/[0.02] px-2 focus-within:border-[var(--accent-primary)]/30">
                    <Search size={10} className="shrink-0 text-sparkle-text-muted/45" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-[10px] text-sparkle-text-secondary outline-none placeholder:text-sparkle-text-muted/40"
                        placeholder="Search images, links, or turns"
                        aria-label="Search chat resources"
                        spellCheck={false}
                    />
                    {query ? <button type="button" onClick={() => setQuery('')} className="inline-flex size-4 items-center justify-center text-sparkle-text-muted hover:text-sparkle-text" title="Clear resource search"><X size={9} /></button> : null}
                </div>
            </div>

            <div className="flex h-8 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
                {RESOURCE_FILTERS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => setFilter(entry.id)}
                        className={cn(
                            'inline-flex h-5 items-center gap-1 border px-1.5 text-[8px] font-medium',
                            filter === entry.id
                                ? 'border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/[0.09] text-sparkle-text'
                                : 'border-white/[0.06] bg-white/[0.018] text-sparkle-text-muted/65 hover:bg-white/[0.04] hover:text-sparkle-text-secondary'
                        )}
                    >
                        {entry.label}
                        <span className="font-mono text-[7px] opacity-60">{filterCounts[entry.id]}</span>
                    </button>
                ))}
            </div>

            {error ? <div className="flex shrink-0 items-center gap-2 border-b border-red-500/15 bg-red-500/[0.06] px-2 py-1 text-[9px] text-red-300"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setError(null)} className="inline-flex size-4 items-center justify-center hover:text-red-100" title="Dismiss"><X size={9} /></button></div> : null}

            <div className="flex h-6 shrink-0 items-center justify-between border-b border-white/[0.05] px-2 text-[8px] text-sparkle-text-muted/50">
                <span>{visibleResources.length} of {resourceIndex.resources.length} resources</span>
                <span>{resourceIndex.totalOccurrences} mentions{resourceIndex.truncated ? ' · bounded' : ''}</span>
            </div>

            <div ref={scrollElementRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
                {visibleResources.length > 0 ? (
                    <div style={{ height: cardRowCount * RESOURCE_CARD_ROW_HEIGHT + 8, position: 'relative' }}>
                        <div
                            className="grid grid-cols-2 gap-2 px-2"
                            style={{ transform: `translateY(${range.start * RESOURCE_CARD_ROW_HEIGHT + 8}px)` }}
                        >
                            {renderedResources.map((resource) => (
                                <article key={resource.id} className="group/card relative flex h-[176px] min-w-0 flex-col overflow-hidden border border-white/[0.075] bg-white/[0.022] hover:border-white/[0.14] hover:bg-white/[0.035]">
                                    <button
                                        type="button"
                                        onClick={() => void openResource(resource)}
                                        className="relative h-[104px] shrink-0 overflow-hidden border-b border-white/[0.06] text-left"
                                        title={resource.path || resource.url || resource.title}
                                    >
                                        {resource.kind === 'image' ? <ResourceImagePreview resource={resource} /> : <ResourceLinkPreview resource={resource} />}
                                        {openingResourceId === resource.id ? <span className="absolute inset-0 flex items-center justify-center bg-black/45"><LoaderCircle size={16} className="animate-spin text-white/85" /></span> : null}
                                        <span className="absolute left-1.5 top-1.5 flex items-center gap-1">
                                            <span className="border border-white/10 bg-black/55 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-white/75 backdrop-blur-sm">{resource.kind}</span>
                                            {resource.occurrenceCount > 1 ? <span className="border border-white/10 bg-black/55 px-1 py-0.5 font-mono text-[7px] text-white/65 backdrop-blur-sm">×{resource.occurrenceCount}</span> : null}
                                        </span>
                                    </button>

                                    <div className="flex min-h-0 flex-1 flex-col px-2 py-1.5">
                                        <div className="flex min-w-0 items-start gap-1.5">
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[9px] font-semibold text-sparkle-text-secondary" title={resource.title}>{resource.title}</div>
                                                <div className="mt-0.5 truncate text-[7px] text-sparkle-text-muted/45" title={resource.subtitle}>{resource.subtitle}</div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-px">
                                                {resource.latestDiffTarget ? <button type="button" onClick={() => onOpenDiff(resource.latestDiffTarget!)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title="Open recorded change in Review"><FileClock size={9} /></button> : null}
                                                <button type="button" onClick={() => onOpenTurn(resource.latestTurnId)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title={`Open Turn ${resource.latestTurnNumber}`}><ArrowUpRight size={9} /></button>
                                                {resource.kind === 'image' && !resource.url ? <button type="button" onClick={() => void openResource(resource, true)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title="Open image in a new preview tab"><ExternalLink size={9} /></button> : null}
                                                <button type="button" onClick={() => void copyResource(resource)} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted/60 hover:bg-white/[0.06] hover:text-sparkle-text" title="Copy resource"><Copy size={9} /></button>
                                            </div>
                                        </div>
                                        <div className="mt-auto flex min-w-0 items-center gap-1 overflow-hidden">
                                            {resource.sources.slice(0, 2).map((source) => <span key={source} className={cn('shrink-0 border px-1 py-px text-[6px] font-semibold uppercase tracking-[0.05em]', sourceBadgeClass(source))}>{sourceBadgeLabel(source)}</span>)}
                                            <span className="ml-auto shrink-0 text-[7px] text-sparkle-text-muted/40">Turn {resource.latestTurnNumber}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center">
                        <div className="max-w-[250px]">
                            <Library size={20} className="mx-auto text-sparkle-text-muted/45" />
                            <h3 className="mt-3 text-[11px] font-semibold text-sparkle-text-secondary">{resourceIndex.resources.length === 0 ? 'No images or links yet' : 'No matching resources'}</h3>
                            <p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/55">{resourceIndex.resources.length === 0 ? 'Images and safe links shared in this chat will appear here.' : 'Try another search or resource filter.'}</p>
                        </div>
                    </div>
                )}
            </div>

            <AssistantAttachmentPreviewModal
                file={previewFile}
                meta={previewMeta}
                contentType={previewFile ? getContentTypeTag(previewFile) : ''}
                sizeLabel={previewFile ? toKbLabel(previewFile.sizeBytes) : ''}
                showFormattingWarning={false}
                readOnly
                onClose={() => setPreviewFile(null)}
            />
        </section>
    )
})

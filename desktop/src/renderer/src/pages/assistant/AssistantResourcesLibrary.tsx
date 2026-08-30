import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { ArrowUpRight, Copy, ExternalLink, FileClock, Globe2, Image as ImageIcon, X } from 'lucide-react'
import { usePreviewVirtualWindow } from '@/components/ui/file-preview/usePreviewVirtualWindow'
import { MarkdownSiteIcon, resolveExternalMarkdownHost } from '@/components/ui/markdown/InlineTargets'
import { cn } from '@/lib/utils'
import type { AssistantResource, AssistantResourceSource } from './assistant-resource-index'
import type { AssistantDiffTarget } from './assistant-diff-types'

export type ResourceKindFilter = 'all' | 'images' | 'links'
export type ResourceSourceFilter = 'all' | AssistantResourceSource
export type ResourceTurnFilter = 'all' | string

export function resourceSourceBadgeClass(source: AssistantResourceSource): string {
    if (source === 'generated') return 'border-amber-300/20 bg-amber-400/10 text-amber-100/85'
    if (source === 'changed') return 'border-sky-300/20 bg-sky-400/10 text-sky-100/85'
    if (source === 'attached') return 'border-violet-300/20 bg-violet-400/10 text-violet-100/85'
    return 'border-white/10 bg-black/30 text-white/65'
}

export function resourceSourceBadgeLabel(source: AssistantResourceSource): string {
    if (source === 'generated') return 'Generated'
    if (source === 'changed') return 'Changed'
    if (source === 'attached') return 'Attached'
    return 'Mentioned'
}

function resourceLocation(resource: AssistantResource): string {
    return resource.url || resource.path || resource.attachment?.path || resource.subtitle
}

const ResourceLibraryTile = memo(function ResourceLibraryTile({
    resource,
    selected,
    preview,
    onSelect,
    onOpen
}: {
    resource: AssistantResource
    selected: boolean
    preview: ReactNode
    onSelect: (resource: AssistantResource) => void
    onOpen: (resource: AssistantResource) => void
}) {
    const host = resource.url ? resolveExternalMarkdownHost(resource.url) : null
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(resource)}
            onDoubleClick={() => onOpen(resource)}
            className={cn(
                'group/library-tile flex h-[166px] min-w-0 flex-col overflow-hidden border bg-[color-mix(in_srgb,var(--color-bg)_97%,black)] text-left outline-none transition-[border-color,background-color,box-shadow] duration-100',
                selected
                    ? 'border-[color-mix(in_srgb,var(--accent-primary)_66%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--color-bg))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_24%,transparent)]'
                    : 'border-white/[0.065] hover:border-white/[0.12] hover:bg-[color-mix(in_srgb,var(--color-card)_54%,var(--color-bg))] focus-visible:border-[var(--accent-primary)]/45'
            )}
            title={`${resource.title}\n${resourceLocation(resource)}`}
        >
            <span className="relative flex h-[104px] shrink-0 items-center justify-center overflow-hidden border-b border-white/[0.055] bg-black/15">
                {resource.kind === 'image' ? preview : (
                    <span className="flex min-w-0 items-center gap-3 px-4">
                        {host ? <MarkdownSiteIcon host={host} className="inline-flex size-8 shrink-0" /> : <Globe2 size={28} className="shrink-0 text-sky-200/65" />}
                        <span className="min-w-0">
                            <span className="block truncate text-[11px] font-medium text-sparkle-text-secondary">{host || resource.title}</span>
                            <span className="mt-1 block truncate text-[8px] text-sparkle-text-muted/55">{resource.subtitle}</span>
                        </span>
                    </span>
                )}
                <span className="absolute right-1.5 top-1.5 border border-black/20 bg-black/55 px-1 py-0.5 text-[6px] font-semibold uppercase tracking-[0.06em] text-white/75 backdrop-blur-sm">
                    {resource.kind}
                </span>
            </span>
            <span className="flex min-h-0 flex-1 flex-col px-2.5 py-1.5">
                <span className="truncate text-[10px] font-medium text-sparkle-text-secondary">{resource.title}</span>
                <span className="mt-0.5 truncate font-mono text-[7px] text-sparkle-text-muted/45">{resourceLocation(resource)}</span>
                <span className="mt-auto flex items-center gap-1.5 pt-1">
                    <span className="min-w-0 flex-1 truncate text-[7px] text-sparkle-text-muted/45">{resource.occurrenceCount} mention{resource.occurrenceCount === 1 ? '' : 's'}</span>
                    <span className="font-mono text-[7px] text-sparkle-text-muted/55">#{resource.latestTurnNumber}</span>
                </span>
            </span>
        </button>
    )
})

export function AssistantResourcesLibrary({
    resources,
    allResources,
    selectedResourceId,
    kindFilter,
    sourceFilter,
    turnFilter,
    kindCounts,
    sourceCounts,
    turnOptions,
    renderPreview,
    onSelectResource,
    onKindFilterChange,
    onSourceFilterChange,
    onTurnFilterChange,
    onOpenResource,
    onCopyResource,
    onOpenTurn,
    onOpenDiff
}: {
    resources: AssistantResource[]
    allResources: AssistantResource[]
    selectedResourceId: string | null
    kindFilter: ResourceKindFilter
    sourceFilter: ResourceSourceFilter
    turnFilter: ResourceTurnFilter
    kindCounts: Record<ResourceKindFilter, number>
    sourceCounts: Record<AssistantResourceSource, number>
    turnOptions: Array<{ id: string; number: number; count: number }>
    renderPreview: (resource: AssistantResource) => ReactNode
    onSelectResource: (resourceId: string | null) => void
    onKindFilterChange: (filter: ResourceKindFilter) => void
    onSourceFilterChange: (filter: ResourceSourceFilter) => void
    onTurnFilterChange: (filter: ResourceTurnFilter) => void
    onOpenResource: (resource: AssistantResource, inNewTab?: boolean) => void
    onCopyResource: (resource: AssistantResource) => void
    onOpenTurn: (turnId: string) => void
    onOpenDiff: (target: AssistantDiffTarget) => void
}) {
    const libraryRef = useRef<HTMLDivElement | null>(null)
    const [libraryWidth, setLibraryWidth] = useState(0)
    const selectedResource = resources.find((resource) => resource.id === selectedResourceId)
        || allResources.find((resource) => resource.id === selectedResourceId)
        || null
    const columnCount = Math.max(1, Math.floor((libraryWidth + 8) / 190))
    const rowHeight = 178
    const rowCount = Math.ceil(resources.length / columnCount)
    const { range, scrollElementRef, scrollToIndex } = usePreviewVirtualWindow({
        rowCount,
        rowHeight,
        restoreKey: `assistant-resource-library:${kindFilter}:${sourceFilter}:${turnFilter}`,
        overscanRows: 2,
        guardRows: 1
    })
    const renderedResources = resources.slice(range.start * columnCount, Math.min(resources.length, range.end * columnCount))

    useEffect(() => {
        const element = libraryRef.current
        if (!element || typeof ResizeObserver === 'undefined') return
        const update = () => setLibraryWidth(element.clientWidth)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!selectedResourceId) return
        if (!resources.some((resource) => resource.id === selectedResourceId)) onSelectResource(null)
    }, [onSelectResource, resources, selectedResourceId])

    const selectRelative = useCallback((direction: number) => {
        if (resources.length === 0) return
        const currentIndex = selectedResourceId ? resources.findIndex((resource) => resource.id === selectedResourceId) : -1
        const nextIndex = Math.max(0, Math.min(resources.length - 1, currentIndex < 0 ? 0 : currentIndex + direction))
        onSelectResource(resources[nextIndex]!.id)
        scrollToIndex(Math.floor(nextIndex / columnCount))
    }, [columnCount, onSelectResource, resources, scrollToIndex, selectedResourceId])

    const handleLibraryKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && selectedResourceId) {
            event.preventDefault()
            onSelectResource(null)
            return
        }
        if (event.key === 'Enter' && selectedResource) {
            event.preventDefault()
            onOpenResource(selectedResource)
            return
        }
        const movement = event.key === 'ArrowRight' ? 1
            : event.key === 'ArrowLeft' ? -1
                : event.key === 'ArrowDown' ? columnCount
                    : event.key === 'ArrowUp' ? -columnCount
                        : 0
        if (!movement) return
        event.preventDefault()
        selectRelative(movement)
    }, [columnCount, onOpenResource, onSelectResource, selectRelative, selectedResource, selectedResourceId])

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden">
            <ResourceFilterRail
                kindFilter={kindFilter}
                sourceFilter={sourceFilter}
                turnFilter={turnFilter}
                kindCounts={kindCounts}
                sourceCounts={sourceCounts}
                turnOptions={turnOptions}
                onKindFilterChange={onKindFilterChange}
                onSourceFilterChange={onSourceFilterChange}
                onTurnFilterChange={onTurnFilterChange}
            />
            <div ref={libraryRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" onKeyDown={handleLibraryKeyDown}>
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/[0.055] px-3">
                    <span className="text-[9px] font-semibold text-sparkle-text-secondary">Library</span>
                    <span className="font-mono text-[8px] text-sparkle-text-muted/45">{resources.length} item{resources.length === 1 ? '' : 's'}</span>
                </div>
                <div ref={scrollElementRef} role="listbox" aria-label="Resource library" aria-multiselectable="false" tabIndex={0} className="custom-scrollbar min-h-0 flex-1 overflow-auto p-2 outline-none">
                    {resources.length > 0 ? (
                        <div className="relative" style={{ height: rowCount * rowHeight }}>
                            <div
                                className="absolute inset-x-0 grid gap-2"
                                style={{
                                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 210px))`,
                                    transform: `translateY(${range.start * rowHeight}px)`
                                }}
                            >
                                {renderedResources.map((resource) => (
                                    <ResourceLibraryTile
                                        key={resource.id}
                                        resource={resource}
                                        selected={resource.id === selectedResourceId}
                                        preview={renderPreview(resource)}
                                        onSelect={(target) => onSelectResource(target.id)}
                                        onOpen={(target) => onOpenResource(target)}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center">
                            <div className="max-w-[240px]">
                                <ImageIcon size={20} className="mx-auto text-sparkle-text-muted/40" />
                                <p className="mt-3 text-[11px] font-medium text-sparkle-text-secondary">No matching resources</p>
                                <p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/55">Try another filter or search.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {selectedResource ? (
                <ResourceInspector
                    resource={selectedResource}
                    preview={renderPreview(selectedResource)}
                    onClose={() => onSelectResource(null)}
                    onOpen={() => onOpenResource(selectedResource)}
                    onOpenInNewTab={() => onOpenResource(selectedResource, selectedResource.kind === 'image' && !selectedResource.url)}
                    onCopy={() => onCopyResource(selectedResource)}
                    onOpenTurn={onOpenTurn}
                    onOpenDiff={onOpenDiff}
                />
            ) : null}
        </div>
    )
}

function ResourceFilterRail({
    kindFilter,
    sourceFilter,
    turnFilter,
    kindCounts,
    sourceCounts,
    turnOptions,
    onKindFilterChange,
    onSourceFilterChange,
    onTurnFilterChange
}: {
    kindFilter: ResourceKindFilter
    sourceFilter: ResourceSourceFilter
    turnFilter: ResourceTurnFilter
    kindCounts: Record<ResourceKindFilter, number>
    sourceCounts: Record<AssistantResourceSource, number>
    turnOptions: Array<{ id: string; number: number; count: number }>
    onKindFilterChange: (filter: ResourceKindFilter) => void
    onSourceFilterChange: (filter: ResourceSourceFilter) => void
    onTurnFilterChange: (filter: ResourceTurnFilter) => void
}) {
    const kinds: Array<{ id: ResourceKindFilter; label: string }> = [
        { id: 'all', label: 'All resources' },
        { id: 'images', label: 'Images' },
        { id: 'links', label: 'Links' }
    ]
    const sources: AssistantResourceSource[] = ['attached', 'generated', 'changed', 'mentioned']
    return (
        <aside className="custom-scrollbar w-[210px] shrink-0 overflow-y-auto border-r border-white/[0.055] bg-[color-mix(in_srgb,var(--color-card)_66%,var(--color-bg))] px-2 py-2" aria-label="Resource filters">
            <FilterSection label="Type">
                {kinds.map((entry) => <FilterButton key={entry.id} active={kindFilter === entry.id} label={entry.label} count={kindCounts[entry.id]} onClick={() => onKindFilterChange(entry.id)} />)}
            </FilterSection>
            <FilterSection label="Source">
                <FilterButton active={sourceFilter === 'all'} label="All sources" count={Object.values(sourceCounts).reduce((sum, count) => sum + count, 0)} onClick={() => onSourceFilterChange('all')} />
                {sources.filter((source) => sourceCounts[source] > 0).map((source) => <FilterButton key={source} active={sourceFilter === source} label={resourceSourceBadgeLabel(source)} count={sourceCounts[source]} onClick={() => onSourceFilterChange(source)} />)}
            </FilterSection>
            {turnOptions.length > 0 ? (
                <FilterSection label="Turns">
                    <FilterButton active={turnFilter === 'all'} label="All turns" count={turnOptions.reduce((sum, turn) => sum + turn.count, 0)} onClick={() => onTurnFilterChange('all')} />
                    {turnOptions.slice(0, 10).map((turn) => <FilterButton key={turn.id} active={turnFilter === turn.id} label={`Turn ${turn.number}`} count={turn.count} onClick={() => onTurnFilterChange(turn.id)} />)}
                </FilterSection>
            ) : null}
        </aside>
    )
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="mb-4 last:mb-0">
            <h3 className="mb-1 px-2 text-[7px] font-bold uppercase tracking-[0.1em] text-sparkle-text-muted/40">{label}</h3>
            <div className="space-y-px">{children}</div>
        </section>
    )
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={active} className={cn('flex h-7 w-full items-center rounded-md px-2 text-left text-[9px]', active ? 'bg-[var(--surface-active)] font-medium text-sparkle-text' : 'text-sparkle-text-muted/65 hover:bg-[var(--surface-hover)] hover:text-sparkle-text-secondary')}>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="font-mono text-[7px] text-sparkle-text-muted/45">{count}</span>
        </button>
    )
}

function ResourceInspector({
    resource,
    preview,
    onClose,
    onOpen,
    onOpenInNewTab,
    onCopy,
    onOpenTurn,
    onOpenDiff
}: {
    resource: AssistantResource
    preview: ReactNode
    onClose: () => void
    onOpen: () => void
    onOpenInNewTab: () => void
    onCopy: () => void
    onOpenTurn: (turnId: string) => void
    onOpenDiff: (target: AssistantDiffTarget) => void
}) {
    const host = resource.url ? resolveExternalMarkdownHost(resource.url) : null
    return (
        <aside className="custom-scrollbar w-[340px] shrink-0 overflow-y-auto border-l border-white/[0.055] bg-[color-mix(in_srgb,var(--color-card)_76%,var(--color-bg))]" aria-label="Selected resource details">
            <div className="flex h-9 items-center border-b border-white/[0.055] px-3">
                <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-sparkle-text-secondary">Resource details</span>
                <button type="button" onClick={onClose} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/55 hover:bg-white/[0.05] hover:text-sparkle-text" title="Close resource details" aria-label="Close resource details"><X size={12} /></button>
            </div>
            <div className="flex h-[190px] items-center justify-center overflow-hidden border-b border-white/[0.055] bg-black/15">
                {resource.kind === 'image' ? preview : (
                    <div className="flex min-w-0 items-center gap-3 px-5">
                        {host ? <MarkdownSiteIcon host={host} className="inline-flex size-10 shrink-0" /> : <Globe2 size={38} className="text-sky-200/65" />}
                        <div className="min-w-0"><div className="truncate text-[13px] font-medium text-sparkle-text">{host || resource.title}</div><div className="mt-1 truncate text-[9px] text-sparkle-text-muted/55">{resource.subtitle}</div></div>
                    </div>
                )}
            </div>
            <div className="p-3">
                <h2 className="break-words text-[13px] font-semibold leading-5 text-sparkle-text">{resource.title}</h2>
                <p className="mt-1 break-all font-mono text-[8px] leading-4 text-sparkle-text-muted/55">{resourceLocation(resource)}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                    {resource.sources.map((source) => <span key={source} className={cn('border px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.04em]', resourceSourceBadgeClass(source))}>{resourceSourceBadgeLabel(source)}</span>)}
                </div>
                <dl className="mt-4 divide-y divide-white/[0.05] border-y border-white/[0.05] text-[9px]">
                    <InspectorRow label="Type" value={resource.kind === 'image' ? 'Image' : 'Link'} />
                    <InspectorRow label="Mentions" value={String(resource.occurrenceCount)} />
                    <InspectorRow label="Latest turn" value={`#${resource.latestTurnNumber}`} action={() => onOpenTurn(resource.latestTurnId)} />
                </dl>
                <div className="mt-4">
                    <h3 className="text-[7px] font-bold uppercase tracking-[0.1em] text-sparkle-text-muted/40">Provenance</h3>
                    <div className="mt-1.5 space-y-1">
                        {resource.origins.slice(0, 8).map((origin) => (
                            <button key={origin.key} type="button" onClick={() => onOpenTurn(origin.turnId)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]">
                                <span className="min-w-0 flex-1 truncate text-[8px] capitalize text-sparkle-text-secondary/75">{origin.kind}</span>
                                <span className="font-mono text-[7px] text-sparkle-text-muted/50">Turn {origin.turnNumber}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={onOpen} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 text-[9px] font-semibold text-white hover:brightness-110"><ExternalLink size={11} />Open</button>
                    <button type="button" onClick={onCopy} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] text-[9px] font-medium text-sparkle-text-secondary hover:bg-white/[0.04]"><Copy size={11} />Copy</button>
                    <button type="button" onClick={onOpenInNewTab} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] text-[9px] font-medium text-sparkle-text-secondary hover:bg-white/[0.04]"><ArrowUpRight size={11} />Open in tab</button>
                    {resource.latestDiffTarget ? <button type="button" onClick={() => onOpenDiff(resource.latestDiffTarget!)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] text-[9px] font-medium text-sparkle-text-secondary hover:bg-white/[0.04]"><FileClock size={11} />Review</button> : <span />}
                </div>
            </div>
        </aside>
    )
}

function InspectorRow({ label, value, action }: { label: string; value: string; action?: () => void }) {
    return (
        <div className="flex min-h-8 items-center gap-3 py-1.5">
            <dt className="w-20 shrink-0 text-sparkle-text-muted/45">{label}</dt>
            <dd className="min-w-0 flex-1 text-right text-sparkle-text-secondary/80">{action ? <button type="button" onClick={action} className="hover:text-sparkle-text">{value}</button> : value}</dd>
        </div>
    )
}

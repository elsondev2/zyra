import {
    ChevronDown,
    ChevronUp,
    Maximize2,
    Search,
    ZoomIn,
    ZoomOut
} from 'lucide-react'
import { FileEntryIcon } from '@/components/ui/FileEntryIcon'
import { useThemeRevision } from '@/lib/use-theme-revision'
import { cn } from '@/lib/utils'
import type { OfficePreviewPosition, OfficePreviewType } from './officePreviewViewer'

function OfficeTypeMark({ type }: { type: OfficePreviewType }) {
    useThemeRevision()
    const iconTheme = typeof document !== 'undefined' && document.body.classList.contains('light') ? 'light' : 'dark'
    return (
        <span className={cn(
            'inline-flex size-5 items-center justify-center rounded-[4px]',
            type === 'docx'
                ? 'bg-[color-mix(in_srgb,var(--status-info)_14%,transparent)] text-[color-mix(in_srgb,var(--status-info)_72%,var(--color-text))]'
                : type === 'xlsx'
                    ? 'bg-[color-mix(in_srgb,var(--status-success)_14%,transparent)] text-[color-mix(in_srgb,var(--status-success)_72%,var(--color-text))]'
                    : 'bg-[color-mix(in_srgb,var(--status-warning)_14%,transparent)] text-[color-mix(in_srgb,var(--status-warning)_72%,var(--color-text))]'
        )}>
            <FileEntryIcon pathValue={`preview.${type}`} kind="file" theme={iconTheme} size={13} />
        </span>
    )
}

const controlClass = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted outline-none hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/55 disabled:pointer-events-none disabled:opacity-30'

export function OfficePreviewToolbar({
    type,
    ready,
    position,
    scale,
    query,
    onQueryChange,
    resultCount,
    activeResult,
    searching,
    onSearch,
    onPreviousResult,
    onNextResult,
    onZoomOut,
    onZoomIn,
    onFitWidth,
    onFitPage
}: {
    type: OfficePreviewType
    ready: boolean
    position: OfficePreviewPosition | null
    scale: number
    query: string
    onQueryChange: (query: string) => void
    resultCount: number | null
    activeResult: number
    searching: boolean
    onSearch: () => void
    onPreviousResult: () => void
    onNextResult: () => void
    onZoomOut: () => void
    onZoomIn: () => void
    onFitWidth: () => void
    onFitPage: () => void
}) {
    const positionText = position && position.total > 0
        ? `${position.unit[0].toUpperCase()}${position.unit.slice(1)} ${position.index + 1} of ${position.total}`
        : type.toUpperCase()
    const resultText = resultCount === null
        ? ''
        : resultCount === 0 ? 'No results' : `${activeResult} of ${resultCount}`

    return (
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--surface-divider)] bg-[var(--surface-chrome)] px-2.5">
            <OfficeTypeMark type={type} />
            <span className="mr-1 min-w-[88px] text-[10px] tabular-nums text-sparkle-text-secondary">{positionText}</span>
            <div className="h-4 w-px bg-[var(--surface-divider)]" />
            <form
                className="ml-1 flex h-7 min-w-0 max-w-[300px] flex-1 items-center rounded-md border border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-bg)_72%,var(--color-card))] focus-within:border-[var(--accent-primary)]/45"
                onSubmit={(event) => {
                    event.preventDefault()
                    onSearch()
                }}
            >
                <Search className="ml-2 size-3 shrink-0 text-sparkle-text-muted" />
                <input
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') onQueryChange('')
                    }}
                    placeholder="Find in document"
                    aria-label="Find in Office document"
                    className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-[10px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/55"
                />
                {searching ? <span className="mr-2 text-[9px] text-sparkle-text-muted">Searching…</span> : null}
                {!searching && resultText ? <span className="mr-1 whitespace-nowrap text-[9px] tabular-nums text-sparkle-text-muted">{resultText}</span> : null}
                <button type="button" className={cn(controlClass, 'size-6 rounded')} disabled={!ready || !resultCount} onClick={onPreviousResult} title="Previous match"><ChevronUp className="size-3" /></button>
                <button type="button" className={cn(controlClass, 'mr-0.5 size-6 rounded')} disabled={!ready || !resultCount} onClick={onNextResult} title="Next match"><ChevronDown className="size-3" /></button>
            </form>
            <div className="ml-auto flex items-center gap-0.5">
                <button type="button" className={controlClass} disabled={!ready} onClick={onZoomOut} title="Zoom out"><ZoomOut className="size-3.5" /></button>
                <span className="w-9 text-center text-[9px] tabular-nums text-sparkle-text-muted">{Math.round(scale * 100)}%</span>
                <button type="button" className={controlClass} disabled={!ready} onClick={onZoomIn} title="Zoom in"><ZoomIn className="size-3.5" /></button>
                <button type="button" className={controlClass} disabled={!ready} onClick={onFitWidth} title="Fit width"><span className="text-[12px] leading-none">↔</span></button>
                <button type="button" className={controlClass} disabled={!ready} onClick={onFitPage} title="Fit page"><Maximize2 className="size-3.5" /></button>
            </div>
        </div>
    )
}

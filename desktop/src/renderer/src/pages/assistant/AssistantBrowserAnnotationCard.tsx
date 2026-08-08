import { Frame, MousePointer2, PenLine, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DevScopeBrowserAnnotationPayload } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'

function Stat({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
    if (count <= 0) return null
    return <span className="inline-flex items-center gap-1 text-[9px] text-sparkle-text-muted" title={`${count} ${label}${count === 1 ? '' : 's'}`}>{icon}{count}</span>
}

export function AssistantBrowserAnnotationCard({
    annotation,
    previewDataUrl,
    onOpen,
    onRemove,
    removing
}: {
    annotation: DevScopeBrowserAnnotationPayload
    previewDataUrl: string
    onOpen: () => void
    onRemove: () => void
    removing: boolean
}) {
    return (
        <article
            data-composer-attachment-item="true"
            className="group relative flex w-[min(320px,calc(100vw-32px))] min-w-0 items-center overflow-hidden rounded-lg border border-[var(--surface-divider)] bg-[var(--color-card)] shadow-lg"
            style={{
                transition: 'transform 190ms ease, opacity 190ms ease',
                transform: removing ? 'translateY(5px) scale(0.9)' : 'translateY(0) scale(1)',
                opacity: removing ? 0 : 1
            }}
        >
            <button type="button" onClick={onOpen} className="size-16 shrink-0 overflow-hidden border-r border-[var(--surface-divider)] bg-black" aria-label="Open annotated Browser image">
                <img src={previewDataUrl} alt="Annotated Browser crop" className="size-full object-cover" draggable={false} />
            </button>
            <div className="min-w-0 flex-1 px-2.5 py-2 pr-8">
                {annotation.comment ? <p className="truncate text-[11px] font-medium text-sparkle-text">{annotation.comment}</p> : null}
                <p className={cn('truncate font-mono text-[9px] text-sparkle-text-muted', annotation.comment && 'mt-0.5')}>{annotation.title || annotation.url || 'Browser annotation'}</p>
                <div className="mt-1.5 flex items-center gap-2">
                    <Stat icon={<MousePointer2 size={10} />} count={annotation.elements.length} label="element" />
                    <Stat icon={<Frame size={10} />} count={annotation.regions.length} label="region" />
                    <Stat icon={<PenLine size={10} />} count={annotation.strokes.length} label="drawing" />
                </div>
            </div>
            <button
                type="button"
                onClick={onRemove}
                disabled={removing}
                className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                aria-label="Remove Browser annotation"
            >
                <X size={11} />
            </button>
        </article>
    )
}

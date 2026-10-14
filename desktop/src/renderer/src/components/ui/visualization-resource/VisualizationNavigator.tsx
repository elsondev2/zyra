import { Box, Code2, Workflow } from 'lucide-react'
import type { VisualizationResource } from '@shared/visualization-resources'

/** One entry per resource identity. Revisions belong to the viewer, not navigation. */
export function VisualizationNavigator({
    resources,
    selectedId,
    onSelect,
    compact = false,
}: {
    resources: VisualizationResource[]
    selectedId: string
    onSelect: (resource: VisualizationResource) => void
    compact?: boolean
}) {
    const unique = [...new Map(resources.map((resource) => [resource.id, resource])).values()]
    return (
        <nav
            aria-label="Saved visualizations"
            className={`custom-scrollbar min-h-0 shrink-0 overflow-y-auto border-r border-[var(--surface-divider)] bg-[var(--color-bg)] ${compact ? 'w-24' : 'w-52'}`}
        >
            <div className="px-2.5 py-2 text-[10px] font-medium text-sparkle-text-muted">Visualizations</div>
            {unique.map((resource) => {
                const Icon =
                    resource.kind === 'scene3d' ? Box : resource.kind === 'mermaid' ? Workflow : Code2
                return (
                    <button
                        key={resource.id}
                        type="button"
                        aria-current={resource.id === selectedId ? 'page' : undefined}
                        title={resource.title}
                        onClick={() => onSelect(resource)}
                        className={`flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left text-[11px] outline-none focus-visible:bg-[var(--surface-hover)] ${resource.id === selectedId ? 'bg-[var(--surface-active)] text-sparkle-text' : 'text-sparkle-text-secondary hover:bg-[var(--surface-hover)]'}`}
                    >
                        <Icon size={13} className="shrink-0 text-sparkle-text-muted" />
                        <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                    </button>
                )
            })}
        </nav>
    )
}

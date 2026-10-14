import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { addOverlayEventListener, createOverlayPortal } from '../native-overlay-portal'
import type { VisualizationResource, VisualizationUseDetail } from '@shared/visualization-resources'
import { VisualizationNavigator } from './VisualizationNavigator'
import { VisualizationResourceView } from './VisualizationResourceView'

export function VisualizationWorkspace({
    resource,
    initialVersion,
    initialTab = 'Preview',
    resources,
    threadId,
    onClose,
    onUseVersion,
    onOpenTurn,
}: {
    resource: VisualizationResource
    initialVersion?: number
    initialTab?: 'Preview' | 'Code' | 'Versions'
    resources?: VisualizationResource[]
    threadId?: string
    onClose: () => void
    onUseVersion?: (detail: VisualizationUseDetail) => void
    onOpenTurn?: (turnId: string) => void
}) {
    const [items, setItems] = useState(resources || [resource])
    const [selected, setSelected] = useState(resource)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    useEffect(
        () =>
            addOverlayEventListener('keydown', (event) => {
                if (event.key === 'Escape') onClose()
            }),
        [onClose],
    )
    useEffect(() => {
        if (resources) {
            setItems(resources)
            return
        }
        if (!threadId || !window.devscope.assistant.listVisualizations) return
        let cancelled = false
        void window.devscope.assistant
            .listVisualizations({ threadId, scope: 'thread' })
            .then((result) => {
                if (!cancelled && result.success)
                    setItems([
                        resource,
                        ...(result.resources || []).filter((item) => item.id !== resource.id),
                    ])
            })
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [resources, resource, threadId])
    useEffect(() => {
        let cancelled = false
        if (selected.sourceLoaded !== false || !threadId) return
        const get = window.devscope.assistant.getVisualization
        if (!get) {
            setError('Visualization details are unavailable in this client.')
            return
        }
        setLoading(true)
        setError('')
        void get({ threadId, id: selected.id })
            .then((result) => {
                if (cancelled) return
                if (!result.success || !result.resource)
                    throw new Error(
                        !result.success
                            ? result.error || 'Could not load visualization.'
                            : 'Could not load visualization.',
                    )
                setSelected(result.resource)
            })
            .catch((cause) => {
                if (!cancelled)
                    setError(cause instanceof Error ? cause.message : 'Could not load visualization.')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [selected.id, selected.sourceLoaded, threadId])
    return createOverlayPortal(
        <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label="Visualization workspace"
                className="flex h-[calc(100dvh-24px)] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--surface-divider)] bg-[var(--color-bg)] shadow-2xl"
            >
                <div className="flex min-h-0 flex-1">
                    <VisualizationNavigator
                        resources={items}
                        selectedId={selected.id}
                        onSelect={(item) => {
                            setSelected(item)
                            setError('')
                        }}
                    />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        {loading || error ? (
                            <>
                                <div className="flex h-10 shrink-0 items-center border-b border-[var(--surface-divider)] px-2">
                                    <span className="min-w-0 flex-1 truncate text-xs">{selected.title}</span>
                                    <button
                                        type="button"
                                        aria-label="Close visualization details"
                                        className="grid size-6 place-items-center"
                                        onClick={onClose}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                                <p
                                    role={error ? 'alert' : 'status'}
                                    className="p-4 text-xs text-sparkle-text-muted"
                                >
                                    {error || 'Loading visualization…'}
                                </p>
                            </>
                        ) : (
                            <VisualizationResourceView
                                key={selected.id}
                                resource={selected}
                                initialVersion={selected.id === resource.id ? initialVersion : undefined}
                                initialTab={initialTab}
                                threadId={threadId}
                                allowExpand={false}
                                onClose={onClose}
                                onUseVersion={onUseVersion}
                                onOpenTurn={onOpenTurn}
                            />
                        )}
                    </div>
                </div>
            </section>
        </div>,
        document.body,
    )
}

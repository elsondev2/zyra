import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Copy, Download, Expand, GitCompareArrows, Info, MessageSquare, X } from 'lucide-react'
import { getVisualizationThreadAliases, useSavedVisualization } from '@/pages/assistant/visualization-context'
import {
    type VisualizationResource,
    type VisualizationRevision,
    type VisualizationUseDetail,
} from '@shared/visualization-resources'
import {
    nextVisualizationVersion,
    revisionLineDiff,
    visualizationDate,
    visualizationEmbed,
    visualizationExport,
    visualizationKindLabel,
} from './visualization-resource-utils'
import { VisualizationSource } from './VisualizationSource'

const HtmlPreview = lazy(() =>
    import('../visualization/VisualizationPreview').then((module) => ({
        default: module.VisualizationPreview,
    })),
)
const MermaidPreview = lazy(() =>
    import('../markdown/MermaidDiagram').then((module) => ({ default: module.MermaidDiagram })),
)
const ScenePreview = lazy(() =>
    import('../scene3d/Scene3DViewer').then((module) => ({ default: module.Scene3DViewer })),
)
const Workspace = lazy(() =>
    import('./VisualizationWorkspace').then((module) => ({ default: module.VisualizationWorkspace })),
)
const tabs = ['Preview', 'Code', 'Versions'] as const
const iconClass =
    'inline-flex size-6 shrink-0 items-center justify-center rounded text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]'

export type VisualizationResourceViewProps = {
    resource: VisualizationResource
    initialVersion?: number
    initialTab?: (typeof tabs)[number]
    threadId?: string
    relatedResources?: VisualizationResource[]
    allowExpand?: boolean
    onClose?: () => void
    onUseVersion?: (detail: VisualizationUseDetail) => void
    onOpenTurn?: (turnId: string) => void
}
export function VisualizationResourceView({
    resource,
    initialVersion,
    initialTab = 'Preview',
    threadId,
    relatedResources,
    allowExpand = true,
    onClose,
    onUseVersion,
    onOpenTurn,
}: VisualizationResourceViewProps) {
    const [version, setVersion] = useState(initialVersion ?? resource.latestVersion)
    const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab)
    const [expanded, setExpanded] = useState(false)
    const [compareVersion, setCompareVersion] = useState<number | null>(null)
    const [notice, setNotice] = useState('')
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
    const uid = useId()
    const previousResource = useRef({
        id: resource.id,
        initialVersion,
        latestVersion: resource.latestVersion,
    })
    useEffect(() => {
        const previous = previousResource.current
        if (previous.id !== resource.id || previous.initialVersion !== initialVersion) {
            setVersion(initialVersion ?? resource.latestVersion)
            setCompareVersion(null)
            setNotice('')
            setExpanded(false)
        } else if (previous.latestVersion !== resource.latestVersion) {
            setVersion((current) =>
                nextVisualizationVersion(
                    current,
                    previous.latestVersion,
                    resource.latestVersion,
                    initialVersion,
                ),
            )
        }
        previousResource.current = { id: resource.id, initialVersion, latestVersion: resource.latestVersion }
    }, [resource.id, initialVersion, resource.latestVersion])
    useEffect(() => {
        if (!notice) return
        const id = window.setTimeout(() => setNotice(''), 3000)
        return () => window.clearTimeout(id)
    }, [notice])
    const revision = resource.versions.find((item) => item.version === version)
    const comparison = resource.versions.find((item) => item.version === compareVersion)
    const alternatives = resource.versions.filter((item) => item.version !== version)
    const diff = useMemo(
        () => (comparison && revision ? revisionLineDiff(comparison.source, revision.source) : []),
        [comparison, revision],
    )
    const useRevision = () => {
        if (!revision || !threadId) return
        const detail: VisualizationUseDetail = {
            threadId,
            id: resource.id,
            version: revision.version,
            title: revision.title,
            kind: resource.kind,
        }
        try {
            if (onUseVersion) onUseVersion(detail)
            else useSavedVisualization(detail)
            setNotice(`Version ${revision.version} added to chat context.`)
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not use this version in chat.')
        }
    }
    const copyText = async (text: string, success: string) => {
        try {
            const result = await window.devscope.copyToClipboard(text)
            setNotice(result.success ? success : result.error || 'Could not copy.')
        } catch {
            setNotice('Could not copy.')
        }
    }
    const download = () => {
        const exported = visualizationExport(resource, version)
        const url = URL.createObjectURL(new Blob([exported.source], { type: exported.mime }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = exported.filename
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    const metadata = [
        visualizationKindLabel(resource.kind),
        revision?.summary || resource.summary,
        revision && `Saved ${visualizationDate(revision.createdAt)}`,
    ]
        .filter(Boolean)
        .join('\n')
    return (
        <section
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-sparkle-text"
            aria-label="Visualization details"
        >
            <header className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--surface-divider)] px-2">
                <h2
                    id={`${uid}-title`}
                    className="min-w-0 flex-1 truncate text-xs font-medium"
                    title={revision?.title || resource.title}
                >
                    {revision?.title || resource.title}
                </h2>
                <button
                    type="button"
                    className={iconClass}
                    aria-label="Visualization details info"
                    title={metadata}
                >
                    <Info size={12} />
                </button>
                {revision && (
                    <time dateTime={revision.createdAt} className="sr-only">
                        {visualizationDate(revision.createdAt)}
                    </time>
                )}
                <select
                    aria-label="Visualization version"
                    title="Choose saved version"
                    value={version}
                    onChange={(event) => {
                        setVersion(Number(event.target.value))
                        setCompareVersion(null)
                    }}
                    className="h-6 max-w-16 shrink-0 rounded border-0 bg-transparent px-1 text-[11px] text-sparkle-text-secondary outline-none hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
                >
                    {[...resource.versions]
                        .sort((a, b) => b.version - a.version)
                        .map((item) => (
                            <option key={item.version} value={item.version}>
                                v{item.version}
                            </option>
                        ))}
                </select>
                {onClose && (
                    <button
                        type="button"
                        className={iconClass}
                        aria-label="Close visualization details"
                        title="Close visualization"
                        onClick={onClose}
                    >
                        <X size={13} />
                    </button>
                )}
            </header>
            <div className="flex min-h-8 shrink-0 flex-wrap items-center border-b border-[var(--surface-divider)] px-1">
                <div
                    role="tablist"
                    aria-label="Visualization views"
                    className="flex min-w-0 items-center self-stretch"
                >
                    {tabs.map((name, index) => (
                        <button
                            key={name}
                            ref={(element) => {
                                tabRefs.current[index] = element
                            }}
                            type="button"
                            role="tab"
                            id={`${uid}-tab-${name}`}
                            aria-controls={`${uid}-panel`}
                            aria-selected={tab === name}
                            tabIndex={tab === name ? 0 : -1}
                            className={`self-stretch border-b-2 px-2.5 text-[11px] ${tab === name ? 'border-[var(--accent-primary)] text-sparkle-text' : 'border-transparent text-sparkle-text-muted hover:text-sparkle-text'}`}
                            onClick={() => setTab(name)}
                            onKeyDown={(event) => {
                                const next =
                                    event.key === 'ArrowRight'
                                        ? (index + 1) % tabs.length
                                        : event.key === 'ArrowLeft'
                                          ? (index + tabs.length - 1) % tabs.length
                                          : event.key === 'Home'
                                            ? 0
                                            : event.key === 'End'
                                              ? tabs.length - 1
                                              : -1
                                if (next >= 0) {
                                    event.preventDefault()
                                    setTab(tabs[next]!)
                                    tabRefs.current[next]?.focus()
                                }
                            }}
                        >
                            {name}
                        </button>
                    ))}
                </div>
                <div
                    role="toolbar"
                    aria-label={`${tab} actions`}
                    className="ml-auto flex items-center gap-0.5"
                >
                    {tab === 'Code' && (
                        <>
                            {alternatives.length > 0 && (
                                <button
                                    type="button"
                                    aria-label="Compare versions"
                                    title={
                                        compareVersion
                                            ? 'Show source without comparison'
                                            : 'Compare with another version'
                                    }
                                    aria-pressed={compareVersion !== null}
                                    className={`${iconClass} ${compareVersion !== null ? 'bg-[var(--surface-active)] text-[var(--accent-primary)]' : ''}`}
                                    onClick={() =>
                                        setCompareVersion((current) =>
                                            current !== null
                                                ? null
                                                : revision?.parentVersion || alternatives[0]!.version,
                                        )
                                    }
                                >
                                    <GitCompareArrows size={13} />
                                </button>
                            )}
                            {comparison && (
                                <select
                                    aria-label="Compare against version"
                                    title="Compare against version"
                                    value={compareVersion!}
                                    onChange={(event) => setCompareVersion(Number(event.target.value))}
                                    className="h-6 rounded bg-[var(--color-bg)] px-1 text-[10px] text-sparkle-text-secondary"
                                >
                                    {alternatives.map((item) => (
                                        <option key={item.version} value={item.version}>
                                            v{item.version}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="button"
                                aria-label="Copy code"
                                title="Copy code"
                                disabled={!revision}
                                className={iconClass}
                                onClick={() => revision && void copyText(revision.source, 'Source copied.')}
                            >
                                <Copy size={12} />
                            </button>
                        </>
                    )}
                    {allowExpand && (
                        <button
                            type="button"
                            aria-label="Expand visualization"
                            title="Open visualization workspace"
                            className={iconClass}
                            onClick={() => setExpanded(true)}
                        >
                            <Expand size={12} />
                        </button>
                    )}
                </div>
            </div>
            <div
                role="tabpanel"
                id={`${uid}-panel`}
                aria-labelledby={`${uid}-tab-${tab}`}
                tabIndex={0}
                className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"
            >
                {!revision ? (
                    <p role="alert" className="p-3">
                        This version is unavailable.
                    </p>
                ) : tab === 'Preview' ? (
                    (!expanded || !allowExpand) && <ResourcePreview resource={resource} revision={revision} />
                ) : tab === 'Code' ? (
                    comparison ? (
                        <pre
                            aria-label={`Changes from v${comparison.version} to v${version}`}
                            className="min-h-full min-w-full p-3 font-mono text-xs leading-5"
                        >
                            {diff.map((line, index) => (
                                <div
                                    key={index}
                                    className={
                                        line.kind === 'added'
                                            ? 'bg-emerald-500/10'
                                            : line.kind === 'removed'
                                              ? 'bg-red-500/10'
                                              : 'text-sparkle-text-muted'
                                    }
                                    style={{
                                        color:
                                            line.kind === 'added'
                                                ? 'color-mix(in srgb, var(--color-text) 70%, #22b5aa)'
                                                : line.kind === 'removed'
                                                  ? 'color-mix(in srgb, var(--color-text) 70%, #e45b6d)'
                                                  : undefined,
                                    }}
                                >
                                    <span className="mr-3 inline-block w-14 select-none text-right opacity-50">
                                        {line.oldLine || ''} {line.newLine || ''}
                                    </span>
                                    {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                                    {line.text || ' '}
                                </div>
                            ))}
                        </pre>
                    ) : (
                        <VisualizationSource source={revision.source} />
                    )
                ) : (
                    <ol className="divide-y divide-white/[0.08]">
                        {[...resource.versions]
                            .sort((a, b) => b.version - a.version)
                            .map((item) => (
                                <li key={item.version}>
                                    <button
                                        type="button"
                                        aria-pressed={version === item.version}
                                        onClick={() => {
                                            setVersion(item.version)
                                            setCompareVersion(null)
                                        }}
                                        className={`w-full border-l-2 px-3 py-3 text-left ${version === item.version ? 'border-[var(--accent-primary)] bg-[var(--surface-active)]' : 'border-transparent hover:bg-[var(--surface-hover)]'}`}
                                    >
                                        <span className="text-xs font-medium">
                                            v{item.version} · {item.title}
                                        </span>
                                        <time
                                            dateTime={item.createdAt}
                                            className="mt-1 block text-[10px] text-sparkle-text-muted"
                                        >
                                            {visualizationDate(item.createdAt)}
                                        </time>
                                        <span className="mt-1 block text-[11px] text-sparkle-text-secondary">
                                            {item.changeNote || item.summary || 'Saved revision'}
                                        </span>
                                        <span className="mt-1 block text-[10px] text-sparkle-text-muted">
                                            {item.parentVersion
                                                ? `Based on v${item.parentVersion}`
                                                : 'Original version'}
                                        </span>
                                    </button>
                                </li>
                            ))}
                    </ol>
                )}
            </div>
            <footer className="flex min-h-8 shrink-0 flex-wrap items-center gap-1 border-t border-[var(--surface-divider)] px-2 py-1">
                <button
                    type="button"
                    disabled={!revision || !threadId}
                    title={
                        !threadId
                            ? 'Open a chat to use this version'
                            : 'Add this exact version as agent context'
                    }
                    className="inline-flex h-6 items-center gap-1.5 rounded px-1.5 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-40"
                    onClick={useRevision}
                >
                    <MessageSquare size={12} />
                    Use in chat
                </button>
                <span className="ml-auto flex items-center gap-0.5">
                    {onOpenTurn && revision?.origin?.turnId && getVisualizationThreadAliases(threadId).includes(revision.origin.threadId) && (
                        <button
                            type="button"
                            title="Source turn"
                            className="px-1 text-[10px] text-sparkle-text-muted hover:text-sparkle-text"
                            onClick={() => onOpenTurn(revision.origin!.turnId!)}
                        >
                            Source turn
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label="Copy embed"
                        title="Copy pinned embed"
                        disabled={!revision}
                        className={iconClass}
                        onClick={() =>
                            void copyText(
                                visualizationEmbed(resource.id, version),
                                `Copied pinned embed for v${version}.`,
                            )
                        }
                    >
                        <Copy size={12} />
                    </button>
                    <button
                        type="button"
                        aria-label="Export source"
                        title="Export source"
                        disabled={!revision}
                        className={iconClass}
                        onClick={download}
                    >
                        <Download size={12} />
                    </button>
                </span>
                {notice && (
                    <span
                        role="status"
                        aria-live="polite"
                        className="w-full text-[10px] text-sparkle-text-muted"
                    >
                        {notice}
                    </span>
                )}
            </footer>
            {allowExpand && expanded && (
                <Suspense fallback={null}>
                    <Workspace
                        resource={resource}
                        initialVersion={version}
                        initialTab={tab}
                        resources={relatedResources}
                        threadId={threadId}
                        onClose={() => setExpanded(false)}
                        onUseVersion={onUseVersion}
                        onOpenTurn={onOpenTurn}
                    />
                </Suspense>
            )}
        </section>
    )
}
function ResourcePreview({
    resource,
    revision,
}: {
    resource: VisualizationResource
    revision: VisualizationRevision
}) {
    if (resource.sourceLoaded === false) return <div role="status" className="grid min-h-64 flex-1 place-items-center text-xs text-sparkle-text-muted">Loading preview…</div>
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col [&>section]:flex-1">
            <Suspense
                fallback={
                    <div
                        role="status"
                        className="grid min-h-64 flex-1 place-items-center text-xs text-sparkle-text-muted"
                    >
                        Loading preview…
                    </div>
                }
            >
                {resource.kind === 'html' ? (
                    <HtmlPreview
                        streaming={false}
                        hideHeader
                        fill
                        block={{
                            kind: 'visualization',
                            start: 0,
                            title: revision.title,
                            summary: revision.summary,
                            height: revision.height,
                            state: 'complete',
                            html: revision.source,
                        }}
                    />
                ) : resource.kind === 'mermaid' ? (
                    <div className="flex min-h-0 flex-1 flex-col [&>div]:flex-1">
                        <MermaidPreview chart={revision.source} fill hideExpand />
                    </div>
                ) : (
                    <ScenePreview source={revision.source} expanded />
                )}
            </Suspense>
        </div>
    )
}

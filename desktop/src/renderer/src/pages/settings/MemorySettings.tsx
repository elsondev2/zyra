import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BrainCircuit, Check, Copy, FileText, FolderOpen, RefreshCw, Sparkles } from 'lucide-react'
import type { ZyraMemoryOverview } from '@shared/contracts/memory-contracts'
import { cn } from '@/lib/utils'

type LoadState =
    | { status: 'loading'; overview: ZyraMemoryOverview | null; error: null }
    | { status: 'ready'; overview: ZyraMemoryOverview; error: null }
    | { status: 'error'; overview: null; error: string }

export default function MemorySettings() {
    const [state, setState] = useState<LoadState>({ status: 'loading', overview: null, error: null })
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [copiedPath, setCopiedPath] = useState<string | null>(null)

    const load = async () => {
        setState((current) => ({ status: 'loading', overview: current.overview, error: null }))
        const result = await window.devscope.memory.getOverview()
        if (!result.success) {
            setState({ status: 'error', overview: null, error: result.error })
            return
        }
        setState({ status: 'ready', overview: result.overview, error: null })
        setSelectedId((current) => current || result.overview.memoryLayers[0]?.id || null)
    }

    useEffect(() => {
        void load()
    }, [])

    const overview = state.overview
    const selectedLayer = useMemo(() => {
        if (!overview) return null
        return overview.memoryLayers.find((layer) => layer.id === selectedId) || overview.memoryLayers[0] || null
    }, [overview, selectedId])

    const copyPath = async (path: string) => {
        await window.devscope.copyToClipboard(path)
        setCopiedPath(path)
        window.setTimeout(() => setCopiedPath((current) => current === path ? null : current), 1400)
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-500/10 p-2">
                        <BrainCircuit className="text-amber-300" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-sparkle-text">Zyra Memory</h1>
                        <p className="text-sm text-sparkle-text-secondary">The local layers that shape Zyra before a chat starts.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03]"
                    >
                        <RefreshCw size={16} className={cn(state.status === 'loading' && 'animate-spin')} />
                        Refresh
                    </button>
                    <Link
                        to="/settings"
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-[var(--accent-primary)]"
                    >
                        <ArrowLeft size={16} />
                        Back
                    </Link>
                </div>
            </div>

            {state.status === 'error' ? (
                <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                    {state.error}
                </div>
            ) : null}

            {overview ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.35fr)]">
                    <section className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-sparkle-card p-5">
                            <div className="grid gap-3 text-sm">
                                <InfoRow icon={<FolderOpen size={15} />} label="Root" value={overview.rootPath} onCopy={() => void copyPath(overview.rootPath)} copied={copiedPath === overview.rootPath} />
                                <InfoRow icon={<FileText size={15} />} label="Memory" value={overview.memoryDirectory} onCopy={() => void copyPath(overview.memoryDirectory)} copied={copiedPath === overview.memoryDirectory} />
                                <InfoRow icon={<Sparkles size={15} />} label="Runtime" value={`${overview.defaultModel} / ${overview.defaultThinking}`} />
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-white/10 bg-sparkle-card">
                            <div className="border-b border-white/10 px-4 py-3">
                                <h2 className="text-sm font-semibold text-sparkle-text">Layers</h2>
                            </div>
                            <div className="max-h-[520px] overflow-y-auto">
                                {overview.memoryLayers.map((layer) => (
                                    <button
                                        key={layer.id}
                                        type="button"
                                        onClick={() => setSelectedId(layer.id)}
                                        className={cn(
                                            'block w-full border-b border-white/5 px-4 py-3 text-left transition-colors last:border-b-0',
                                            selectedLayer?.id === layer.id
                                                ? 'bg-[var(--accent-primary)]/10'
                                                : 'hover:bg-white/[0.03]'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-medium text-sparkle-text">{layer.title}</span>
                                            <span className="text-[11px] text-sparkle-text-muted">{formatBytes(layer.size)}</span>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-sparkle-text-secondary">
                                            {layer.summary || 'No stable summary yet.'}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="min-w-0 space-y-4">
                        <div className="rounded-xl border border-white/10 bg-sparkle-card">
                            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                                <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-sparkle-text">
                                        {selectedLayer?.title || 'No memory layer'}
                                    </h2>
                                    {selectedLayer ? (
                                        <p className="mt-1 truncate text-xs text-sparkle-text-muted">
                                            {new Date(selectedLayer.updatedAt).toLocaleString()}
                                        </p>
                                    ) : null}
                                </div>
                                {selectedLayer ? (
                                    <button
                                        type="button"
                                        onClick={() => void copyPath(selectedLayer.filePath)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-sparkle-text-secondary transition-colors hover:border-white/20 hover:text-sparkle-text"
                                    >
                                        {copiedPath === selectedLayer.filePath ? <Check size={14} /> : <Copy size={14} />}
                                        Path
                                    </button>
                                ) : null}
                            </div>
                            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-5 font-mono text-[12px] leading-relaxed text-sparkle-text-secondary">
                                {selectedLayer?.content || 'No memory files were found.'}
                            </pre>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-sparkle-card p-5">
                            <h2 className="text-sm font-semibold text-sparkle-text">Recommended Prompts</h2>
                            <div className="mt-3 grid gap-2">
                                {overview.recommendedPrompts.length ? overview.recommendedPrompts.map((prompt) => (
                                    <div key={prompt} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-sm text-sparkle-text-secondary">
                                        {prompt}
                                    </div>
                                )) : (
                                    <p className="text-sm text-sparkle-text-muted">No recommended prompts saved yet.</p>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    )
}

function InfoRow({
    icon,
    label,
    value,
    onCopy,
    copied = false
}: {
    icon: ReactNode
    label: string
    value: string
    onCopy?: () => void
    copied?: boolean
}) {
    return (
        <div className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-sparkle-text-muted">
                {icon}
                {label}
            </span>
            <span className="truncate font-mono text-xs text-sparkle-text-secondary">{value}</span>
            {onCopy ? (
                <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-sparkle-text-muted transition-colors hover:border-white/20 hover:text-sparkle-text"
                    title={`Copy ${label.toLowerCase()} path`}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
            ) : <span />}
        </div>
    )
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
    return `${Math.round(value / 1024 / 102.4) / 10} MB`
}

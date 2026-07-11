import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Command, ExternalLink, HelpCircle, Loader2, Package, Play, Search, X } from 'lucide-react'
import { ProjectAuthorMismatchModal } from './ProjectAuthorMismatchModal'
import { ProjectScriptCatalogModal } from './ProjectScriptCatalogModal'

export const ScriptCatalogModal = ProjectScriptCatalogModal
export const AuthorMismatchModal = ProjectAuthorMismatchModal

type DependencyInstallStatus = {
    installed: boolean | null
    checked: boolean
    ecosystem: 'node' | 'unknown'
    totalPackages: number
    installedPackages: number
    missingPackages: number
    missingDependencies?: string[]
    missingSample?: string[]
    reason?: string
}

export function DependenciesModal({
    projectName,
    projectPath,
    dependencies,
    devDependencies,
    dependencyInstallStatus,
    onDependenciesUpdated,
    onClose
}: {
    projectName?: string
    projectPath?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    dependencyInstallStatus?: DependencyInstallStatus | null
    onDependenciesUpdated?: () => Promise<void> | void
    onClose: () => void
}) {
    const [search, setSearch] = useState('')
    const [installing, setInstalling] = useState(false)
    const [installFeedbackTone, setInstallFeedbackTone] = useState<'idle' | 'progress' | 'success' | 'error'>('idle')
    const [installFeedbackMessage, setInstallFeedbackMessage] = useState<string>('')
    const listRef = useRef<HTMLDivElement | null>(null)
    const deferredSearch = useDeferredValue(search)
    const searchValue = deferredSearch.toLowerCase()
    const allDependencies = useMemo(() => {
        const runtime = Object.entries(dependencies || {}).map(([name, version]) => ({
            name,
            version,
            scope: 'dependency' as const
        }))
        const dev = Object.entries(devDependencies || {}).map(([name, version]) => ({
            name,
            version,
            scope: 'devDependency' as const
        }))
        return [...runtime, ...dev].sort((left, right) => left.name.localeCompare(right.name))
    }, [dependencies, devDependencies])

    const runtimeCount = Object.keys(dependencies || {}).length
    const devCount = Object.keys(devDependencies || {}).length

    const filtered = useMemo(() => allDependencies.filter(({ name }) =>
        name.toLowerCase().includes(searchValue)
    ), [allDependencies, searchValue])

    const missingDependencySet = useMemo(() => (
        new Set((dependencyInstallStatus?.missingDependencies || []).map((name) => name.toLowerCase()))
    ), [dependencyInstallStatus?.missingDependencies])

    const installLabel = dependencyInstallStatus?.installed === true
        ? 'All Installed'
        : dependencyInstallStatus?.installed === false
            ? 'Missing Packages'
            : 'Status Unknown'

    const installDetail = dependencyInstallStatus
        ? dependencyInstallStatus.installed === true
            ? `${dependencyInstallStatus.installedPackages}/${dependencyInstallStatus.totalPackages} packages found`
            : dependencyInstallStatus.installed === false
                ? `Missing ${dependencyInstallStatus.missingPackages} of ${dependencyInstallStatus.totalPackages}`
                : (dependencyInstallStatus.reason || 'Install status could not be verified')
        : 'Install status could not be verified'

    const installIndicator = dependencyInstallStatus?.installed === true
        ? <CheckCircle2 size={13} className="text-emerald-300" />
        : dependencyInstallStatus?.installed === false
            ? <AlertTriangle size={13} className="text-amber-300" />
            : <HelpCircle size={13} className="text-white/50" />

    const installBadgeClass = dependencyInstallStatus?.installed === true
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
        : dependencyInstallStatus?.installed === false
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            : 'border-white/10 bg-white/5 text-white/60'

    const totalTracked = dependencyInstallStatus?.totalPackages ?? allDependencies.length
    const installedTracked = dependencyInstallStatus?.installedPackages ?? (
        dependencyInstallStatus?.installed === false
            ? Math.max(0, allDependencies.length - (dependencyInstallStatus?.missingPackages || 0))
            : allDependencies.length
    )
    const installPercent = totalTracked > 0 ? Math.round((installedTracked / totalTracked) * 100) : 100
    const missingCount = dependencyInstallStatus?.missingPackages || 0
    const hasMissingDependencies = missingCount > 0
    const canInstallDependencies = Boolean(projectPath && projectPath.trim().length > 0)
    const progressTone = dependencyInstallStatus?.installed === true
        ? 'bg-emerald-500'
        : dependencyInstallStatus?.installed === false
            ? 'bg-amber-500'
            : 'bg-white/40'

    const runInstall = async (mode: 'missing' | 'all') => {
        const targetPath = String(projectPath || '').trim()
        if (!targetPath || installing) return

        setInstalling(true)
        setInstallFeedbackTone('progress')
        setInstallFeedbackMessage(
            mode === 'missing'
                ? 'Installing missing packages in background...'
                : 'Installing project dependencies in background...'
        )

        try {
            const result = await window.devscope.installProjectDependencies(targetPath, { onlyMissing: mode === 'missing' })
            if (!result?.success) {
                setInstallFeedbackTone('error')
                setInstallFeedbackMessage(result?.error || 'Dependency installation failed.')
                if (onDependenciesUpdated) {
                    await onDependenciesUpdated()
                }
                return
            }

            const manager = String(result.manager || '').trim()
            const installedMessage = result.message || `Dependencies installed${manager ? ` via ${manager}` : ''}.`
            setInstallFeedbackTone('success')
            setInstallFeedbackMessage(installedMessage)

            if (onDependenciesUpdated) {
                await onDependenciesUpdated()
            }
        } catch (error: any) {
            setInstallFeedbackTone('error')
            setInstallFeedbackMessage(error?.message || 'Dependency installation failed.')
        } finally {
            setInstalling(false)
        }
    }

    useEffect(() => {
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [])

    useEffect(() => {
        const container = listRef.current
        if (!container) return
        container.scrollTop = 0
    }, [searchValue, projectPath])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn" onClick={onClose}>
            <div
                className="bg-sparkle-card border border-white/10 rounded-2xl shadow-2xl w-[min(1120px,96vw)] max-h-[95vh] flex flex-col m-4 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Package size={20} className="text-[var(--accent-primary)]" />
                        Dependencies
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-normal text-white/60">
                            {allDependencies.length}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border ${installBadgeClass}`}>
                            {installIndicator}
                            {installLabel}
                        </span>
                    </h3>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                        <X size={20} />
                    </button>
                </div>
                <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
                    <aside className="h-full min-h-0 border-r border-white/10 bg-black/20 p-4">
                        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-sky-500/10 via-white/[0.03] to-violet-500/10 p-3.5">
                            <p className="text-[11px] uppercase tracking-wide text-white/45">Project Overview</p>
                            <p className="mt-1.5 text-sm font-semibold text-white truncate" title={projectName || ''}>{projectName || 'Current Project'}</p>
                            <p className="mt-1 text-[11px] text-white/45 truncate" title={projectPath || ''}>{projectPath || '-'}</p>
                        </div>

                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                            <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2.5">Dependency Stats</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                    <p className="text-[10px] text-white/45 uppercase tracking-wide">Total</p>
                                    <p className="mt-1 text-base font-semibold text-white">{allDependencies.length}</p>
                                </div>
                                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-2">
                                    <p className="text-[10px] text-sky-200/70 uppercase tracking-wide">Runtime</p>
                                    <p className="mt-1 text-base font-semibold text-sky-100">{runtimeCount}</p>
                                </div>
                                <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-2">
                                    <p className="text-[10px] text-violet-200/70 uppercase tracking-wide">Dev</p>
                                    <p className="mt-1 text-base font-semibold text-violet-100">{devCount}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                            <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2.5">Install Health</p>
                            <div className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border ${installBadgeClass}`}>
                                {installIndicator}
                                {installLabel}
                            </div>
                            <p className="mt-2.5 text-xs text-white/65 leading-relaxed">{installDetail}</p>
                            <div className="mt-3">
                                <div className="flex items-center justify-between text-[11px] text-white/55 mb-1.5">
                                    <span>Matched packages</span>
                                    <span>{installedTracked}/{totalTracked} ({installPercent}%)</span>
                                </div>
                                <div className="h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
                                    <div
                                        className={`h-full ${progressTone} transition-all`}
                                        style={{ width: `${Math.max(0, Math.min(100, installPercent))}%` }}
                                    />
                                </div>
                            </div>
                            {dependencyInstallStatus?.checked && (
                                <div className="mt-3 flex items-center justify-between text-xs">
                                    <span className="text-white/55">Missing</span>
                                    <span className={missingCount > 0 ? 'text-amber-200' : 'text-emerald-200'}>{missingCount}</span>
                                </div>
                            )}
                            <div className="mt-4 pt-3 border-t border-white/10">
                                <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2">Actions</p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { void runInstall('missing') }}
                                        disabled={!canInstallDependencies || !hasMissingDependencies || installing}
                                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        title={hasMissingDependencies ? 'Install missing dependencies' : 'No missing dependencies'}
                                    >
                                        Install Missing
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void runInstall('all') }}
                                        disabled={!canInstallDependencies || installing}
                                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        title="Install or repair all dependencies"
                                    >
                                        Install / Repair All
                                    </button>
                                </div>

                                {(installFeedbackTone !== 'idle' || installing) && (
                                    <div className={`mt-2.5 text-[11px] rounded-lg border px-2.5 py-2 flex items-center gap-1.5 ${installFeedbackTone === 'success'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                        : installFeedbackTone === 'error'
                                            ? 'border-red-500/30 bg-red-500/10 text-red-200'
                                            : 'border-sky-500/30 bg-sky-500/10 text-sky-200'
                                    }`}>
                                        {installing ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : installFeedbackTone === 'success' ? (
                                            <CheckCircle2 size={12} />
                                        ) : installFeedbackTone === 'error' ? (
                                            <AlertTriangle size={12} />
                                        ) : (
                                            <HelpCircle size={12} />
                                        )}
                                        <span className="leading-relaxed">{installFeedbackMessage}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>

                    <section className="min-w-0 h-full min-h-0 flex flex-col">
                        <div className="p-4 border-b border-white/5 bg-black/15">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search packages..."
                                    autoFocus
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent-primary)]/50 focus:bg-white/10 transition-all"
                                />
                            </div>
                            <p className="mt-2 text-xs text-white/45">{filtered.length}/{allDependencies.length} shown</p>
                        </div>

                        <div
                            ref={listRef}
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black/10 p-2 custom-scrollbar"
                        >
                            {filtered.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2">
                                    {filtered.map(({ name, version, scope }) => {
                                        const isMissing = missingDependencySet.has(name.toLowerCase())
                                        const presenceTone = dependencyInstallStatus?.checked
                                            ? isMissing ? 'missing' : 'installed'
                                            : 'unknown'

                                        return (
                                            <div
                                                key={`${scope}:${name}`}
                                                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-sm text-white/80 font-mono font-medium block truncate" title={name}>{name}</span>
                                                    <div className="mt-1 flex items-center gap-1.5">
                                                        <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border ${scope === 'dependency'
                                                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
                                                            : 'border-violet-500/30 bg-violet-500/10 text-violet-200'
                                                        }`}>
                                                            {scope === 'dependency' ? 'runtime' : 'dev'}
                                                        </span>
                                                        <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border ${presenceTone === 'installed'
                                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                                            : presenceTone === 'missing'
                                                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                                                : 'border-white/10 bg-white/5 text-white/60'
                                                        }`}>
                                                            {presenceTone === 'installed' ? 'installed' : presenceTone === 'missing' ? 'missing' : 'unknown'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-white/40 font-mono px-2 py-1 rounded bg-black/30 border border-white/5">{version}</span>
                                                    <a
                                                        href={`https://www.npmjs.com/package/${name}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="rounded-lg p-1.5 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10"
                                                        title="View on npm"
                                                    >
                                                        <ExternalLink size={14} />
                                                    </a>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 text-white/30">
                                    <Package size={48} className="mb-4 opacity-20" />
                                    <p className="text-sm">No packages found</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}

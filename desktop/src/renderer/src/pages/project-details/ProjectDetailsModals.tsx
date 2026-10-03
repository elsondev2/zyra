import { NativeOverlayPortal } from '@/components/ui/native-overlay-portal'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MoreHorizontal, Package, Search, X } from 'lucide-react'
import { ProjectAuthorMismatchModal } from './ProjectAuthorMismatchModal'
import { ProjectScriptCatalogModal } from './ProjectScriptCatalogModal'
import { PackageLogo } from './PackageLogo'

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
type PackageScope = 'all' | 'runtime' | 'dev'

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
    const [scope, setScope] = useState<PackageScope>('all')
    const [installing, setInstalling] = useState(false)
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'progress'; message: string } | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const deferredSearch = useDeferredValue(search)
    const allPackages = useMemo(() => [
        ...Object.entries(dependencies || {}).map(([name, version]) => ({ name, version, scope: 'runtime' as const })),
        ...Object.entries(devDependencies || {}).map(([name, version]) => ({ name, version, scope: 'dev' as const }))
    ].sort((a, b) => a.name.localeCompare(b.name)), [dependencies, devDependencies])
    const runtimeCount = Object.keys(dependencies || {}).length
    const devCount = Object.keys(devDependencies || {}).length
    const missing = useMemo(() => new Set((dependencyInstallStatus?.missingDependencies || []).map(name => name.toLocaleLowerCase())), [dependencyInstallStatus?.missingDependencies])
    const visible = useMemo(() => {
        const needle = deferredSearch.trim().toLocaleLowerCase()
        return allPackages.filter(item => (scope === 'all' || item.scope === scope) && (!needle || `${item.name} ${item.version}`.toLocaleLowerCase().includes(needle)))
    }, [allPackages, deferredSearch, scope])
    const missingCount = dependencyInstallStatus?.missingPackages ?? 0
    const canInstall = Boolean(projectPath?.trim())

    const runInstall = async (mode: 'missing' | 'all') => {
        const targetPath = projectPath?.trim()
        if (!targetPath || installing) return
        setMenuOpen(false)
        setInstalling(true)
        setFeedback({ tone: 'progress', message: mode === 'missing' ? 'Installing missing packages…' : 'Installing project dependencies…' })
        try {
            const result = await window.devscope.installProjectDependencies(targetPath, { onlyMissing: mode === 'missing' })
            if (!result?.success) {
                setFeedback({ tone: 'error', message: result?.error || 'Dependency installation failed.' })
            } else {
                setFeedback({ tone: 'success', message: result.message || 'Dependencies installed.' })
            }
            await onDependenciesUpdated?.()
        } catch (cause) {
            setFeedback({ tone: 'error', message: cause instanceof Error ? cause.message : 'Dependency installation failed.' })
        } finally {
            setInstalling(false)
        }
    }

    useEffect(() => {
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = originalOverflow }
    }, [])
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = 0
    }, [deferredSearch, scope, projectPath])
    useEffect(() => {
        if (!menuOpen) return
        const closeOutside = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
        }
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false)
        }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('keydown', closeEscape)
        }
    }, [menuOpen])

    const status = dependencyInstallStatus?.installed === true
        ? <span className="inline-flex items-center gap-1.5 text-emerald-300"><CheckCircle2 size={13} />All installed</span>
        : dependencyInstallStatus?.installed === false
            ? <span className="inline-flex items-center gap-1.5 text-amber-300"><AlertTriangle size={13} />{missingCount} missing</span>
            : <span className="text-sparkle-text-muted">Install status unknown</span>

    return <NativeOverlayPortal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
        <div className="flex h-[min(720px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--surface-divider)] bg-sparkle-card shadow-2xl" onClick={event => event.stopPropagation()}>
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--surface-divider)] px-5 py-2.5">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Package size={17} className="shrink-0 text-[var(--accent-primary)]" />
                        <h3 className="text-base font-semibold text-sparkle-text">Packages</h3>
                        <span className="text-xs text-sparkle-text-muted">{allPackages.length}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-sparkle-text-secondary" title={projectPath}>{projectName || 'Current project'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <div ref={menuRef} className="relative"><button type="button" onClick={() => setMenuOpen(value => !value)} aria-label="Package actions" aria-haspopup="menu" aria-expanded={menuOpen} className="rounded-md p-1.5 text-sparkle-text-secondary hover:bg-white/5"><MoreHorizontal size={16} /></button>{menuOpen ? <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-xl"><button type="button" role="menuitem" disabled={!canInstall || installing} onClick={() => void runInstall('all')} className="w-full rounded px-2.5 py-2 text-left text-xs hover:bg-white/10 disabled:opacity-50">Install / repair all</button></div> : null}</div>
                    <button type="button" onClick={onClose} aria-label="Close packages" className="rounded-md p-1.5 text-sparkle-text-secondary hover:bg-white/10 hover:text-sparkle-text"><X size={17} /></button>
                </div>
            </header>
            {feedback ? <div role="status" className={`flex shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-5 py-2 text-xs ${feedback.tone === 'error' ? 'text-red-300' : feedback.tone === 'success' ? 'text-emerald-300' : 'text-sky-300'}`}>{installing ? <Loader2 size={13} className="animate-spin" /> : feedback.tone === 'error' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{feedback.message}</div> : null}
            <div className="shrink-0 border-b border-[var(--surface-divider)] px-5 pt-2"><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sparkle-text-muted" /><input autoFocus type="search" aria-label="Search packages" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search packages or versions" className="w-full rounded-md border border-[var(--surface-divider)] bg-black/10 py-2 pl-9 pr-3 text-sm text-sparkle-text outline-none focus:border-[var(--accent-primary)]" /></div><div className="mt-3 flex gap-5 text-xs">{([['all', `All ${allPackages.length}`], ['runtime', `Runtime ${runtimeCount}`], ['dev', `Dev ${devCount}`]] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setScope(key)} className={`border-b-2 pb-2 ${scope === key ? 'border-[var(--accent-primary)] text-sparkle-text' : 'border-transparent text-sparkle-text-muted hover:text-sparkle-text'}`}>{label}</button>)}</div></div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-1">{visible.length > 0 ? visible.map(item => <div key={`${item.scope}:${item.name}`} className="flex min-w-0 items-center gap-3 border-b border-[var(--surface-divider)] py-2.5 last:border-b-0"><PackageLogo packageName={item.name} /><div className="min-w-0 flex-1"><div className="truncate font-mono text-xs font-medium text-sparkle-text" title={item.name}>{item.name}</div><div className="mt-0.5 text-[11px] text-sparkle-text-muted">{item.scope === 'runtime' ? 'Runtime' : 'Development'}{dependencyInstallStatus?.checked ? missing.has(item.name.toLocaleLowerCase()) ? ' · Missing' : ' · Installed' : ''}</div></div><span className="max-w-36 truncate font-mono text-xs text-sparkle-text-secondary" title={item.version}>{item.version}</span><a href={`https://www.npmjs.com/package/${item.name}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.name} on npm`} className="rounded p-1.5 text-sparkle-text-muted hover:bg-white/5 hover:text-sparkle-text"><ExternalLink size={14} /></a></div>) : <div className="py-16 text-center text-xs text-sparkle-text-muted">{search ? 'No packages match your search.' : 'No packages in this section.'}</div>}</div>
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--surface-divider)] px-5 py-2 text-[11px] text-sparkle-text-muted">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {status}
                    <span className="hidden max-w-48 truncate sm:inline" title={dependencyInstallStatus?.reason}>{dependencyInstallStatus?.checked ? `${dependencyInstallStatus.installedPackages}/${dependencyInstallStatus.totalPackages} found` : dependencyInstallStatus?.reason || ''}</span>
                    {missingCount > 0 ? <button type="button" disabled={!canInstall || installing} onClick={() => void runInstall('missing')} className="rounded-md bg-[var(--accent-primary)] px-2 py-1 text-xs font-medium text-[var(--accent-on-primary)] disabled:opacity-50">{installing ? 'Installing…' : 'Install missing'}</button> : null}
                </div>
                <span className="shrink-0">{visible.length} of {allPackages.length} packages</span>
            </footer>
        </div>
    </div></NativeOverlayPortal>
}

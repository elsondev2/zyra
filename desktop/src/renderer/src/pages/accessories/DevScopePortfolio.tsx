import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, LoaderCircle, Plus, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { DevScopeProjectGitOverviewItem } from '@shared/contracts/devscope-git-contracts'
import { useSettings } from '@/lib/settings'
import { DevScopeIcon } from '@/components/ui/DevScopeIcon'
import { DevScopeProjectRow } from './DevScopeProjectRow'
import { DevScopeDiscoveryPanel } from './DevScopeDiscoveryPanel'
import { DevScopePagination } from './DevScopePagination'
import { DevScopePortfolioToolbar, type SearchField } from './DevScopePortfolioToolbar'
import { pathKey, sortPortfolioProjects, type ProjectSortOrder } from './devscopePortfolioPaths'
import { useDevScopePortfolio } from './useDevScopePortfolio'

export function DevScopePortfolio() {
    const navigate = useNavigate()
    const { settings } = useSettings()
    const configuredRoots = [settings.projectsFolder, ...settings.additionalFolders]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    const portfolio = useDevScopePortfolio(configuredRoots)
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query)
    const [searchField, setSearchField] = useState<SearchField>('both')
    const [sortOrder, setSortOrder] = useState<ProjectSortOrder>('recent')
    const [showArchived, setShowArchived] = useState(false)
    const [discoveryOpen, setDiscoveryOpen] = useState(false)
    const [working, setWorking] = useState(false)
    const [message, setMessage] = useState('')
    const [gitOverview, setGitOverview] = useState<Record<string, DevScopeProjectGitOverviewItem>>({})
    const [checkingGit, setCheckingGit] = useState(false)
    const [githubBusy, setGithubBusy] = useState(false)
    const [githubMessage, setGithubMessage] = useState('')
    const [githubMatches, setGithubMatches] = useState<Record<string, string>>({})
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(12)
    const listTopRef = useRef<HTMLDivElement>(null)
    const gitRunRef = useRef(0)
    const gitFetchedPathsRef = useRef(new Set<string>())
    const archivedCount = portfolio.projects.filter(project => project.archived).length

    useEffect(() => { if (archivedCount === 0) setShowArchived(false) }, [archivedCount])

    const projects = useMemo(() => {
        const needle = deferredQuery.trim().toLocaleLowerCase()
        const matches = portfolio.projects.filter(project => {
            if (project.archived !== showArchived) return false
            if (!needle) return true
            const nameMatches = project.displayName.toLocaleLowerCase().includes(needle)
            const pathMatches = project.path.toLocaleLowerCase().includes(needle)
            return searchField === 'name' ? nameMatches : searchField === 'path' ? pathMatches : nameMatches || pathMatches
        })
        return sortPortfolioProjects(matches, sortOrder)
    }, [portfolio.projects, deferredQuery, searchField, showArchived, sortOrder])
    const totalPages = Math.max(1, Math.ceil(projects.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const visible = projects.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const visiblePathsKey = visible.map(project => project.path).join('\0')
    const iconOverrides = useMemo(
        () => new Map(Object.entries(settings.projectIconOverrides).map(([path, icon]) => [pathKey(path), icon])),
        [settings.projectIconOverrides]
    )

    const changePage = (next: number) => {
        setPage(next)
        listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const openProject = (path: string) => navigate(`/accessories/project/${encodeURIComponent(path)}`)
    const withWork = async (action: () => Promise<void>) => {
        setWorking(true)
        setMessage('')
        try { await action() }
        catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not update projects.') }
        finally { setWorking(false) }
    }
    const addProjectFolder = () => void withWork(async () => {
        const choice = await window.devscope.selectFolder()
        if (!choice.success || !choice.folderPath) return
        const result = await portfolio.addProject(choice.folderPath)
        openProject(result.path)
    })
    const addLocation = () => void withWork(async () => {
        const choice = await window.devscope.selectFolder()
        if (choice.success && choice.folderPath) portfolio.addRoot(choice.folderPath)
    })
    const revealProject = (path: string) => void withWork(async () => {
        const result = await window.devscope.openInExplorer(path)
        if (!result.success) throw new Error(result.error || 'Could not open this location.')
    })

    const checkGit = useCallback(async (paths: string[], force = false) => {
        const pending = force ? paths : paths.filter(path => !gitFetchedPathsRef.current.has(pathKey(path)))
        if (!pending.length) { setCheckingGit(false); return }
        const run = ++gitRunRef.current
        setCheckingGit(true)
        try {
            for (let index = 0; index < pending.length; index += 4) {
                const result = await window.devscope.getProjectsGitOverview(pending.slice(index, index + 4))
                if (run !== gitRunRef.current) return
                if (!result.success) throw new Error(result.error || 'Could not read Git status.')
                for (const item of result.items) gitFetchedPathsRef.current.add(pathKey(item.path))
                setGitOverview(current => ({
                    ...current,
                    ...Object.fromEntries(result.items.map(item => [pathKey(item.path), item]))
                }))
            }
        } catch (cause) {
            if (run === gitRunRef.current) setMessage(cause instanceof Error ? cause.message : 'Could not read Git status.')
        } finally {
            if (run === gitRunRef.current) setCheckingGit(false)
        }
    }, [])
    useEffect(() => {
        if (visiblePathsKey) void checkGit(visiblePathsKey.split('\0'))
        return () => { gitRunRef.current += 1 }
    }, [visiblePathsKey, checkGit])

    const refreshAll = () => void withWork(async () => {
        await portfolio.refresh(true)
        gitFetchedPathsRef.current.clear()
        await checkGit(visible.map(project => project.path), true)
    })
    const discoverGitHub = async () => {
        setGithubBusy(true)
        setGithubMessage('')
        try {
            const result = await window.devscope.discoverLocalGitHubProjects(portfolio.projects.map(project => project.path))
            if (!result.success) throw new Error(result.error || 'Could not check GitHub.')
            setGithubMatches(Object.fromEntries(result.matches.map(match => [pathKey(match.path), match.fullName])))
            setGithubMessage(`${result.matches.length} local ${result.matches.length === 1 ? 'project' : 'projects'} matched from ${result.repositoryCount} accessible GitHub repositories.`)
        } catch (cause) {
            setGithubMessage(cause instanceof Error ? cause.message : 'Could not check GitHub.')
        } finally { setGithubBusy(false) }
    }

    return <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-7 sm:px-8">
            <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--surface-divider)] bg-white/[0.035] text-sparkle-text"><DevScopeIcon size={23} /></div>
                    <div><h1 className="text-xl font-semibold tracking-tight text-sparkle-text">DevScope</h1><p className="mt-0.5 text-xs text-sparkle-text-secondary">Local code projects, files, Git, and scripts.</p></div>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setDiscoveryOpen(true)} aria-label="Discover projects" title="Discover projects" className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--surface-divider)] text-sparkle-text-secondary hover:bg-white/5 hover:text-sparkle-text"><SlidersHorizontal size={15} /></button>
                    <button type="button" onClick={addProjectFolder} disabled={working} className="inline-flex items-center gap-2 rounded-md bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"><Plus size={15} />Add folder</button>
                </div>
            </header>
            {message || portfolio.error ? <div role="alert" className="mt-4 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{message || portfolio.error}</div> : null}
            <section ref={listTopRef} aria-label="Project portfolio">
                <DevScopePortfolioToolbar
                    query={query}
                    onQueryChange={value => { setQuery(value); setPage(1) }}
                    searchField={searchField}
                    onSearchFieldChange={value => { setSearchField(value); setPage(1) }}
                    sortOrder={sortOrder}
                    onSortOrderChange={value => { setSortOrder(value); setPage(1) }}
                    view={portfolio.view}
                    onViewChange={portfolio.setView}
                    refreshing={working || checkingGit || portfolio.loading}
                    onRefresh={refreshAll}
                />
                {archivedCount > 0 ? <div className="mt-4 flex items-center gap-5 border-b border-[var(--surface-divider)] text-xs">
                    <button type="button" onClick={() => { setShowArchived(false); setPage(1) }} className={`border-b-2 pb-2 ${!showArchived ? 'border-[var(--accent-primary)] text-sparkle-text' : 'border-transparent text-sparkle-text-muted hover:text-sparkle-text'}`}>Active</button>
                    <button type="button" onClick={() => { setShowArchived(true); setPage(1) }} className={`flex items-center gap-1.5 border-b-2 pb-2 ${showArchived ? 'border-[var(--accent-primary)] text-sparkle-text' : 'border-transparent text-sparkle-text-muted hover:text-sparkle-text'}`}><Archive size={12} />Archived</button>
                </div> : null}
                {portfolio.loading && portfolio.projects.length === 0
                    ? <div className="flex justify-center py-20 text-sparkle-text-muted"><LoaderCircle size={20} className="animate-spin" /></div>
                    : projects.length === 0
                        ? <div className="py-16 text-center"><div className="text-sm font-medium">{query ? 'No matching projects' : showArchived ? 'No archived projects' : 'No code projects found'}</div><p className="mt-1 text-xs text-sparkle-text-muted">{query ? 'Try another name or path.' : 'Add a project folder or choose a location to discover from.'}</p>{!query && !showArchived ? <button type="button" onClick={() => setDiscoveryOpen(true)} className="mt-4 rounded-md border border-[var(--surface-divider)] px-3 py-2 text-xs hover:bg-white/5">Discover projects</button> : null}</div>
                        : <div className={portfolio.view === 'cards' ? 'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' : archivedCount > 0 ? 'rounded-b-lg border-x border-b border-[var(--surface-divider)] bg-[var(--surface-floating)]' : 'mt-4 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)]'}>
                            {visible.map(project => <DevScopeProjectRow
                                key={pathKey(project.path)}
                                project={project}
                                iconPath={iconOverrides.get(pathKey(project.path)) || project.projectIconPath}
                                git={gitOverview[pathKey(project.path)]}
                                githubName={githubMatches[pathKey(project.path)]}
                                view={portfolio.view}
                                onOpen={() => openProject(project.path)}
                                onArchive={() => portfolio.setArchived(project.path, !project.archived)}
                                onRename={name => portfolio.rename(project.path, name)}
                                onReveal={() => revealProject(project.path)}
                            />)}
                        </div>}
                <DevScopePagination page={currentPage} pageSize={pageSize} total={projects.length} onPageChange={changePage} onPageSizeChange={value => { setPageSize(value); setPage(1) }} />
            </section>
        </div>
        {discoveryOpen ? <DevScopeDiscoveryPanel
            locations={portfolio.roots}
            working={working}
            onClose={() => setDiscoveryOpen(false)}
            onAddLocation={addLocation}
            onRemoveLocation={portfolio.removeRoot}
            onAddProject={addProjectFolder}
            onDiscoverGitHub={() => void discoverGitHub()}
            githubBusy={githubBusy}
            githubMessage={githubMessage}
        /> : null}
    </div>
}

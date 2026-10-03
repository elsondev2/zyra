import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DevScopeProject } from '@shared/contracts/devscope-project-contracts'
import { collapseNestedProjects, folderName, isSystemProjectPath, isWithinPath, pathKey } from './devscopePortfolioPaths'

const STORAGE_KEY = 'zyra:devscope:portfolio:v1'
const MAX_SCAN_FOLDERS = 72
const MAX_SCAN_DEPTH = 2
const DISCOVERY_MAX_AGE_MS = 10 * 60 * 1000

export type PortfolioProject = DevScopeProject & {
    displayName: string
    archived: boolean
    source: 'added' | 'discovered'
}

type PortfolioState = {
    roots: string[] | null
    added: DevScopeProject[]
    discovered: DevScopeProject[]
    archived: string[]
    names: Record<string, string>
    view: 'list' | 'cards'
    scannedAt: number
    scannedRootsKey: string
}

const EMPTY: PortfolioState = { roots: null, added: [], discovered: [], archived: [], names: {}, view: 'list', scannedAt: 0, scannedRootsKey: '' }

function readState(): PortfolioState {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (!value || typeof value !== 'object') return EMPTY
        return {
            roots: Array.isArray(value.roots) ? value.roots.filter((path: unknown) => typeof path === 'string') : null,
            added: Array.isArray(value.added) ? value.added.filter((project: DevScopeProject) => typeof project?.path === 'string') : [],
            discovered: Array.isArray(value.discovered) ? value.discovered.filter((project: DevScopeProject) => typeof project?.path === 'string') : [],
            archived: Array.isArray(value.archived) ? value.archived.filter((key: unknown) => typeof key === 'string') : [],
            names: value.names && typeof value.names === 'object' ? value.names : {},
            view: value.view === 'cards' ? 'cards' : 'list',
            scannedAt: typeof value.scannedAt === 'number' ? value.scannedAt : 0,
            scannedRootsKey: typeof value.scannedRootsKey === 'string' ? value.scannedRootsKey : ''
        }
    } catch { return EMPTY }
}

export async function scanLocation(root: string, force: boolean): Promise<DevScopeProject[]> {
    if (isSystemProjectPath(root)) return []
    const rootDetails = await window.devscope.getProjectDetails(root)
    if (rootDetails.success && rootDetails.project.markers.length > 0) {
        const project = rootDetails.project
        return [{ name: folderName(root), path: root, type: project.type, projectIconPath: project.projectIconPath,
            markers: project.markers, frameworks: project.frameworks, lastModified: project.lastModified as number | undefined, isProject: true }]
    }

    const projects: DevScopeProject[] = []
    const queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }]
    let scanned = 0
    while (queue.length > 0 && scanned < MAX_SCAN_FOLDERS) {
        const batch = queue.splice(0, 2)
        const results = await Promise.all(batch.map(async entry => ({
            ...entry,
            result: await window.devscope.scanProjects(entry.path, { forceRefresh: force }).catch(() => null)
        })))
        scanned += batch.length
        for (const entry of results) {
            if (!entry.result?.success) continue
            projects.push(...entry.result.projects.filter(project => !isSystemProjectPath(project.path)))
            if (entry.depth >= MAX_SCAN_DEPTH) continue
            for (const folder of entry.result.folders) {
                if (!isSystemProjectPath(folder.path) && queue.length + scanned < MAX_SCAN_FOLDERS) {
                    queue.push({ path: folder.path, depth: entry.depth + 1 })
                }
            }
        }
    }
    return projects
}

export function useDevScopePortfolio(configuredRoots: string[]) {
    const [state, setState] = useState(readState)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const revision = useRef(0)
    const roots = state.roots ?? configuredRoots
    const rootsKey = roots.map(pathKey).join('\0')

    const save = useCallback((change: (current: PortfolioState) => PortfolioState) => {
        setState(current => {
            const next = change(current)
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Keep the current window usable. */ }
            return next
        })
    }, [])

    // Seed DevScope from the user's coding locations once, then keep its catalog independent.
    useEffect(() => {
        if (state.roots !== null || configuredRoots.length === 0) return
        save(current => current.roots === null ? { ...current, roots: [...configuredRoots] } : current)
    }, [state.roots, configuredRoots.map(pathKey).join('\0'), save])

    const projects = useMemo(() => {
        const addedKeys = new Set(state.added.map(project => pathKey(project.path)))
        return collapseNestedProjects([
            ...state.added.map(project => ({ ...project, source: 'added' as const })),
            ...state.discovered.filter(project => roots.some(root => isWithinPath(root, project.path)) && !addedKeys.has(pathKey(project.path))).map(project => ({ ...project, source: 'discovered' as const }))
        ]).map(project => ({
            ...project,
            displayName: state.names[pathKey(project.path)] || project.name,
            archived: state.archived.includes(pathKey(project.path))
        }))
    }, [state.added, state.discovered, state.archived, state.names, rootsKey])

    const refresh = useCallback(async (force = false) => {
        const current = ++revision.current
        if (roots.length === 0) {
            save(state => ({ ...state, discovered: [], scannedAt: Date.now(), scannedRootsKey: rootsKey }))
            setLoading(false)
            return
        }
        setLoading(true)
        setError('')
        try {
            const discovered: DevScopeProject[] = []
            for (const root of roots) {
                const projects = await scanLocation(root, force)
                if (current !== revision.current) return
                discovered.push(...projects)
                save(state => ({ ...state, discovered: collapseNestedProjects(discovered) }))
            }
            if (current === revision.current) save(state => ({ ...state, discovered: collapseNestedProjects(discovered), scannedAt: Date.now(), scannedRootsKey: rootsKey }))
            if (force) {
                const latest: DevScopeProject[] = []
                for (const project of state.added) {
                    const result = await window.devscope.getProjectDetails(project.path)
                    latest.push(result.success ? { ...project, ...result.project, name: project.name, isProject: true } : project)
                }
                if (current === revision.current) save(state => ({ ...state, added: latest }))
            }
        } catch (cause) {
            if (current === revision.current) setError(cause instanceof Error ? cause.message : 'Could not discover projects.')
        } finally {
            if (current === revision.current) setLoading(false)
        }
    }, [rootsKey, save, state.added])

    useEffect(() => {
        if (state.scannedRootsKey !== rootsKey || Date.now() - state.scannedAt > DISCOVERY_MAX_AGE_MS) void refresh()
        return () => { revision.current += 1 }
    }, [rootsKey])

    const addProject = useCallback(async (path: string): Promise<{ path: string; added: boolean }> => {
        const existing = projects.find(project => isWithinPath(project.path, path))
        if (existing) return { path: existing.path, added: false }
        if (isSystemProjectPath(path)) throw new Error('Choose a development project outside application or build folders.')
        const result = await window.devscope.getProjectDetails(path)
        if (!result.success) throw new Error(result.error || 'Could not read this project.')
        if (result.project.markers.length === 0) throw new Error('This folder has no development project markers or Git repository.')
        const project: DevScopeProject = {
            name: folderName(path), path, type: result.project.type,
            projectIconPath: result.project.projectIconPath, markers: result.project.markers,
            frameworks: result.project.frameworks, lastModified: result.project.lastModified as number | undefined,
            isProject: true
        }
        save(current => ({ ...current, added: [...current.added, project] }))
        return { path, added: true }
    }, [projects, save])

    const addRoot = useCallback((path: string) => {
        if (isSystemProjectPath(path)) throw new Error('Choose a location outside application or build folders.')
        save(current => ({ ...current, roots: [...new Set([...(current.roots ?? configuredRoots), path])] }))
    }, [configuredRoots, save])

    const removeRoot = useCallback((path: string) => {
        save(current => ({ ...current, roots: (current.roots ?? configuredRoots).filter(root => pathKey(root) !== pathKey(path)) }))
    }, [configuredRoots, save])

    const rename = useCallback((path: string, name: string) => {
        save(current => ({ ...current, names: { ...current.names, [pathKey(path)]: name } }))
    }, [save])
    const setArchived = useCallback((path: string, archived: boolean) => {
        save(current => ({ ...current, archived: archived
            ? [...new Set([...current.archived, pathKey(path)])]
            : current.archived.filter(key => key !== pathKey(path)) }))
    }, [save])
    const setView = useCallback((view: 'list' | 'cards') => save(current => ({ ...current, view })), [save])

    return { projects, roots, loading, error, view: state.view, refresh, addProject, addRoot, removeRoot, rename, setArchived, setView }
}

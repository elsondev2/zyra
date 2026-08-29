import { useEffect, useRef, useState } from 'react'
import type { DevScopeFileTreeNode, DevScopeIndexedPathEntry } from '@shared/contracts/devscope-project-contracts'
import { captureProductEvent } from '@/lib/product-analytics'

export type PreviewFileSearchEntry = Pick<DevScopeIndexedPathEntry,
    'path' | 'parentPath' | 'relativePath' | 'name' | 'type' | 'extension' | 'isHidden' | 'depth'
>

const warmIndexRequests = new Map<string, Promise<void>>()
const warmIndexReady = new Set<string>()

function normalizePath(pathValue: string): string {
    return String(pathValue || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

function normalizePathKey(pathValue: string): string {
    const normalized = normalizePath(pathValue)
    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
}

function relativePath(rootPath: string, targetPath: string): string {
    const root = normalizePath(rootPath)
    const target = normalizePath(targetPath)
    const rootKey = normalizePathKey(root)
    const targetKey = normalizePathKey(target)
    if (targetKey === rootKey) return ''
    if (!targetKey.startsWith(`${rootKey}/`)) return target
    return target.slice(root.length + 1)
}

function searchScore(name: string, path: string, query: string, type: 'file' | 'directory'): number {
    const normalizedName = name.toLowerCase()
    const normalizedPath = path.toLowerCase()
    let score = type === 'directory' ? 4 : 0
    if (normalizedName === query) score += 120
    else if (normalizedName.startsWith(query)) score += 90
    else if (normalizedName.includes(query)) score += 55
    if (normalizedPath.startsWith(query)) score += 40
    else if (normalizedPath.includes(query)) score += 25
    return score
}

export function searchLoadedPreviewTree(
    nodes: DevScopeFileTreeNode[],
    rootPath: string,
    scopePath: string,
    query: string,
    showHidden: boolean,
    limit: number
): PreviewFileSearchEntry[] {
    const scopeKey = normalizePathKey(scopePath)
    const matches: Array<{ entry: PreviewFileSearchEntry; score: number }> = []
    const visit = (entries: DevScopeFileTreeNode[], depth: number) => {
        for (const node of entries) {
            const nodeKey = normalizePathKey(node.path)
            const inScope = nodeKey === scopeKey || nodeKey.startsWith(`${scopeKey}/`)
            if (inScope && (showHidden || !node.isHidden)) {
                const relative = relativePath(rootPath, node.path)
                const score = searchScore(node.name, relative, query, node.type)
                if (score > (node.type === 'directory' ? 4 : 0)) {
                    matches.push({
                        score,
                        entry: {
                            path: node.path,
                            parentPath: node.path === rootPath ? null : normalizePath(node.path).slice(0, Math.max(0, normalizePath(node.path).lastIndexOf('/'))) || null,
                            relativePath: relative,
                            name: node.name,
                            type: node.type,
                            extension: node.type === 'file' && node.name.includes('.') ? node.name.split('.').pop()?.toLowerCase() || '' : '',
                            isHidden: node.isHidden,
                            depth
                        }
                    })
                }
            }
            if (Array.isArray(node.children)) visit(node.children, depth + 1)
        }
    }
    visit(nodes, 0)
    return matches
        .sort((left, right) => right.score - left.score || left.entry.depth - right.entry.depth || left.entry.name.localeCompare(right.entry.name))
        .slice(0, limit)
        .map((match) => match.entry)
}

export function warmPreviewFileSearchIndex(projectPath: string): Promise<void> {
    const normalizedProjectPath = normalizePath(projectPath)
    const projectKey = normalizePathKey(normalizedProjectPath)
    if (!projectKey || warmIndexReady.has(projectKey) || typeof window === 'undefined' || !window.devscope) {
        return Promise.resolve()
    }
    const existing = warmIndexRequests.get(projectKey)
    if (existing) return existing

    const request = window.devscope.searchIndexedPaths({
        scopePath: normalizedProjectPath,
        term: '__zyra_search_catalog_warm__',
        limit: 1,
        includeFiles: true,
        includeDirectories: true,
        includeAncestors: false,
        showHidden: false
    }).then((result) => {
        if (result.success) warmIndexReady.add(projectKey)
    }).finally(() => {
        if (warmIndexRequests.get(projectKey) === request) warmIndexRequests.delete(projectKey)
    })
    warmIndexRequests.set(projectKey, request)
    return request
}

export function usePreviewFileSearch({
    projectPath,
    scopePath,
    query,
    loadedTree,
    showHidden,
    limit = 120
}: {
    projectPath: string
    scopePath: string
    query: string
    loadedTree: DevScopeFileTreeNode[]
    showHidden: boolean
    limit?: number
}) {
    const [entries, setEntries] = useState<PreviewFileSearchEntry[]>([])
    const [searching, setSearching] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestSequenceRef = useRef(0)
    const capturedQueryRef = useRef('')

    useEffect(() => {
        const normalizedProjectPath = normalizePath(projectPath)
        if (!normalizedProjectPath) return
        const warm = () => { void warmPreviewFileSearchIndex(normalizedProjectPath) }
        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(warm, { timeout: 1200 })
            return () => window.cancelIdleCallback(idleId)
        }
        const timeoutId = window.setTimeout(warm, 240)
        return () => window.clearTimeout(timeoutId)
    }, [projectPath])

    useEffect(() => {
        const normalizedQuery = query.trim().toLowerCase()
        const normalizedProjectPath = normalizePath(projectPath)
        const normalizedScopePath = normalizePath(scopePath || projectPath)
        const requestId = ++requestSequenceRef.current
        if (!normalizedQuery || !normalizedProjectPath || !normalizedScopePath) {
            setEntries([])
            setSearching(false)
            setError(null)
            return
        }

        setEntries(searchLoadedPreviewTree(loadedTree, normalizedProjectPath, normalizedScopePath, normalizedQuery, showHidden, limit))
        setSearching(true)
        setError(null)

        void window.devscope.searchIndexedPaths({
            scopePath: normalizedScopePath,
            term: normalizedQuery,
            limit,
            includeFiles: true,
            includeDirectories: true,
            includeAncestors: false,
            showHidden
        }).then((result) => {
            if (requestSequenceRef.current !== requestId) return
            if (!result.success) {
                setError(result.error || 'File search failed.')
                return
            }
            setEntries(result.entries || [])
        }).catch((searchError: unknown) => {
            if (requestSequenceRef.current !== requestId) return
            setError(searchError instanceof Error ? searchError.message : 'File search failed.')
        }).finally(() => {
            if (requestSequenceRef.current === requestId) setSearching(false)
        })
    }, [limit, loadedTree, projectPath, query, scopePath, showHidden])

    useEffect(() => {
        const normalizedQuery = query.trim().toLowerCase()
        if (!normalizedQuery) {
            capturedQueryRef.current = ''
            return
        }
        if (searching || capturedQueryRef.current === normalizedQuery) return
        const timer = window.setTimeout(() => {
            capturedQueryRef.current = normalizedQuery
            captureProductEvent({
                event: 'zyra_v1_files',
                properties: {
                    action: 'search',
                    outcome: error ? 'failed' : 'completed',
                    result_count: entries.length,
                    ...(error ? { error_code: 'unknown' } : {})
                }
            })
        }, 750)
        return () => window.clearTimeout(timer)
    }, [entries.length, error, query, searching])

    return { entries, searching, error }
}

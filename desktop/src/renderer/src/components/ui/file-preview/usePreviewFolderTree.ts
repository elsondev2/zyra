import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { mergeDirectoryChildren } from '@/lib/filesystem/fileTreeMutations'
import { getCachedPreviewFolderTree, setCachedPreviewFolderTree } from '@/lib/projectViewCache'

function normalizePathKey(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').toLowerCase()
}

export function getPreviewNavigatorFolderPath(pathValue: string, directoryTarget = false): string {
    if (directoryTarget) return String(pathValue || '').replace(/[\\/]+$/, '')
    const normalized = String(pathValue || '').replace(/\\/g, '/')
    const lastSlashIndex = normalized.lastIndexOf('/')
    if (lastSlashIndex <= 0) return normalized
    return normalized.slice(0, lastSlashIndex)
}

function collectAncestorDirectoryPaths(rootPath: string, folderPath: string): string[] {
    const normalizedRoot = String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const normalizedFolder = String(folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const rootKey = normalizePathKey(normalizedRoot)
    const folderKey = normalizePathKey(normalizedFolder)
    if (!rootKey || !folderKey.startsWith(`${rootKey}/`)) return []

    const paths: string[] = []
    const relativeSegments = normalizedFolder.slice(normalizedRoot.length + 1).split('/').filter(Boolean)
    let currentPath = normalizedRoot
    for (const segment of relativeSegments) {
        currentPath = `${currentPath}/${segment}`
        paths.push(currentPath)
    }
    return paths
}

function collectAncestorDirectoryKeys(rootPath: string, folderPath: string): Set<string> {
    return new Set(collectAncestorDirectoryPaths(rootPath, folderPath).map(normalizePathKey))
}

function resolveTreeRootPath(projectPath: string | undefined, folderPath: string): string {
    const trimmedProjectPath = String(projectPath || '').trim()
    if (!trimmedProjectPath) return folderPath

    const normalizedProjectKey = normalizePathKey(trimmedProjectPath)
    const normalizedFolderKey = normalizePathKey(folderPath)

    if (
        normalizedFolderKey === normalizedProjectKey
        || normalizedFolderKey.startsWith(`${normalizedProjectKey}/`)
    ) {
        return trimmedProjectPath
    }

    return folderPath
}

function sortNodes(nodes: DevScopeFileTreeNode[]): DevScopeFileTreeNode[] {
    return [...nodes]
        .map((node) => ({
            ...node,
            children: Array.isArray(node.children) ? sortNodes(node.children) : node.children
        }))
        .sort((left, right) => {
            if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
            return left.name.localeCompare(right.name)
        })
}

function applyTreeUpdate(
    updateTree: Dispatch<SetStateAction<DevScopeFileTreeNode[]>>,
    nextValue: SetStateAction<DevScopeFileTreeNode[]>
): void {
    startTransition(() => {
        updateTree(nextValue)
    })
}

type UsePreviewFolderTreeOptions = {
    filePath: string
    projectPath?: string
    directoryTarget?: boolean
    enabled?: boolean
    refreshToken?: number
}

export function usePreviewFolderTree({
    filePath,
    projectPath,
    directoryTarget = false,
    enabled = true,
    refreshToken = 0
}: UsePreviewFolderTreeOptions) {
    const currentFileFolderPath = useMemo(
        () => getPreviewNavigatorFolderPath(filePath, directoryTarget),
        [directoryTarget, filePath]
    )
    const [activeFolderPath, setActiveFolderPath] = useState(currentFileFolderPath)
    const treeRootPath = useMemo(() => resolveTreeRootPath(projectPath, activeFolderPath), [activeFolderPath, projectPath])
    const targetAncestorPaths = useMemo(
        () => collectAncestorDirectoryPaths(treeRootPath, activeFolderPath),
        [activeFolderPath, treeRootPath]
    )

    const [tree, setTree] = useState<DevScopeFileTreeNode[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
    const requestSequenceRef = useRef(0)
    const latestRequestByPathRef = useRef(new Map<string, number>())
    const internalNavigationTargetRef = useRef<string | null>(null)
    const cacheKeyRootPath = treeRootPath || activeFolderPath

    useEffect(() => {
        const nextFileKey = normalizePathKey(filePath)
        if (!nextFileKey) return

        if (internalNavigationTargetRef.current === nextFileKey) {
            internalNavigationTargetRef.current = null
            if (directoryTarget) setActiveFolderPath(currentFileFolderPath)
            return
        }

        setActiveFolderPath(currentFileFolderPath)
    }, [currentFileFolderPath, directoryTarget, filePath])

    const readCachedDirectory = useCallback((folderPath: string) => {
        if (!cacheKeyRootPath || !folderPath) return null
        const cachedTree = getCachedPreviewFolderTree(cacheKeyRootPath, folderPath)
        return Array.isArray(cachedTree) ? (cachedTree as DevScopeFileTreeNode[]) : null
    }, [cacheKeyRootPath])

    const writeCachedDirectory = useCallback((folderPath: string, nodes: DevScopeFileTreeNode[]) => {
        if (!cacheKeyRootPath || !folderPath) return
        setCachedPreviewFolderTree(cacheKeyRootPath, folderPath, nodes)
    }, [cacheKeyRootPath])

    const loadTree = useCallback(async (
        targetPath?: string,
        options?: { preferCache?: boolean }
    ) => {
        if (!enabled || !treeRootPath || !activeFolderPath) return

        const resolvedTargetPath = targetPath || treeRootPath
        const cachedTree = options?.preferCache === false ? null : readCachedDirectory(resolvedTargetPath)
        if (cachedTree) {
            if (targetPath) {
                applyTreeUpdate(setTree, (currentTree) => mergeDirectoryChildren(currentTree, resolvedTargetPath, cachedTree))
            } else {
                setError(null)
                setLoading(false)
                applyTreeUpdate(setTree, cachedTree)
            }
            return
        }

        const requestKey = normalizePathKey(resolvedTargetPath)
        const requestId = ++requestSequenceRef.current
        latestRequestByPathRef.current.set(requestKey, requestId)
        const isStaleRequest = () => latestRequestByPathRef.current.get(requestKey) !== requestId
        const ownsNavigatorStatus = !targetPath

        if (ownsNavigatorStatus) {
            setLoading(true)
            setError(null)
        }

        try {
            const result = await window.devscope.getFileTree(treeRootPath, {
                showHidden: false,
                maxDepth: 0,
                rootPath: resolvedTargetPath,
                includeGitStatus: false,
                includeFileSize: false
            })

            if (isStaleRequest()) return

            if (!result?.success) {
                if (ownsNavigatorStatus) setError(result?.error || 'Failed to load folder tree.')
                return
            }

            const nextTree = sortNodes(result.tree || [])
            writeCachedDirectory(resolvedTargetPath, nextTree)
            if (targetPath) {
                applyTreeUpdate(setTree, (currentTree) => mergeDirectoryChildren(currentTree, resolvedTargetPath, nextTree))
                return
            }

            applyTreeUpdate(setTree, nextTree)
        } catch (loadError: any) {
            if (isStaleRequest()) return
            if (ownsNavigatorStatus) setError(loadError?.message || 'Failed to load folder tree.')
        } finally {
            if (!isStaleRequest()) {
                latestRequestByPathRef.current.delete(requestKey)
                if (ownsNavigatorStatus) setLoading(false)
            }
        }
    }, [activeFolderPath, enabled, readCachedDirectory, treeRootPath, writeCachedDirectory])

    useEffect(() => {
        if (!enabled || !activeFolderPath || !treeRootPath) {
            setTree([])
            setExpandedPaths(new Set())
            setLoading(false)
            setError(null)
            return
        }

        setExpandedPaths(collectAncestorDirectoryKeys(treeRootPath, activeFolderPath))

        let cancelled = false
        void (async () => {
            await loadTree()
            for (const ancestorPath of targetAncestorPaths) {
                if (cancelled) return
                await loadTree(ancestorPath)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [activeFolderPath, enabled, loadTree, targetAncestorPaths, treeRootPath])

    useEffect(() => {
        if (!enabled || !activeFolderPath || !treeRootPath || refreshToken <= 0) return
        void loadTree(undefined, { preferCache: false })
    }, [activeFolderPath, enabled, loadTree, refreshToken, treeRootPath])

    const ensureDirectoryLoaded = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'directory' || node.childrenLoaded === true) return
        // The virtual tree owns live expansion state. Updating expandedPaths here
        // would flatten the visible rows once before loading and again after merge.
        await loadTree(node.path)
    }, [loadTree])

    const reload = useCallback(async () => {
        await loadTree(undefined, { preferCache: false })
    }, [loadTree])

    const preserveContextForFile = useCallback((targetFilePath: string) => {
        internalNavigationTargetRef.current = normalizePathKey(targetFilePath)
    }, [])

    const navigateToFolder = useCallback((folderPath: string) => {
        const nextFolderPath = String(folderPath || '').trim()
        if (!nextFolderPath) return
        if (normalizePathKey(activeFolderPath) === normalizePathKey(nextFolderPath)) return
        setActiveFolderPath(nextFolderPath)
    }, [activeFolderPath])

    return {
        treeRootPath,
        tree,
        loading,
        error,
        expandedPaths,
        ensureDirectoryLoaded,
        reload,
        preserveContextForFile,
        navigateToFolder
    }
}

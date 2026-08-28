import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { mergeDirectoryChildren, preserveLoadedDirectoryChildren } from '@/lib/filesystem/fileTreeMutations'
import {
    getCachedPreviewFolderTree,
    getCachedPreviewFolderTreeStatus,
    getOrCreatePreviewFolderTreeRequest,
    invalidateCachedPreviewFolderTreeRoot,
    setCachedPreviewFolderTree
} from '@/lib/projectViewCache'

function normalizePathKey(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/')
    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
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
    showHidden?: boolean
    includeFileMetadata?: boolean
    directoryOnlyTree?: boolean
    initialFolderPath?: string | null
}

export function usePreviewFolderTree({
    filePath,
    projectPath,
    directoryTarget = false,
    enabled = true,
    refreshToken = 0,
    showHidden = false,
    includeFileMetadata = false,
    directoryOnlyTree = false,
    initialFolderPath = null
}: UsePreviewFolderTreeOptions) {
    const currentFileFolderPath = useMemo(
        () => getPreviewNavigatorFolderPath(filePath, directoryTarget),
        [directoryTarget, filePath]
    )
    const [activeFolderPath, setActiveFolderPath] = useState(() => String(initialFolderPath || currentFileFolderPath))
    const treeRootPath = useMemo(() => resolveTreeRootPath(projectPath, activeFolderPath), [activeFolderPath, projectPath])
    const targetAncestorPaths = useMemo(
        () => collectAncestorDirectoryPaths(treeRootPath, activeFolderPath),
        [activeFolderPath, treeRootPath]
    )

    const [tree, setTree] = useState<DevScopeFileTreeNode[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [settledNavigatorTargetKey, setSettledNavigatorTargetKey] = useState('')
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
    const requestSequenceRef = useRef(0)
    const navigatorRequestSequenceRef = useRef(0)
    const latestRequestByPathRef = useRef(new Map<string, number>())
    const internalNavigationTargetRef = useRef<string | null>(null)
    const initialFolderPathRef = useRef(String(initialFolderPath || '').trim())
    const hasAppliedInitialFileSyncRef = useRef(false)
    const hasVisibleTreeRef = useRef(false)
    const cacheKeyRootPath = `${treeRootPath || activeFolderPath}::${showHidden ? 'hidden' : 'visible'}::${includeFileMetadata ? 'metadata' : 'lean'}::${directoryOnlyTree ? 'directory-hints' : 'all-children'}`

    useEffect(() => {
        if (!hasAppliedInitialFileSyncRef.current) {
            hasAppliedInitialFileSyncRef.current = true
            if (initialFolderPathRef.current) return
        }
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

    const readCachedDirectoryStatus = useCallback((folderPath: string) => {
        if (!cacheKeyRootPath || !folderPath) return null
        const cached = getCachedPreviewFolderTreeStatus(cacheKeyRootPath, folderPath)
        if (!cached || !Array.isArray(cached.value)) return null
        return { value: cached.value as DevScopeFileTreeNode[], stale: cached.stale }
    }, [cacheKeyRootPath])

    const writeCachedDirectory = useCallback((folderPath: string, nodes: DevScopeFileTreeNode[]) => {
        if (!cacheKeyRootPath || !folderPath) return
        setCachedPreviewFolderTree(cacheKeyRootPath, folderPath, nodes)
    }, [cacheKeyRootPath])

    const readDirectory = useCallback(async (folderPath: string, preferCache = true) => {
        const cachedTree = preferCache ? readCachedDirectoryStatus(folderPath) : null
        if (cachedTree && !cachedTree.stale) return cachedTree.value

        const nextTree = await getOrCreatePreviewFolderTreeRequest(cacheKeyRootPath, folderPath, async () => {
            const result = await window.devscope.getFileTree(treeRootPath, {
                showHidden,
                maxDepth: 0,
                rootPath: folderPath,
                includeGitStatus: false,
                includeFileSize: includeFileMetadata,
                includeDirectoryChildHint: directoryOnlyTree
            })
            if (!result?.success) throw new Error(result?.error || 'Failed to load folder tree.')
            return sortNodes(result.tree || [])
        })
        writeCachedDirectory(folderPath, nextTree)
        return nextTree
    }, [cacheKeyRootPath, directoryOnlyTree, includeFileMetadata, readCachedDirectoryStatus, showHidden, treeRootPath, writeCachedDirectory])

    const combineDirectorySnapshots = useCallback((
        directoryPaths: string[],
        snapshots: DevScopeFileTreeNode[][]
    ) => {
        let nextTree = snapshots[0] || []
        for (let index = 1; index < snapshots.length; index += 1) {
            nextTree = mergeDirectoryChildren(nextTree, directoryPaths[index], snapshots[index] || [])
        }
        return nextTree
    }, [])

    const loadNavigatorTree = useCallback(async (preferCache = true) => {
        if (!enabled || !treeRootPath || !activeFolderPath) return
        const requestId = ++navigatorRequestSequenceRef.current
        const directoryPaths = [...new Set([treeRootPath, ...targetAncestorPaths])]
        const cachedSnapshots = preferCache
            ? directoryPaths.map((folderPath) => readCachedDirectory(folderPath))
            : directoryPaths.map(() => null)
        const cachedRoot = cachedSnapshots[0]

        if (cachedRoot) {
            const cachedDirectoryPaths = [directoryPaths[0]]
            const availableSnapshots = [cachedRoot]
            for (let index = 1; index < cachedSnapshots.length; index += 1) {
                const snapshot = cachedSnapshots[index]
                if (!snapshot) break
                cachedDirectoryPaths.push(directoryPaths[index])
                availableSnapshots.push(snapshot)
            }
            const cachedTree = combineDirectorySnapshots(cachedDirectoryPaths, availableSnapshots)
            hasVisibleTreeRef.current = cachedTree.length > 0
            setError(null)
            setLoading(false)
            applyTreeUpdate(setTree, (currentTree) => preserveLoadedDirectoryChildren(cachedTree, currentTree))
        } else if (!hasVisibleTreeRef.current) {
            setLoading(true)
            setError(null)
        }

        try {
            const snapshots = await Promise.all(directoryPaths.map((folderPath) => readDirectory(folderPath, preferCache)))
            if (navigatorRequestSequenceRef.current !== requestId) return
            const nextTree = combineDirectorySnapshots(directoryPaths, snapshots)
            hasVisibleTreeRef.current = nextTree.length > 0
            setError(null)
            applyTreeUpdate(setTree, (currentTree) => preserveLoadedDirectoryChildren(nextTree, currentTree))
            setSettledNavigatorTargetKey(normalizePathKey(activeFolderPath))
        } catch (loadError: any) {
            if (navigatorRequestSequenceRef.current !== requestId) return
            setError(loadError?.message || 'Failed to load folder tree.')
        } finally {
            if (navigatorRequestSequenceRef.current === requestId) setLoading(false)
        }
    }, [activeFolderPath, combineDirectorySnapshots, enabled, readCachedDirectory, readDirectory, targetAncestorPaths, treeRootPath])

    const loadTree = useCallback(async (targetPath: string) => {
        if (!enabled || !treeRootPath || !activeFolderPath) return
        const requestKey = normalizePathKey(targetPath)
        const requestId = ++requestSequenceRef.current
        latestRequestByPathRef.current.set(requestKey, requestId)
        try {
            const nextTree = await readDirectory(targetPath)
            if (latestRequestByPathRef.current.get(requestKey) !== requestId) return
            applyTreeUpdate(setTree, (currentTree) => mergeDirectoryChildren(currentTree, targetPath, nextTree))
        } catch {
            if (
                latestRequestByPathRef.current.get(requestKey) === requestId
                && normalizePathKey(targetPath) === normalizePathKey(activeFolderPath)
            ) setActiveFolderPath(treeRootPath)
        } finally {
            if (latestRequestByPathRef.current.get(requestKey) === requestId) {
                latestRequestByPathRef.current.delete(requestKey)
            }
        }
    }, [activeFolderPath, enabled, readDirectory, treeRootPath])

    useEffect(() => {
        if (!enabled || !activeFolderPath || !treeRootPath) {
            navigatorRequestSequenceRef.current += 1
            hasVisibleTreeRef.current = false
            setTree([])
            setExpandedPaths(new Set())
            setLoading(false)
            setError(null)
            setSettledNavigatorTargetKey('')
            return
        }

        setExpandedPaths(collectAncestorDirectoryKeys(treeRootPath, activeFolderPath))
        void loadNavigatorTree(true)
    }, [activeFolderPath, enabled, loadNavigatorTree, treeRootPath])

    useEffect(() => {
        if (!enabled || !activeFolderPath || !treeRootPath || refreshToken <= 0) return
        invalidateCachedPreviewFolderTreeRoot(cacheKeyRootPath)
        void loadNavigatorTree(false)
    }, [activeFolderPath, cacheKeyRootPath, enabled, loadNavigatorTree, refreshToken, treeRootPath])

    const ensureDirectoryLoaded = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'directory' || node.childrenLoaded === true) return
        // The virtual tree owns live expansion state. Updating expandedPaths here
        // would flatten the visible rows once before loading and again after merge.
        await loadTree(node.path)
    }, [loadTree])

    const reload = useCallback(async () => {
        invalidateCachedPreviewFolderTreeRoot(cacheKeyRootPath)
        await loadNavigatorTree(false)
    }, [cacheKeyRootPath, loadNavigatorTree])

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
        activeFolderPath,
        tree,
        loading,
        error,
        navigatorTargetSettled: settledNavigatorTargetKey === normalizePathKey(activeFolderPath),
        expandedPaths,
        ensureDirectoryLoaded,
        reload,
        preserveContextForFile,
        navigateToFolder
    }
}

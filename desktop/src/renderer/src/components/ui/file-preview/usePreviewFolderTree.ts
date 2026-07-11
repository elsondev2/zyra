import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { mergeDirectoryChildren } from '@/lib/filesystem/fileTreeMutations'
import { getCachedPreviewFolderTree, setCachedPreviewFolderTree } from '@/lib/projectViewCache'

function normalizePathKey(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').toLowerCase()
}

function getDirectoryPath(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/')
    const lastSlashIndex = normalized.lastIndexOf('/')
    if (lastSlashIndex <= 0) return normalized
    return normalized.slice(0, lastSlashIndex)
}

function getParentFolderPath(pathValue: string): string | null {
    const normalized = String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '')
    if (!normalized) return null

    if (/^[A-Za-z]:$/.test(normalized)) {
        return null
    }

    const lastSlashIndex = normalized.lastIndexOf('/')
    if (lastSlashIndex < 0) return null
    if (lastSlashIndex === 0) return '/'

    const parentPath = normalized.slice(0, lastSlashIndex)
    if (/^[A-Za-z]:$/.test(parentPath)) {
        return `${parentPath}/`
    }

    return parentPath || null
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
    enabled?: boolean
    refreshToken?: number
}

export function usePreviewFolderTree({
    filePath,
    projectPath,
    enabled = true,
    refreshToken = 0
}: UsePreviewFolderTreeOptions) {
    const currentFileFolderPath = useMemo(() => getDirectoryPath(filePath), [filePath])
    const [activeFolderPath, setActiveFolderPath] = useState(currentFileFolderPath)
    const treeRootPath = useMemo(() => resolveTreeRootPath(projectPath, activeFolderPath), [activeFolderPath, projectPath])
    const rootBoundaryPath = useMemo(() => resolveTreeRootPath(projectPath, currentFileFolderPath), [currentFileFolderPath, projectPath])

    const [tree, setTree] = useState<DevScopeFileTreeNode[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
    const requestIdRef = useRef(0)
    const internalNavigationTargetRef = useRef<string | null>(null)
    const cacheKeyRootPath = treeRootPath || activeFolderPath

    useEffect(() => {
        const nextFileKey = normalizePathKey(filePath)
        if (!nextFileKey) return

        if (internalNavigationTargetRef.current === nextFileKey) {
            internalNavigationTargetRef.current = null
            return
        }

        setActiveFolderPath(currentFileFolderPath)
    }, [currentFileFolderPath, filePath])

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
        options?: { preferCache?: boolean; background?: boolean }
    ) => {
        if (!enabled || !treeRootPath || !activeFolderPath) return

        const resolvedTargetPath = targetPath || activeFolderPath
        const cachedTree = options?.preferCache === false ? null : readCachedDirectory(resolvedTargetPath)
        if (cachedTree) {
            setError(null)
            if (targetPath) {
                applyTreeUpdate(setTree, (currentTree) => mergeDirectoryChildren(currentTree, resolvedTargetPath, cachedTree))
            } else {
                applyTreeUpdate(setTree, cachedTree)
            }
            if (!options?.background) {
                setLoading(false)
                return
            }
        }

        const requestId = ++requestIdRef.current
        const isStaleRequest = () => requestId !== requestIdRef.current

        setLoading(!cachedTree || !options?.background)
        setError(null)

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
                setError(result?.error || 'Failed to load folder tree.')
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
            setError(loadError?.message || 'Failed to load folder tree.')
        } finally {
            if (!isStaleRequest()) {
                setLoading(false)
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

        setExpandedPaths(new Set())
        const cachedTree = readCachedDirectory(activeFolderPath)
        if (cachedTree) {
            setError(null)
            setLoading(false)
            applyTreeUpdate(setTree, cachedTree)
            void loadTree(undefined, { background: true })
            return
        }
        void loadTree(undefined, { preferCache: false })
    }, [activeFolderPath, enabled, loadTree, readCachedDirectory, treeRootPath])

    useEffect(() => {
        if (!enabled || !activeFolderPath || !treeRootPath || refreshToken <= 0) return
        void loadTree(undefined, { preferCache: false })
    }, [activeFolderPath, enabled, loadTree, refreshToken, treeRootPath])

    const toggleDirectory = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'directory') return

        const nodeKey = normalizePathKey(node.path)
        const isExpanded = expandedPaths.has(nodeKey)
        const shouldLoadChildren = !isExpanded && node.childrenLoaded !== true

        setExpandedPaths((currentExpandedPaths) => {
            const nextExpandedPaths = new Set(currentExpandedPaths)
            if (nextExpandedPaths.has(nodeKey)) {
                nextExpandedPaths.delete(nodeKey)
            } else {
                nextExpandedPaths.add(nodeKey)
            }
            return nextExpandedPaths
        })

        if (shouldLoadChildren) {
            const cachedTree = readCachedDirectory(node.path)
            if (cachedTree) {
                applyTreeUpdate(setTree, (currentTree) => mergeDirectoryChildren(currentTree, node.path, cachedTree))
                return
            }
            await loadTree(node.path, { preferCache: false })
        }
    }, [expandedPaths, loadTree, readCachedDirectory])

    const reload = useCallback(async () => {
        await loadTree(undefined, { preferCache: false })
    }, [loadTree])

    const preserveContextForFile = useCallback((targetFilePath: string) => {
        internalNavigationTargetRef.current = normalizePathKey(targetFilePath)
    }, [])

    const canNavigateUpFolder = useMemo(() => {
        const parentFolderPath = getParentFolderPath(activeFolderPath)
        if (!parentFolderPath) return false

        const activeFolderKey = normalizePathKey(activeFolderPath)
        const rootBoundaryKey = normalizePathKey(rootBoundaryPath)
        return activeFolderKey !== rootBoundaryKey
    }, [activeFolderPath, rootBoundaryPath])

    const navigateUpFolder = useCallback(() => {
        const parentFolderPath = getParentFolderPath(activeFolderPath)
        if (!parentFolderPath) return

        const rootBoundaryKey = normalizePathKey(rootBoundaryPath)
        const parentFolderKey = normalizePathKey(parentFolderPath)
        const nextFolderPath = parentFolderKey === rootBoundaryKey ? rootBoundaryPath : parentFolderPath

        if (normalizePathKey(activeFolderPath) === normalizePathKey(nextFolderPath)) return
        setActiveFolderPath(nextFolderPath)
    }, [activeFolderPath, rootBoundaryPath])

    const navigateToFolder = useCallback((folderPath: string) => {
        const nextFolderPath = String(folderPath || '').trim()
        if (!nextFolderPath) return
        if (normalizePathKey(activeFolderPath) === normalizePathKey(nextFolderPath)) return
        setActiveFolderPath(nextFolderPath)
    }, [activeFolderPath])

    return {
        activeFolderPath,
        tree,
        loading,
        error,
        expandedPaths,
        toggleDirectory,
        reload,
        preserveContextForFile,
        canNavigateUpFolder,
        navigateUpFolder,
        navigateToFolder
    }
}

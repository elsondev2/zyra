import { useCallback } from 'react'
import { getAllFolderPaths } from './fileTreeUtils'
import type { FileTreeNode } from './types'

type UseProjectFileTreeNavigationActionsParams = {
    fileTreeFullyLoaded: boolean
    projectRootPath: string
    refreshFileTree: (options?: { deep?: boolean; targetPath?: string }) => Promise<FileTreeNode[] | undefined>
    expandedFolders: Set<string>
    setExpandedFolders: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void
    setLoadingFolderPaths: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void
    setIsExpandingFolders: (value: boolean) => void
    fileTree: FileTreeNode[]
    showToast: (message: string, actionLabel?: string, actionTo?: string, tone?: 'success' | 'error' | 'info') => void
}

export function useProjectFileTreeNavigationActions({
    fileTreeFullyLoaded,
    projectRootPath,
    refreshFileTree,
    expandedFolders,
    setExpandedFolders,
    setLoadingFolderPaths,
    setIsExpandingFolders,
    fileTree,
    showToast
}: UseProjectFileTreeNavigationActionsParams) {
    const refreshVisibleFileTree = useCallback(async (targetPath?: string) => {
        const normalizedTargetPath = String(targetPath || '').trim()
        const shouldDeepRefresh = fileTreeFullyLoaded

        if (!projectRootPath || !normalizedTargetPath || normalizedTargetPath === projectRootPath) {
            return refreshFileTree({ deep: shouldDeepRefresh })
        }

        if (shouldDeepRefresh) {
            return refreshFileTree({ deep: true })
        }

        return refreshFileTree({ targetPath: normalizedTargetPath })
    }, [fileTreeFullyLoaded, projectRootPath, refreshFileTree])

    const handleToggleFolder = useCallback(async (node: FileTreeNode) => {
        if (node.type !== 'directory') return

        if (expandedFolders.has(node.path)) {
            setExpandedFolders((prev) => {
                const next = new Set(prev)
                next.delete(node.path)
                return next
            })
            return
        }

        setExpandedFolders((prev) => {
            const next = new Set(prev)
            next.add(node.path)
            return next
        })

        const needsChildren = node.childrenLoaded === false || typeof node.children === 'undefined'
        if (!needsChildren) return

        setLoadingFolderPaths((prev) => new Set(prev).add(node.path))
        try {
            await refreshFileTree({ targetPath: node.path })
        } catch (err: any) {
            showToast(err?.message || `Failed to load "${node.name}"`, undefined, undefined, 'error')
            setExpandedFolders((prev) => {
                const next = new Set(prev)
                next.delete(node.path)
                return next
            })
        } finally {
            setLoadingFolderPaths((prev) => {
                const next = new Set(prev)
                next.delete(node.path)
                return next
            })
        }
    }, [expandedFolders, refreshFileTree, setExpandedFolders, setLoadingFolderPaths, showToast])

    const handleToggleAllFolders = useCallback(async () => {
        setIsExpandingFolders(true)
        try {
            if (expandedFolders.size > 0) {
                setExpandedFolders(new Set())
                return
            }

            const nextTree = fileTreeFullyLoaded
                ? fileTree
                : (await refreshFileTree({ deep: true })) || fileTree

            setExpandedFolders(new Set(getAllFolderPaths(nextTree)))
        } finally {
            setIsExpandingFolders(false)
        }
    }, [expandedFolders.size, fileTree, fileTreeFullyLoaded, refreshFileTree, setExpandedFolders, setIsExpandingFolders])

    return {
        refreshVisibleFileTree,
        handleToggleFolder,
        handleToggleAllFolders
    }
}

import { useCallback, useEffect, useRef } from 'react'
import { getCachedFileTree, setCachedFileTree } from '@/lib/projectViewCache'
import { preserveLoadedDirectoryChildren } from '@/lib/filesystem/fileTreeMutations'
import { mergeDirectoryChildren } from '../fileTreeUtils'
import type { FileTreeNode } from '../types'
import type { UseProjectDataLifecycleParams } from './types'

type UseProjectFileTreeLifecycleParams = Pick<
    UseProjectDataLifecycleParams,
    'decodedPath' | 'fileTree' | 'setFileTree' | 'setLoadingFiles'
>

export function useProjectFileTreeLifecycle({
    decodedPath,
    fileTree,
    setFileTree,
    setLoadingFiles
}: UseProjectFileTreeLifecycleParams) {
    const refreshFilesRequestRef = useRef(0)
    const fileTreeRef = useRef(fileTree)

    useEffect(() => {
        fileTreeRef.current = fileTree
    }, [fileTree])

    const refreshFileTree = useCallback(async (options?: { deep?: boolean; targetPath?: string }) => {
        if (!decodedPath) return undefined

        const targetPath = typeof options?.targetPath === 'string' && options.targetPath.trim().length > 0
            ? options.targetPath.trim()
            : undefined
        const requestId = targetPath ? refreshFilesRequestRef.current : ++refreshFilesRequestRef.current
        const isStaleRefresh = () => requestId !== refreshFilesRequestRef.current
        const deep = options?.deep ?? !targetPath
        if (!targetPath) setLoadingFiles(true)

        try {
            const treeResult = await window.devscope.getFileTree(decodedPath, {
                showHidden: true,
                maxDepth: deep ? -1 : 1,
                rootPath: targetPath,
                // Git status is refreshed independently; fetching it for every folder expansion
                // makes a filesystem navigation wait on a repository-wide scan.
                includeGitStatus: false
            })
            if (isStaleRefresh() || !treeResult?.success || !treeResult.tree) {
                return undefined
            }

            if (targetPath) {
                // Merge into the latest tree so simultaneous sibling expansions retain both results.
                const mergedTree = mergeDirectoryChildren(fileTreeRef.current, targetPath, treeResult.tree as FileTreeNode[])
                fileTreeRef.current = mergedTree
                setFileTree(mergedTree)
                setCachedFileTree(decodedPath, mergedTree)
                return mergedTree
            }

            const nextTree = deep
                ? treeResult.tree as FileTreeNode[]
                : preserveLoadedDirectoryChildren(treeResult.tree as FileTreeNode[], fileTreeRef.current)
            fileTreeRef.current = nextTree
            setFileTree(nextTree)
            setCachedFileTree(decodedPath, nextTree)
            return nextTree
        } finally {
            if (!targetPath && !isStaleRefresh()) {
                setLoadingFiles(false)
            }
        }
    }, [decodedPath, setFileTree, setLoadingFiles])

    useEffect(() => {
        if (!decodedPath) return

        const cachedTree = getCachedFileTree(decodedPath)
        if (cachedTree) {
            setFileTree(cachedTree as any)
            setLoadingFiles(false)
            return
        }

        void refreshFileTree({ deep: false })
    }, [decodedPath, refreshFileTree, setFileTree, setLoadingFiles])

    return { refreshFileTree }
}

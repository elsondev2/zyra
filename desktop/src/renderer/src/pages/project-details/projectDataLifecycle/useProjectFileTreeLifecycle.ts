import { useCallback, useEffect, useRef } from 'react'
import { getCachedFileTree, setCachedFileTree } from '@/lib/projectViewCache'
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

        const requestId = ++refreshFilesRequestRef.current
        const isStaleRefresh = () => requestId !== refreshFilesRequestRef.current
        const targetPath = typeof options?.targetPath === 'string' && options.targetPath.trim().length > 0
            ? options.targetPath.trim()
            : undefined
        const currentTree = fileTreeRef.current
        const deep = options?.deep ?? !targetPath
        setLoadingFiles(true)

        try {
            const treeResult = await window.devscope.getFileTree(decodedPath, {
                showHidden: true,
                maxDepth: deep ? -1 : 1,
                rootPath: targetPath
            })
            if (isStaleRefresh() || !treeResult?.success || !treeResult.tree) {
                return undefined
            }

            if (targetPath) {
                const mergedTree = mergeDirectoryChildren(currentTree, targetPath, treeResult.tree as FileTreeNode[])
                fileTreeRef.current = mergedTree
                setFileTree(mergedTree)
                setCachedFileTree(decodedPath, mergedTree)
                return mergedTree
            }

            fileTreeRef.current = treeResult.tree as FileTreeNode[]
            setFileTree(treeResult.tree)
            setCachedFileTree(decodedPath, treeResult.tree)
            return treeResult.tree as FileTreeNode[]
        } finally {
            if (!isStaleRefresh()) {
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

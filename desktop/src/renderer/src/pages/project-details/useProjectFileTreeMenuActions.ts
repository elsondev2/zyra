import { useCallback } from 'react'
import type { FileTreeNode } from './types'
import { splitFileNameForRename } from './projectDetailsPageHelpers'

type UseProjectFileTreeMenuActionsParams = {
    openFile: (path: string) => Promise<void>
    showToast: (message: string, actionLabel?: string, actionTo?: string, tone?: 'success' | 'error' | 'info') => void
    setFileClipboardItem: (value: { path: string; name: string; type: 'file' | 'directory' } | null) => void
    setRenameTarget: (value: FileTreeNode | null) => void
    setRenameDraft: (value: string) => void
    setRenameExtensionSuffix: (value: string) => void
    setRenameErrorMessage: (value: string | null) => void
    setDeleteTarget: (value: FileTreeNode | null) => void
}

export function useProjectFileTreeMenuActions({
    openFile,
    showToast,
    setFileClipboardItem,
    setRenameTarget,
    setRenameDraft,
    setRenameExtensionSuffix,
    setRenameErrorMessage,
    setDeleteTarget
}: UseProjectFileTreeMenuActionsParams) {
    const handleFileTreeOpen = useCallback(async (
        node: FileTreeNode,
        handleToggleFolder: (target: FileTreeNode) => Promise<void>
    ) => {
        if (node.type === 'directory') {
            await handleToggleFolder(node)
            return
        }

        await openFile(node.path)
    }, [openFile])

    const handleFileTreeOpenWith = useCallback(async (node: FileTreeNode) => {
        if (node.type === 'directory') return

        const result = await window.devscope.openWith(node.path)
        if (!result.success) {
            showToast(result.error || `Failed to open "${node.name}" with...`, undefined, undefined, 'error')
        }
    }, [showToast])

    const handleFileTreeOpenInExplorer = useCallback(async (node: FileTreeNode) => {
        const result = await window.devscope.openInExplorer(node.path)
        if (!result.success) {
            showToast(result.error || `Failed to open "${node.name}" in explorer`, undefined, undefined, 'error')
        }
    }, [showToast])

    const handleFileTreeCopyPath = useCallback(async (node: FileTreeNode) => {
        try {
            if (window.devscope.copyToClipboard) {
                const result = await window.devscope.copyToClipboard(node.path)
                if (!result.success) {
                    showToast(result.error || 'Failed to copy to clipboard', undefined, undefined, 'error')
                    return
                }
            } else {
                await navigator.clipboard.writeText(node.path)
            }

            showToast(`Copied path: ${node.name}`)
        } catch (err: any) {
            showToast(err?.message || 'Failed to copy to clipboard', undefined, undefined, 'error')
        }
    }, [showToast])

    const handleFileTreeCopy = useCallback((node: FileTreeNode) => {
        setFileClipboardItem({
            path: node.path,
            name: node.name,
            type: node.type
        })
        showToast(`Copied ${node.type === 'directory' ? 'folder' : 'file'}: ${node.name}`)
    }, [setFileClipboardItem, showToast])

    const handleFileTreeRename = useCallback((node: FileTreeNode) => {
        const splitName = splitFileNameForRename(node.name)
        setRenameTarget(node)
        setRenameDraft(splitName.baseName)
        setRenameExtensionSuffix(node.type === 'file' ? splitName.extensionSuffix : '')
        setRenameErrorMessage(null)
    }, [setRenameDraft, setRenameErrorMessage, setRenameExtensionSuffix, setRenameTarget])

    const handleFileTreeDelete = useCallback((node: FileTreeNode) => {
        setDeleteTarget(node)
    }, [setDeleteTarget])

    return {
        handleFileTreeOpen,
        handleFileTreeOpenWith,
        handleFileTreeOpenInExplorer,
        handleFileTreeCopyPath,
        handleFileTreeCopy,
        handleFileTreeRename,
        handleFileTreeDelete
    }
}

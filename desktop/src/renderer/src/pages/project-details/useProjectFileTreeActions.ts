import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { getAllFolderPaths } from './fileTreeUtils'
import type { FileTreeNode } from './types'
import {
    extractNodeByPath,
    insertNodeAtDirectory,
    joinFileSystemPath,
    pathsMatch,
    renameNodeByPath,
    resolveOptimisticCopyName,
    updateNodePathPrefix
} from './fileTreeMutations'
import {
    getFileExtensionFromName,
    normalizeFileSystemPath,
    getParentFolderPath,
    validateCreateName
} from './projectDetailsPageHelpers'
import { useProjectFileTreeNavigationActions } from './useProjectFileTreeNavigationActions'
import { useProjectFileTreeMenuActions } from './useProjectFileTreeMenuActions'

type UseProjectFileTreeActionsParams = {
    activeTab: 'readme' | 'files' | 'git'
    loadingFiles: boolean
    projectRootPath: string
    fileSearch: string
    fileTreeFullyLoaded: boolean
    refreshFileTree: (options?: { deep?: boolean; targetPath?: string }) => Promise<FileTreeNode[] | undefined>
    expandedFolders: Set<string>
    setExpandedFolders: Dispatch<SetStateAction<Set<string>>>
    setLoadingFolderPaths: Dispatch<SetStateAction<Set<string>>>
    setIsExpandingFolders: Dispatch<SetStateAction<boolean>>
    fileTree: FileTreeNode[]
    setFileTree: Dispatch<SetStateAction<FileTreeNode[]>>
    openFile: (path: string) => Promise<void>
    openPreview: (
        file: { name: string; path: string },
        ext: string,
        options?: { startInEditMode?: boolean }
    ) => Promise<void>
    showToast: (message: string, actionLabel?: string, actionTo?: string, tone?: 'success' | 'error' | 'info') => void
    fileClipboardItem: { path: string; name: string; type: 'file' | 'directory' } | null
    setFileClipboardItem: Dispatch<SetStateAction<{ path: string; name: string; type: 'file' | 'directory' } | null>>
    setRenameTarget: Dispatch<SetStateAction<FileTreeNode | null>>
    setRenameDraft: Dispatch<SetStateAction<string>>
    setRenameExtensionSuffix: Dispatch<SetStateAction<string>>
    setRenameErrorMessage: Dispatch<SetStateAction<string | null>>
    setCreateTarget: Dispatch<SetStateAction<{ destinationDirectory: string; type: 'file' | 'directory'; presetExtension?: string } | null>>
    setCreateDraft: Dispatch<SetStateAction<string>>
    setCreateErrorMessage: Dispatch<SetStateAction<string | null>>
    setDeleteTarget: Dispatch<SetStateAction<FileTreeNode | null>>
    createTarget: { destinationDirectory: string; type: 'file' | 'directory'; presetExtension?: string } | null
    createDraft: string
    setCreateDraftState: Dispatch<SetStateAction<string>>
    renameTarget: FileTreeNode | null
    renameDraft: string
    renameExtensionSuffix: string
    deleteTarget: FileTreeNode | null
}

export function useProjectFileTreeActions({
    activeTab,
    loadingFiles,
    projectRootPath,
    fileSearch,
    fileTreeFullyLoaded,
    refreshFileTree,
    expandedFolders,
    setExpandedFolders,
    setLoadingFolderPaths,
    setIsExpandingFolders,
    fileTree,
    setFileTree,
    openFile,
    openPreview,
    showToast,
    fileClipboardItem,
    setFileClipboardItem,
    setRenameTarget,
    setRenameDraft,
    setRenameExtensionSuffix,
    setRenameErrorMessage,
    setCreateTarget,
    setCreateDraft,
    setCreateErrorMessage,
    setDeleteTarget,
    createTarget,
    createDraft,
    setCreateDraftState,
    renameTarget,
    renameDraft,
    renameExtensionSuffix,
    deleteTarget
}: UseProjectFileTreeActionsParams) {
    const fileTreeRef = useRef(fileTree)

    useEffect(() => {
        fileTreeRef.current = fileTree
    }, [fileTree])

    const applyOptimisticFileTree = useCallback((
        updater: (tree: FileTreeNode[]) => FileTreeNode[]
    ) => {
        const previousTree = fileTreeRef.current
        const nextTree = updater(previousTree)
        if (nextTree !== previousTree) {
            setFileTree(nextTree)
        }
        return previousTree
    }, [setFileTree])

    const {
        refreshVisibleFileTree,
        handleToggleFolder,
        handleToggleAllFolders
    } = useProjectFileTreeNavigationActions({
        fileTreeFullyLoaded,
        projectRootPath,
        refreshFileTree,
        expandedFolders,
        setExpandedFolders,
        setLoadingFolderPaths,
        setIsExpandingFolders,
        fileTree,
        showToast
    })

    const {
        handleFileTreeOpen: handleFileTreeOpenBase,
        handleFileTreeOpenWith,
        handleFileTreeOpenInExplorer,
        handleFileTreeCopyPath,
        handleFileTreeCopy,
        handleFileTreeRename,
        handleFileTreeDelete
    } = useProjectFileTreeMenuActions({
        openFile,
        showToast,
        setFileClipboardItem,
        setRenameTarget,
        setRenameDraft,
        setRenameExtensionSuffix,
        setRenameErrorMessage,
        setDeleteTarget
    })

    const handleFileTreeOpen = useCallback(async (node: FileTreeNode) => {
        await handleFileTreeOpenBase(node, handleToggleFolder)
    }, [handleFileTreeOpenBase, handleToggleFolder])

    const handleFileTreePaste = useCallback(async (node: FileTreeNode) => {
        if (!fileClipboardItem) return

        const destinationDirectory = node.type === 'directory'
            ? node.path
            : getParentFolderPath(node.path)

        if (!destinationDirectory) {
            showToast('Unable to resolve destination folder for paste.', undefined, undefined, 'error')
            return
        }

        const optimisticName = resolveOptimisticCopyName(
            fileClipboardItem.name,
            destinationDirectory,
            fileTreeRef.current,
            projectRootPath
        )
        const optimisticPath = joinFileSystemPath(destinationDirectory, optimisticName)
        const optimisticNode: FileTreeNode = {
            name: optimisticName,
            path: optimisticPath,
            type: fileClipboardItem.type,
            isHidden: optimisticName.startsWith('.'),
            ...(fileClipboardItem.type === 'directory'
                ? { childrenLoaded: false }
                : {})
        }

        const previousTree = applyOptimisticFileTree((currentTree) => {
            const { nodes } = insertNodeAtDirectory(
                currentTree,
                destinationDirectory,
                optimisticNode,
                projectRootPath
            )
            return nodes
        })

        showToast(`Pasting ${fileClipboardItem.name}...`, undefined, undefined, 'info')

        const result = await window.devscope.pasteFileSystemItem(fileClipboardItem.path, destinationDirectory)
        if (!result.success) {
            setFileTree(previousTree)
            showToast(result.error || `Failed to paste "${fileClipboardItem.name}"`, undefined, undefined, 'error')
            return
        }

        if (result.path && result.name && result.path !== optimisticPath) {
            setFileTree((currentTree) => renameNodeByPath(currentTree, optimisticPath, result.name, result.path))
        }

        showToast(`Pasted ${result.name || fileClipboardItem.name}`)
        await refreshVisibleFileTree(destinationDirectory)
    }, [applyOptimisticFileTree, fileClipboardItem, projectRootPath, refreshVisibleFileTree, setFileTree, showToast])

    const handleFileTreeMove = useCallback(async (node: FileTreeNode, destinationDirectory: string) => {
        if (!node?.path || !destinationDirectory) return
        const normalizedDestination = String(destinationDirectory || '').trim()
        if (!normalizedDestination) return

        const sourceParent = getParentFolderPath(node.path)
        if (sourceParent && normalizeFileSystemPath(sourceParent) === normalizeFileSystemPath(normalizedDestination)) {
            return
        }

        const previousTree = applyOptimisticFileTree((currentTree) => {
            const extraction = extractNodeByPath(currentTree, node.path)
            if (!extraction.removed) return currentTree
            const destinationPath = joinFileSystemPath(normalizedDestination, extraction.removed.name)
            const movedNode = updateNodePathPrefix(extraction.removed, extraction.removed.path, destinationPath)
            const insertion = insertNodeAtDirectory(
                extraction.nodes,
                normalizedDestination,
                movedNode,
                projectRootPath
            )
            return insertion.nodes
        })

        showToast(`Moving ${node.name}...`, undefined, undefined, 'info')

        const result = await window.devscope.moveFileSystemItem(node.path, normalizedDestination)
        if (!result.success) {
            setFileTree(previousTree)
            showToast(result.error || `Failed to move "${node.name}"`, undefined, undefined, 'error')
            return
        }

        showToast(`Moved ${node.name}`)
        const sourceParentPath = sourceParent || projectRootPath
        if (sourceParentPath && normalizeFileSystemPath(sourceParentPath) !== normalizeFileSystemPath(normalizedDestination)) {
            await refreshVisibleFileTree(sourceParentPath)
        }
        await refreshVisibleFileTree(normalizedDestination)
    }, [applyOptimisticFileTree, projectRootPath, refreshVisibleFileTree, setFileTree, showToast])

    const resolveCreateDestinationDirectory = useCallback((node?: FileTreeNode): string | null => {
        if (!node) {
            return projectRootPath || null
        }
        if (node.type === 'directory') return node.path
        return getParentFolderPath(node.path)
    }, [projectRootPath])

    const openCreatePrompt = useCallback((destinationDirectory: string, type: 'file' | 'directory', presetExtension?: string) => {
        setCreateTarget({ destinationDirectory, type, presetExtension })
        setCreateDraft('')
        setCreateErrorMessage(null)
    }, [setCreateErrorMessage, setCreateDraft, setCreateTarget])

    const handleFileTreeCreateFile = useCallback((node?: FileTreeNode, presetExtension?: string) => {
        const destinationDirectory = resolveCreateDestinationDirectory(node)
        if (!destinationDirectory) {
            showToast('Unable to resolve destination folder.', undefined, undefined, 'error')
            return
        }
        openCreatePrompt(destinationDirectory, 'file', presetExtension)
    }, [openCreatePrompt, resolveCreateDestinationDirectory, showToast])

    const handleFileTreeCreateFolder = useCallback((node?: FileTreeNode) => {
        const destinationDirectory = resolveCreateDestinationDirectory(node)
        if (!destinationDirectory) {
            showToast('Unable to resolve destination folder.', undefined, undefined, 'error')
            return
        }
        openCreatePrompt(destinationDirectory, 'directory')
    }, [openCreatePrompt, resolveCreateDestinationDirectory, showToast])

    const submitCreateTarget = useCallback(async (nextName?: string) => {
        if (!createTarget) return

        const normalizedName = String(nextName ?? createDraft).trim()
        const validationError = validateCreateName(normalizedName)
        if (validationError) {
            setCreateErrorMessage(validationError)
            return
        }

        const destinationDirectory = createTarget.destinationDirectory
        const optimisticPath = joinFileSystemPath(destinationDirectory, normalizedName)
        const optimisticNode: FileTreeNode = {
            name: normalizedName,
            path: optimisticPath,
            type: createTarget.type,
            isHidden: normalizedName.startsWith('.'),
            ...(createTarget.type === 'directory'
                ? { children: [], childrenLoaded: true }
                : {})
        }

        const previousTree = applyOptimisticFileTree((currentTree) => {
            const { nodes } = insertNodeAtDirectory(
                currentTree,
                destinationDirectory,
                optimisticNode,
                projectRootPath
            )
            return nodes
        })

        setCreateTarget(null)
        setCreateDraftState('')
        setCreateErrorMessage(null)
        showToast(`Creating ${createTarget.type === 'file' ? 'file' : 'folder'}: ${normalizedName}...`, undefined, undefined, 'info')

        const result = await window.devscope.createFileSystemItem(
            destinationDirectory,
            normalizedName,
            createTarget.type
        )
        if (!result.success) {
            setFileTree(previousTree)
            showToast(result.error || `Failed to create ${createTarget.type}.`, undefined, undefined, 'error')
            return
        }

        const createdPath = result.path
        const createdName = result.name
        const createdType = result.type

        if (createdPath && createdName && createdPath !== optimisticPath) {
            setFileTree((currentTree) => renameNodeByPath(currentTree, optimisticPath, createdName, createdPath))
        }

        showToast(`Created ${createdType === 'file' ? 'file' : 'folder'}: ${createdName}`)
        await refreshVisibleFileTree(destinationDirectory)

        if (createdType === 'file') {
            const ext = getFileExtensionFromName(createdName) || 'txt'
            await openPreview(
                { name: createdName, path: createdPath },
                ext,
                { startInEditMode: true }
            )
        }
    }, [
        applyOptimisticFileTree,
        createDraft,
        createTarget,
        openPreview,
        projectRootPath,
        refreshVisibleFileTree,
        setCreateDraftState,
        setCreateErrorMessage,
        setCreateTarget,
        setFileTree,
        showToast
    ])

    const submitRenameTarget = useCallback(async () => {
        if (!renameTarget) return
        const normalizedBaseName = renameDraft.trim()
        if (!normalizedBaseName) {
            setRenameErrorMessage('Name cannot be empty.')
            return
        }
        const normalizedNextName = renameTarget.type === 'file'
            ? `${normalizedBaseName}${renameExtensionSuffix}`
            : normalizedBaseName
        if (normalizedNextName === renameTarget.name) {
            setRenameTarget(null)
            setRenameDraft('')
            setRenameExtensionSuffix('')
            setRenameErrorMessage(null)
            return
        }

        const targetPath = renameTarget.path
        const nextPath = joinFileSystemPath(getParentFolderPath(targetPath) || projectRootPath, normalizedNextName)

        const previousTree = applyOptimisticFileTree((currentTree) => (
            renameNodeByPath(currentTree, targetPath, normalizedNextName, nextPath)
        ))

        setRenameTarget(null)
        setRenameDraft('')
        setRenameExtensionSuffix('')
        setRenameErrorMessage(null)
        showToast(`Renaming ${renameTarget.name}...`, undefined, undefined, 'info')

        const result = await window.devscope.renameFileSystemItem(targetPath, normalizedNextName)
        if (!result.success) {
            setFileTree(previousTree)
            showToast(result.error || `Failed to rename "${renameTarget.name}"`, undefined, undefined, 'error')
            return
        }

        if (result.path && result.name && result.path !== nextPath) {
            setFileTree((currentTree) => renameNodeByPath(currentTree, nextPath, result.name, result.path))
        }

        showToast(`Renamed to ${result.name || normalizedNextName}`)
        await refreshVisibleFileTree(getParentFolderPath(targetPath) || projectRootPath)
    }, [
        applyOptimisticFileTree,
        projectRootPath,
        refreshVisibleFileTree,
        renameDraft,
        renameExtensionSuffix,
        renameTarget,
        setRenameDraft,
        setRenameErrorMessage,
        setRenameExtensionSuffix,
        setRenameTarget,
        setFileTree,
        showToast
    ])

    const confirmDeleteTarget = useCallback(async () => {
        if (!deleteTarget) return
        const target = deleteTarget
        const previousClipboard = fileClipboardItem

        const previousTree = applyOptimisticFileTree((currentTree) => {
            const extraction = extractNodeByPath(currentTree, target.path)
            return extraction.nodes
        })

        setDeleteTarget(null)

        if (fileClipboardItem?.path === target.path) {
            setFileClipboardItem(null)
        }

        showToast(`Deleting ${target.name}...`, undefined, undefined, 'info')

        const result = await window.devscope.deleteFileSystemItem(target.path)
        if (!result.success) {
            setFileTree(previousTree)
            if (previousClipboard) {
                setFileClipboardItem(previousClipboard)
            }
            showToast(result.error || `Failed to delete "${target.name}"`, undefined, undefined, 'error')
            return
        }

        showToast(`Deleted ${target.name}`)
        await refreshVisibleFileTree(getParentFolderPath(target.path) || projectRootPath)
    }, [
        applyOptimisticFileTree,
        deleteTarget,
        fileClipboardItem,
        projectRootPath,
        refreshVisibleFileTree,
        setDeleteTarget,
        setFileClipboardItem,
        setFileTree,
        showToast
    ])
    return {
        refreshVisibleFileTree,
        handleToggleFolder,
        handleToggleAllFolders,
        handleFileTreeOpen,
        handleFileTreeOpenWith,
        handleFileTreeOpenInExplorer,
        handleFileTreeCopyPath,
        handleFileTreeCopy,
        handleFileTreeRename,
        handleFileTreeDelete,
        handleFileTreePaste,
        handleFileTreeMove,
        handleFileTreeCreateFile,
        handleFileTreeCreateFolder,
        submitCreateTarget,
        submitRenameTarget,
        confirmDeleteTarget
    }
}

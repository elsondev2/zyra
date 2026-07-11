import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import { primeProjectDetailsCache } from '@/lib/projectViewCache'
import type { FolderItem, Project } from './types'
import type {
    CreateFileSystemTarget,
    FileSystemClipboardItem,
    FolderBrowseMode
} from './folderBrowsePageUtils'
import {
    buildBrowseRoute,
    getFileExtensionFromName,
    getParentFolderPath,
    getParentFolderPathWithinRoot,
    isPathWithinRoot,
    splitFileNameForRename,
    validateCreateName
} from './folderBrowsePageUtils'

type ToastState = {
    message: string
    visible: boolean
    tone?: 'success' | 'error' | 'info'
    detail?: string
    progress?: number
    persistent?: boolean
} | null

type OpenPreviewFn = (
    file: { name: string; path: string },
    extension: string,
    options?: PreviewOpenOptions
) => Promise<void>

type UpdateSettingsFn = (patch: Record<string, unknown>) => void

export function useFolderBrowseActions(input: {
    mode: FolderBrowseMode
    decodedPath: string
    navigationRoot: string | null
    navigate: NavigateFunction
    updateSettings: UpdateSettingsFn
    loadContents: (forceRefresh?: boolean) => Promise<void>
    openPreview: OpenPreviewFn
    setError: Dispatch<SetStateAction<string | null>>
}) {
    const {
        mode,
        decodedPath,
        navigationRoot,
        navigate,
        updateSettings,
        loadContents,
        openPreview,
        setError
    } = input
    const browseRoute = useCallback((path?: string) => buildBrowseRoute(mode, path), [mode])
    const folderHistoryRef = useRef<string[]>([])
    const [copiedPath, setCopiedPath] = useState(false)
    const [fileClipboardItem, setFileClipboardItem] = useState<FileSystemClipboardItem | null>(null)
    const [renameTarget, setRenameTarget] = useState<FileSystemClipboardItem | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [renameExtensionSuffix, setRenameExtensionSuffix] = useState('')
    const [renameErrorMessage, setRenameErrorMessage] = useState<string | null>(null)
    const [createTarget, setCreateTarget] = useState<CreateFileSystemTarget | null>(null)
    const [createDraft, setCreateDraft] = useState('')
    const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null)
    const [cloneRepoModalOpen, setCloneRepoModalOpen] = useState(false)
    const [cloneRepoUrl, setCloneRepoUrl] = useState('')
    const [cloneRepoErrorMessage, setCloneRepoErrorMessage] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<FileSystemClipboardItem | null>(null)
    const [toast, setToast] = useState<ToastState>(null)

    useEffect(() => {
        if (!decodedPath) return

        const history = folderHistoryRef.current
        const existingIndex = history.lastIndexOf(decodedPath)

        if (existingIndex >= 0) {
            folderHistoryRef.current = history.slice(0, existingIndex + 1)
            return
        }

        history.push(decodedPath)
    }, [decodedPath])

    useEffect(() => {
        setCopiedPath(false)
    }, [decodedPath])

    const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
        setToast({ message, visible: false, tone })
        window.setTimeout(() => {
            setToast((current) => current ? { ...current, visible: true } : current)
        }, 8)
    }, [])

    useEffect(() => {
        if (!toast?.visible) return
        if (toast.persistent) return
        const hideTimer = window.setTimeout(() => {
            setToast((current) => current ? { ...current, visible: false } : current)
        }, 2200)
        const removeTimer = window.setTimeout(() => {
            setToast(null)
        }, 2600)
        return () => {
            window.clearTimeout(hideTimer)
            window.clearTimeout(removeTimer)
        }
    }, [toast?.persistent, toast?.visible])

    const handleProjectClick = useCallback((project: Project) => {
        primeProjectDetailsCache(project)
        navigate(`/projects/${encodeURIComponent(project.path)}`)
    }, [navigate])

    const handleFolderClick = useCallback((folder: FolderItem) => {
        navigate(browseRoute(folder.path))
    }, [browseRoute, navigate])

    const handleViewAsProject = useCallback(() => {
        const fallbackName = String(decodedPath || '').trim().split(/[\\/]/).filter(Boolean).pop() || 'Project'
        primeProjectDetailsCache({
            name: fallbackName,
            path: decodedPath,
            type: 'unknown',
            markers: [],
            frameworks: []
        })
        navigate(`/projects/${encodeURIComponent(decodedPath)}`)
    }, [decodedPath, navigate])

    const handleBack = useCallback(() => {
        const history = folderHistoryRef.current
        if (history.length > 1) {
            history.pop()
            while (history.length > 0) {
                const previousFolder = history[history.length - 1]
                if (!navigationRoot || isPathWithinRoot(previousFolder, navigationRoot)) {
                    navigate(browseRoute(previousFolder))
                    return
                }
                history.pop()
            }
        }

        const parentPath = getParentFolderPathWithinRoot(decodedPath, navigationRoot)
        if (parentPath && parentPath !== decodedPath) {
            navigate(browseRoute(parentPath))
            return
        }

        navigate(-1)
    }, [browseRoute, decodedPath, navigate, navigationRoot])

    const handleNavigateUp = useCallback(() => {
        const parentPath = getParentFolderPathWithinRoot(decodedPath, navigationRoot)
        if (!parentPath || parentPath === decodedPath) return
        navigate(browseRoute(parentPath))
    }, [browseRoute, decodedPath, navigate, navigationRoot])

    const copyTextToClipboard = useCallback(async (value: string): Promise<boolean> => {
        try {
            if (window.devscope.copyToClipboard) {
                const result = await window.devscope.copyToClipboard(value)
                if (!result.success) {
                    setError(result.error || 'Failed to copy to clipboard')
                    return false
                }
            } else {
                await navigator.clipboard.writeText(value)
            }
            return true
        } catch (err: any) {
            setError(err?.message || 'Failed to copy to clipboard')
            return false
        }
    }, [setError])

    const handleCopyPath = useCallback(async () => {
        if (!decodedPath.trim()) return
        const copied = await copyTextToClipboard(decodedPath)
        setCopiedPath(copied)
        if (copied) {
            showToast('Copied folder path')
            window.setTimeout(() => setCopiedPath(false), 1500)
        }
    }, [copyTextToClipboard, decodedPath, showToast])

    const handleEntryOpen = useCallback(async (entry: FileSystemClipboardItem) => {
        if (entry.type === 'directory') {
            navigate(browseRoute(entry.path))
            return
        }
        const result = await window.devscope.openFile(entry.path)
        if (!result.success) {
            setError(result.error || `Failed to open "${entry.name}"`)
        }
    }, [browseRoute, navigate, setError])

    const handleEntryOpenWith = useCallback(async (entry: FileSystemClipboardItem) => {
        if (entry.type === 'directory') return
        const result = await window.devscope.openWith(entry.path)
        if (!result.success) {
            setError(result.error || `Failed to open "${entry.name}" with...`)
        }
    }, [setError])

    const handleEntryOpenInExplorer = useCallback(async (entry: FileSystemClipboardItem) => {
        const result = await window.devscope.openInExplorer(entry.path)
        if (!result.success) {
            setError(result.error || `Failed to open "${entry.name}" in explorer`)
        }
    }, [setError])

    const handleEntryCopyPath = useCallback(async (entry: FileSystemClipboardItem) => {
        const copied = await copyTextToClipboard(entry.path)
        if (copied) showToast(`Copied path: ${entry.name}`)
    }, [copyTextToClipboard, showToast])

    const handleEntryCopy = useCallback((entry: FileSystemClipboardItem) => {
        setFileClipboardItem({
            path: entry.path,
            name: entry.name,
            type: entry.type
        })
        setError(null)
        showToast(`Copied ${entry.type === 'directory' ? 'folder' : 'file'}: ${entry.name}`)
    }, [setError, showToast])

    const handleEntryRename = useCallback(async (entry: FileSystemClipboardItem) => {
        const splitName = entry.type === 'file'
            ? splitFileNameForRename(entry.name)
            : { baseName: entry.name, extensionSuffix: '' }
        setRenameTarget(entry)
        setRenameDraft(splitName.baseName)
        setRenameExtensionSuffix(splitName.extensionSuffix)
        setRenameErrorMessage(null)
    }, [])

    const handleEntryDelete = useCallback(async (entry: FileSystemClipboardItem) => {
        setDeleteTarget(entry)
    }, [])

    const handleProjectRename = useCallback(async (project: Project) => {
        await handleEntryRename({
            path: project.path,
            name: project.name,
            type: 'directory'
        })
    }, [handleEntryRename])

    const handleProjectDelete = useCallback(async (project: Project) => {
        await handleEntryDelete({
            path: project.path,
            name: project.name,
            type: 'directory'
        })
    }, [handleEntryDelete])

    const handleEntryPaste = useCallback(async (entry: FileSystemClipboardItem) => {
        if (!fileClipboardItem) return

        const destinationDirectory = entry.type === 'directory'
            ? entry.path
            : getParentFolderPath(entry.path)

        if (!destinationDirectory) {
            setError('Unable to resolve destination folder for paste.')
            return
        }

        const result = await window.devscope.pasteFileSystemItem(fileClipboardItem.path, destinationDirectory)
        if (!result.success) {
            setError(result.error || `Failed to paste "${fileClipboardItem.name}"`)
            return
        }

        showToast(`Pasted ${fileClipboardItem.name}`)
        await loadContents(true)
    }, [fileClipboardItem, loadContents, setError, showToast])

    const resolveEntryDestinationDirectory = useCallback((entry: FileSystemClipboardItem): string | null => {
        if (entry.type === 'directory') return entry.path
        return getParentFolderPath(entry.path)
    }, [])

    const openCreatePrompt = useCallback((destinationDirectory: string, type: 'file' | 'directory', presetExtension?: string) => {
        setCreateTarget({ destinationDirectory, type, presetExtension })
        setCreateDraft('')
        setCreateErrorMessage(null)
        setError(null)
    }, [setError])

    const handleCreateInCurrentFolder = useCallback((type: 'file' | 'directory', presetExtension?: string) => {
        if (!decodedPath) return
        openCreatePrompt(decodedPath, type, presetExtension)
    }, [decodedPath, openCreatePrompt])

    const openCloneRepoModal = useCallback(() => {
        if (!decodedPath) return
        setCloneRepoModalOpen(true)
        setCloneRepoUrl('')
        setCloneRepoErrorMessage(null)
        setError(null)
    }, [decodedPath, setError])

    const submitCloneRepo = useCallback(async () => {
        const repoUrl = cloneRepoUrl.trim()
        if (!repoUrl) {
            setCloneRepoErrorMessage('Repository URL is required.')
            return
        }
        if (!decodedPath) {
            setCloneRepoErrorMessage('Destination folder is missing.')
            return
        }

        const cloneId = `folder-clone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        setCloneRepoModalOpen(false)
        setCloneRepoUrl('')
        setCloneRepoErrorMessage(null)

        try {
            const result = await window.devscope.cloneGitRepository({
                cloneId,
                repoUrl,
                destinationDirectory: decodedPath
            })
            if (!result.success) {
                setError(result.error || 'Failed to clone repository.')
                return
            }

            await loadContents(true)
        } catch (err: any) {
            setError(err?.message || 'Failed to clone repository.')
        }
    }, [cloneRepoUrl, decodedPath, loadContents, setError])

    const handleEntryCreateFile = useCallback((entry: FileSystemClipboardItem) => {
        const destinationDirectory = resolveEntryDestinationDirectory(entry)
        if (!destinationDirectory) {
            setError('Unable to resolve destination folder.')
            return
        }
        openCreatePrompt(destinationDirectory, 'file')
    }, [openCreatePrompt, resolveEntryDestinationDirectory, setError])

    const handleEntryCreateFolder = useCallback((entry: FileSystemClipboardItem) => {
        const destinationDirectory = resolveEntryDestinationDirectory(entry)
        if (!destinationDirectory) {
            setError('Unable to resolve destination folder.')
            return
        }
        openCreatePrompt(destinationDirectory, 'directory')
    }, [openCreatePrompt, resolveEntryDestinationDirectory, setError])

    const submitCreateTarget = useCallback(async (nextName?: string) => {
        if (!createTarget) return

        const normalizedName = String(nextName ?? createDraft).trim()
        const validationError = validateCreateName(normalizedName)
        if (validationError) {
            setCreateErrorMessage(validationError)
            return
        }

        const result = await window.devscope.createFileSystemItem(
            createTarget.destinationDirectory,
            normalizedName,
            createTarget.type
        )
        if (!result.success) {
            setCreateErrorMessage(result.error || `Failed to create ${createTarget.type}.`)
            return
        }

        const createdPath = result.path
        const createdName = result.name
        const createdType = result.type

        setCreateTarget(null)
        setCreateDraft('')
        setCreateErrorMessage(null)

        showToast(`Created ${createdType === 'file' ? 'file' : 'folder'}: ${createdName}`)
        await loadContents(true)

        if (createdType === 'file') {
            const ext = getFileExtensionFromName(createdName) || 'txt'
            await openPreview(
                { name: createdName, path: createdPath },
                ext,
                { startInEditMode: true }
            )
        }
    }, [createDraft, createTarget, loadContents, openPreview, showToast])

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

        const result = await window.devscope.renameFileSystemItem(renameTarget.path, normalizedNextName)
        if (!result.success) {
            setRenameErrorMessage(result.error || `Failed to rename "${renameTarget.name}"`)
            return
        }

        setRenameTarget(null)
        setRenameDraft('')
        setRenameExtensionSuffix('')
        setRenameErrorMessage(null)
        showToast(`Renamed to ${normalizedNextName}`)
        await loadContents(true)
    }, [loadContents, renameDraft, renameExtensionSuffix, renameTarget, showToast])

    const confirmDeleteTarget = useCallback(async () => {
        if (!deleteTarget) return

        const result = await window.devscope.deleteFileSystemItem(deleteTarget.path)
        if (!result.success) {
            setError(result.error || `Failed to delete "${deleteTarget.name}"`)
            return
        }

        if (fileClipboardItem?.path === deleteTarget.path) {
            setFileClipboardItem(null)
        }

        setDeleteTarget(null)
        showToast(`Deleted ${deleteTarget.name}`)
        await loadContents(true)
    }, [deleteTarget, fileClipboardItem?.path, loadContents, setError, showToast])

    const handleSelectExplorerHome = useCallback(async () => {
        try {
            const result = await window.devscope.selectFolder()
            if (!result.success || !result.folderPath) return

            updateSettings({
                explorerHomePath: result.folderPath,
                explorerTabEnabled: true
            })
            navigate(buildBrowseRoute('explorer', result.folderPath), { replace: true })
        } catch (err: any) {
            setError(err?.message || 'Failed to choose an Explorer home folder.')
        }
    }, [navigate, setError, updateSettings])

    return {
        copiedPath,
        cloneRepoErrorMessage,
        cloneRepoModalOpen,
        cloneRepoUrl,
        createDraft,
        createErrorMessage,
        createTarget,
        deleteTarget,
        fileClipboardItem,
        handleBack,
        handleCopyPath,
        handleCreateInCurrentFolder,
        openCloneRepoModal,
        handleEntryCopy,
        handleEntryCopyPath,
        handleEntryCreateFile,
        handleEntryCreateFolder,
        handleEntryDelete,
        handleEntryOpen,
        handleEntryOpenInExplorer,
        handleEntryOpenWith,
        handleEntryPaste,
        handleEntryRename,
        handleFolderClick,
        handleNavigateUp,
        handleProjectClick,
        handleProjectDelete,
        handleProjectRename,
        handleSelectExplorerHome,
        handleViewAsProject,
        renameDraft,
        renameErrorMessage,
        renameExtensionSuffix,
        renameTarget,
        setCreateDraft,
        setCreateErrorMessage,
        setCreateTarget,
        setCloneRepoErrorMessage,
        setCloneRepoModalOpen,
        setCloneRepoUrl,
        setDeleteTarget,
        setRenameDraft,
        setRenameErrorMessage,
        setRenameExtensionSuffix,
        setRenameTarget,
        submitCreateTarget,
        submitCloneRepo,
        submitRenameTarget,
        confirmDeleteTarget,
        toast
    }
}

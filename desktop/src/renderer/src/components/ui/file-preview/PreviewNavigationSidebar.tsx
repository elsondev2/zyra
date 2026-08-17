import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    AlertCircle,
    AppWindow,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    Copy,
    ExternalLink,
    File,
    Folder,
    FolderOpen,
    MoveHorizontal,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    WrapText
} from 'lucide-react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { PromptModal } from '@/components/ui/PromptModal'
import { getParentFolderPath, validateCreateName } from '@/lib/filesystem/fileSystemPaths'
import { useSettings } from '@/lib/settings'
import { cn, getFileExtension } from '@/lib/utils'
import type { PreviewFile, PreviewOpenOptions } from './types'
import { resolvePreviewType } from './utils'
import { PreviewVirtualFileTree } from './PreviewVirtualFileTree'
import { usePreviewFolderTree } from './usePreviewFolderTree'
import { getPathName, normalizePathKey } from './previewNavigationSidebar.tree'

function ExplorerCreateIcon({ kind }: { kind: 'file' | 'directory' }) {
    const EntryIcon = kind === 'directory' ? Folder : File
    return (
        <span className="relative inline-flex size-4 items-center justify-center" aria-hidden="true">
            <EntryIcon className="size-3.5" strokeWidth={1.8} />
            <Plus className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-sm bg-sparkle-card" strokeWidth={3} />
        </span>
    )
}

type TreePromptState =
    | {
        type: 'create-file' | 'create-folder'
        destinationDirectory: string
        value: string
        error: string | null
    }
    | {
        type: 'rename'
        target: DevScopeFileTreeNode
        value: string
        error: string | null
    }
    | null

type PreviewNavigationSidebarProps = {
    file: PreviewFile
    projectPath?: string
    onOpenLinkedPreview?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenLinkedPreviewInNewTab?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    refreshToken?: number
    preserveContextRequest?: { path: string; nonce: number } | null
    revealTargetRequestId?: string | null
    onRevealTargetHandled?: (requestId: string) => void
}

export function PreviewNavigationSidebar({
    file,
    projectPath,
    onOpenLinkedPreview,
    onOpenLinkedPreviewInNewTab,
    refreshToken = 0,
    preserveContextRequest = null,
    revealTargetRequestId = null,
    onRevealTargetHandled
}: PreviewNavigationSidebarProps) {
    const { settings, updateSettings } = useSettings()
    const iconTheme = settings.appearanceResolvedMode
    const nameLayout = settings.filePreviewExplorerNameLayout
    const [explorerOpen, setExplorerOpen] = useState(true)
    const [collapseAllRequest, setCollapseAllRequest] = useState(0)
    const [toastMessage, setToastMessage] = useState<string | null>(null)
    const [treePrompt, setTreePrompt] = useState<TreePromptState>(null)
    const [deleteTarget, setDeleteTarget] = useState<DevScopeFileTreeNode | null>(null)
    const toastTimerRef = useRef<number | null>(null)
    const {
        treeRootPath,
        tree,
        loading: folderLoading,
        error: folderError,
        expandedPaths,
        ensureDirectoryLoaded,
        reload,
        preserveContextForFile,
        navigateToFolder
    } = usePreviewFolderTree({
        filePath: file.path,
        projectPath,
        directoryTarget: file.type === 'directory',
        refreshToken
    })

    useEffect(() => {
        const nextPath = String(preserveContextRequest?.path || '').trim()
        if (!nextPath) return
        preserveContextForFile(nextPath)
    }, [preserveContextForFile, preserveContextRequest?.nonce, preserveContextRequest?.path])

    useEffect(() => {
        return () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current)
            }
        }
    }, [])

    const activeFileKey = useMemo(() => normalizePathKey(file.path), [file.path])
    const explorerRootName = useMemo(
        () => getPathName(treeRootPath) || getPathName(projectPath || '') || 'Workspace',
        [projectPath, treeRootPath]
    )

    const handleFolderFileOpen = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'file' || !onOpenLinkedPreview) return
        preserveContextForFile(node.path)
        await onOpenLinkedPreview({ name: node.name, path: node.path }, getFileExtension(node.name))
    }, [onOpenLinkedPreview, preserveContextForFile])

    const showToast = useCallback((message: string) => {
        setToastMessage(message)
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current)
        }
        toastTimerRef.current = window.setTimeout(() => {
            setToastMessage(null)
            toastTimerRef.current = null
        }, 2200)
    }, [])

    const copyNodePath = useCallback(async (node: DevScopeFileTreeNode) => {
        try {
            if (window.devscope.copyToClipboard) {
                const result = await window.devscope.copyToClipboard(node.path)
                if (!result.success) {
                    showToast(result.error || 'Failed to copy path')
                    return
                }
            } else {
                await navigator.clipboard.writeText(node.path)
            }
            showToast(`Copied path: ${node.name}`)
        } catch (error: any) {
            showToast(error?.message || 'Failed to copy path')
        }
    }, [showToast])

    const openNativeFile = useCallback(async (node: DevScopeFileTreeNode) => {
        const result = await window.devscope.openFile(node.path)
        if (!result.success) {
            showToast(result.error || `Failed to open "${node.name}"`)
        }
    }, [showToast])

    const openNodeWith = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'file') return
        const result = await window.devscope.openWith(node.path)
        if (!result.success) {
            showToast(result.error || `Failed to open "${node.name}" with...`)
        }
    }, [showToast])

    const revealNode = useCallback(async (node: DevScopeFileTreeNode) => {
        const result = await window.devscope.openInExplorer(node.path)
        if (!result.success) {
            showToast(result.error || `Failed to reveal "${node.name}"`)
        }
    }, [showToast])

    const startCreate = useCallback((type: 'file' | 'directory', destinationDirectory: string) => {
        setTreePrompt({
            type: type === 'file' ? 'create-file' : 'create-folder',
            destinationDirectory,
            value: '',
            error: null
        })
    }, [])

    const startRename = useCallback((target: DevScopeFileTreeNode) => {
        setTreePrompt({
            type: 'rename',
            target,
            value: target.name,
            error: null
        })
    }, [])

    const updatePromptValue = useCallback((value: string) => {
        setTreePrompt((currentPrompt) => currentPrompt ? { ...currentPrompt, value, error: null } : currentPrompt)
    }, [])

    const submitTreePrompt = useCallback(async () => {
        if (!treePrompt) return

        const nextName = treePrompt.value.trim()
        const validationError = validateCreateName(nextName)
        if (validationError) {
            setTreePrompt({ ...treePrompt, error: validationError })
            return
        }

        if (treePrompt.type === 'rename') {
            if (nextName === treePrompt.target.name) {
                setTreePrompt(null)
                return
            }

            const result = await window.devscope.renameFileSystemItem(treePrompt.target.path, nextName)
            if (!result.success) {
                setTreePrompt({ ...treePrompt, error: result.error || `Failed to rename "${treePrompt.target.name}"` })
                return
            }

            setTreePrompt(null)
            showToast(`Renamed to ${result.name || nextName}`)
            await reload()

            if (normalizePathKey(treePrompt.target.path) === activeFileKey && treePrompt.target.type === 'file' && result.path && onOpenLinkedPreview) {
                preserveContextForFile(result.path)
                await onOpenLinkedPreview(
                    { name: result.name || nextName, path: result.path },
                    getFileExtension(result.name || nextName)
                )
            }
            return
        }

        const createType = treePrompt.type === 'create-folder' ? 'directory' : 'file'
        const result = await window.devscope.createFileSystemItem(treePrompt.destinationDirectory, nextName, createType)
        if (!result.success) {
            setTreePrompt({ ...treePrompt, error: result.error || `Failed to create ${createType}.` })
            return
        }

        setTreePrompt(null)
        showToast(`Created ${createType === 'file' ? 'file' : 'folder'}: ${result.name || nextName}`)
        await reload()

        if (result.type === 'directory') {
            navigateToFolder(result.path)
            return
        }

        if (result.path && result.name && onOpenLinkedPreview) {
            preserveContextForFile(result.path)
            await onOpenLinkedPreview(
                { name: result.name, path: result.path },
                getFileExtension(result.name) || 'txt',
                { startInEditMode: true }
            )
        }
    }, [activeFileKey, navigateToFolder, onOpenLinkedPreview, preserveContextForFile, reload, showToast, treePrompt])

    const confirmDeleteTarget = useCallback(async () => {
        if (!deleteTarget) return

        const targetName = deleteTarget.name
        const result = await window.devscope.deleteFileSystemItem(deleteTarget.path)
        if (!result.success) {
            showToast(result.error || `Failed to delete "${targetName}"`)
            return
        }

        setDeleteTarget(null)
        showToast(`Deleted ${targetName}`)
        await reload()
    }, [deleteTarget, reload, showToast])

    const getNodeDestinationDirectory = useCallback((node: DevScopeFileTreeNode): string | null => {
        if (node.type === 'directory') return node.path
        return getParentFolderPath(node.path)
    }, [])

    const buildNodeActions = useCallback((node: DevScopeFileTreeNode): FileActionsMenuItem[] => {
        const isDirectory = node.type === 'directory'
        const extension = getFileExtension(node.name)
        const previewTarget = !isDirectory ? resolvePreviewType(node.name, extension) : null
        const destinationDirectory = getNodeDestinationDirectory(node)

        const items: Array<FileActionsMenuItem | null> = [
            !isDirectory && previewTarget ? {
                id: 'preview',
                label: 'Preview',
                icon: <FolderOpen className="size-3.5" />,
                onSelect: () => { void handleFolderFileOpen(node) }
            } : null,
            !isDirectory && previewTarget && onOpenLinkedPreviewInNewTab ? {
                id: 'new-tab',
                label: 'Open in new tab',
                icon: <ExternalLink className="size-3.5" />,
                onSelect: () => {
                    preserveContextForFile(node.path)
                    void onOpenLinkedPreviewInNewTab({ name: node.name, path: node.path }, extension)
                }
            } : null,
            isDirectory ? {
                id: 'browse',
                label: 'Browse folder',
                icon: <FolderOpen className="size-3.5" />,
                onSelect: () => navigateToFolder(node.path)
            } : null,
            {
                id: 'open',
                label: isDirectory ? 'Open folder' : 'Open file',
                icon: <ExternalLink className="size-3.5" />,
                onSelect: () => { void openNativeFile(node) }
            },
            !isDirectory ? {
                id: 'open-with',
                label: 'Open with...',
                icon: <AppWindow className="size-3.5" />,
                onSelect: () => { void openNodeWith(node) }
            } : null,
            {
                id: 'reveal',
                label: 'Reveal in Explorer',
                icon: <FolderOpen className="size-3.5" />,
                onSelect: () => { void revealNode(node) }
            },
            {
                id: 'copy-path',
                label: 'Copy path',
                icon: <Copy className="size-3.5" />,
                onSelect: () => { void copyNodePath(node) }
            },
            destinationDirectory ? {
                id: 'new-file',
                label: isDirectory ? 'New file here' : 'New sibling file',
                icon: <ExplorerCreateIcon kind="file" />,
                onSelect: () => startCreate('file', destinationDirectory)
            } : null,
            destinationDirectory ? {
                id: 'new-folder',
                label: isDirectory ? 'New folder here' : 'New sibling folder',
                icon: <ExplorerCreateIcon kind="directory" />,
                onSelect: () => startCreate('directory', destinationDirectory)
            } : null,
            {
                id: 'rename',
                label: 'Rename',
                icon: <Pencil className="size-3.5" />,
                onSelect: () => startRename(node)
            },
            {
                id: 'delete',
                label: 'Delete',
                icon: <Trash2 className="size-3.5" />,
                danger: true,
                onSelect: () => setDeleteTarget(node)
            }
        ]

        return items.filter(Boolean) as FileActionsMenuItem[]
    }, [
        copyNodePath,
        getNodeDestinationDirectory,
        handleFolderFileOpen,
        navigateToFolder,
        onOpenLinkedPreviewInNewTab,
        openNativeFile,
        openNodeWith,
        preserveContextForFile,
        revealNode,
        startCreate,
        startRename
    ])

    const promptTitle = treePrompt?.type === 'rename'
        ? `Rename ${treePrompt.target.type === 'directory' ? 'folder' : 'file'}`
        : treePrompt?.type === 'create-folder'
            ? 'New folder'
            : 'New file'
    const promptMessage = !treePrompt
        ? undefined
        : treePrompt.type === 'rename'
            ? treePrompt.target.path
            : treePrompt.destinationDirectory
    const promptConfirmLabel = treePrompt?.type === 'rename' ? 'Rename' : 'Create'
    const promptPlaceholder = treePrompt?.type === 'create-folder' ? 'Folder name' : 'File name'

    return (
        <>
        <div className="flex min-h-0 flex-1 flex-col bg-sparkle-card">
            <div className="group/explorer flex h-8 min-h-8 items-center border-b border-white/[0.05] px-1.5">
                <button
                    type="button"
                    onClick={() => setExplorerOpen((open) => !open)}
                    className="flex min-w-0 flex-1 items-center gap-1 px-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-sparkle-text"
                    title={treeRootPath}
                    aria-expanded={explorerOpen}
                >
                    {explorerOpen ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                    <span className="truncate">{explorerRootName}</span>
                </button>
                <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/explorer:opacity-100 group-focus-within/explorer:opacity-100">
                    <button
                        type="button"
                        disabled={!treeRootPath}
                        onClick={(event) => {
                            event.stopPropagation()
                            startCreate('file', treeRootPath)
                        }}
                        className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-30"
                        title="New File"
                        aria-label="New File"
                    >
                        <ExplorerCreateIcon kind="file" />
                    </button>
                    <button
                        type="button"
                        disabled={!treeRootPath}
                        onClick={(event) => {
                            event.stopPropagation()
                            startCreate('directory', treeRootPath)
                        }}
                        className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-30"
                        title="New Folder"
                        aria-label="New Folder"
                    >
                        <ExplorerCreateIcon kind="directory" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            void reload()
                        }}
                        className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text"
                        title="Refresh Explorer"
                        aria-label="Refresh Explorer"
                    >
                        <RefreshCw className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            setCollapseAllRequest((request) => request + 1)
                        }}
                        className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text"
                        title="Collapse Folders in Explorer"
                        aria-label="Collapse Folders in Explorer"
                    >
                        <ChevronsDownUp className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            updateSettings({
                                filePreviewExplorerNameLayout: nameLayout === 'wrap' ? 'horizontal' : 'wrap'
                            })
                        }}
                        className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text"
                        title={nameLayout === 'wrap' ? 'Use horizontal scrolling for long names' : 'Wrap long names'}
                        aria-label={nameLayout === 'wrap' ? 'Use horizontal scrolling for long names' : 'Wrap long names'}
                        aria-pressed={nameLayout === 'wrap'}
                    >
                        {nameLayout === 'wrap' ? <WrapText className="size-3.5" /> : <MoveHorizontal className="size-3.5" />}
                    </button>
                </div>
            </div>

            <div className={cn('flex min-h-0 flex-1 overflow-hidden px-1 pb-1', !explorerOpen && 'hidden')}>
                        {folderError ? (
                            <div className="m-1 h-fit flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-[11px] text-red-200">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="size-3.5 shrink-0" />
                                    <span className="truncate">{folderError}</span>
                                </div>
                            </div>
                        ) : folderLoading && tree.length === 0 ? (
                            <div className="m-1 h-fit flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-4 text-[11px] text-sparkle-text-secondary">
                                Loading project tree...
                            </div>
                        ) : tree.length > 0 ? (
                            <PreviewVirtualFileTree
                                nodes={tree}
                                rootPath={treeRootPath}
                                selectedPath={file.path}
                                selectedPathKind={file.type === 'directory' ? 'directory' : 'file'}
                                expandedPathKeys={expandedPaths}
                                collapseAllRequest={collapseAllRequest}
                                nameLayout={nameLayout}
                                theme={iconTheme}
                                revealTargetRequestId={revealTargetRequestId}
                                onRevealTargetHandled={onRevealTargetHandled}
                                onOpenFile={(node) => { void handleFolderFileOpen(node) }}
                                onExpandDirectory={ensureDirectoryLoaded}
                                getNodeActions={buildNodeActions}
                            />
                        ) : (
                            <div className="m-1 h-fit flex-1 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.03] px-3 py-4 text-[11px] text-sparkle-text-secondary">
                                No project files found.
                            </div>
                        )}
                    </div>
                    {toastMessage ? (
                        <div className="border-t border-white/[0.05] bg-white/[0.03] px-3 py-1.5 text-[11px] text-sparkle-text-secondary">
                            {toastMessage}
                        </div>
                    ) : null}
        </div>
        <PromptModal
            isOpen={Boolean(treePrompt)}
            title={promptTitle}
            message={promptMessage}
            value={treePrompt?.value || ''}
            onChange={updatePromptValue}
            onConfirm={() => { void submitTreePrompt() }}
            onCancel={() => setTreePrompt(null)}
            confirmLabel={promptConfirmLabel}
            placeholder={promptPlaceholder}
            errorMessage={treePrompt?.error || null}
        />
        <ConfirmModal
            isOpen={Boolean(deleteTarget)}
            title={`Delete ${deleteTarget?.type === 'directory' ? 'folder' : 'file'}`}
            message={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ''}
            confirmLabel="Delete"
            onConfirm={() => { void confirmDeleteTarget() }}
            onCancel={() => setDeleteTarget(null)}
            variant="danger"
        />
        </>
    )
}

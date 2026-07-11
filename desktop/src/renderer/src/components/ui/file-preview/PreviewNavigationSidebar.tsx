import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    AlertCircle,
    AppWindow,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Copy,
    ExternalLink,
    FilePlus,
    FolderPlus,
    FolderOpen,
    ListTree,
    Pencil,
    RefreshCw,
    Trash2,
    PanelLeft
} from 'lucide-react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { FileActionsMenu, type FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { PromptModal } from '@/components/ui/PromptModal'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { getParentFolderPath, validateCreateName } from '@/lib/filesystem/fileSystemPaths'
import { useSettings } from '@/lib/settings'
import { cn, getFileExtension } from '@/lib/utils'
import type { OutlineItem, OutlineItemKind } from './modalShared'
import type { PreviewFile, PreviewOpenOptions } from './types'
import { resolvePreviewType } from './utils'
import { usePreviewFolderTree } from './usePreviewFolderTree'
import {
    collectDefaultExpandedOutlineIds,
    DraggablePreviewFileRow,
    flattenFolderNodes,
    flattenOutlineItems,
    getPathName,
    normalizePathKey,
    type VisibleFolderNode,
    type VisibleOutlineItem
} from './previewNavigationSidebar.tree'

type SidebarTab = 'outline' | 'folder'
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
    outlineItems: OutlineItem[]
    onOutlineSelect: (item: OutlineItem) => void
    onMinimizePanel?: () => void
    onOpenLinkedPreview?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenLinkedPreviewInNewTab?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    refreshToken?: number
    preserveContextRequest?: { path: string; nonce: number } | null
}

const KIND_STYLES: Record<OutlineItemKind, { dot: string; glow: string }> = {
    heading: { dot: 'bg-violet-400', glow: 'shadow-[0_0_0_1px_rgba(167,139,250,0.2)]' },
    class: { dot: 'bg-sky-400', glow: 'shadow-[0_0_0_1px_rgba(56,189,248,0.2)]' },
    function: { dot: 'bg-emerald-400', glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.2)]' }
}

export function PreviewNavigationSidebar({
    file,
    projectPath,
    outlineItems,
    onOutlineSelect,
    onMinimizePanel,
    onOpenLinkedPreview,
    onOpenLinkedPreviewInNewTab,
    refreshToken = 0,
    preserveContextRequest = null
}: PreviewNavigationSidebarProps) {
    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const [activeTab, setActiveTab] = useState<SidebarTab>('folder')
    const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(() => new Set())
    const [copiedPath, setCopiedPath] = useState(false)
    const [toastMessage, setToastMessage] = useState<string | null>(null)
    const [treePrompt, setTreePrompt] = useState<TreePromptState>(null)
    const [deleteTarget, setDeleteTarget] = useState<DevScopeFileTreeNode | null>(null)
    const [fileHistory, setFileHistory] = useState<string[]>(() => file.path ? [file.path] : [])
    const [fileHistoryIndex, setFileHistoryIndex] = useState(file.path ? 0 : -1)
    const toastTimerRef = useRef<number | null>(null)
    const pendingHistoryTargetRef = useRef<{ pathKey: string; index: number } | null>(null)
    const {
        activeFolderPath,
        tree,
        loading: folderLoading,
        error: folderError,
        expandedPaths,
        toggleDirectory,
        reload,
        preserveContextForFile,
        canNavigateUpFolder,
        navigateUpFolder,
        navigateToFolder
    } = usePreviewFolderTree({
        filePath: file.path,
        projectPath,
        refreshToken
    })

    useEffect(() => {
        setExpandedOutlineIds(new Set(collectDefaultExpandedOutlineIds(outlineItems)))
    }, [file.path, outlineItems])

    useEffect(() => {
        const nextPath = String(file.path || '').trim()
        const nextPathKey = normalizePathKey(nextPath)
        if (!nextPathKey) return

        const pendingTarget = pendingHistoryTargetRef.current
        if (pendingTarget?.pathKey === nextPathKey) {
            pendingHistoryTargetRef.current = null
            setFileHistoryIndex(pendingTarget.index)
            return
        }

        setFileHistory((currentHistory) => {
            if (currentHistory.length === 0) {
                setFileHistoryIndex(0)
                return [nextPath]
            }

            const currentEntry = currentHistory[fileHistoryIndex]
            if (normalizePathKey(currentEntry || '') === nextPathKey) {
                return currentHistory
            }

            const trimmedHistory = currentHistory.slice(0, Math.max(0, fileHistoryIndex) + 1)
            if (normalizePathKey(trimmedHistory[trimmedHistory.length - 1] || '') === nextPathKey) {
                setFileHistoryIndex(trimmedHistory.length - 1)
                return trimmedHistory
            }

            const nextHistory = [...trimmedHistory, nextPath]
            setFileHistoryIndex(nextHistory.length - 1)
            return nextHistory
        })
    }, [file.path, fileHistoryIndex])

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

    const visibleOutlineItems = useMemo(
        () => flattenOutlineItems(outlineItems, expandedOutlineIds),
        [expandedOutlineIds, outlineItems]
    )
    const visibleFolderNodes = useMemo(
        () => flattenFolderNodes(tree, expandedPaths),
        [expandedPaths, tree]
    )
    const activeFileKey = useMemo(() => normalizePathKey(file.path), [file.path])
    const activeFolderName = useMemo(() => (
        activeFolderPath ? getPathName(activeFolderPath) || activeFolderPath : 'No folder context'
    ), [activeFolderPath])

    const handleOutlineToggle = useCallback((item: OutlineItem) => {
        if (item.children.length === 0) return
        setExpandedOutlineIds((currentExpandedIds) => {
            const nextExpandedIds = new Set(currentExpandedIds)
            if (nextExpandedIds.has(item.id)) nextExpandedIds.delete(item.id)
            else nextExpandedIds.add(item.id)
            return nextExpandedIds
        })
    }, [])

    const handleFolderFileOpen = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'file' || !onOpenLinkedPreview) return
        preserveContextForFile(node.path)
        await onOpenLinkedPreview({ name: node.name, path: node.path }, getFileExtension(node.name))
    }, [onOpenLinkedPreview, preserveContextForFile])

    const openHistoryFile = useCallback(async (targetIndex: number) => {
        if (!onOpenLinkedPreview) return

        const targetPath = fileHistory[targetIndex]
        if (!targetPath) return

        pendingHistoryTargetRef.current = {
            pathKey: normalizePathKey(targetPath),
            index: targetIndex
        }
        preserveContextForFile(targetPath)
        const targetName = getPathName(targetPath)
        try {
            await onOpenLinkedPreview({ name: targetName, path: targetPath }, getFileExtension(targetName))
        } catch (error) {
            pendingHistoryTargetRef.current = null
            throw error
        }
    }, [fileHistory, onOpenLinkedPreview, preserveContextForFile])

    const canGoToPreviousFile = fileHistoryIndex > 0
    const canGoToNextFile = fileHistoryIndex >= 0 && fileHistoryIndex < fileHistory.length - 1

    const handleCopyFolderPath = useCallback(async () => {
        if (!activeFolderPath) return
        if (window.devscope.copyToClipboard) {
            const result = await window.devscope.copyToClipboard(activeFolderPath)
            if (!result.success) {
                setToastMessage(result.error || 'Failed to copy path')
                return
            }
        } else {
            await navigator.clipboard.writeText(activeFolderPath)
        }
        setCopiedPath(true)
        setToastMessage('Copied full path')
        window.setTimeout(() => setCopiedPath(false), 1200)
        window.setTimeout(() => setToastMessage(null), 2200)
    }, [activeFolderPath])

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
                icon: <FilePlus className="size-3.5" />,
                onSelect: () => startCreate('file', destinationDirectory)
            } : null,
            destinationDirectory ? {
                id: 'new-folder',
                label: isDirectory ? 'New folder here' : 'New sibling folder',
                icon: <FolderPlus className="size-3.5" />,
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
            <div className="border-b border-white/[0.06] bg-white/[0.02]">
                <div className="relative grid h-9 min-h-9 grid-cols-2">
                    <div
                        className={cn(
                            'pointer-events-none absolute inset-y-0 w-1/2 bg-white/[0.045] transition-transform duration-200 ease-out',
                            activeTab === 'folder' ? 'translate-x-0' : 'translate-x-full'
                        )}
                    />
                    <div className="pointer-events-none absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 bg-white/[0.08]" />
                    <div
                        className={cn(
                            'relative z-[1] flex min-w-0 items-stretch border-b transition-colors duration-200',
                            activeTab === 'folder' ? 'border-white/55 text-sparkle-text' : 'border-transparent text-sparkle-text-muted hover:text-sparkle-text-secondary'
                        )}
                    >
                        <button
                            type="button"
                            onClick={onMinimizePanel}
                            className="inline-flex h-full shrink-0 items-center justify-center pl-1.5 pr-2 text-inherit opacity-70 transition-[opacity,color,background-color] duration-200 hover:bg-white/[0.04] hover:opacity-100 hover:text-sparkle-text"
                            title="Minimize left panel"
                        >
                            <PanelLeft className="size-3.5" />
                        </button>
                        <div className="my-2 w-px shrink-0 bg-white/[0.08]" />
                        <button
                            type="button"
                            onClick={() => setActiveTab('folder')}
                            className={cn(
                                'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[11px] font-medium transition-[opacity,color,background-color] duration-200',
                                activeTab === 'folder' ? 'text-sparkle-text opacity-100' : 'text-sparkle-text-muted opacity-70 hover:bg-white/[0.04] hover:text-sparkle-text-secondary hover:opacity-100'
                            )}
                        >
                            <FolderOpen className="size-3.5" />
                            <span>Folder</span>
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setActiveTab('outline')}
                        className={cn(
                            'relative z-[1] inline-flex min-w-0 items-center justify-center gap-1.5 border-b px-2 text-[11px] font-medium transition-[opacity,color,background-color,border-color] duration-200',
                            activeTab === 'outline'
                                ? 'border-white/55 text-sparkle-text opacity-100'
                                : 'border-transparent text-sparkle-text-muted opacity-70 hover:bg-white/[0.04] hover:text-sparkle-text-secondary hover:opacity-100'
                        )}
                    >
                        <ListTree className="size-3.5" />
                        <span>File map</span>
                    </button>
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div
                    className={cn(
                        'absolute inset-0 flex min-h-0 flex-col transition-[opacity,transform] duration-180 ease-out',
                        activeTab === 'outline'
                            ? 'translate-x-0 opacity-100'
                            : '-translate-x-2 pointer-events-none opacity-0'
                    )}
                >
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
                        {visibleOutlineItems.length > 0 ? (
                            <div className="space-y-0.5">
                                {visibleOutlineItems.map(({ item, depth }) => {
                                    const isExpanded = expandedOutlineIds.has(item.id)
                                    const canExpand = item.children.length > 0
                                    const kindStyle = KIND_STYLES[item.kind]

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => onOutlineSelect(item)}
                                            className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-[11px] transition-colors hover:border-white/[0.08] hover:bg-white/[0.05]"
                                            style={{ paddingLeft: `${8 + depth * 16}px` }}
                                            title={`${item.label} (line ${item.line})`}
                                        >
                                            <span
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    handleOutlineToggle(item)
                                                }}
                                                className={cn(
                                                    'inline-flex size-4 shrink-0 items-center justify-center rounded text-sparkle-text-muted',
                                                    canExpand ? 'hover:bg-white/[0.06] hover:text-sparkle-text-secondary' : 'pointer-events-none opacity-0'
                                                )}
                                            >
                                                {canExpand ? (
                                                    isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
                                                ) : (
                                                    <ChevronRight className="size-3.5" />
                                                )}
                                            </span>
                                            <span className={cn('size-2.5 shrink-0 rounded-full', kindStyle.dot, kindStyle.glow)} />
                                            <span className="min-w-0 flex-1 truncate text-sparkle-text">{item.label}</span>
                                            <span className="shrink-0 text-[10px] text-sparkle-text-muted">:{item.line}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.03] px-3 py-4 text-[11px] text-sparkle-text-secondary">
                                No structure.
                            </div>
                        )}
                    </div>
                </div>

                <div
                    className={cn(
                        'absolute inset-0 flex min-h-0 flex-col transition-[opacity,transform] duration-180 ease-out',
                        activeTab === 'folder'
                            ? 'translate-x-0 opacity-100'
                            : 'translate-x-2 pointer-events-none opacity-0'
                    )}
                >
                    <div className="border-b border-white/[0.05] px-2 py-1.5">
                        <div
                            className="group flex min-w-0 items-center gap-1.5"
                            onDoubleClick={() => { void reload() }}
                            title={activeFolderPath ? `${activeFolderPath}\nDouble-click to refresh` : 'No folder context'}
                        >
                            <div
                                className="min-w-0 flex-1 truncate rounded-md bg-white/[0.025] px-1.5 py-1 text-[11px] font-medium text-sparkle-text-secondary"
                            >
                                {activeFolderName}
                            </div>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    void reload()
                                }}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.06] hover:text-sparkle-text"
                                title="Refresh folder"
                            >
                                <RefreshCw className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                disabled={!activeFolderPath}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    startCreate('file', activeFolderPath)
                                }}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.06] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                                title="New file here"
                            >
                                <FilePlus className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                disabled={!activeFolderPath}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    startCreate('directory', activeFolderPath)
                                }}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.06] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                                title="New folder here"
                            >
                                <FolderPlus className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    void handleCopyFolderPath()
                                }}
                                className={cn(
                                    'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.06] hover:text-sparkle-text',
                                    copiedPath && 'opacity-100 text-emerald-300'
                                )}
                                title={copiedPath ? 'Copied' : 'Copy path'}
                            >
                                {copiedPath ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                            </button>
                        </div>
                    </div>

                    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
                        {folderError ? (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-[11px] text-red-200">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="size-3.5 shrink-0" />
                                    <span className="truncate">{folderError}</span>
                                </div>
                            </div>
                        ) : folderLoading && visibleFolderNodes.length === 0 ? (
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-4 text-[11px] text-sparkle-text-secondary">
                                Loading current folder...
                            </div>
                        ) : visibleFolderNodes.length > 0 ? (
                            <div className="space-y-px">
                                {visibleFolderNodes.map(({ node, depth, expanded }) => {
                                    const isDirectory = node.type === 'directory'
                                    const nodeKey = normalizePathKey(node.path)
                                    const isActiveFile = !isDirectory && nodeKey === activeFileKey
                                    const extension = getFileExtension(node.name)
                                    const previewTarget = !isDirectory ? resolvePreviewType(node.name, extension) : null
                                    const isPreviewable = Boolean(previewTarget)

                                    if (!isDirectory) {
                                        return (
                                            <DraggablePreviewFileRow
                                                key={node.path}
                                                node={node}
                                                depth={depth}
                                                isActiveFile={isActiveFile}
                                                isPreviewable={isPreviewable}
                                                iconTheme={iconTheme}
                                                onOpen={() => { void handleFolderFileOpen(node) }}
                                                actionMenu={(
                                                    <FileActionsMenu
                                                        items={buildNodeActions(node)}
                                                        buttonClassName="size-5.5 rounded-[4px] border-0 text-sparkle-text-muted hover:border-0 hover:bg-white/[0.06] hover:text-sparkle-text"
                                                        openButtonClassName="border-0 bg-white/[0.08] text-sparkle-text opacity-100"
                                                        title={`Actions for ${node.name}`}
                                                    />
                                                )}
                                            />
                                        )
                                    }

                                    return (
                                        <div
                                            key={node.path}
                                            className={cn(
                                                'group/row flex w-full items-center rounded-[4px] border text-left text-[11px] transition-colors',
                                                isActiveFile
                                                    ? 'border-transparent bg-sky-500/10 text-sky-100'
                                                    : 'border-transparent text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text',
                                                !isDirectory && !isPreviewable && 'text-sparkle-text-muted'
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => { void toggleDirectory(node) }}
                                                onDoubleClick={() => navigateToFolder(node.path)}
                                                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-l-[4px] px-1.5 py-1 text-left"
                                                style={{ paddingLeft: `${6 + depth * 14}px` }}
                                            >
                                                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text-secondary">
                                                    {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                                </span>
                                                <VscodeEntryIcon
                                                    pathValue={node.path}
                                                    kind={node.type}
                                                    theme={iconTheme}
                                                    className="size-3.5 shrink-0"
                                                />
                                                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                                            </button>
                                            <div className="shrink-0 pr-0.5">
                                                <FileActionsMenu
                                                    items={buildNodeActions(node)}
                                                    buttonClassName="size-5.5 rounded-[4px] border-0 text-sparkle-text-muted hover:border-0 hover:bg-white/[0.06] hover:text-sparkle-text"
                                                    openButtonClassName="border-0 bg-white/[0.08] text-sparkle-text opacity-100"
                                                    title={`Actions for ${node.name}`}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.03] px-3 py-4 text-[11px] text-sparkle-text-secondary">
                                No sibling files found in this folder.
                            </div>
                        )}
                    </div>
                    {toastMessage ? (
                        <div className="border-t border-white/[0.05] bg-white/[0.03] px-3 py-1.5 text-[11px] text-sparkle-text-secondary">
                            {toastMessage}
                        </div>
                    ) : null}
                    <div className="border-t border-white/[0.06] bg-white/[0.02]">
                        <div className="grid grid-cols-3">
                            <button
                                type="button"
                                onClick={navigateUpFolder}
                                disabled={!canNavigateUpFolder}
                                className={cn(
                                    'inline-flex items-center justify-center gap-1.5 border-r border-white/[0.08] px-2 py-2.5 text-[11px] font-medium transition-colors',
                                    canNavigateUpFolder
                                        ? 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                        : 'cursor-not-allowed text-sparkle-text-muted'
                                )}
                                title="Go up one folder"
                            >
                                <ChevronUp className="size-3.5" />
                                <span>Up</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { void openHistoryFile(fileHistoryIndex - 1) }}
                                disabled={!canGoToPreviousFile}
                                className={cn(
                                    'inline-flex items-center justify-center gap-1.5 border-r border-white/[0.08] px-2 py-2.5 text-[11px] font-medium transition-colors',
                                    canGoToPreviousFile
                                        ? 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                        : 'cursor-not-allowed text-sparkle-text-muted'
                                )}
                                title="Previous file in preview history"
                            >
                                <ChevronLeft className="size-3.5" />
                                <span>Prev</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { void openHistoryFile(fileHistoryIndex + 1) }}
                                disabled={!canGoToNextFile}
                                className={cn(
                                    'inline-flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium transition-colors',
                                    canGoToNextFile
                                        ? 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                        : 'cursor-not-allowed text-sparkle-text-muted'
                                )}
                                title="Next file in preview history"
                            >
                                <span>Next</span>
                                <ChevronRight className="size-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
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

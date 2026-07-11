import { startTransition, useCallback, useMemo, useState, type DragEvent } from 'react'
import {
    RefreshCw, Search,
    ChevronUp, ChevronDown, ChevronRight, AppWindow, ClipboardPaste, Copy,
    ExternalLink, FolderOpen, Pencil, Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildMediaPreviewSources } from '@/components/ui/file-preview/utils'
import { formatFileSize } from './fileTreeUtils'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { useSettings } from '@/lib/settings'
import { FileActionsMenu } from '@/components/ui/FileActionsMenu'
import { normalizeFileSystemPath, getParentFolderPath } from './projectDetailsPageHelpers'
import { ProjectFilesToolbar } from './ProjectFilesToolbar'
import { getGitStatusVisual, useFileTreeGitStatus } from './useFileTreeGitStatus'

interface ProjectDetailsFilesTabProps {
    [key: string]: any
}

export function ProjectDetailsFilesTab(props: ProjectDetailsFilesTabProps) {
    const {
        fileSearch,
        setFileSearch,
        setIsExpandingFolders,
        expandedFolders,
        setExpandedFolders,
        loadingFolderPaths,
        allFolderPathsSet,
        isExpandingFolders,
        showHidden,
        setShowHidden,
        fileTree,
        sortBy,
        setSortBy,
        sortAsc,
        setSortAsc,
        visibleFileList,
        changedFiles,
        project,
        openPreview,
        onFileTreeOpen,
        onFileTreeOpenWith,
        onFileTreeOpenInExplorer,
        onFileTreeCopyPath,
        onFileTreeCopy,
        onFileTreeRename,
        onFileTreeDelete,
        onFileTreePaste,
        onFileTreeMove,
        onFileTreeCreateFile,
        onFileTreeCreateFolder,
        hasFileClipboardItem,
        loadingFiles,
        refreshFileTree,
        onToggleFolder,
        onToggleAllFolders
    } = props

    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const renderEntryIcon = (pathValue: string, kind: 'file' | 'directory') => (
        <VscodeEntryIcon pathValue={pathValue} kind={kind} theme={iconTheme} className="size-3.5 shrink-0" />
    )
    const projectRootPath = useMemo(() => normalizeFileSystemPath(project?.path || ''), [project?.path])
    const [draggedNode, setDraggedNode] = useState<any | null>(null)
    const [dragOverPath, setDragOverPath] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const normalizedDragOverPath = useMemo(() => {
        if (!dragOverPath || dragOverPath === '__root__') return null
        return normalizeFileSystemPath(dragOverPath)
    }, [dragOverPath])

    const {
        resolveNodeStatus,
        resolveDirectStatus,
        folderHasNestedChanges,
        resolveFolderNestedStatus
    } = useFileTreeGitStatus(changedFiles, projectRootPath)

    const resolveDropDestination = useCallback((targetNode?: any): string | null => {
        if (!project?.path) return null
        if (!targetNode) return project.path
        if (targetNode.type === 'directory') return targetNode.path
        return getParentFolderPath(targetNode.path) || project.path
    }, [project?.path])

    const isMoveAllowed = useCallback((sourceNode: any, destinationDirectory: string | null) => {
        if (!sourceNode?.path || !destinationDirectory) return false
        const normalizedSourcePath = normalizeFileSystemPath(sourceNode.path)
        const normalizedDestDir = normalizeFileSystemPath(destinationDirectory)
        if (!normalizedSourcePath || !normalizedDestDir) return false
        const sourceParent = getParentFolderPath(sourceNode.path)
        if (sourceParent && normalizeFileSystemPath(sourceParent) === normalizedDestDir) return false
        if (sourceNode.type === 'directory') {
            if (normalizedDestDir === normalizedSourcePath) return false
            if (normalizedDestDir.startsWith(`${normalizedSourcePath}/`)) return false
        }
        return true
    }, [])

    const handleDragStart = useCallback((event: DragEvent, node: any) => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', node.path)
        setDraggedNode(node)
        setIsDragging(true)
    }, [])

    const handleDragEnd = useCallback(() => {
        setDraggedNode(null)
        setDragOverPath(null)
        setIsDragging(false)
    }, [])

    const handleDragOver = useCallback((event: DragEvent, node?: any) => {
        if (!draggedNode) return
        event.preventDefault()
        const destinationDirectory = resolveDropDestination(node)
        const allowed = isMoveAllowed(draggedNode, destinationDirectory)
        event.dataTransfer.dropEffect = allowed ? 'move' : 'none'
        if (!allowed) {
            setDragOverPath(null)
            return
        }
        if (!destinationDirectory) {
            setDragOverPath(null)
            return
        }
        if (!node?.path) {
            setDragOverPath('__root__')
        } else {
            setDragOverPath(destinationDirectory)
        }
    }, [draggedNode, isMoveAllowed, resolveDropDestination])

    const handleDragLeave = useCallback((event: DragEvent, node?: any) => {
        if (!draggedNode) return
        const related = event.relatedTarget as Node | null
        if (related && event.currentTarget.contains(related)) return
        const destinationDirectory = resolveDropDestination(node)
        if (node?.path && destinationDirectory && dragOverPath === destinationDirectory) {
            setDragOverPath(null)
        } else if (!node?.path && dragOverPath === '__root__') {
            setDragOverPath(null)
        }
    }, [draggedNode, dragOverPath, resolveDropDestination])

    const handleDrop = useCallback(async (event: DragEvent, targetNode?: any) => {
        if (!draggedNode) return
        event.preventDefault()
        event.stopPropagation()
        const destinationDirectory = resolveDropDestination(targetNode)
        if (!isMoveAllowed(draggedNode, destinationDirectory)) {
            handleDragEnd()
            return
        }
        if (onFileTreeMove) {
            await onFileTreeMove(draggedNode, destinationDirectory)
        }
        handleDragEnd()
    }, [draggedNode, handleDragEnd, isMoveAllowed, onFileTreeMove, resolveDropDestination])

    return (
        <div className="flex flex-col h-full">
            <ProjectFilesToolbar
                fileSearch={fileSearch}
                setFileSearch={setFileSearch}
                refreshFileTree={refreshFileTree}
                loadingFiles={loadingFiles}
                onToggleAllFolders={onToggleAllFolders}
                setIsExpandingFolders={setIsExpandingFolders}
                expandedFolders={expandedFolders}
                setExpandedFolders={setExpandedFolders}
                allFolderPathsSet={allFolderPathsSet}
                isExpandingFolders={isExpandingFolders}
                showHidden={showHidden}
                setShowHidden={setShowHidden}
                onFileTreeCreateFile={onFileTreeCreateFile}
                onFileTreeCreateFolder={onFileTreeCreateFolder}
                renderEntryIcon={renderEntryIcon}
                fileTreeCount={fileTree.length}
            />

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-white/5 bg-black/10 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-white/30 sm:grid-cols-12">
                <div className="col-span-1 flex items-center gap-1 cursor-pointer hover:text-white/50 sm:col-span-6" onClick={() => { setSortBy('name'); setSortAsc(sortBy === 'name' ? !sortAsc : true) }}>
                    Name {sortBy === 'name' && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </div>
                <div className="hidden items-center gap-1 cursor-pointer hover:text-white/50 sm:col-span-2 sm:flex" onClick={() => { setSortBy('type'); setSortAsc(sortBy === 'type' ? !sortAsc : true) }}>
                    Type {sortBy === 'type' && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </div>
                <div className="hidden items-center gap-1 cursor-pointer hover:text-white/50 sm:col-span-2 sm:flex" onClick={() => { setSortBy('size'); setSortAsc(sortBy === 'size' ? !sortAsc : true) }}>
                    Size {sortBy === 'size' && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </div>
                <div className="col-span-1 text-right sm:col-span-2">Info</div>
            </div>

                <div
                    className={cn(
                        "project-surface-scrollbar flex-1 overflow-y-auto",
                        isDragging && dragOverPath === '__root__' && "bg-white/[0.03]"
                    )}
                    onDragOver={(event) => handleDragOver(event)}
                    onDragLeave={(event) => handleDragLeave(event)}
                    onDrop={(event) => { void handleDrop(event) }}
                >
                {loadingFiles && visibleFileList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 opacity-60">
                        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-primary)]/20 border-t-[var(--accent-primary)] animate-spin mb-5" />
                        <div className="text-white font-medium text-lg">Loading files...</div>
                    </div>
                ) : visibleFileList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-white/30">
                        <Search size={32} className="mb-3 opacity-30" />
                        <p className="text-sm">No files found</p>
                        {fileSearch && (
                            <button
                                onClick={() => setFileSearch('')}
                                className="mt-2 text-xs text-[var(--accent-primary)] hover:underline"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                ) : (
                    visibleFileList.map(({ node, depth, isExpanded, isFolder, ext, isPreviewable }: any) => {
                        const normalizedNodePath = normalizeFileSystemPath(node.path || '')
                        const isDragTarget = Boolean(
                            normalizedDragOverPath
                            && (normalizedNodePath === normalizedDragOverPath
                                || normalizedNodePath.startsWith(`${normalizedDragOverPath}/`))
                        )
                        const isDragTargetRoot = normalizedDragOverPath && normalizedNodePath === normalizedDragOverPath
                        const directStatus = resolveDirectStatus(node)
                        const hasNestedChanges = isFolder && folderHasNestedChanges(node.path)
                        const nestedStatus = isFolder ? resolveFolderNestedStatus(node.path) : undefined
                        const effectiveStatus = resolveNodeStatus(node) || nestedStatus || (hasNestedChanges ? 'modified' : undefined)
                        const effectiveVisual = getGitStatusVisual(effectiveStatus)
                        const directVisual = getGitStatusVisual(directStatus)
                        const hasStatusNameColor = Boolean(effectiveVisual.nameColor)
                        const isFolderLoading = Boolean(isFolder && loadingFolderPaths?.has(node.path))
                        return (
                            <div
                                key={node.path}
                                className={cn(
                                    "grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-white/5 px-4 py-0.5 transition-colors group cursor-pointer sm:grid-cols-12 hover:bg-white/5",
                                    node.isHidden && "opacity-50",
                                    isDragTarget && "bg-white/[0.03]",
                                    isDragTargetRoot && "bg-white/[0.06] border-white/20"
                                )}
                                style={{ paddingLeft: `${12 + depth * 16}px` }}
                                draggable
                                onDragStart={(event) => handleDragStart(event, node)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(event) => {
                                    event.stopPropagation()
                                    handleDragOver(event, node)
                                }}
                                onDragLeave={(event) => {
                                    event.stopPropagation()
                                    handleDragLeave(event, node)
                                }}
                                onDrop={(event) => { void handleDrop(event, node) }}
                                onClick={() => {
                                    if (isFolder) {
                                        if (onToggleFolder) {
                                            void onToggleFolder(node)
                                            return
                                        }
                                        startTransition(() => {
                                            setExpandedFolders((prev: Set<string>) => {
                                                const next = new Set(prev)
                                                if (next.has(node.path)) {
                                                    next.delete(node.path)
                                                } else {
                                                    next.add(node.path)
                                                }
                                                return next
                                            })
                                        })
                                    } else {
                                        void openPreview(
                                            { name: node.name, path: node.path },
                                            ext,
                                            {
                                                mediaItems: buildMediaPreviewSources(visibleFileList
                                                    .filter((entry: any) => !entry.isFolder)
                                                    .map((entry: any) => ({
                                                        name: entry.node.name,
                                                        path: entry.node.path,
                                                        extension: entry.ext
                                                    })))
                                            }
                                        )
                                    }
                                }}
                            >
                                    <div className="col-span-1 flex min-w-0 items-center gap-2 sm:col-span-6">
                                        {isFolder ? (
                                            isFolderLoading ? (
                                                <RefreshCw size={12} className="text-white/40 animate-spin" />
                                            ) : (
                                                <ChevronRight size={12} className={cn("text-white/30 transition-transform", isExpanded && "rotate-90")} />
                                            )
                                        ) : (
                                            <span className="w-3" />
                                        )}
                                        <VscodeEntryIcon
                                            pathValue={node.path || node.name}
                                            kind={isFolder ? 'directory' : 'file'}
                                            theme={iconTheme}
                                            className="shrink-0"
                                        />
                                        <span className={cn(
                                            "text-[14px] truncate",
                                            !hasStatusNameColor && (isFolder ? "text-white/80 font-medium" : "text-white/60"),
                                            effectiveVisual.nameClass
                                        )}
                                        style={effectiveVisual.nameColor ? { color: effectiveVisual.nameColor } : undefined}
                                        >
                                            {node.name}
                                        </span>
                                        {isFolder && hasNestedChanges && (
                                            <span className="relative inline-flex w-3.5 h-3.5 shrink-0">
                                                <span
                                                    className="absolute inset-[1px] rounded-full border"
                                                    style={{ borderColor: effectiveVisual.pulseColor || '#7dd3fc', backgroundColor: 'rgba(255,255,255,0.16)' }}
                                                />
                                                <span
                                                    className="absolute inset-[4px] rounded-full"
                                                    style={{ backgroundColor: effectiveVisual.pulseColor || '#7dd3fc' }}
                                                />
                                            </span>
                                        )}
                                        {isFolder && !hasNestedChanges && (
                                            <span className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                        {!isFolder && (
                                            <span className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                        {directStatus && (
                                            <span className={cn(
                                                "text-[8px] uppercase font-bold px-1 py-0.5 rounded shrink-0",
                                                directVisual.badgeClass
                                            )}>
                                                {directVisual.badgeLabel}
                                            </span>
                                        )}
                                    </div>

                                    <div className="hidden items-center sm:col-span-2 sm:flex">
                                        <span
                                            className={cn("text-[12px] text-white/40 uppercase", effectiveVisual.metaClass)}
                                        >
                                            {isFolder ? 'Folder' : ext || '-'}
                                        </span>
                                    </div>

                                    <div className="hidden items-center sm:col-span-2 sm:flex">
                                        <span
                                            className={cn("text-[12px] text-white/40 font-mono", effectiveVisual.metaClass)}
                                        >
                                            {isFolder ? '-' : formatFileSize(node.size)}
                                        </span>
                                    </div>

                                    <div className="col-span-1 flex min-w-0 items-center justify-end gap-2 sm:col-span-2">
                                        {isPreviewable && !isFolder && (
                                            <span className="text-[10px] text-[var(--accent-primary)] opacity-0 group-hover:opacity-100 transition-opacity">
                                                Preview
                                            </span>
                                        )}
                                        <FileActionsMenu
                                            title={`${node.name} actions`}
                                            items={[
                                                {
                                                    id: 'open',
                                                    label: 'Open',
                                                    icon: <FolderOpen size={13} />,
                                                    onSelect: () => onFileTreeOpen(node)
                                                },
                                                ...(!isFolder ? [{
                                                    id: 'open-with',
                                                    label: 'Open With...',
                                                    icon: <AppWindow size={13} />,
                                                    onSelect: () => onFileTreeOpenWith(node)
                                                }] : []),
                                                {
                                                    id: 'open-in-explorer',
                                                    label: 'Open in Explorer',
                                                    icon: <ExternalLink size={13} />,
                                                    onSelect: () => onFileTreeOpenInExplorer(node)
                                                },
                                                {
                                                    id: 'copy-path',
                                                    label: 'Copy Path',
                                                    icon: <Copy size={13} />,
                                                    onSelect: () => onFileTreeCopyPath(node)
                                                },
                                                {
                                                    id: 'copy',
                                                    label: 'Copy',
                                                    icon: <Copy size={13} />,
                                                    onSelect: () => onFileTreeCopy(node)
                                                },
                                                {
                                                    id: 'paste',
                                                    label: 'Paste',
                                                    icon: <ClipboardPaste size={13} />,
                                                    disabled: !hasFileClipboardItem,
                                                    onSelect: () => onFileTreePaste(node)
                                                },
                                                {
                                                    id: 'new-file',
                                                    label: 'New File',
                                                    icon: renderEntryIcon('file', 'file'),
                                                    onSelect: () => onFileTreeCreateFile(node)
                                                },
                                                {
                                                    id: 'new-folder',
                                                    label: 'New Folder',
                                                    icon: renderEntryIcon('folder', 'directory'),
                                                    onSelect: () => onFileTreeCreateFolder(node)
                                                },
                                                {
                                                    id: 'rename',
                                                    label: 'Rename',
                                                    icon: <Pencil size={13} />,
                                                    onSelect: () => onFileTreeRename(node)
                                                },
                                                {
                                                    id: 'delete',
                                                    label: 'Delete',
                                                    icon: <Trash2 size={13} />,
                                                    danger: true,
                                                    onSelect: () => onFileTreeDelete(node)
                                                }
                                            ]}
                                        />
                                    </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}

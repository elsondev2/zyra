import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
    AlertCircle,
    AppWindow,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    Copy,
    ExternalLink,
    Eye,
    EyeOff,
    File,
    Folder,
    FolderOpen,
    Grid3X3,
    List,
    MoveHorizontal,
    Pencil,
    Search,
    X,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Trash2,
    WrapText
} from 'lucide-react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { FileActionsMenu, type FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { PromptModal } from '@/components/ui/PromptModal'
import { getParentFolderPath, validateCreateName } from '@/lib/filesystem/fileSystemPaths'
import { useSettings } from '@/lib/settings'
import { cn, getFileExtension } from '@/lib/utils'
import type { PreviewFile, PreviewOpenOptions } from './types'
import { resolvePreviewType } from './utils'
import { PreviewVirtualFileTree } from './PreviewVirtualFileTree'
import { PreviewFileIconGrid } from './PreviewFileIconGrid'
import { PreviewFileDetailsTable } from './PreviewFileDetailsTable'
import { FileSystemEntryIcon } from './FileSystemEntryIcon'
import { usePreviewFolderTree } from './usePreviewFolderTree'
import { prefetchPreviewFile, preloadPreviewRenderer } from './useFilePreview'
import { getPathName, normalizePathKey } from './previewNavigationSidebar.tree'
import {
    INSPECTOR_NAVIGATION_PANE_DEFAULT_WIDTH,
    INSPECTOR_NAVIGATION_PANE_MAX_WIDTH,
    INSPECTOR_NAVIGATION_PANE_MIN_WIDTH,
    readInspectorExplorerPreferences,
    writeInspectorExplorerPreferences
} from './inspectorExplorerPreferences'
import { PreviewTreeSkeleton } from './PreviewLoadingSkeleton'
import { PreviewFileSearchResults } from './PreviewFileSearchResults'
import { usePreviewFileSearch } from './usePreviewFileSearch'

function ExplorerCreateIcon({ kind }: { kind: 'file' | 'directory' }) {
    const EntryIcon = kind === 'directory' ? Folder : File
    return (
        <span className="relative inline-flex size-4 items-center justify-center" aria-hidden="true">
            <EntryIcon className="size-3.5" strokeWidth={1.8} />
            <Plus className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-sm bg-sparkle-card" strokeWidth={3} />
        </span>
    )
}

function clampNavigationPaneWidth(width: number): number {
    return Math.round(Math.min(INSPECTOR_NAVIGATION_PANE_MAX_WIDTH, Math.max(INSPECTOR_NAVIGATION_PANE_MIN_WIDTH, width)))
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

export function filterWorkspaceTree(nodes: DevScopeFileTreeNode[], query: string): DevScopeFileTreeNode[] {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return nodes
    return nodes.flatMap((node) => {
        const children = Array.isArray(node.children) ? filterWorkspaceTree(node.children, query) : []
        if (!node.name.toLowerCase().includes(normalizedQuery) && children.length === 0) return []
        return [{ ...node, children }]
    })
}

function findWorkspaceFolderNodes(nodes: DevScopeFileTreeNode[], folderPath: string, rootPath: string): DevScopeFileTreeNode[] {
    const folderKey = normalizePathKey(folderPath)
    if (!folderKey || folderKey === normalizePathKey(rootPath)) return nodes
    const visit = (entries: DevScopeFileTreeNode[]): DevScopeFileTreeNode[] | null => {
        for (const node of entries) {
            if (node.type !== 'directory') continue
            if (normalizePathKey(node.path) === folderKey) return Array.isArray(node.children) ? node.children : []
            if (Array.isArray(node.children)) {
                const nested = visit(node.children)
                if (nested) return nested
            }
        }
        return null
    }
    return visit(nodes) || []
}

export function filterWorkspaceDirectoryTree(nodes: DevScopeFileTreeNode[]): DevScopeFileTreeNode[] {
    return nodes.flatMap((node) => node.type === 'directory'
        ? [{ ...node, children: Array.isArray(node.children) ? filterWorkspaceDirectoryTree(node.children) : node.children }]
        : [])
}

export function collectWorkspaceTreeStats(nodes: DevScopeFileTreeNode[]): { count: number; directoryKeys: Set<string> } {
    let count = 0
    const directoryKeys = new Set<string>()
    const visit = (entries: DevScopeFileTreeNode[]) => {
        for (const node of entries) {
            count += 1
            if (node.type === 'directory') directoryKeys.add(normalizePathKey(node.path))
            if (Array.isArray(node.children)) visit(node.children)
        }
    }
    visit(nodes)
    return { count, directoryKeys }
}

export type PreviewNavigationWorkspaceState = {
    currentFolderPath?: string
    expandedPathKeys?: string[]
    selectedPath?: string
    query?: string
    searchScope?: 'project' | 'folder'
    view?: 'list' | 'icons'
}

type PreviewNavigationSidebarProps = {
    file: PreviewFile
    projectPath?: string
    onOpenLinkedPreview?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenLinkedPreviewInNewTab?: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    refreshToken?: number
    revealTargetRequestId?: string | null
    onRevealTargetHandled?: (requestId: string) => void
    variant?: 'sidebar' | 'workspace' | 'navigation'
    initialWorkspaceState?: PreviewNavigationWorkspaceState
    onWorkspaceStateChange?: (state: PreviewNavigationWorkspaceState) => void
}

export function PreviewNavigationSidebar({
    file,
    projectPath,
    onOpenLinkedPreview,
    onOpenLinkedPreviewInNewTab,
    refreshToken = 0,
    revealTargetRequestId = null,
    onRevealTargetHandled,
    variant = 'sidebar',
    initialWorkspaceState,
    onWorkspaceStateChange
}: PreviewNavigationSidebarProps) {
    const { settings, updateSettings } = useSettings()
    const filesNavigationMode = variant === 'workspace' || variant === 'navigation'
    const workspacePreferenceProjectPath = String(projectPath || file.path || '').trim()
    const workspacePreferenceSeed = useMemo(
        () => {
            const persisted = filesNavigationMode
                ? readInspectorExplorerPreferences(workspacePreferenceProjectPath)
                : { view: 'list' as const, showHiddenFiles: false, navigationPaneWidth: INSPECTOR_NAVIGATION_PANE_DEFAULT_WIDTH, currentFolderPath: null, expandedPathKeys: [] }
            return {
                ...persisted,
                view: initialWorkspaceState?.view || persisted.view,
                currentFolderPath: initialWorkspaceState?.currentFolderPath || persisted.currentFolderPath,
                expandedPathKeys: initialWorkspaceState?.expandedPathKeys || persisted.expandedPathKeys
            }
        },
        [filesNavigationMode, initialWorkspaceState, workspacePreferenceProjectPath]
    )
    const iconTheme = settings.appearanceResolvedMode
    const nameLayout = settings.filePreviewExplorerNameLayout
    const [explorerOpen, setExplorerOpen] = useState(true)
    const [collapseAllRequest, setCollapseAllRequest] = useState(0)
    const [toastMessage, setToastMessage] = useState<string | null>(null)
    const [treePrompt, setTreePrompt] = useState<TreePromptState>(null)
    const [deleteTargets, setDeleteTargets] = useState<DevScopeFileTreeNode[]>([])
    const [workspaceFilter, setWorkspaceFilter] = useState(initialWorkspaceState?.query || '')
    const [searchBarFocused, setSearchBarFocused] = useState(false)
    const [searchScope, setSearchScope] = useState<'project' | 'folder'>(initialWorkspaceState?.searchScope || 'project')
    const [selectedWorkspacePath, setSelectedWorkspacePath] = useState(initialWorkspaceState?.selectedPath || file.path)
    const [automaticRevealRequestId, setAutomaticRevealRequestId] = useState<string | null>(null)
    const [showHiddenFiles, setShowHiddenFiles] = useState(workspacePreferenceSeed.showHiddenFiles)
    const [workspaceView, setWorkspaceView] = useState<'list' | 'icons'>(workspacePreferenceSeed.view)
    const [workspaceSelectionCount, setWorkspaceSelectionCount] = useState(0)
    const [navigationPaneWidth, setNavigationPaneWidth] = useState(workspacePreferenceSeed.navigationPaneWidth)
    const [navigationPaneResizing, setNavigationPaneResizing] = useState(false)
    const [persistedExpandedPathKeys, setPersistedExpandedPathKeys] = useState<string[]>(workspacePreferenceSeed.expandedPathKeys)
    const deferredWorkspaceFilter = useDeferredValue(workspaceFilter)
    const toastTimerRef = useRef<number | null>(null)
    const filePrefetchTimerRef = useRef<number | null>(null)
    const internalSelectionPathRef = useRef<string | null>(null)
    const automaticRevealSequenceRef = useRef(0)
    const persistedExpandedPathKeysRef = useRef(workspacePreferenceSeed.expandedPathKeys)
    const navigationPaneWidthRef = useRef(workspacePreferenceSeed.navigationPaneWidth)
    const navigationPaneResizeStartRef = useRef<{ clientX: number; width: number } | null>(null)
    const navigationPanePendingWidthRef = useRef<number | null>(null)
    const navigationPaneResizeFrameRef = useRef<number | null>(null)
    const {
        treeRootPath,
        activeFolderPath,
        tree,
        loading: folderLoading,
        error: folderError,
        navigatorTargetSettled,
        expandedPaths,
        ensureDirectoryLoaded,
        reload,
        preserveContextForFile,
        navigateToFolder: navigateFolderTreeTo
    } = usePreviewFolderTree({
        filePath: file.path,
        projectPath,
        directoryTarget: file.type === 'directory',
        refreshToken,
        showHidden: filesNavigationMode && showHiddenFiles,
        includeFileMetadata: variant === 'workspace' && workspaceView === 'list',
        directoryOnlyTree: filesNavigationMode,
        initialFolderPath: filesNavigationMode ? workspacePreferenceSeed.currentFolderPath : null
    })

    const navigateToFolder = useCallback((folderPath: string) => {
        const nextFolderPath = String(folderPath || '').trim()
        if (!nextFolderPath) return
        setSelectedWorkspacePath(nextFolderPath)
        navigateFolderTreeTo(nextFolderPath)
        if (!filesNavigationMode) {
            automaticRevealSequenceRef.current += 1
            setAutomaticRevealRequestId(`preview-folder-change:${automaticRevealSequenceRef.current}:${normalizePathKey(nextFolderPath)}`)
        }
    }, [filesNavigationMode, navigateFolderTreeTo])

    useEffect(() => {
        if (typeof window.requestIdleCallback === 'function') {
            const markdownIdleId = window.requestIdleCallback(() => preloadPreviewRenderer('md'), { timeout: 450 })
            const codeIdleId = window.requestIdleCallback(() => preloadPreviewRenderer('code'), { timeout: 1_400 })
            return () => {
                window.cancelIdleCallback(markdownIdleId)
                window.cancelIdleCallback(codeIdleId)
            }
        }
        const markdownTimer = window.setTimeout(() => preloadPreviewRenderer('md'), 120)
        const codeTimer = window.setTimeout(() => preloadPreviewRenderer('code'), 480)
        return () => {
            window.clearTimeout(markdownTimer)
            window.clearTimeout(codeTimer)
        }
    }, [])

    useEffect(() => {
        if (variant !== 'workspace') return
        writeInspectorExplorerPreferences(workspacePreferenceProjectPath, {
            view: workspaceView,
            showHiddenFiles
        })
    }, [showHiddenFiles, variant, workspacePreferenceProjectPath, workspaceView])

    const applyNavigationPaneWidth = useCallback((width: number, persist = false) => {
        const nextWidth = clampNavigationPaneWidth(width)
        navigationPaneWidthRef.current = nextWidth
        setNavigationPaneWidth(nextWidth)
        if (persist && variant === 'workspace') {
            writeInspectorExplorerPreferences(workspacePreferenceProjectPath, { navigationPaneWidth: nextWidth })
        }
    }, [variant, workspacePreferenceProjectPath])

    const handleNavigationPaneResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        navigationPaneResizeStartRef.current = { clientX: event.clientX, width: navigationPaneWidthRef.current }
        navigationPanePendingWidthRef.current = navigationPaneWidthRef.current
        setNavigationPaneResizing(true)
    }, [])

    const handleNavigationPaneResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        const nextWidth = event.key === 'ArrowLeft'
            ? navigationPaneWidthRef.current - 16
            : event.key === 'ArrowRight'
                ? navigationPaneWidthRef.current + 16
                : event.key === 'Home'
                    ? INSPECTOR_NAVIGATION_PANE_MIN_WIDTH
                    : event.key === 'End'
                        ? INSPECTOR_NAVIGATION_PANE_MAX_WIDTH
                        : null
        if (nextWidth === null) return
        event.preventDefault()
        applyNavigationPaneWidth(nextWidth, true)
    }, [applyNavigationPaneWidth])

    useEffect(() => {
        if (!navigationPaneResizing) return
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const flushPendingWidth = () => {
            navigationPaneResizeFrameRef.current = null
            const pendingWidth = navigationPanePendingWidthRef.current
            if (pendingWidth !== null) applyNavigationPaneWidth(pendingWidth)
        }
        const handlePointerMove = (event: PointerEvent) => {
            const resizeStart = navigationPaneResizeStartRef.current
            if (!resizeStart) return
            navigationPanePendingWidthRef.current = clampNavigationPaneWidth(resizeStart.width + event.clientX - resizeStart.clientX)
            if (navigationPaneResizeFrameRef.current === null) {
                navigationPaneResizeFrameRef.current = window.requestAnimationFrame(flushPendingWidth)
            }
        }
        const finishResize = (cancelled: boolean) => {
            const resizeStart = navigationPaneResizeStartRef.current
            if (navigationPaneResizeFrameRef.current !== null) {
                window.cancelAnimationFrame(navigationPaneResizeFrameRef.current)
                navigationPaneResizeFrameRef.current = null
            }
            const finalWidth = cancelled && resizeStart
                ? resizeStart.width
                : navigationPanePendingWidthRef.current ?? navigationPaneWidthRef.current
            applyNavigationPaneWidth(finalWidth, !cancelled)
            navigationPaneResizeStartRef.current = null
            navigationPanePendingWidthRef.current = null
            setNavigationPaneResizing(false)
        }
        const handlePointerUp = () => finishResize(false)
        const handlePointerCancel = () => finishResize(false)
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') finishResize(true)
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp, { once: true })
        window.addEventListener('pointercancel', handlePointerCancel, { once: true })
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerCancel)
            window.removeEventListener('keydown', handleKeyDown)
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
            if (navigationPaneResizeFrameRef.current !== null) {
                window.cancelAnimationFrame(navigationPaneResizeFrameRef.current)
                navigationPaneResizeFrameRef.current = null
            }
        }
    }, [applyNavigationPaneWidth, navigationPaneResizing])

    useEffect(() => {
        if (!filesNavigationMode || !activeFolderPath) return
        writeInspectorExplorerPreferences(workspacePreferenceProjectPath, { currentFolderPath: activeFolderPath })
    }, [activeFolderPath, filesNavigationMode, workspacePreferenceProjectPath])

    useEffect(() => {
        if (!filesNavigationMode) return
        onWorkspaceStateChange?.({
            currentFolderPath: activeFolderPath,
            expandedPathKeys: persistedExpandedPathKeys,
            selectedPath: selectedWorkspacePath,
            query: workspaceFilter,
            searchScope,
            view: workspaceView
        })
    }, [activeFolderPath, filesNavigationMode, onWorkspaceStateChange, persistedExpandedPathKeys, searchScope, selectedWorkspacePath, workspaceFilter, workspaceView])

    useEffect(() => {
        if (filesNavigationMode) setSelectedWorkspacePath(activeFolderPath)
    }, [activeFolderPath, filesNavigationMode])

    const handleExpandedPathKeysChange = useCallback((paths: ReadonlySet<string>) => {
        if (!filesNavigationMode) return
        const nextPaths = [...paths].map(normalizePathKey).filter(Boolean).sort()
        const previousPaths = persistedExpandedPathKeysRef.current
        if (previousPaths.length === nextPaths.length && previousPaths.every((path, index) => path === nextPaths[index])) return
        persistedExpandedPathKeysRef.current = nextPaths
        setPersistedExpandedPathKeys(nextPaths)
        writeInspectorExplorerPreferences(workspacePreferenceProjectPath, { expandedPathKeys: nextPaths })
    }, [filesNavigationMode, workspacePreferenceProjectPath])

    useEffect(() => {
        const nextPath = String(file.path || '').trim()
        const nextPathKey = normalizePathKey(nextPath)
        if (!nextPathKey) return
        setSelectedWorkspacePath((currentPath) => (
            normalizePathKey(currentPath) === nextPathKey ? currentPath : nextPath
        ))

        const internallySelected = internalSelectionPathRef.current === nextPathKey
        internalSelectionPathRef.current = null
        if (internallySelected || revealTargetRequestId) {
            setAutomaticRevealRequestId(null)
            return
        }

        automaticRevealSequenceRef.current += 1
        setAutomaticRevealRequestId(`preview-file-change:${automaticRevealSequenceRef.current}:${nextPathKey}`)
        // revealTargetRequestId is intentionally read only for this file change. Consuming an
        // explicit request must not schedule a second automatic center for the same target.
    }, [file.path])

    useEffect(() => {
        return () => {
            if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
            if (filePrefetchTimerRef.current !== null) window.clearTimeout(filePrefetchTimerRef.current)
        }
    }, [])

    const activeFileKey = useMemo(() => normalizePathKey(file.path), [file.path])
    const effectiveRevealTargetRequestId = revealTargetRequestId || automaticRevealRequestId
    const handleRevealTargetHandled = useCallback((requestId: string) => {
        if (requestId === automaticRevealRequestId) {
            setAutomaticRevealRequestId((currentRequestId) => currentRequestId === requestId ? null : currentRequestId)
            return
        }
        onRevealTargetHandled?.(requestId)
    }, [automaticRevealRequestId, onRevealTargetHandled])
    const explorerRootName = useMemo(
        () => getPathName(treeRootPath) || getPathName(projectPath || '') || 'Workspace',
        [projectPath, treeRootPath]
    )
    const workspaceTree = tree
    const workspaceDirectoryTree = useMemo(() => filterWorkspaceDirectoryTree(workspaceTree), [workspaceTree])
    const workspaceFolderNodes = useMemo(
        () => findWorkspaceFolderNodes(tree, activeFolderPath, treeRootPath),
        [activeFolderPath, tree, treeRootPath]
    )
    const workspaceIconNodes = workspaceFolderNodes
    const workspaceFolderName = getPathName(activeFolderPath) || explorerRootName
    const searchQuery = deferredWorkspaceFilter.trim()
    const searchScopePath = searchScope === 'folder' ? activeFolderPath : treeRootPath
    const fileSearch = usePreviewFileSearch({
        projectPath: treeRootPath,
        scopePath: searchScopePath,
        query: searchQuery,
        loadedTree: tree,
        showHidden: filesNavigationMode && showHiddenFiles
    })
    const workspaceVisibleCount = searchQuery ? fileSearch.entries.length : workspaceIconNodes.length
    const workspaceParentPath = getParentFolderPath(activeFolderPath)
    const canNavigateWorkspaceUp = Boolean(
        workspaceParentPath
        && normalizePathKey(activeFolderPath) !== normalizePathKey(treeRootPath)
        && normalizePathKey(workspaceParentPath).startsWith(normalizePathKey(treeRootPath))
    )
    const workspaceExpandedPaths = useMemo(
        () => new Set([...expandedPaths, ...persistedExpandedPathKeys].map(normalizePathKey)),
        [expandedPaths, persistedExpandedPathKeys]
    )
    const visibleExpandedPaths = filesNavigationMode ? workspaceExpandedPaths : expandedPaths

    const handleWorkspaceSelectionCountChange = useCallback((count: number) => setWorkspaceSelectionCount(count), [])

    const handleFolderFileOpen = useCallback(async (node: DevScopeFileTreeNode) => {
        if (node.type !== 'file' || !onOpenLinkedPreview) return
        internalSelectionPathRef.current = normalizePathKey(node.path)
        setSelectedWorkspacePath(node.path)
        preserveContextForFile(node.path)
        await onOpenLinkedPreview({ name: node.name, path: node.path }, getFileExtension(node.name))
    }, [onOpenLinkedPreview, preserveContextForFile])

    const handleFilePrefetch = useCallback((node: DevScopeFileTreeNode) => {
        if (node.type !== 'file') return
        if (filePrefetchTimerRef.current !== null) window.clearTimeout(filePrefetchTimerRef.current)
        filePrefetchTimerRef.current = window.setTimeout(() => {
            filePrefetchTimerRef.current = null
            prefetchPreviewFile({ name: node.name, path: node.path }, getFileExtension(node.name))
        }, 90)
    }, [])

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
        if (deleteTargets.length === 0) return
        const failures: string[] = []
        let deletedCount = 0
        for (const target of deleteTargets) {
            const result = await window.devscope.deleteFileSystemItem(target.path)
            if (result.success) deletedCount += 1
            else failures.push(target.name)
        }
        setDeleteTargets([])
        if (deletedCount > 0) await reload()
        if (failures.length > 0) {
            showToast(`${deletedCount > 0 ? `Deleted ${deletedCount}; ` : ''}could not delete ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? ` and ${failures.length - 3} more` : ''}.`)
            return
        }
        showToast(deletedCount === 1 ? `Deleted ${deleteTargets[0].name}` : `Deleted ${deletedCount} items`)
    }, [deleteTargets, reload, showToast])

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
                onSelect: () => setDeleteTargets([node])
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

    const buildSelectionActions = useCallback((nodes: DevScopeFileTreeNode[]): FileActionsMenuItem[] => {
        const previewableFiles = nodes.flatMap((node) => {
            if (node.type !== 'file') return []
            const extension = getFileExtension(node.name)
            return resolvePreviewType(node.name, extension) ? [{ node, extension }] : []
        })
        const canOpenAllInTabs = Boolean(
            onOpenLinkedPreviewInNewTab
            && previewableFiles.length === nodes.length
            && previewableFiles.length <= 20
        )
        return [
            canOpenAllInTabs ? {
                id: 'open-selected-tabs',
                label: `Open ${nodes.length} items in tabs`,
                icon: <ExternalLink className="size-3.5" />,
                onSelect: async () => {
                    if (!onOpenLinkedPreviewInNewTab) return
                    for (const item of previewableFiles) {
                        preserveContextForFile(item.node.path)
                        await onOpenLinkedPreviewInNewTab({ name: item.node.name, path: item.node.path }, item.extension)
                    }
                }
            } : null,
            {
                id: 'copy-selected-paths',
                label: `Copy ${nodes.length} paths`,
                icon: <Copy className="size-3.5" />,
                onSelect: async () => {
                    const text = nodes.map((node) => node.path).join('\n')
                    if (window.devscope.copyToClipboard) {
                        const result = await window.devscope.copyToClipboard(text)
                        showToast(result.success ? `Copied ${nodes.length} paths` : result.error || 'Failed to copy paths')
                        return
                    }
                    await navigator.clipboard.writeText(text)
                    showToast(`Copied ${nodes.length} paths`)
                }
            },
            {
                id: 'delete-selected',
                label: `Delete ${nodes.length} items`,
                icon: <Trash2 className="size-3.5" />,
                danger: true,
                separatorBefore: true,
                onSelect: () => setDeleteTargets(nodes)
            }
        ].filter(Boolean) as FileActionsMenuItem[]
    }, [onOpenLinkedPreviewInNewTab, preserveContextForFile, showToast])

    const workspaceOptionsMenuItems = useMemo<FileActionsMenuItem[]>(() => [
        {
            id: 'hidden-files',
            label: 'Show hidden files',
            icon: showHiddenFiles ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />,
            checked: showHiddenFiles,
            onSelect: () => setShowHiddenFiles((visible) => !visible)
        }
    ], [showHiddenFiles])

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

    const workspaceMainSurface = folderError ? (
        <div className="h-fit flex-1 border-b border-red-500/20 bg-red-500/10 px-3 py-3 text-[11px] text-red-200">
            <div className="flex items-center gap-2"><AlertCircle className="size-3.5 shrink-0" /><span className="truncate">{folderError}</span></div>
        </div>
    ) : folderLoading && workspaceTree.length === 0 ? (
        <PreviewTreeSkeleton />
    ) : searchQuery ? (
        <PreviewFileSearchResults
            entries={fileSearch.entries}
            query={searchQuery}
            selectedPath={selectedWorkspacePath}
            light={iconTheme === 'light'}
            searching={fileSearch.searching}
            error={fileSearch.error}
            onOpenFile={(node) => { void handleFolderFileOpen(node) }}
            onOpenDirectory={(node) => {
                setWorkspaceFilter('')
                navigateToFolder(node.path)
            }}
            onPrefetchFile={handleFilePrefetch}
            getNodeActions={buildNodeActions}
        />
    ) : workspaceIconNodes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-[10px] text-sparkle-text-muted/50">This folder is empty.</div>
    ) : workspaceView === 'icons' ? (
        <PreviewFileIconGrid
            nodes={workspaceIconNodes}
            selectedPath={selectedWorkspacePath}
            light={iconTheme === 'light'}
            onOpenFile={(node) => { void handleFolderFileOpen(node) }}
            onPrefetchFile={handleFilePrefetch}
            onOpenDirectory={(node) => navigateToFolder(node.path)}
            onSelectionCountChange={handleWorkspaceSelectionCountChange}
            getNodeActions={buildNodeActions}
            getSelectionActions={buildSelectionActions}
        />
    ) : (
        <PreviewFileDetailsTable
            nodes={workspaceIconNodes}
            selectedPath={selectedWorkspacePath}
            light={iconTheme === 'light'}
            onOpenFile={(node) => { void handleFolderFileOpen(node) }}
            onPrefetchFile={handleFilePrefetch}
            onOpenDirectory={(node) => navigateToFolder(node.path)}
            onSelectionCountChange={handleWorkspaceSelectionCountChange}
            getNodeActions={buildNodeActions}
            getSelectionActions={buildSelectionActions}
        />
    )

    const folderNavigationTreeSurface = folderError ? (
        <div className="h-fit flex-1 border-b border-red-500/20 bg-red-500/10 px-3 py-3 text-[10px] text-red-200">
            <div className="flex items-center gap-2"><AlertCircle className="size-3.5 shrink-0" /><span className="truncate">{folderError}</span></div>
        </div>
    ) : folderLoading && workspaceDirectoryTree.length === 0 ? (
        <PreviewTreeSkeleton compact />
    ) : workspaceDirectoryTree.length > 0 ? (
        <PreviewVirtualFileTree
            nodes={workspaceDirectoryTree}
            rootPath={treeRootPath}
            selectedPath={activeFolderPath}
            selectedPathKind="directory"
            expandedPathKeys={visibleExpandedPaths}
            collapseAllRequest={collapseAllRequest}
            nameLayout={nameLayout}
            theme={iconTheme}
            onOpenFile={() => undefined}
            onActivateDirectory={(node) => navigateToFolder(node.path)}
            onExpandDirectory={ensureDirectoryLoaded}
            onExpandedPathKeysChange={handleExpandedPathKeysChange}
            getNodeActions={buildNodeActions}
            presentation="navigation"
        />
    ) : (
        <div className="px-3 py-4 text-[9px] text-sparkle-text-muted/45">No folders</div>
    )

    const navigationSearchSurface = searchQuery ? (
        <PreviewFileSearchResults
            entries={fileSearch.entries}
            query={searchQuery}
            selectedPath={selectedWorkspacePath}
            light={iconTheme === 'light'}
            searching={fileSearch.searching}
            error={fileSearch.error}
            onOpenFile={(node) => { void handleFolderFileOpen(node) }}
            onOpenDirectory={(node) => {
                setWorkspaceFilter('')
                navigateToFolder(node.path)
            }}
            onPrefetchFile={handleFilePrefetch}
            getNodeActions={buildNodeActions}
        />
    ) : folderNavigationTreeSurface

    const folderNavigationHeader = (
        <div className="group/folder-pane flex h-8 shrink-0 items-center border-b border-white/[0.05] px-1.5">
            <button
                type="button"
                onClick={() => navigateToFolder(treeRootPath)}
                className={cn(
                    'flex min-w-0 flex-1 items-center gap-1.5 px-0.5 text-left text-[10px] font-semibold text-sparkle-text-secondary hover:text-sparkle-text',
                    normalizePathKey(activeFolderPath) === normalizePathKey(treeRootPath) && 'text-sparkle-text'
                )}
                title={treeRootPath}
            >
                <FileSystemEntryIcon path={treeRootPath} kind="directory" expanded light={iconTheme === 'light'} size={15} />
                <span className="truncate">{explorerRootName}</span>
            </button>
            <div className="flex shrink-0 items-center text-sparkle-text-muted/55">
                <button type="button" disabled={!activeFolderPath} onClick={() => startCreate('file', activeFolderPath)} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/55 hover:bg-white/[0.055] hover:text-sparkle-text disabled:opacity-25" title="New file" aria-label="New file"><ExplorerCreateIcon kind="file" /></button>
                <button type="button" disabled={!activeFolderPath} onClick={() => startCreate('directory', activeFolderPath)} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/55 hover:bg-white/[0.055] hover:text-sparkle-text disabled:opacity-25" title="New folder" aria-label="New folder"><ExplorerCreateIcon kind="directory" /></button>
                <button type="button" onClick={() => void reload()} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/55 hover:bg-white/[0.055] hover:text-sparkle-text" title="Refresh folder tree" aria-label="Refresh folder tree"><RefreshCw className={cn('size-3.5', folderLoading && 'animate-spin motion-reduce:animate-none')} /></button>
                <button type="button" onClick={() => setCollapseAllRequest((request) => request + 1)} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/55 hover:bg-white/[0.055] hover:text-sparkle-text" title="Collapse folder tree" aria-label="Collapse folder tree"><ChevronsDownUp className="size-3.5" /></button>
                <button type="button" onClick={() => updateSettings({ filePreviewExplorerNameLayout: nameLayout === 'wrap' ? 'horizontal' : 'wrap' })} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/55 hover:bg-white/[0.055] hover:text-sparkle-text" title={nameLayout === 'wrap' ? 'Use horizontal scrolling for long names' : 'Wrap long names'} aria-label={nameLayout === 'wrap' ? 'Use horizontal scrolling for long names' : 'Wrap long names'}>{nameLayout === 'wrap' ? <WrapText className="size-3.5" /> : <MoveHorizontal className="size-3.5" />}</button>
            </div>
        </div>
    )

    const sidebarTreeSurface = folderError ? (
        <div className="m-1 h-fit flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-[11px] text-red-200">
            <div className="flex items-center gap-2"><AlertCircle className="size-3.5 shrink-0" /><span className="truncate">{folderError}</span></div>
        </div>
    ) : folderLoading && workspaceTree.length === 0 ? (
        <PreviewTreeSkeleton compact />
    ) : searchQuery ? (
        <PreviewFileSearchResults
            entries={fileSearch.entries}
            query={searchQuery}
            selectedPath={file.path}
            light={iconTheme === 'light'}
            searching={fileSearch.searching}
            error={fileSearch.error}
            onOpenFile={(node) => { void handleFolderFileOpen(node) }}
            onOpenDirectory={(node) => {
                setWorkspaceFilter('')
                navigateToFolder(node.path)
            }}
            onPrefetchFile={handleFilePrefetch}
            getNodeActions={buildNodeActions}
        />
    ) : workspaceTree.length > 0 ? (
        <PreviewVirtualFileTree
            nodes={workspaceTree}
            rootPath={treeRootPath}
            selectedPath={selectedWorkspacePath}
            selectedPathKind={normalizePathKey(selectedWorkspacePath) === normalizePathKey(activeFolderPath) ? 'directory' : 'file'}
            expandedPathKeys={visibleExpandedPaths}
            collapseAllRequest={collapseAllRequest}
            nameLayout={nameLayout}
            theme={iconTheme}
            revealTargetRequestId={effectiveRevealTargetRequestId}
            revealReady={navigatorTargetSettled}
            onRevealTargetHandled={handleRevealTargetHandled}
            onOpenFile={(node) => { void handleFolderFileOpen(node) }}
            onActivateDirectory={(node) => navigateToFolder(node.path)}
            onPrefetchFile={handleFilePrefetch}
            onExpandDirectory={ensureDirectoryLoaded}
            getNodeActions={buildNodeActions}
            presentation="tree"
        />
    ) : (
        <div className="flex flex-1 items-start justify-center px-4 py-7 text-center text-[10px] text-sparkle-text-muted/55">No files in this project.</div>
    )

    return (
        <>
        <div className={cn('flex min-h-0 flex-1 flex-col', filesNavigationMode ? 'bg-[color-mix(in_srgb,var(--color-bg)_97%,black)]' : 'bg-sparkle-card')}>
            {variant === 'navigation' ? (
                <>
                    {folderNavigationHeader}
                    <div className="flex h-9 shrink-0 items-center border-b border-white/[0.045] px-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-sparkle-text-muted/35" />
                            <input
                                value={workspaceFilter}
                                onChange={(event) => setWorkspaceFilter(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && workspaceFilter) {
                                        event.preventDefault()
                                        setWorkspaceFilter('')
                                    }
                                }}
                                placeholder="Search project files"
                                className="h-7 w-full rounded-md border border-white/[0.055] bg-white/[0.015] pl-7 pr-7 text-[9px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/35 focus:border-[var(--accent-primary)]/25"
                                aria-label="Search preview files"
                            />
                            {workspaceFilter ? <button type="button" onClick={() => setWorkspaceFilter('')} className="absolute right-1.5 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center text-sparkle-text-muted/45 hover:text-sparkle-text" title="Clear file search" aria-label="Clear file search"><X className="size-3" /></button> : null}
                        </div>
                    </div>
                </>
            ) : variant === 'workspace' ? (
                <>
                    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.055] px-3">
                        <button type="button" disabled={!canNavigateWorkspaceUp} onClick={() => { if (workspaceParentPath) navigateToFolder(workspaceParentPath) }} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/55 hover:bg-white/[0.055] hover:text-sparkle-text disabled:opacity-20" title="Up one folder" aria-label="Up one folder"><ArrowUp className="size-3.5" /></button>
                        <FileSystemEntryIcon path={activeFolderPath} kind="directory" expanded light={iconTheme === 'light'} size={17} />
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-[11px] font-semibold text-sparkle-text" title={activeFolderPath}>{workspaceFolderName}</h2>
                            <p className="truncate text-[8px] text-sparkle-text-muted/40" title={activeFolderPath}>{activeFolderPath}</p>
                        </div>
                    </div>
                    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.05] px-3">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-sparkle-text-muted/35" />
                            <input
                                value={workspaceFilter}
                                onFocus={() => setSearchBarFocused(true)}
                                onBlur={() => setSearchBarFocused(false)}
                                onChange={(event) => setWorkspaceFilter(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && workspaceFilter) {
                                        event.preventDefault()
                                        setWorkspaceFilter('')
                                    }
                                }}
                                placeholder={searchScope === 'folder' ? 'Search this folder' : 'Search project files'}
                                className="h-7 w-full rounded-md border border-white/[0.065] bg-white/[0.02] pl-7 pr-7 text-[9px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/35 focus:border-[var(--accent-primary)]/30 focus:bg-white/[0.03]"
                                aria-label="Search workspace files"
                            />
                            {workspaceFilter ? <button type="button" onClick={() => setWorkspaceFilter('')} className="absolute right-1.5 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center text-sparkle-text-muted/45 hover:text-sparkle-text" title="Clear file search" aria-label="Clear file search"><X className="size-3" /></button> : null}
                        </div>
                        {searchBarFocused || workspaceFilter.trim() ? (
                            <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => setSearchScope((scope) => scope === 'project' ? 'folder' : 'project')}
                                className="inline-flex h-7 shrink-0 items-center px-1.5 text-[8px] font-medium text-sparkle-text-muted/55 hover:text-sparkle-text"
                                title={searchScope === 'project' ? 'Search the entire project' : `Search only ${workspaceFolderName}`}
                                aria-label="Change file search scope"
                            >
                                {searchScope === 'project' ? 'Project' : 'Folder'}
                            </button>
                        ) : null}
                        <div className="flex h-7 items-center rounded-md border border-white/[0.065] bg-white/[0.015] p-0.5" aria-label="Explorer view">
                            <button type="button" onClick={() => setWorkspaceView('list')} className={cn('inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/45', workspaceView === 'list' ? 'bg-white/[0.085] text-sparkle-text' : 'hover:text-sparkle-text')} title="Details view" aria-label="Details view"><List className="size-3.5" /></button>
                            <button type="button" onClick={() => setWorkspaceView('icons')} className={cn('inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted/45', workspaceView === 'icons' ? 'bg-white/[0.085] text-sparkle-text' : 'hover:text-sparkle-text')} title="Large icons" aria-label="Large icons"><Grid3X3 className="size-3.5" /></button>
                        </div>
                        <FileActionsMenu
                            items={workspaceOptionsMenuItems}
                            density="compact"
                            title="Explorer options"
                            buttonClassName="border border-[var(--surface-divider)] bg-transparent text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                            openButtonClassName="border-[var(--surface-divider)] bg-[var(--surface-active)] text-sparkle-text"
                            menuWidth={220}
                            triggerIcon={<SlidersHorizontal className="size-3.5" />}
                        />
                    </div>
                </>
            ) : null}
            <div className={cn('group/explorer flex h-8 min-h-8 items-center border-b border-white/[0.05] px-1.5', filesNavigationMode && 'hidden')}>
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
            {variant === 'sidebar' && explorerOpen ? (
                <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-white/[0.045] px-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-sparkle-text-muted/35" />
                        <input
                            value={workspaceFilter}
                            onFocus={() => setSearchBarFocused(true)}
                            onBlur={() => setSearchBarFocused(false)}
                            onChange={(event) => setWorkspaceFilter(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' && workspaceFilter) {
                                    event.preventDefault()
                                    setWorkspaceFilter('')
                                }
                            }}
                            placeholder={searchScope === 'folder' ? 'Search this folder' : 'Search project files'}
                            className="h-6 w-full bg-transparent pl-6 pr-6 text-[9px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/35"
                            aria-label="Search project files"
                        />
                        {workspaceFilter ? <button type="button" onClick={() => setWorkspaceFilter('')} className="absolute right-1 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center text-sparkle-text-muted/45 hover:text-sparkle-text" title="Clear file search" aria-label="Clear file search"><X className="size-3" /></button> : null}
                    </div>
                    {searchBarFocused || workspaceFilter.trim() ? (
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchScope((scope) => scope === 'project' ? 'folder' : 'project')} className="h-6 px-1 text-[8px] font-medium text-sparkle-text-muted/50 hover:text-sparkle-text" title={searchScope === 'project' ? 'Search the entire project' : `Search only ${workspaceFolderName}`}>{searchScope === 'project' ? 'Project' : 'Folder'}</button>
                    ) : null}
                </div>
            ) : null}

            {variant === 'workspace' ? (
                <div className="assistant-workspace-explorer-layout flex min-h-0 flex-1 overflow-hidden">
                    <aside
                        className={cn(
                            'assistant-workspace-explorer-layout__tree relative min-h-0 shrink-0 flex-col overflow-hidden border-r border-white/[0.055] bg-[color-mix(in_srgb,var(--color-card)_72%,var(--color-bg))]',
                            navigationPaneResizing ? 'transition-none' : 'transition-[width] duration-150 ease-out'
                        )}
                        style={{ width: `${navigationPaneWidth}px` }}
                        aria-label="Folder navigation pane"
                    >
                        {folderNavigationHeader}
                        {folderNavigationTreeSurface}
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize folder navigation pane"
                            aria-valuemin={INSPECTOR_NAVIGATION_PANE_MIN_WIDTH}
                            aria-valuemax={INSPECTOR_NAVIGATION_PANE_MAX_WIDTH}
                            aria-valuenow={navigationPaneWidth}
                            tabIndex={0}
                            onPointerDown={handleNavigationPaneResizeStart}
                            onKeyDown={handleNavigationPaneResizeKeyDown}
                            onDoubleClick={() => applyNavigationPaneWidth(INSPECTOR_NAVIGATION_PANE_DEFAULT_WIDTH, true)}
                            className="group absolute right-0 top-0 z-30 h-full w-2 cursor-col-resize touch-none bg-transparent outline-none"
                            title="Resize folder navigation pane"
                        >
                            <span className={cn('pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors', navigationPaneResizing ? 'bg-[var(--accent-primary)]/55' : 'bg-transparent group-hover:bg-[var(--accent-primary)]/45 group-focus-visible:bg-[var(--accent-primary)]/55')} />
                        </div>
                    </aside>
                    <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]">
                        {workspaceMainSurface}
                    </main>
                </div>
            ) : variant === 'navigation' ? (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    {navigationSearchSurface}
                </div>
            ) : (
                <div className={cn('flex min-h-0 flex-1 overflow-hidden px-1 pb-1', !explorerOpen && 'hidden')}>
                    {sidebarTreeSurface}
                </div>
            )}
                    {variant === 'workspace' && !searchQuery ? (
                        <div className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-white/[0.055] px-2.5 font-mono text-[8px] text-sparkle-text-muted/40">
                            <span>{workspaceSelectionCount > 0 ? `${workspaceSelectionCount.toLocaleString()} selected · ` : ''}{workspaceVisibleCount.toLocaleString()} item{workspaceVisibleCount === 1 ? '' : 's'}</span>
                            <span className="max-w-[65%] truncate">{deferredWorkspaceFilter.trim() ? `Filter: ${deferredWorkspaceFilter.trim()}` : activeFolderPath}</span>
                        </div>
                    ) : null}
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
            isOpen={deleteTargets.length > 0}
            title={deleteTargets.length === 1 ? `Delete ${deleteTargets[0]?.type === 'directory' ? 'folder' : 'file'}` : `Delete ${deleteTargets.length} items`}
            message={deleteTargets.length === 1
                ? `Delete "${deleteTargets[0]?.name}"? This cannot be undone.`
                : `Delete ${deleteTargets.slice(0, 4).map((target) => `"${target.name}"`).join(', ')}${deleteTargets.length > 4 ? ` and ${deleteTargets.length - 4} more` : ''}? This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => { void confirmDeleteTarget() }}
            onCancel={() => setDeleteTargets([])}
            variant="danger"
        />
        </>
    )
}

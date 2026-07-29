import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { cn } from '@/lib/utils'
import {
    buildVisiblePreviewTreeModel,
    normalizePreviewTreePath,
    type PreviewVirtualTreeRow
} from './previewVirtualTreeModel'
import { usePreviewVirtualWindow } from './usePreviewVirtualWindow'
import {
    getPreviewTreeMenuAnchor,
    PreviewTreeContextMenu,
    type PreviewTreeMenuAnchor
} from './PreviewTreeContextMenu'

type PreviewTreeMenuState = {
    node: DevScopeFileTreeNode
    anchor: PreviewTreeMenuAnchor
} | null

export function PreviewVirtualFileTree({
    nodes,
    rootPath,
    selectedPath,
    expandedPathKeys,
    collapseAllRequest = 0,
    nameLayout,
    theme,
    revealTargetRequestId = null,
    onRevealTargetHandled,
    onOpenFile,
    onExpandDirectory,
    getNodeActions
}: {
    nodes: DevScopeFileTreeNode[]
    rootPath: string
    selectedPath?: string
    selectedPathKind?: 'file' | 'directory'
    expandedPathKeys: ReadonlySet<string>
    collapseAllRequest?: number
    nameLayout: 'wrap' | 'horizontal'
    theme: 'light' | 'dark'
    revealTargetRequestId?: string | null
    onRevealTargetHandled?: (requestId: string) => void
    onOpenFile: (node: DevScopeFileTreeNode) => void
    onExpandDirectory: (node: DevScopeFileTreeNode) => void | Promise<void>
    getNodeActions: (node: DevScopeFileTreeNode) => FileActionsMenuItem[]
}) {
    const rowHeight = nameLayout === 'wrap' ? 40 : 24
    const selectedPathKey = normalizePreviewTreePath(selectedPath || '')
    const rootPathKey = normalizePreviewTreePath(rootPath)
    const requestedExpansionKeys = useMemo(
        () => new Set([...expandedPathKeys].map(normalizePreviewTreePath)),
        [expandedPathKeys]
    )
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(requestedExpansionKeys))
    const [activeKey, setActiveKey] = useState(selectedPathKey)
    const [menuState, setMenuState] = useState<PreviewTreeMenuState>(null)
    const expandedKeysRef = useRef(expandedKeys)
    const appliedAutoExpansionPathsRef = useRef(new Set<string>())
    const mountedRootPathRef = useRef(rootPathKey)
    const appliedCollapseAllRequestRef = useRef(0)
    const appliedRevealRequestsRef = useRef(new Set<string>())
    const pendingDirectoryLoadsRef = useRef(new Set<string>())
    const pendingFocusKeyRef = useRef<string | null>(null)
    const menuStateRef = useRef<PreviewTreeMenuState>(menuState)
    const rowElementsRef = useRef(new Map<string, HTMLDivElement>())
    const typeNavigationRef = useRef({ value: '', updatedAt: 0 })
    menuStateRef.current = menuState

    const visibleTreeModel = useMemo(
        () => buildVisiblePreviewTreeModel(nodes, expandedKeys),
        [expandedKeys, nodes]
    )
    const { rows, rowIndexByKey, horizontalContentWidth } = visibleTreeModel
    const { range, scrollElementRef, scrollToIndex } = usePreviewVirtualWindow({
        rowCount: rows.length,
        rowHeight
    })

    useEffect(() => {
        if (mountedRootPathRef.current === rootPathKey) return
        mountedRootPathRef.current = rootPathKey
        appliedAutoExpansionPathsRef.current.clear()
        const nextExpandedKeys = new Set(requestedExpansionKeys)
        expandedKeysRef.current = nextExpandedKeys
        setExpandedKeys(nextExpandedKeys)
    }, [requestedExpansionKeys, rootPathKey])

    useEffect(() => {
        const additions: string[] = []
        for (const pathKey of requestedExpansionKeys) {
            if (appliedAutoExpansionPathsRef.current.has(pathKey)) continue
            appliedAutoExpansionPathsRef.current.add(pathKey)
            if (!expandedKeysRef.current.has(pathKey)) additions.push(pathKey)
        }
        if (additions.length === 0) return
        const nextExpandedKeys = new Set(expandedKeysRef.current)
        additions.forEach((pathKey) => nextExpandedKeys.add(pathKey))
        expandedKeysRef.current = nextExpandedKeys
        setExpandedKeys(nextExpandedKeys)
    }, [requestedExpansionKeys])

    useEffect(() => {
        if (collapseAllRequest <= appliedCollapseAllRequestRef.current) return
        appliedCollapseAllRequestRef.current = collapseAllRequest
        const nextExpandedKeys = new Set<string>()
        expandedKeysRef.current = nextExpandedKeys
        setExpandedKeys(nextExpandedKeys)
    }, [collapseAllRequest])

    useEffect(() => {
        if (selectedPathKey) setActiveKey(selectedPathKey)
    }, [selectedPathKey])

    useEffect(() => {
        if (rows.length === 0) return
        if (activeKey && rowIndexByKey.has(activeKey)) return
        setActiveKey(rows[0].key)
    }, [activeKey, rowIndexByKey, rows])

    useEffect(() => {
        if (
            !revealTargetRequestId
            || !selectedPathKey
            || appliedRevealRequestsRef.current.has(revealTargetRequestId)
        ) return
        const targetIndex = rowIndexByKey.get(selectedPathKey)
        if (targetIndex === undefined) return
        setActiveKey(selectedPathKey)
        const frameId = window.requestAnimationFrame(() => {
            scrollToIndex(targetIndex, 'auto')
            appliedRevealRequestsRef.current.add(revealTargetRequestId)
            onRevealTargetHandled?.(revealTargetRequestId)
        })
        return () => window.cancelAnimationFrame(frameId)
    }, [onRevealTargetHandled, revealTargetRequestId, rowIndexByKey, scrollToIndex, selectedPathKey])

    useEffect(() => {
        const pendingFocusKey = pendingFocusKeyRef.current
        if (!pendingFocusKey || pendingFocusKey !== activeKey) return
        const element = rowElementsRef.current.get(pendingFocusKey)
        if (!element) return
        pendingFocusKeyRef.current = null
        element.focus({ preventScroll: true })
    }, [activeKey, range])

    const closeMenu = useCallback((options?: { restoreFocus?: boolean }) => {
        const menuPathKey = menuStateRef.current
            ? normalizePreviewTreePath(menuStateRef.current.node.path)
            : null
        setMenuState(null)
        if (options?.restoreFocus !== true || !menuPathKey) return
        window.requestAnimationFrame(() => {
            rowElementsRef.current.get(menuPathKey)?.focus({ preventScroll: true })
        })
    }, [])

    useEffect(() => {
        if (!menuState) return
        const scrollElement = scrollElementRef.current
        const handleScroll = () => closeMenu({ restoreFocus: false })
        scrollElement?.addEventListener('scroll', handleScroll, { passive: true })
        return () => scrollElement?.removeEventListener('scroll', handleScroll)
    }, [closeMenu, menuState, scrollElementRef])

    const requestDirectoryLoad = useCallback((node: DevScopeFileTreeNode) => {
        if (node.type !== 'directory' || node.childrenLoaded === true) return
        const pathKey = normalizePreviewTreePath(node.path)
        if (pendingDirectoryLoadsRef.current.has(pathKey)) return
        pendingDirectoryLoadsRef.current.add(pathKey)
        void Promise.resolve(onExpandDirectory(node)).finally(() => {
            pendingDirectoryLoadsRef.current.delete(pathKey)
        })
    }, [onExpandDirectory])

    const toggleDirectory = useCallback((node: DevScopeFileTreeNode, forceExpanded?: boolean) => {
        if (node.type !== 'directory') return
        const pathKey = normalizePreviewTreePath(node.path)
        const nextExpanded = forceExpanded ?? !expandedKeysRef.current.has(pathKey)
        const nextExpandedKeys = new Set(expandedKeysRef.current)
        if (nextExpanded) nextExpandedKeys.add(pathKey)
        else nextExpandedKeys.delete(pathKey)
        expandedKeysRef.current = nextExpandedKeys
        setExpandedKeys(nextExpandedKeys)
        if (nextExpanded) requestDirectoryLoad(node)
    }, [requestDirectoryLoad])

    const openFile = useCallback((row: PreviewVirtualTreeRow) => {
        setActiveKey(row.key)
        if (row.key !== selectedPathKey) onOpenFile(row.node)
    }, [onOpenFile, selectedPathKey])

    const activateRowAtIndex = useCallback((index: number) => {
        const row = rows[Math.max(0, Math.min(rows.length - 1, index))]
        if (!row) return
        pendingFocusKeyRef.current = row.key
        setActiveKey(row.key)
        scrollToIndex(index, 'auto')
    }, [rows, scrollToIndex])

    const openMenuForRow = useCallback((row: PreviewVirtualTreeRow, anchor: PreviewTreeMenuAnchor) => {
        setActiveKey(row.key)
        setMenuState({ node: row.node, anchor })
    }, [])

    const handleRowKeyDown = useCallback((
        event: ReactKeyboardEvent<HTMLDivElement>,
        row: PreviewVirtualTreeRow,
        rowIndex: number
    ) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            activateRowAtIndex(rowIndex + 1)
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            activateRowAtIndex(rowIndex - 1)
            return
        }
        if (event.key === 'Home') {
            event.preventDefault()
            activateRowAtIndex(0)
            return
        }
        if (event.key === 'End') {
            event.preventDefault()
            activateRowAtIndex(rows.length - 1)
            return
        }
        if (event.key === 'ArrowRight' && row.node.type === 'directory') {
            event.preventDefault()
            if (!expandedKeysRef.current.has(row.key)) {
                toggleDirectory(row.node, true)
                return
            }
            const childIndex = rowIndex + 1
            if (rows[childIndex]?.parentKey === row.key) activateRowAtIndex(childIndex)
            return
        }
        if (event.key === 'ArrowLeft') {
            if (row.node.type === 'directory' && expandedKeysRef.current.has(row.key)) {
                event.preventDefault()
                toggleDirectory(row.node, false)
                return
            }
            const parentIndex = row.parentKey ? rowIndexByKey.get(row.parentKey) : undefined
            if (parentIndex !== undefined) {
                event.preventDefault()
                activateRowAtIndex(parentIndex)
            }
            return
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (row.node.type === 'directory') toggleDirectory(row.node)
            else openFile(row)
            return
        }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            openMenuForRow(row, getPreviewTreeMenuAnchor(event.currentTarget.getBoundingClientRect()))
            return
        }
        if (event.key === 'F2') {
            const renameAction = getNodeActions(row.node).find((item) => item.id === 'rename' && !item.disabled)
            if (renameAction) {
                event.preventDefault()
                void renameAction.onSelect()
            }
            return
        }
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.key === ' ') return
        const now = performance.now()
        const previousNavigation = typeNavigationRef.current
        const nextValue = now - previousNavigation.updatedAt < 700
            ? `${previousNavigation.value}${event.key.toLowerCase()}`
            : event.key.toLowerCase()
        typeNavigationRef.current = { value: nextValue, updatedAt: now }
        for (let offset = 1; offset <= rows.length; offset += 1) {
            const candidateIndex = (rowIndex + offset) % rows.length
            if (rows[candidateIndex]?.node.name.toLowerCase().startsWith(nextValue)) {
                event.preventDefault()
                activateRowAtIndex(candidateIndex)
                break
            }
        }
    }, [activateRowAtIndex, getNodeActions, openFile, openMenuForRow, rowIndexByKey, rows, toggleDirectory])

    const visibleRows = rows.slice(range.start, range.end)
    const menuItems = menuState ? getNodeActions(menuState.node) : []

    return (
        <>
            <div
                ref={scrollElementRef}
                role="tree"
                aria-label="Preview project files"
                className={cn(
                    'min-h-0 flex-1 overscroll-contain [scrollbar-gutter:stable]',
                    nameLayout === 'horizontal' ? 'overflow-auto' : 'overflow-x-hidden overflow-y-auto'
                )}
            >
                <div
                    className="relative min-w-full"
                    style={{
                        height: rows.length * rowHeight,
                        width: nameLayout === 'horizontal' ? `max(100%, ${horizontalContentWidth}px)` : '100%'
                    }}
                >
                    {visibleRows.map((row, visibleIndex) => {
                        const rowIndex = range.start + visibleIndex
                        const directory = row.node.type === 'directory'
                        const expanded = directory && expandedKeys.has(row.key)
                        const active = activeKey === row.key
                        return (
                            <div
                                key={row.key}
                                ref={(element) => {
                                    if (element) rowElementsRef.current.set(row.key, element)
                                    else rowElementsRef.current.delete(row.key)
                                }}
                                role="treeitem"
                                tabIndex={active ? 0 : -1}
                                aria-level={row.depth + 1}
                                aria-posinset={row.positionInSet}
                                aria-setsize={row.setSize}
                                aria-expanded={directory ? expanded : undefined}
                                aria-selected={active}
                                data-preview-tree-row={row.key}
                                className={cn(
                                    'group/tree-row absolute left-0 flex w-full cursor-default items-center rounded-[5px] pr-1 text-xs text-sparkle-text-secondary outline-none transition-colors',
                                    active
                                        ? 'bg-[color-mix(in_srgb,var(--accent-primary,#38bdf8)_16%,transparent)] text-sparkle-text'
                                        : 'hover:bg-white/[0.055] focus:bg-white/[0.055]'
                                )}
                                style={{
                                    height: rowHeight,
                                    transform: `translateY(${rowIndex * rowHeight}px)`,
                                    paddingLeft: 3 + row.depth * 12
                                }}
                                onClick={() => {
                                    setActiveKey(row.key)
                                    if (directory) toggleDirectory(row.node)
                                    else openFile(row)
                                }}
                                onContextMenu={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    openMenuForRow(row, {
                                        left: event.clientX,
                                        right: event.clientX,
                                        top: event.clientY,
                                        bottom: event.clientY,
                                        width: 0
                                    })
                                }}
                                onKeyDown={(event) => handleRowKeyDown(event, row, rowIndex)}
                            >
                                {directory ? (
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        aria-label={expanded ? `Collapse ${row.node.name}` : `Expand ${row.node.name}`}
                                        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-sparkle-text-muted hover:text-sparkle-text"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            setActiveKey(row.key)
                                            toggleDirectory(row.node)
                                        }}
                                    >
                                        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                    </button>
                                ) : <span className="size-4 shrink-0" aria-hidden="true" />}
                                <VscodeEntryIcon
                                    pathValue={row.node.path}
                                    kind={directory ? 'directory' : 'file'}
                                    theme={theme}
                                    className="mx-0.5 size-4"
                                    loading="lazy"
                                />
                                <span className={cn(
                                    'min-w-0 flex-1',
                                    nameLayout === 'wrap'
                                        ? 'line-clamp-2 overflow-hidden break-all leading-[14px]'
                                        : 'whitespace-nowrap'
                                )}>
                                    {row.node.name}
                                </span>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-sparkle-text-muted opacity-0 hover:bg-white/[0.08] hover:text-sparkle-text group-hover/tree-row:opacity-100 group-focus-within/tree-row:opacity-100"
                                    title={`Actions for ${row.node.name}`}
                                    aria-label={`Actions for ${row.node.name}`}
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        openMenuForRow(row, getPreviewTreeMenuAnchor(event.currentTarget.getBoundingClientRect()))
                                    }}
                                >
                                    <MoreHorizontal className="size-3.5" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
            {menuState ? (
                <PreviewTreeContextMenu
                    items={menuItems}
                    anchor={menuState.anchor}
                    onClose={closeMenu}
                />
            ) : null}
        </>
    )
}

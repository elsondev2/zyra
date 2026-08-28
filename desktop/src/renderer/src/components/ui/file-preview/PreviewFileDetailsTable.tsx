import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { cn } from '@/lib/utils'
import { FileSystemEntryIcon } from './FileSystemEntryIcon'
import { applyIconGridSelection, iconGridSelectionsEqual } from './previewIconGridSelection'
import { PreviewTreeContextMenu, type PreviewTreeMenuAnchor } from './PreviewTreeContextMenu'
import { usePreviewVirtualWindow } from './usePreviewVirtualWindow'

const DETAILS_ROW_HEIGHT = 34
type SortColumn = 'name' | 'modified' | 'type' | 'size'
type SortDirection = 'asc' | 'desc'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
})

function fileExtension(node: DevScopeFileTreeNode): string {
    if (node.type === 'directory') return ''
    const dot = node.name.lastIndexOf('.')
    return dot > 0 ? node.name.slice(dot + 1).toLowerCase() : ''
}

function fileTypeLabel(node: DevScopeFileTreeNode): string {
    if (node.type === 'directory') return 'File folder'
    const extension = fileExtension(node)
    return extension ? `${extension.toUpperCase()} file` : 'File'
}

function formatFileSize(node: DevScopeFileTreeNode): string {
    if (node.type === 'directory' || typeof node.size !== 'number') return ''
    if (node.size < 1024) return `${node.size} B`
    if (node.size < 1024 ** 2) return `${Math.max(0.1, node.size / 1024).toFixed(node.size < 10 * 1024 ? 1 : 0)} KB`
    if (node.size < 1024 ** 3) return `${(node.size / 1024 ** 2).toFixed(node.size < 10 * 1024 ** 2 ? 1 : 0)} MB`
    return `${(node.size / 1024 ** 3).toFixed(1)} GB`
}

function compareNodes(left: DevScopeFileTreeNode, right: DevScopeFileTreeNode, column: SortColumn): number {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
    if (column === 'modified') return (left.modifiedAt || 0) - (right.modifiedAt || 0)
    if (column === 'size') return (left.size || 0) - (right.size || 0)
    if (column === 'type') return fileTypeLabel(left).localeCompare(fileTypeLabel(right)) || left.name.localeCompare(right.name)
    return left.name.localeCompare(right.name)
}

const DetailsRow = memo(function DetailsRow({
    node,
    index,
    selected,
    active,
    light,
    setElement,
    onSelect,
    onOpen,
    onPrefetch,
    onKeyDown,
    onOpenMenu
}: {
    node: DevScopeFileTreeNode
    index: number
    selected: boolean
    active: boolean
    light: boolean
    setElement: (path: string, element: HTMLDivElement | null) => void
    onSelect: (event: MouseEvent<HTMLDivElement>, node: DevScopeFileTreeNode, index: number) => void
    onOpen: (node: DevScopeFileTreeNode) => void
    onPrefetch?: (node: DevScopeFileTreeNode) => void
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>, node: DevScopeFileTreeNode, index: number) => void
    onOpenMenu: (event: MouseEvent<HTMLElement>, node: DevScopeFileTreeNode, index: number) => void
}) {
    return (
        <div
            ref={(element) => setElement(node.path, element)}
            role="row"
            tabIndex={active ? 0 : -1}
            aria-selected={selected}
            data-explorer-details-row={node.path}
            className={cn(
                'group absolute inset-x-0 grid cursor-default grid-cols-[minmax(240px,1fr)_170px_130px_88px] items-center border-b border-white/[0.035] px-2 text-[10px] outline-none',
                selected
                    ? 'bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-sparkle-text shadow-[inset_2px_0_0_var(--accent-primary)]'
                    : 'text-sparkle-text-secondary hover:bg-white/[0.035] focus:bg-white/[0.045]'
            )}
            style={{ height: DETAILS_ROW_HEIGHT, transform: `translateY(${index * DETAILS_ROW_HEIGHT}px)` }}
            onClick={(event) => onSelect(event, node, index)}
            onDoubleClick={() => onOpen(node)}
            onPointerEnter={() => {
                if (node.type === 'file') onPrefetch?.(node)
            }}
            onKeyDown={(event) => onKeyDown(event, node, index)}
            onContextMenu={(event) => onOpenMenu(event, node, index)}
        >
            <div role="cell" className="flex min-w-0 items-center gap-2 pr-3">
                <FileSystemEntryIcon path={node.path} kind={node.type} light={light} size={16} />
                <span className="min-w-0 flex-1 truncate" title={node.name}>{node.name}</span>
            </div>
            <div role="cell" className="truncate pr-3 text-sparkle-text-muted/65">
                {typeof node.modifiedAt === 'number' ? dateFormatter.format(node.modifiedAt) : '—'}
            </div>
            <div role="cell" className="truncate pr-3 text-sparkle-text-muted/65">{fileTypeLabel(node)}</div>
            <div role="cell" className="truncate text-right font-mono text-[9px] text-sparkle-text-muted/65">{formatFileSize(node)}</div>
        </div>
    )
})

export function PreviewFileDetailsTable({
    nodes,
    selectedPath,
    light = false,
    onOpenFile,
    onPrefetchFile,
    onOpenDirectory,
    onSelectionCountChange,
    getNodeActions,
    getSelectionActions
}: {
    nodes: DevScopeFileTreeNode[]
    selectedPath?: string
    light?: boolean
    onOpenFile: (node: DevScopeFileTreeNode) => void
    onPrefetchFile?: (node: DevScopeFileTreeNode) => void
    onOpenDirectory: (node: DevScopeFileTreeNode) => void
    onSelectionCountChange?: (count: number) => void
    getNodeActions: (node: DevScopeFileTreeNode) => FileActionsMenuItem[]
    getSelectionActions?: (nodes: DevScopeFileTreeNode[]) => FileActionsMenuItem[]
}) {
    const [sortColumn, setSortColumn] = useState<SortColumn>('name')
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => selectedPath ? new Set([selectedPath]) : new Set())
    const [activePath, setActivePath] = useState(selectedPath || nodes[0]?.path || '')
    const [menuState, setMenuState] = useState<{ items: FileActionsMenuItem[]; anchor: PreviewTreeMenuAnchor } | null>(null)
    const selectedPathsRef = useRef(selectedPaths)
    const selectionAnchorIndexRef = useRef<number | null>(null)
    const rowElementsRef = useRef(new Map<string, HTMLDivElement>())
    const pendingFocusPathRef = useRef<string | null>(null)
    selectedPathsRef.current = selectedPaths

    const sortedNodes = useMemo(() => {
        const direction = sortDirection === 'asc' ? 1 : -1
        return [...nodes].sort((left, right) => left.type !== right.type
            ? left.type === 'directory' ? -1 : 1
            : compareNodes(left, right, sortColumn) * direction)
    }, [nodes, sortColumn, sortDirection])
    const orderedPaths = useMemo(() => sortedNodes.map((node) => node.path), [sortedNodes])
    const pathSet = useMemo(() => new Set(orderedPaths), [orderedPaths])
    const pathIndex = useMemo(() => new Map(orderedPaths.map((path, index) => [path, index] as const)), [orderedPaths])
    const restoreKey = `workspace-details:${sortedNodes[0]?.path.replace(/[\\/][^\\/]+$/, '') || selectedPath || ''}`
    const { range, scrollElementRef, scrollToIndex } = usePreviewVirtualWindow({
        rowCount: sortedNodes.length,
        rowHeight: DETAILS_ROW_HEIGHT,
        restoreKey,
        overscanRows: 8,
        guardRows: 3
    })
    const visibleNodes = sortedNodes.slice(range.start, range.end)

    useEffect(() => {
        setSelectedPaths((current) => {
            const next = new Set([...current].filter((path) => pathSet.has(path)))
            if (next.size === 0 && selectedPath && pathSet.has(selectedPath)) next.add(selectedPath)
            return iconGridSelectionsEqual(current, next) ? current : next
        })
        setActivePath((current) => pathSet.has(current) ? current : selectedPath && pathSet.has(selectedPath) ? selectedPath : orderedPaths[0] || '')
    }, [orderedPaths, pathSet, selectedPath])
    useEffect(() => onSelectionCountChange?.(selectedPaths.size), [onSelectionCountChange, selectedPaths.size])
    useEffect(() => () => onSelectionCountChange?.(0), [onSelectionCountChange])
    useEffect(() => {
        const pendingPath = pendingFocusPathRef.current
        if (!pendingPath) return
        const element = rowElementsRef.current.get(pendingPath)
        if (!element) return
        pendingFocusPathRef.current = null
        element.focus({ preventScroll: true })
    }, [range])

    const replaceSelection = useCallback((next: Set<string>) => {
        setSelectedPaths((current) => iconGridSelectionsEqual(current, next) ? current : next)
    }, [])
    const setRowElement = useCallback((path: string, element: HTMLDivElement | null) => {
        if (element) rowElementsRef.current.set(path, element)
        else rowElementsRef.current.delete(path)
    }, [])
    const openNode = useCallback((node: DevScopeFileTreeNode) => {
        setActivePath(node.path)
        replaceSelection(new Set([node.path]))
        selectionAnchorIndexRef.current = pathIndex.get(node.path) ?? null
        if (node.type === 'directory') onOpenDirectory(node)
        else onOpenFile(node)
    }, [onOpenDirectory, onOpenFile, pathIndex, replaceSelection])
    const selectRow = useCallback((event: MouseEvent<HTMLDivElement>, node: DevScopeFileTreeNode, index: number) => {
        const additive = event.ctrlKey || event.metaKey
        const mode = event.shiftKey ? (additive ? 'range-add' : 'range') : additive ? 'toggle' : 'replace'
        const result = applyIconGridSelection(orderedPaths, selectedPathsRef.current, index, selectionAnchorIndexRef.current, mode)
        selectionAnchorIndexRef.current = result.anchorIndex
        setActivePath(node.path)
        replaceSelection(result.selected)
    }, [orderedPaths, replaceSelection])
    const activateIndex = useCallback((index: number) => {
        const safeIndex = Math.max(0, Math.min(sortedNodes.length - 1, index))
        const node = sortedNodes[safeIndex]
        if (!node) return
        setActivePath(node.path)
        replaceSelection(new Set([node.path]))
        selectionAnchorIndexRef.current = safeIndex
        pendingFocusPathRef.current = node.path
        scrollToIndex(safeIndex)
    }, [replaceSelection, scrollToIndex, sortedNodes])
    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, node: DevScopeFileTreeNode, index: number) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault()
            replaceSelection(new Set(orderedPaths))
            return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            activateIndex(event.key === 'Home' ? 0 : event.key === 'End' ? sortedNodes.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1))
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            replaceSelection(new Set())
            return
        }
        if (event.key === ' ') {
            event.preventDefault()
            const result = applyIconGridSelection(orderedPaths, selectedPathsRef.current, index, selectionAnchorIndexRef.current, event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'range' : 'replace')
            selectionAnchorIndexRef.current = result.anchorIndex
            replaceSelection(result.selected)
            return
        }
        if (event.key === 'Enter') {
            event.preventDefault()
            openNode(node)
        }
    }, [activateIndex, openNode, orderedPaths, replaceSelection, sortedNodes.length])
    const openMenu = useCallback((event: MouseEvent<HTMLElement>, node: DevScopeFileTreeNode, index: number) => {
        event.preventDefault()
        event.stopPropagation()
        let effectiveSelection = selectedPathsRef.current
        if (!effectiveSelection.has(node.path)) {
            effectiveSelection = new Set([node.path])
            replaceSelection(effectiveSelection)
        }
        setActivePath(node.path)
        selectionAnchorIndexRef.current = index
        const selectedNodes = sortedNodes.filter((candidate) => effectiveSelection.has(candidate.path))
        const items = selectedNodes.length > 1 && getSelectionActions ? getSelectionActions(selectedNodes) : getNodeActions(node)
        setMenuState({ items, anchor: { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY, width: 0 } })
    }, [getNodeActions, getSelectionActions, replaceSelection, sortedNodes])
    const toggleSort = useCallback((column: SortColumn) => {
        if (column === sortColumn) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
        else {
            setSortColumn(column)
            setSortDirection('asc')
        }
    }, [sortColumn])

    return (
        <div className="flex min-h-0 min-w-[680px] flex-1 flex-col overflow-hidden" role="table" aria-label="Workspace details view" aria-colcount={4} aria-rowcount={sortedNodes.length}>
            <div role="row" className="grid h-8 shrink-0 grid-cols-[minmax(240px,1fr)_170px_130px_88px] items-center border-b border-white/[0.065] bg-[color-mix(in_srgb,var(--color-bg)_97%,black)] px-2 text-[8px] font-semibold text-sparkle-text-muted/55">
                <DetailsHeader label="Name" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={toggleSort} />
                <DetailsHeader label="Date modified" column="modified" activeColumn={sortColumn} direction={sortDirection} onSort={toggleSort} />
                <DetailsHeader label="Type" column="type" activeColumn={sortColumn} direction={sortDirection} onSort={toggleSort} />
                <DetailsHeader label="Size" column="size" activeColumn={sortColumn} direction={sortDirection} onSort={toggleSort} align="right" />
            </div>
            <div ref={scrollElementRef} role="rowgroup" className="project-surface-scrollbar relative min-h-0 flex-1 overflow-auto">
                <div className="relative min-w-[680px]" style={{ height: sortedNodes.length * DETAILS_ROW_HEIGHT }}>
                    {visibleNodes.map((node, visibleIndex) => {
                        const index = range.start + visibleIndex
                        return (
                            <DetailsRow
                                key={node.path}
                                node={node}
                                index={index}
                                selected={selectedPaths.has(node.path)}
                                active={activePath === node.path}
                                light={light}
                                setElement={setRowElement}
                                onSelect={selectRow}
                                onOpen={openNode}
                                onPrefetch={onPrefetchFile}
                                onKeyDown={handleKeyDown}
                                onOpenMenu={openMenu}
                            />
                        )
                    })}
                </div>
            </div>
            {menuState ? <PreviewTreeContextMenu items={menuState.items} anchor={menuState.anchor} onClose={() => setMenuState(null)} /> : null}
        </div>
    )
}

function DetailsHeader({
    label,
    column,
    activeColumn,
    direction,
    onSort,
    align = 'left'
}: {
    label: string
    column: SortColumn
    activeColumn: SortColumn
    direction: SortDirection
    onSort: (column: SortColumn) => void
    align?: 'left' | 'right'
}) {
    const active = activeColumn === column
    return (
        <button
            type="button"
            role="columnheader"
            onClick={() => onSort(column)}
            className={cn('flex h-full min-w-0 items-center gap-1 border-r border-white/[0.045] px-2 hover:bg-white/[0.035] hover:text-sparkle-text-secondary', align === 'right' && 'justify-end border-r-0')}
            aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}
        >
            <span className="truncate">{label}</span>
            {active ? direction === 'asc' ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" /> : null}
        </button>
    )
}

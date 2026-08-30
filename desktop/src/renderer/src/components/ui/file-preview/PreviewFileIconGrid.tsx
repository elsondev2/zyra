import {
    useCallback,
    useEffect,
    useLayoutEffect,
    memo,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent as ReactPointerEvent
} from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { cn } from '@/lib/utils'
import { FileSystemEntryIcon } from './FileSystemEntryIcon'
import {
    applyIconGridSelection,
    iconGridSelectionsEqual,
    mergeIconGridMarqueeSelection,
    rectanglesIntersect
} from './previewIconGridSelection'
import { getFileThumbnailUrl } from './utils'
import { PreviewTreeContextMenu, type PreviewTreeMenuAnchor } from './PreviewTreeContextMenu'
import { usePreviewVirtualWindow } from './usePreviewVirtualWindow'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'])
const ICON_GRID_HORIZONTAL_PADDING = 12
const ICON_GRID_MIN_ITEM_WIDTH = 92
const ICON_GRID_COLUMN_GAP = 8
const ICON_GRID_ITEM_HEIGHT = 106
const ICON_GRID_ROW_GAP = 12
const ICON_GRID_ROW_PITCH = ICON_GRID_ITEM_HEIGHT + ICON_GRID_ROW_GAP

type MarqueeBox = { left: number; top: number; width: number; height: number }
type DragSelectionState = {
    pointerId: number
    startContentX: number
    startContentY: number
    baseSelection: Set<string>
}

function isImageFile(node: DevScopeFileTreeNode): boolean {
    if (node.type !== 'file') return false
    const name = node.name.toLowerCase()
    const extension = name.includes('.') ? name.split('.').pop() || '' : ''
    return IMAGE_EXTENSIONS.has(extension)
}

function getParentPath(pathValue: string): string {
    const normalized = pathValue.replace(/\\/g, '/')
    return normalized.slice(0, Math.max(0, normalized.lastIndexOf('/')))
}

const PreviewFileIconCell = memo(function PreviewFileIconCell({
    node,
    index,
    columnCount,
    selected,
    light,
    onSelect,
    onOpen,
    onPrefetch,
    onKeyDown,
    onOpenMenu
}: {
    node: DevScopeFileTreeNode
    index: number
    columnCount: number
    selected: boolean
    light: boolean
    onSelect: (event: MouseEvent<HTMLButtonElement>, node: DevScopeFileTreeNode, index: number) => void
    onOpen: (node: DevScopeFileTreeNode) => void
    onPrefetch?: (node: DevScopeFileTreeNode) => void
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, node: DevScopeFileTreeNode, index: number) => void
    onOpenMenu: (event: MouseEvent<HTMLElement>, node: DevScopeFileTreeNode, index: number) => void
}) {
    const image = isImageFile(node)
    const thumbnailUrl = image ? getFileThumbnailUrl(node.path) : ''
    return (
        <button
            data-explorer-icon-item="true"
            type="button"
            role="gridcell"
            aria-selected={selected}
            aria-rowindex={Math.floor(index / columnCount) + 1}
            aria-colindex={(index % columnCount) + 1}
            onClick={(event) => onSelect(event, node, index)}
            onDoubleClick={() => onOpen(node)}
            onPointerEnter={() => {
                if (node.type === 'file') onPrefetch?.(node)
            }}
            onKeyDown={(event) => onKeyDown(event, node, index)}
            onContextMenu={(event) => onOpenMenu(event, node, index)}
            className={cn('group relative flex h-[106px] min-w-0 flex-col items-center justify-start rounded-lg px-2 py-2 text-center outline-none transition-[background-color,box-shadow,transform] duration-150', selected ? 'text-sparkle-text' : 'hover:bg-white/[0.035] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]/45')}
            style={selected ? {
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-primary) 17%, transparent), color-mix(in srgb, var(--accent-primary) 9%, transparent))',
                boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 68%, transparent), 0 7px 22px color-mix(in srgb, var(--accent-primary) 10%, transparent)'
            } : undefined}
            title={`${node.name}\n${node.path}`}
        >
            {image ? (
                <span className="relative flex h-14 w-full max-w-[76px] items-center justify-center overflow-hidden rounded-md bg-black/20 ring-1 ring-white/[0.07]">
                    <img src={thumbnailUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" fetchPriority="low" draggable={false} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-md" />
                    <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" draggable={false} className="relative z-[1] max-h-full max-w-full object-contain" />
                </span>
            ) : (
                <span className="flex size-14 items-center justify-center">
                    <FileSystemEntryIcon path={node.path} kind={node.type} light={light} size={node.type === 'directory' ? 52 : 44} />
                </span>
            )}
            <span className={cn('mt-1.5 line-clamp-2 max-w-full break-words text-[9px] leading-3.5 group-hover:text-sparkle-text', selected ? 'font-medium text-sparkle-text' : 'text-sparkle-text-secondary')}>{node.name}</span>
        </button>
    )
})

export function PreviewFileIconGrid({
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
    const initialSelection = selectedPath ? new Set([selectedPath]) : new Set<string>()
    const [selectedNodePaths, setSelectedNodePaths] = useState(initialSelection)
    const [menuState, setMenuState] = useState<{ items: FileActionsMenuItem[]; anchor: PreviewTreeMenuAnchor } | null>(null)
    const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null)
    const [gridWidth, setGridWidth] = useState(0)
    const selectedNodePathsRef = useRef(selectedNodePaths)
    const selectionAnchorIndexRef = useRef<number | null>(null)
    const dragSelectionRef = useRef<DragSelectionState | null>(null)
    const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null)
    const marqueeFrameRef = useRef<number | null>(null)
    selectedNodePathsRef.current = selectedNodePaths

    const nodePaths = useMemo(() => nodes.map((node) => node.path), [nodes])
    const nodePathSet = useMemo(() => new Set(nodePaths), [nodePaths])
    const nodePathIndex = useMemo(() => new Map(nodePaths.map((path, index) => [path, index] as const)), [nodePaths])
    const columnCount = Math.max(1, Math.floor((gridWidth + ICON_GRID_COLUMN_GAP) / (ICON_GRID_MIN_ITEM_WIDTH + ICON_GRID_COLUMN_GAP)))
    const rowCount = Math.ceil(nodes.length / columnCount)
    const restoreKey = `workspace-icons:${getParentPath(nodes[0]?.path || selectedPath || '')}`
    const { range, scrollElementRef } = usePreviewVirtualWindow({
        rowCount,
        rowHeight: ICON_GRID_ROW_PITCH,
        restoreKey,
        overscanRows: 1,
        guardRows: 1
    })
    const virtualNodeStart = Math.min(nodes.length, range.start * columnCount)
    const virtualNodeEnd = Math.min(nodes.length, range.end * columnCount)
    const virtualNodes = useMemo(
        () => nodes.slice(virtualNodeStart, virtualNodeEnd),
        [nodes, virtualNodeEnd, virtualNodeStart]
    )
    const virtualGridTop = range.start * ICON_GRID_ROW_PITCH
    const virtualContentHeight = rowCount > 0
        ? (rowCount - 1) * ICON_GRID_ROW_PITCH + ICON_GRID_ITEM_HEIGHT
        : 0

    useLayoutEffect(() => {
        const scrollElement = scrollElementRef.current
        if (!scrollElement) return
        const updateWidth = () => {
            const nextWidth = Math.max(0, scrollElement.clientWidth - ICON_GRID_HORIZONTAL_PADDING * 2)
            setGridWidth((current) => Math.abs(current - nextWidth) < 0.5 ? current : nextWidth)
        }
        updateWidth()
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateWidth)
        observer?.observe(scrollElement)
        if (!observer) window.addEventListener('resize', updateWidth)
        return () => {
            observer?.disconnect()
            if (!observer) window.removeEventListener('resize', updateWidth)
        }
    }, [scrollElementRef])

    useEffect(() => {
        setSelectedNodePaths((current) => {
            const next = new Set([...current].filter((path) => nodePathSet.has(path)))
            if (next.size === 0 && selectedPath && nodePathSet.has(selectedPath)) next.add(selectedPath)
            return iconGridSelectionsEqual(current, next) ? current : next
        })
    }, [nodePathSet, selectedPath])
    useEffect(() => onSelectionCountChange?.(selectedNodePaths.size), [onSelectionCountChange, selectedNodePaths.size])
    useEffect(() => () => onSelectionCountChange?.(0), [onSelectionCountChange])
    useEffect(() => () => {
        if (marqueeFrameRef.current !== null) window.cancelAnimationFrame(marqueeFrameRef.current)
    }, [])

    const replaceSelection = useCallback((next: Set<string>) => {
        setSelectedNodePaths((current) => iconGridSelectionsEqual(current, next) ? current : next)
    }, [])

    const openNode = useCallback((node: DevScopeFileTreeNode) => {
        replaceSelection(new Set([node.path]))
        selectionAnchorIndexRef.current = nodePathIndex.get(node.path) ?? null
        if (node.type === 'directory') onOpenDirectory(node)
        else onOpenFile(node)
    }, [nodePathIndex, onOpenDirectory, onOpenFile, replaceSelection])

    const selectItem = useCallback((event: MouseEvent<HTMLButtonElement>, node: DevScopeFileTreeNode, index: number) => {
        const additive = event.ctrlKey || event.metaKey
        const mode = event.shiftKey ? (additive ? 'range-add' : 'range') : additive ? 'toggle' : 'replace'
        const result = applyIconGridSelection(
            nodePaths,
            selectedNodePathsRef.current,
            index,
            selectionAnchorIndexRef.current,
            mode
        )
        selectionAnchorIndexRef.current = result.anchorIndex
        replaceSelection(result.selected)
    }, [nodePaths, replaceSelection])

    const openMenu = useCallback((event: MouseEvent<HTMLElement>, node: DevScopeFileTreeNode, index: number) => {
        event.preventDefault()
        event.stopPropagation()
        let effectiveSelection = selectedNodePathsRef.current
        if (!effectiveSelection.has(node.path)) {
            effectiveSelection = new Set([node.path])
            replaceSelection(effectiveSelection)
        }
        selectionAnchorIndexRef.current = index
        const selectedNodes = nodes.filter((candidate) => effectiveSelection.has(candidate.path))
        const items = selectedNodes.length > 1 && getSelectionActions
            ? getSelectionActions(selectedNodes)
            : getNodeActions(node)
        setMenuState({ items, anchor: { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY, width: 0 } })
    }, [getNodeActions, getSelectionActions, nodes, replaceSelection])

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, node: DevScopeFileTreeNode, index: number) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault()
            replaceSelection(new Set(nodePaths))
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            replaceSelection(new Set())
            return
        }
        if (event.key === ' ') {
            event.preventDefault()
            const result = applyIconGridSelection(
                nodePaths,
                selectedNodePathsRef.current,
                index,
                selectionAnchorIndexRef.current,
                event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'range' : 'replace'
            )
            selectionAnchorIndexRef.current = result.anchorIndex
            replaceSelection(result.selected)
            return
        }
        if (event.key !== 'Enter') return
        event.preventDefault()
        openNode(node)
    }, [nodePaths, openNode, replaceSelection])

    const applyMarqueePoint = useCallback((clientX: number, clientY: number) => {
        const drag = dragSelectionRef.current
        const scrollElement = scrollElementRef.current
        if (!drag || !scrollElement || gridWidth <= 0) return
        const rect = scrollElement.getBoundingClientRect()
        const edgeSize = 28
        if (clientY < rect.top + edgeSize) scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop - 14)
        else if (clientY > rect.bottom - edgeSize) scrollElement.scrollTop += 14

        const currentContentX = clientX - rect.left + scrollElement.scrollLeft
        const currentContentY = clientY - rect.top + scrollElement.scrollTop
        const left = Math.min(drag.startContentX, currentContentX)
        const top = Math.min(drag.startContentY, currentContentY)
        const right = Math.max(drag.startContentX, currentContentX)
        const bottom = Math.max(drag.startContentY, currentContentY)
        setMarqueeBox({ left, top, width: right - left, height: bottom - top })

        const itemWidth = (gridWidth - Math.max(0, columnCount - 1) * ICON_GRID_COLUMN_GAP) / columnCount
        const firstRow = Math.max(0, Math.floor((top - ICON_GRID_HORIZONTAL_PADDING) / ICON_GRID_ROW_PITCH))
        const lastRow = Math.min(rowCount - 1, Math.floor((bottom - ICON_GRID_HORIZONTAL_PADDING) / ICON_GRID_ROW_PITCH))
        const firstColumn = Math.max(0, Math.floor((left - ICON_GRID_HORIZONTAL_PADDING) / (itemWidth + ICON_GRID_COLUMN_GAP)))
        const lastColumn = Math.min(columnCount - 1, Math.floor((right - ICON_GRID_HORIZONTAL_PADDING) / (itemWidth + ICON_GRID_COLUMN_GAP)))
        const selectionRect = { left, top, right, bottom }
        const intersectingPaths: string[] = []
        for (let row = firstRow; row <= lastRow; row += 1) {
            for (let column = firstColumn; column <= lastColumn; column += 1) {
                const index = row * columnCount + column
                const node = nodes[index]
                if (!node) continue
                const itemLeft = ICON_GRID_HORIZONTAL_PADDING + column * (itemWidth + ICON_GRID_COLUMN_GAP)
                const itemTop = ICON_GRID_HORIZONTAL_PADDING + row * ICON_GRID_ROW_PITCH
                if (rectanglesIntersect(selectionRect, {
                    left: itemLeft,
                    top: itemTop,
                    right: itemLeft + itemWidth,
                    bottom: itemTop + ICON_GRID_ITEM_HEIGHT
                })) intersectingPaths.push(node.path)
            }
        }
        replaceSelection(mergeIconGridMarqueeSelection(drag.baseSelection, intersectingPaths))
    }, [columnCount, gridWidth, nodes, replaceSelection, rowCount, scrollElementRef])

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return
        const target = event.target as Element | null
        if (target?.closest('[data-explorer-icon-item="true"]')) return
        const scrollElement = event.currentTarget
        const rect = scrollElement.getBoundingClientRect()
        const additive = event.ctrlKey || event.metaKey || event.shiftKey
        dragSelectionRef.current = {
            pointerId: event.pointerId,
            startContentX: event.clientX - rect.left + scrollElement.scrollLeft,
            startContentY: event.clientY - rect.top + scrollElement.scrollTop,
            baseSelection: additive ? new Set(selectedNodePathsRef.current) : new Set()
        }
        if (!additive) replaceSelection(new Set())
        scrollElement.setPointerCapture(event.pointerId)
        setMarqueeBox({ left: dragSelectionRef.current.startContentX, top: dragSelectionRef.current.startContentY, width: 0, height: 0 })
    }, [replaceSelection])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragSelectionRef.current?.pointerId !== event.pointerId) return
        event.preventDefault()
        pendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
        if (marqueeFrameRef.current !== null) return
        marqueeFrameRef.current = window.requestAnimationFrame(() => {
            marqueeFrameRef.current = null
            const point = pendingPointerRef.current
            if (point) applyMarqueePoint(point.clientX, point.clientY)
        })
    }, [applyMarqueePoint])

    const finishMarquee = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragSelectionRef.current?.pointerId !== event.pointerId) return
        if (marqueeFrameRef.current !== null) {
            window.cancelAnimationFrame(marqueeFrameRef.current)
            marqueeFrameRef.current = null
        }
        applyMarqueePoint(event.clientX, event.clientY)
        dragSelectionRef.current = null
        pendingPointerRef.current = null
        setMarqueeBox(null)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }, [applyMarqueePoint])

    return (
        <>
            <div
                ref={scrollElementRef}
                className="project-surface-scrollbar relative min-h-0 flex-1 select-none overflow-y-auto p-3"
                role="grid"
                aria-label="Workspace icon view"
                aria-multiselectable="true"
                aria-colcount={columnCount}
                aria-rowcount={rowCount}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishMarquee}
                onPointerCancel={finishMarquee}
            >
                <div className="relative w-full" style={{ height: virtualContentHeight }}>
                    <div
                        className="absolute inset-x-0 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-2 gap-y-3"
                        style={{ top: virtualGridTop }}
                    >
                        {virtualNodes.map((node, virtualIndex) => {
                            const index = virtualNodeStart + virtualIndex
                            return (
                                <PreviewFileIconCell
                                    key={node.path}
                                    node={node}
                                    index={index}
                                    columnCount={columnCount}
                                    selected={selectedNodePaths.has(node.path)}
                                    light={light}
                                    onSelect={selectItem}
                                    onOpen={openNode}
                                    onPrefetch={onPrefetchFile}
                                    onKeyDown={handleKeyDown}
                                    onOpenMenu={openMenu}
                                />
                            )
                        })}
                    </div>
                </div>
                {marqueeBox ? (
                    <div
                        className="pointer-events-none absolute z-20 border border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_18%,transparent)]"
                        style={{ left: marqueeBox.left, top: marqueeBox.top, width: marqueeBox.width, height: marqueeBox.height }}
                        aria-hidden="true"
                    />
                ) : null}
            </div>
            {menuState ? <PreviewTreeContextMenu items={menuState.items} anchor={menuState.anchor} onClose={() => setMenuState(null)} /> : null}
        </>
    )
}

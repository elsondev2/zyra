import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { FileSystemEntryIcon } from './FileSystemEntryIcon'
import { usePreviewVirtualWindow } from './usePreviewVirtualWindow'
import type { PreviewFileSearchEntry } from './usePreviewFileSearch'
import { getPreviewTreeMenuAnchor, PreviewTreeContextMenu, type PreviewTreeMenuAnchor } from './PreviewTreeContextMenu'
import { cn } from '@/lib/utils'

const SEARCH_RESULT_ROW_HEIGHT = 42

function toTreeNode(entry: PreviewFileSearchEntry): DevScopeFileTreeNode {
    return {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        size: undefined,
        modifiedAt: undefined,
        children: entry.type === 'directory' ? undefined : undefined,
        childrenLoaded: false,
        isHidden: entry.isHidden
    }
}

function HighlightedMatch({ value, query }: { value: string; query: string }) {
    const normalizedQuery = query.trim().toLowerCase()
    const matchIndex = normalizedQuery ? value.toLowerCase().indexOf(normalizedQuery) : -1
    if (matchIndex < 0) return <>{value}</>
    return (
        <>
            {value.slice(0, matchIndex)}
            <mark className="bg-transparent font-semibold text-sparkle-text">{value.slice(matchIndex, matchIndex + normalizedQuery.length)}</mark>
            {value.slice(matchIndex + normalizedQuery.length)}
        </>
    )
}

export function PreviewFileSearchResults({
    entries,
    query,
    selectedPath,
    light,
    searching,
    error,
    onOpenFile,
    onOpenDirectory,
    onPrefetchFile,
    getNodeActions
}: {
    entries: PreviewFileSearchEntry[]
    query: string
    selectedPath?: string
    light: boolean
    searching: boolean
    error: string | null
    onOpenFile: (node: DevScopeFileTreeNode) => void
    onOpenDirectory: (node: DevScopeFileTreeNode) => void
    onPrefetchFile?: (node: DevScopeFileTreeNode) => void
    getNodeActions: (node: DevScopeFileTreeNode) => FileActionsMenuItem[]
}) {
    const nodes = useMemo(() => entries.map(toTreeNode), [entries])
    const [activeIndex, setActiveIndex] = useState(0)
    const [menuState, setMenuState] = useState<{ node: DevScopeFileTreeNode; anchor: PreviewTreeMenuAnchor } | null>(null)
    const rowElementsRef = useRef(new Map<number, HTMLButtonElement>())
    const { range, scrollElementRef, scrollToIndex } = usePreviewVirtualWindow({
        rowCount: nodes.length,
        rowHeight: SEARCH_RESULT_ROW_HEIGHT
    })

    useEffect(() => {
        setActiveIndex((current) => Math.max(0, Math.min(nodes.length - 1, current)))
    }, [nodes.length])

    const activate = useCallback((index: number) => {
        if (nodes.length === 0) return
        const nextIndex = Math.max(0, Math.min(nodes.length - 1, index))
        setActiveIndex(nextIndex)
        scrollToIndex(nextIndex)
        window.requestAnimationFrame(() => rowElementsRef.current.get(nextIndex)?.focus({ preventScroll: true }))
    }, [nodes.length, scrollToIndex])

    const openNode = useCallback((node: DevScopeFileTreeNode, newTab = false) => {
        if (node.type === 'directory') {
            onOpenDirectory(node)
            return
        }
        if (newTab) {
            const newTabAction = getNodeActions(node).find((item) => item.id === 'new-tab' && !item.disabled)
            if (newTabAction) {
                void newTabAction.onSelect()
                return
            }
        }
        onOpenFile(node)
    }, [getNodeActions, onOpenDirectory, onOpenFile])

    const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, node: DevScopeFileTreeNode, index: number) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            activate(index + 1)
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            activate(index - 1)
            return
        }
        if (event.key === 'Home') {
            event.preventDefault()
            activate(0)
            return
        }
        if (event.key === 'End') {
            event.preventDefault()
            activate(nodes.length - 1)
            return
        }
        if (event.key === 'Enter') {
            event.preventDefault()
            openNode(node, event.shiftKey || event.ctrlKey || event.metaKey)
            return
        }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            setMenuState({ node, anchor: getPreviewTreeMenuAnchor(event.currentTarget.getBoundingClientRect()) })
            return
        }
        if (event.key === 'F2') {
            const renameAction = getNodeActions(node).find((item) => item.id === 'rename' && !item.disabled)
            if (renameAction) {
                event.preventDefault()
                void renameAction.onSelect()
            }
        }
    }, [activate, getNodeActions, nodes.length, openNode])

    if (nodes.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 items-start justify-center px-4 py-7 text-center text-[10px] text-sparkle-text-muted/55" role="status">
                {error || (searching ? 'Searching project files…' : `No results for “${query.trim()}”.`)}
            </div>
        )
    }

    const visibleNodes = nodes.slice(range.start, range.end)
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={scrollElementRef} role="listbox" aria-label="File search results" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                <div className="relative min-w-full" style={{ height: nodes.length * SEARCH_RESULT_ROW_HEIGHT }}>
                    {visibleNodes.map((node, visibleIndex) => {
                        const rowIndex = range.start + visibleIndex
                        const entry = entries[rowIndex]
                        const active = rowIndex === activeIndex
                        const selected = node.path === selectedPath
                        return (
                            <button
                                key={node.path}
                                ref={(element) => {
                                    if (element) rowElementsRef.current.set(rowIndex, element)
                                    else rowElementsRef.current.delete(rowIndex)
                                }}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                tabIndex={active ? 0 : -1}
                                className={cn(
                                    'absolute left-0 flex w-full items-center gap-2 border-b border-white/[0.035] px-2.5 text-left outline-none transition-colors',
                                    active ? 'bg-white/[0.045]' : 'hover:bg-white/[0.03]',
                                    selected && 'text-sparkle-text'
                                )}
                                style={{ height: SEARCH_RESULT_ROW_HEIGHT, transform: `translateY(${rowIndex * SEARCH_RESULT_ROW_HEIGHT}px)` }}
                                onFocus={() => setActiveIndex(rowIndex)}
                                onClick={(event) => openNode(node, event.shiftKey || event.ctrlKey || event.metaKey)}
                                onPointerEnter={() => {
                                    if (node.type === 'file') onPrefetchFile?.(node)
                                }}
                                onContextMenu={(event) => {
                                    event.preventDefault()
                                    setActiveIndex(rowIndex)
                                    setMenuState({
                                        node,
                                        anchor: { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY, width: 0 }
                                    })
                                }}
                                onKeyDown={(event) => handleKeyDown(event, node, rowIndex)}
                                title={node.path}
                            >
                                <FileSystemEntryIcon path={node.path} kind={node.type} light={light} size={17} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[10px] font-medium text-sparkle-text-secondary">
                                        <HighlightedMatch value={node.name} query={query} />
                                    </span>
                                    <span className="block truncate text-[8px] text-sparkle-text-muted/45">
                                        <HighlightedMatch value={entry?.relativePath || node.path} query={query} />
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>
            <div className="flex h-5 shrink-0 items-center justify-between border-t border-white/[0.045] px-2 text-[8px] text-sparkle-text-muted/45">
                <span>{nodes.length.toLocaleString()} result{nodes.length === 1 ? '' : 's'}</span>
                <span>{searching ? 'Updating index…' : 'Project index'}</span>
            </div>
            {menuState ? (
                <PreviewTreeContextMenu
                    items={getNodeActions(menuState.node)}
                    anchor={menuState.anchor}
                    onClose={() => setMenuState(null)}
                />
            ) : null}
        </div>
    )
}

import {
    Braces,
    Box,
    Boxes,
    ChevronRight,
    CircleDot,
    Hash,
    Package,
    RefreshCw,
    Search,
    SquareFunction,
    Type,
    Variable,
    X
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings'
import { FileEntryIcon } from '../FileEntryIcon'
import { MARKDOWN_PREVIEW_ACTIVE_HEADING_EVENT, MARKDOWN_PREVIEW_NAVIGATE_EVENT } from '../markdown/markdownHeadingIds'
import {
    buildMarkdownOutline,
    buildStructuralOutline,
    countOutlineItems,
    documentOutlineLanguageLabel,
    filterDocumentOutline,
    findDeepestOutlineItemAtLine,
    flattenVisibleOutline,
    fromMonacoDocumentSymbols,
    shouldRefreshOutlineImmediately,
    type DocumentOutlineItem,
    type OutlineSymbolKind
} from './documentOutline'
import { readMonacoDocumentSymbolsWithRetry } from './monacoDocumentSymbols'
import type { PreviewFileType } from './types'
import { usePreviewVirtualWindow } from './usePreviewVirtualWindow'

const SYMBOL_REFRESH_DELAY_MS = 80
const OUTLINE_ROW_HEIGHT = 24

type PreviewOutlinePanelProps = {
    filePath: string
    fileType: PreviewFileType
    language?: string
    content: string
    mode: 'preview' | 'edit'
    editor: MonacoEditor.IStandaloneCodeEditor | null
}

function symbolIcon(kind: OutlineSymbolKind): ReactNode {
    const iconProps = { size: 12, strokeWidth: 1.7 }
    if (kind === 'class' || kind === 'constructor') return <Box {...iconProps} />
    if (kind === 'struct' || kind === 'interface' || kind === 'object') return <Boxes {...iconProps} />
    if (kind === 'function' || kind === 'method' || kind === 'operator') return <SquareFunction {...iconProps} />
    if (kind === 'namespace' || kind === 'module' || kind === 'package') return <Package {...iconProps} />
    if (kind === 'enum' || kind === 'enum-member' || kind === 'type-parameter') return <Type {...iconProps} />
    if (kind === 'constant' || kind === 'variable' || kind === 'field' || kind === 'property') return <Variable {...iconProps} />
    if (kind === 'heading' || kind === 'number' || kind === 'boolean' || kind === 'key') return <Hash {...iconProps} />
    if (kind === 'array') return <Braces {...iconProps} />
    return <CircleDot {...iconProps} />
}

function highlightedName(name: string, query: string): ReactNode {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const start = normalizedQuery ? name.toLocaleLowerCase().indexOf(normalizedQuery) : -1
    if (start < 0) return name
    return (
        <>
            {name.slice(0, start)}
            <mark className="rounded-[2px] bg-[var(--accent-primary)]/18 text-inherit">{name.slice(start, start + normalizedQuery.length)}</mark>
            {name.slice(start + normalizedQuery.length)}
        </>
    )
}

function findHeadingItem(items: DocumentOutlineItem[], headingId: string): DocumentOutlineItem | null {
    for (const item of items) {
        if (item.headingId === headingId) return item
        const childMatch = findHeadingItem(item.children, headingId)
        if (childMatch) return childMatch
    }
    return null
}

export function PreviewOutlinePanel({
    filePath,
    fileType,
    language,
    content,
    mode,
    editor
}: PreviewOutlinePanelProps) {
    const { settings } = useSettings()
    const [items, setItems] = useState<DocumentOutlineItem[]>([])
    const [sourceLabel, setSourceLabel] = useState('')
    const [loading, setLoading] = useState(false)
    const [query, setQuery] = useState('')
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [activeLine, setActiveLine] = useState(1)
    const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
    const pendingJumpRef = useRef<DocumentOutlineItem | null>(null)
    const requestRevisionRef = useRef(0)
    const outlineDocumentKeyRef = useRef('')
    const rowRefs = useRef(new Map<string, HTMLButtonElement>())
    const normalizedLanguage = (language || (fileType === 'json' ? 'json' : fileType === 'html' ? 'html' : 'text')).toLowerCase()

    useLayoutEffect(() => {
        requestRevisionRef.current += 1
        const nextDocumentKey = `${filePath}\u0000${fileType}\u0000${normalizedLanguage}`
        const refreshImmediately = shouldRefreshOutlineImmediately(
            fileType,
            outlineDocumentKeyRef.current,
            nextDocumentKey
        )
        outlineDocumentKeyRef.current = nextDocumentKey
        if (!refreshImmediately) return

        if (fileType === 'md') {
            setItems(buildMarkdownOutline(content))
            setSourceLabel('Headings')
            setLoading(false)
            return
        }

        const fallbackItems = buildStructuralOutline(content, normalizedLanguage)
        setItems(fallbackItems)
        setSourceLabel(fallbackItems.length > 0 ? 'Syntax scan' : '')
        setLoading(false)
    }, [content, filePath, fileType, normalizedLanguage])

    const refreshLanguageOutline = useCallback(async () => {
        if (fileType === 'md') return
        const model = editor?.getModel()
        if (!editor || !model) {
            setLoading(false)
            return
        }

        const requestRevision = ++requestRevisionRef.current
        setLoading(true)
        const symbols = await readMonacoDocumentSymbolsWithRetry(editor, {
            isCurrent: () => requestRevision === requestRevisionRef.current
        })
        if (requestRevision !== requestRevisionRef.current) return
        if (symbols.length > 0) {
            setItems(fromMonacoDocumentSymbols(symbols))
            setSourceLabel('Language service')
            setLoading(false)
            return
        }
        const fallbackItems = buildStructuralOutline(model.getValue(), normalizedLanguage)
        setItems(fallbackItems)
        setSourceLabel(fallbackItems.length > 0 ? 'Syntax scan' : '')
        setLoading(false)
    }, [editor, fileType, normalizedLanguage])

    useEffect(() => {
        setQuery('')
        setCollapsedIds(new Set())
        setSelectedId(null)
        setActiveHeadingId(null)
    }, [filePath])

    useEffect(() => {
        if (fileType === 'md') return
        let timeoutId: number | null = null
        void refreshLanguageOutline()
        const scheduleRefresh = () => {
            if (timeoutId !== null) window.clearTimeout(timeoutId)
            timeoutId = window.setTimeout(() => {
                timeoutId = null
                void refreshLanguageOutline()
            }, SYMBOL_REFRESH_DELAY_MS)
        }
        const modelListener = editor?.onDidChangeModel(() => {
            if (timeoutId !== null) window.clearTimeout(timeoutId)
            timeoutId = null
            void refreshLanguageOutline()
        })
        const contentListener = editor?.onDidChangeModelContent(scheduleRefresh)
        return () => {
            requestRevisionRef.current += 1
            if (timeoutId !== null) window.clearTimeout(timeoutId)
            modelListener?.dispose()
            contentListener?.dispose()
        }
    }, [editor, filePath, fileType, refreshLanguageOutline])

    useEffect(() => {
        if (!editor) return
        setActiveLine(editor.getPosition()?.lineNumber || 1)
        const cursorListener = editor.onDidChangeCursorPosition((event) => setActiveLine(event.position.lineNumber))
        return () => cursorListener.dispose()
    }, [editor, filePath])

    useEffect(() => {
        if (fileType !== 'md' || mode !== 'preview') return
        const handleActiveHeading = (event: Event) => {
            const detail = (event as CustomEvent<{ filePath?: string; headingId?: string }>).detail
            if (detail?.filePath !== filePath || !detail.headingId) return
            setActiveHeadingId(detail.headingId)
        }
        window.addEventListener(MARKDOWN_PREVIEW_ACTIVE_HEADING_EVENT, handleActiveHeading)
        return () => window.removeEventListener(MARKDOWN_PREVIEW_ACTIVE_HEADING_EVENT, handleActiveHeading)
    }, [filePath, fileType, mode])

    const filteredItems = useMemo(() => filterDocumentOutline(items, query), [items, query])
    const visibleItems = useMemo(
        () => flattenVisibleOutline(filteredItems, collapsedIds, query.trim().length > 0),
        [collapsedIds, filteredItems, query]
    )
    const activeItem = useMemo(() => findDeepestOutlineItemAtLine(items, activeLine), [activeLine, items])
    const activeHeadingItem = useMemo(
        () => activeHeadingId ? findHeadingItem(items, activeHeadingId) : null,
        [activeHeadingId, items]
    )
    const activeId = fileType === 'md' && mode === 'preview'
        ? activeHeadingItem?.id || selectedId
        : activeItem?.id || selectedId
    const symbolCount = useMemo(() => countOutlineItems(items), [items])
    const languageLabel = documentOutlineLanguageLabel(fileType, language)
    const {
        range: virtualRange,
        scrollElementRef,
        scrollToIndex
    } = usePreviewVirtualWindow({
        rowCount: visibleItems.length,
        rowHeight: OUTLINE_ROW_HEIGHT,
        restoreKey: `outline:${filePath}`,
        overscanRows: 8,
        guardRows: 2
    })
    const range = virtualRange.end > virtualRange.start || visibleItems.length === 0
        ? virtualRange
        : { start: 0, end: Math.min(visibleItems.length, 40) }
    const renderedItems = visibleItems.slice(range.start, range.end)

    useEffect(() => {
        if (!activeId) return
        const activeIndex = visibleItems.findIndex(({ item }) => item.id === activeId)
        if (activeIndex >= 0) scrollToIndex(activeIndex, 'auto')
    }, [activeId, scrollToIndex, visibleItems])

    const jumpToItem = useCallback((item: DocumentOutlineItem) => {
        setSelectedId(item.id)
        setActiveLine(item.selectionLine)
        if (fileType === 'md' && mode === 'preview' && item.headingId) {
            setActiveHeadingId(item.headingId)
            window.dispatchEvent(new CustomEvent(MARKDOWN_PREVIEW_NAVIGATE_EVENT, {
                detail: { filePath, headingId: item.headingId }
            }))
            return
        }

        const currentModel = editor?.getModel()
        if (!editor || !currentModel) {
            pendingJumpRef.current = item
            return
        }
        pendingJumpRef.current = null
        const position = {
            lineNumber: Math.min(Math.max(1, item.selectionLine), currentModel.getLineCount()),
            column: Math.max(1, item.selectionColumn)
        }
        editor.setPosition(position)
        editor.revealPositionNearTop(position, 0)
        editor.focus()
    }, [editor, filePath, fileType, mode])

    useEffect(() => {
        const pendingItem = pendingJumpRef.current
        if (editor && pendingItem) jumpToItem(pendingItem)
    }, [editor, jumpToItem])

    const toggleCollapsed = (item: DocumentOutlineItem) => {
        setCollapsedIds((current) => {
            const next = new Set(current)
            if (next.has(item.id)) next.delete(item.id)
            else next.add(item.id)
            return next
        })
    }

    const focusVisibleItem = (index: number) => {
        const next = visibleItems[Math.max(0, Math.min(visibleItems.length - 1, index))]
        if (!next) return
        setSelectedId(next.item.id)
        scrollToIndex(index, 'auto')
        window.requestAnimationFrame(() => rowRefs.current.get(next.item.id)?.focus())
    }

    const handleRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const entry = visibleItems[index]
        if (!entry) return
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            focusVisibleItem(index + 1)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            focusVisibleItem(index - 1)
        } else if (event.key === 'ArrowRight' && entry.item.children.length > 0) {
            event.preventDefault()
            if (collapsedIds.has(entry.item.id)) toggleCollapsed(entry.item)
            else focusVisibleItem(index + 1)
        } else if (event.key === 'ArrowLeft' && entry.item.children.length > 0 && !collapsedIds.has(entry.item.id)) {
            event.preventDefault()
            toggleCollapsed(entry.item)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            jumpToItem(entry.item)
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col" aria-label="Document outline">
            <div className="shrink-0 border-b border-white/[0.06] px-2 py-2">
                <label className="flex h-7 items-center gap-1.5 rounded-[5px] border border-white/[0.07] bg-black/[0.08] px-2 text-sparkle-text-muted transition-colors focus-within:border-[var(--accent-primary)]/35 focus-within:text-sparkle-text-secondary">
                    <Search size={12} strokeWidth={1.8} className="shrink-0" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowDown' && visibleItems.length > 0) {
                                event.preventDefault()
                                focusVisibleItem(0)
                            } else if (event.key === 'Escape' && query) {
                                event.preventDefault()
                                setQuery('')
                            }
                        }}
                        placeholder="Search"
                        aria-label="Search document symbols"
                        className="min-w-0 flex-1 bg-transparent text-[11px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/55"
                    />
                    {query ? (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="inline-flex size-4 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text"
                            aria-label="Clear symbol search"
                        >
                            <X size={11} />
                        </button>
                    ) : null}
                </label>
            </div>

            <div
                ref={scrollElementRef}
                role="tree"
                className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                style={{ overflowAnchor: 'none' }}
            >
                {loading && items.length === 0 ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-sparkle-text-muted/70">
                        <RefreshCw size={11} className="animate-spin" /> Mapping file...
                    </div>
                ) : visibleItems.length > 0 ? (
                    <div
                        className="relative min-w-full"
                        style={{ height: visibleItems.length * OUTLINE_ROW_HEIGHT }}
                    >
                        {renderedItems.map((entry, relativeIndex) => {
                            const index = range.start + relativeIndex
                            const { item, depth } = entry
                            const hasChildren = item.children.length > 0
                            const collapsed = collapsedIds.has(item.id) && !query.trim()
                            const isActive = activeId === item.id
                            return (
                                <div
                                    key={item.id}
                                    role="none"
                                    className="absolute inset-x-1.5"
                                    style={{
                                        height: OUTLINE_ROW_HEIGHT,
                                        transform: `translateY(${index * OUTLINE_ROW_HEIGHT}px)`
                                    }}
                                >
                                    {depth > 0 ? (
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/[0.045]"
                                            style={{ left: `${8 + (depth - 1) * 13}px` }}
                                        />
                                    ) : null}
                                    <button
                                        ref={(node) => {
                                            if (node) rowRefs.current.set(item.id, node)
                                            else rowRefs.current.delete(item.id)
                                        }}
                                        type="button"
                                        role="treeitem"
                                        aria-level={depth + 1}
                                        aria-expanded={hasChildren ? !collapsed : undefined}
                                        aria-selected={isActive}
                                        tabIndex={isActive || (!activeId && index === 0) ? 0 : -1}
                                        onClick={() => jumpToItem(item)}
                                        onDoubleClick={() => hasChildren && toggleCollapsed(item)}
                                        onKeyDown={(event) => handleRowKeyDown(event, index)}
                                        className={cn(
                                            'group/outline-row relative flex h-full w-full items-center rounded-[4px] pr-1 text-left text-[11px] outline-none transition-colors',
                                            isActive
                                                ? 'bg-[var(--surface-active)] text-sparkle-text'
                                                : 'text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text',
                                            'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]/45'
                                        )}
                                        style={{ paddingLeft: `${4 + depth * 13}px` }}
                                title={`${entry.parentNames.length ? `${entry.parentNames.join(' / ')} / ` : ''}${item.name} · line ${item.selectionLine}`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            onClick={(event) => {
                                                if (!hasChildren) return
                                                event.stopPropagation()
                                                toggleCollapsed(item)
                                            }}
                                            className={cn(
                                                'mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-sparkle-text-muted/70',
                                                hasChildren && 'hover:bg-white/[0.06] hover:text-sparkle-text'
                                            )}
                                        >
                                            {hasChildren ? <ChevronRight size={11} className={cn('transition-transform duration-100', !collapsed && 'rotate-90')} /> : null}
                                        </span>
                                        <span className={cn('mr-1.5 inline-flex size-3.5 shrink-0 items-center justify-center', isActive ? 'text-[var(--accent-primary)]' : 'text-sparkle-text-muted/75')}>
                                            {symbolIcon(item.kind)}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">{highlightedName(item.name, query)}</span>
                                        {item.detail ? <span className="ml-1 max-w-[42%] truncate font-mono text-[9px] text-sparkle-text-muted/45">{item.detail}</span> : null}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="px-2 py-4 text-[11px] leading-5 text-sparkle-text-muted/65">
                        {query
                            ? `No symbols match “${query}”.`
                            : fileType === 'text'
                                ? 'No code symbols in this text file.'
                                : 'No document symbols found.'}
                    </div>
                )}
            </div>

            <div className="flex h-7 shrink-0 items-center border-t border-white/[0.06] px-2.5 text-[9px] text-sparkle-text-muted/55">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <FileEntryIcon
                        pathValue={filePath}
                        kind="file"
                        theme={settings.appearanceResolvedMode}
                        size={12}
                    />
                    <span className="min-w-0 truncate">{symbolCount} {languageLabel} {symbolCount === 1 ? 'entry' : 'entries'}</span>
                </span>
                {sourceLabel ? <span className="ml-auto shrink-0">{sourceLabel}</span> : null}
            </div>
        </div>
    )
}

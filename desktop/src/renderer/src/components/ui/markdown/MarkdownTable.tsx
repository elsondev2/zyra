import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { Check, Copy, Maximize2, Minimize2 } from 'lucide-react'

function readTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
    return Array.from(table.rows)
}

function escapeMarkdownCell(value: string): string {
    return value.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')
}

function csvCell(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return /[",\n]/.test(normalized)
        ? `"${normalized.replace(/"/g, '""')}"`
        : normalized
}

export function serializeMarkdownTable(table: HTMLTableElement): string {
    const rows = readTableRows(table)
    if (rows.length === 0) return ''
    const lines: string[] = []
    let emittedSeparator = false

    for (const row of rows) {
        const cells = Array.from(row.cells)
        if (cells.length === 0) continue
        lines.push(`| ${cells.map((cell) => escapeMarkdownCell(cell.textContent || '')).join(' | ')} |`)
        if (!emittedSeparator) {
            lines.push(`| ${cells.map((cell) => {
                const alignment = cell.getAttribute('align') || cell.style.textAlign
                if (alignment === 'center') return ':---:'
                if (alignment === 'right') return '---:'
                return '---'
            }).join(' | ')} |`)
            emittedSeparator = true
        }
    }

    return lines.join('\n')
}

export function serializeMarkdownTableCsv(table: HTMLTableElement): string {
    return readTableRows(table)
        .map((row) => Array.from(row.cells).map((cell) => csvCell(cell.textContent || '')).join(','))
        .filter(Boolean)
        .join('\n')
}

export function MarkdownTable({ children, className, ...props }: ComponentProps<'table'>) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const tableRef = useRef<HTMLTableElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const copiedTimerRef = useRef<number | null>(null)
    const [expanded, setExpanded] = useState(false)
    const [copyMenuOpen, setCopyMenuOpen] = useState(false)
    const [copyState, setCopyState] = useState<'markdown' | 'csv' | 'error' | null>(null)

    useEffect(() => {
        if (!copyMenuOpen) return
        const closeOnOutsidePointer = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setCopyMenuOpen(false)
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setCopyMenuOpen(false)
        }
        document.addEventListener('mousedown', closeOnOutsidePointer)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('mousedown', closeOnOutsidePointer)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [copyMenuOpen])

    useEffect(() => () => {
        if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
    }, [])

    const copyTable = useCallback(async (format: 'markdown' | 'csv') => {
        const table = tableRef.current
        if (!table || !navigator.clipboard?.writeText) {
            setCopyState('error')
            return
        }
        const value = format === 'markdown'
            ? serializeMarkdownTable(table)
            : serializeMarkdownTableCsv(table)
        try {
            await navigator.clipboard.writeText(value)
            setCopyState(format)
            setCopyMenuOpen(false)
            if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
            copiedTimerRef.current = window.setTimeout(() => setCopyState(null), 1400)
        } catch {
            setCopyState('error')
        }
    }, [])

    const expandLabel = expanded ? 'Collapse table cells' : 'Expand table cells'
    const copyLabel = copyState === 'error'
        ? 'Could not copy table'
        : copyState
            ? `Copied as ${copyState === 'csv' ? 'CSV' : 'Markdown'}`
            : 'Copy table'

    return (
        <div
            ref={containerRef}
            className="markdown-table-container my-5"
            data-expanded={expanded ? 'true' : 'false'}
        >
            <div className="markdown-table-region overflow-x-auto rounded-lg border border-sparkle-border-secondary bg-sparkle-bg/25" role="region" aria-label="Markdown table" tabIndex={0}>
                <table ref={tableRef} className={className} {...props}>{children}</table>
            </div>
            <div className="markdown-table-footer" data-markdown-chrome="">
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="markdown-chrome-action"
                    aria-pressed={expanded}
                    aria-label={expandLabel}
                    title={expandLabel}
                >
                    {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <div ref={menuRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setCopyMenuOpen((value) => !value)}
                        className="markdown-chrome-action"
                        aria-haspopup="menu"
                        aria-expanded={copyMenuOpen}
                        aria-label={copyLabel}
                        title={copyLabel}
                    >
                        {copyState && copyState !== 'error' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    {copyMenuOpen ? (
                        <div className="markdown-table-copy-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => void copyTable('markdown')}>Copy as Markdown</button>
                            <button type="button" role="menuitem" onClick={() => void copyTable('csv')}>Copy as CSV</button>
                        </div>
                    ) : null}
                </div>
            </div>
            <span className="sr-only" aria-live="polite">{copyState ? copyLabel : ''}</span>
        </div>
    )
}

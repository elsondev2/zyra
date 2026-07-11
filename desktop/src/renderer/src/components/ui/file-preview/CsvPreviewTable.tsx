import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { MAX_CSV_ROWS } from './constants'
import { detectCsvDelimiter, extractColorValues, parseDelimitedContent } from './utils'

interface CsvPreviewTableProps {
    content: string
    language?: string
    useDistinctColumnColors: boolean
}

interface ColumnTheme {
    headerBackground: string
    headerText: string
    cellBackground: string
    cellText: string
    borderColor: string
}

const COLUMN_THEMES: ColumnTheme[] = [
    {
        headerBackground: 'rgba(56, 189, 248, 0.2)',
        headerText: 'rgb(186, 230, 253)',
        cellBackground: 'rgba(56, 189, 248, 0.08)',
        cellText: 'rgba(224, 242, 254, 0.95)',
        borderColor: 'rgba(56, 189, 248, 0.26)'
    },
    {
        headerBackground: 'rgba(16, 185, 129, 0.22)',
        headerText: 'rgb(167, 243, 208)',
        cellBackground: 'rgba(16, 185, 129, 0.09)',
        cellText: 'rgba(209, 250, 229, 0.95)',
        borderColor: 'rgba(16, 185, 129, 0.3)'
    },
    {
        headerBackground: 'rgba(245, 158, 11, 0.24)',
        headerText: 'rgb(254, 240, 138)',
        cellBackground: 'rgba(245, 158, 11, 0.1)',
        cellText: 'rgba(254, 249, 195, 0.95)',
        borderColor: 'rgba(245, 158, 11, 0.3)'
    },
    {
        headerBackground: 'rgba(168, 85, 247, 0.24)',
        headerText: 'rgb(233, 213, 255)',
        cellBackground: 'rgba(168, 85, 247, 0.1)',
        cellText: 'rgba(243, 232, 255, 0.95)',
        borderColor: 'rgba(168, 85, 247, 0.3)'
    },
    {
        headerBackground: 'rgba(244, 63, 94, 0.24)',
        headerText: 'rgb(254, 205, 211)',
        cellBackground: 'rgba(244, 63, 94, 0.1)',
        cellText: 'rgba(255, 228, 230, 0.95)',
        borderColor: 'rgba(244, 63, 94, 0.3)'
    },
    {
        headerBackground: 'rgba(59, 130, 246, 0.24)',
        headerText: 'rgb(191, 219, 254)',
        cellBackground: 'rgba(59, 130, 246, 0.1)',
        cellText: 'rgba(219, 234, 254, 0.95)',
        borderColor: 'rgba(59, 130, 246, 0.3)'
    }
]

function getColumnTheme(index: number): ColumnTheme {
    return COLUMN_THEMES[index % COLUMN_THEMES.length]
}

function ColorChips({ value, idPrefix }: { value: string; idPrefix: string }) {
    const colors = useMemo(() => extractColorValues(value, 3), [value])
    if (colors.length === 0) return null

    return (
        <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
            {colors.map((colorValue, index) => (
                <span
                    key={`${idPrefix}-${index}`}
                    className="h-3.5 w-3.5 rounded-sm border border-white/20 shrink-0"
                    style={{ backgroundColor: colorValue }}
                    title={colorValue}
                />
            ))}
        </span>
    )
}

export default function CsvPreviewTable({ content, language, useDistinctColumnColors }: CsvPreviewTableProps) {
    const [page, setPage] = useState(1)
    const [isRendering, setIsRendering] = useState(true)
    const [csvPreview, setCsvPreview] = useState<{ header: string[]; body: string[][]; totalRows: number }>({
        header: [],
        body: [],
        totalRows: 0
    })

    useEffect(() => {
        let cancelled = false
        setIsRendering(true)

        const timeoutId = window.setTimeout(() => {
            if (cancelled) return
            const delimiter = language === 'tsv' ? '\t' : detectCsvDelimiter(content)
            const rows = parseDelimitedContent(content, delimiter).filter(row => row.some(cell => cell.trim().length > 0))

            if (rows.length === 0) {
                setCsvPreview({ header: [], body: [], totalRows: 0 })
                setIsRendering(false)
                return
            }

            const header = rows[0]
            const bodyRows = rows.slice(1)

            setCsvPreview({
                header,
                body: bodyRows,
                totalRows: bodyRows.length
            })
            setIsRendering(false)
        }, 0)

        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
        }
    }, [content, language])

    useEffect(() => {
        setPage(1)
    }, [content, language])

    const totalPages = Math.max(1, Math.ceil(csvPreview.totalRows / MAX_CSV_ROWS))
    const activePage = Math.min(page, totalPages)

    useEffect(() => {
        setPage((current) => Math.min(current, totalPages))
    }, [totalPages])

    const pageStartIndex = (activePage - 1) * MAX_CSV_ROWS
    const pageEndIndex = Math.min(pageStartIndex + MAX_CSV_ROWS, csvPreview.totalRows)
    const pageRows = csvPreview.body.slice(pageStartIndex, pageEndIndex)
    const pageStartLabel = csvPreview.totalRows === 0 ? 0 : pageStartIndex + 1
    const pageEndLabel = csvPreview.totalRows === 0 ? 0 : pageEndIndex
    const shouldSimplifyCellRendering = csvPreview.totalRows > 200 || csvPreview.header.length > 30
    const useColumnColors = useDistinctColumnColors && !shouldSimplifyCellRendering
    const showColorChips = useColumnColors
    const columnThemes = useMemo(
        () => csvPreview.header.map((_, index) => (useColumnColors ? getColumnTheme(index) : null)),
        [csvPreview.header, useColumnColors]
    )

    return (
        <div className="w-full h-full min-h-0 bg-sparkle-card rounded-xl border border-white/5 overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-white/5 text-xs text-white/50 bg-black/20">
                {isRendering
                    ? 'Rendering CSV preview...'
                    : `${csvPreview.totalRows} rows ${csvPreview.totalRows > 0 ? `(showing ${pageStartLabel}-${pageEndLabel})` : ''}`}
            </div>
            {isRendering ? (
                <div className="flex flex-1 items-center justify-center text-xs text-white/50">
                    Rendering CSV preview...
                </div>
            ) : csvPreview.header.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                    <table className="w-full border-collapse text-sm">
                        <thead className="sticky top-0 bg-black/40 backdrop-blur-md">
                            <tr>
                                {csvPreview.header.map((column, index) => (
                                    <th
                                        key={`csv-header-${index}`}
                                        className={cn(
                                            'px-3 py-2 text-left border-b border-r last:border-r-0 font-medium',
                                            useColumnColors ? 'text-white/90' : 'text-white/80 border-white/10 border-r-white/5'
                                        )}
                                        style={useColumnColors && columnThemes[index] ? {
                                            backgroundColor: columnThemes[index]?.headerBackground,
                                            color: columnThemes[index]?.headerText,
                                            borderBottomColor: columnThemes[index]?.borderColor,
                                            borderRightColor: columnThemes[index]?.borderColor
                                        } : undefined}
                                    >
                                        {column || `Column ${index + 1}`}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map((row, rowIndex) => (
                                <tr
                                    key={`csv-row-${pageStartIndex + rowIndex}`}
                                    className={cn(
                                        useColumnColors
                                            ? 'hover:bg-white/[0.03]'
                                            : 'odd:bg-white/[0.02] hover:bg-white/[0.04]'
                                    )}
                                >
                                    {csvPreview.header.map((_, colIndex) => {
                                        const cellValue = row[colIndex] || ''
                                        const columnTheme = columnThemes[colIndex]
                                        return (
                                            <td
                                            key={`csv-cell-${pageStartIndex + rowIndex}-${colIndex}`}
                                            className={cn(
                                                'px-3 py-2 border-b border-r last:border-r-0 align-top',
                                                useColumnColors ? 'text-white/85' : 'text-white/70 border-white/5 border-r-white/5'
                                            )}
                                                style={columnTheme ? {
                                                    backgroundColor: columnTheme.cellBackground,
                                                    color: columnTheme.cellText,
                                                    borderBottomColor: columnTheme.borderColor,
                                                    borderRightColor: columnTheme.borderColor
                                                } : undefined}
                                            >
                                                <span className="inline-flex items-center">
                                                    <span>{cellValue}</span>
                                                    {showColorChips ? (
                                                        <ColorChips value={cellValue} idPrefix={`csv-${rowIndex}-${colIndex}`} />
                                                    ) : null}
                                                </span>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-5 text-sm text-white/60">No tabular data found in this CSV file.</div>
            )}
            {csvPreview.header.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-white/5 text-xs text-white/50 bg-black/20">
                    <span>
                        Page {activePage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            disabled={activePage <= 1}
                            className={cn(
                                'rounded-md border border-white/5 px-2 py-1 text-[11px] transition-colors',
                                activePage <= 1 ? 'text-white/20' : 'text-white/60 hover:border-white/10 hover:text-white'
                            )}
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                            disabled={activePage >= totalPages}
                            className={cn(
                                'rounded-md border border-white/5 px-2 py-1 text-[11px] transition-colors',
                                activePage >= totalPages ? 'text-white/20' : 'text-white/60 hover:border-white/10 hover:text-white'
                            )}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

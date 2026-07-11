import { memo, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import MarkdownRenderer from '../MarkdownRenderer'
import { HIGHLIGHT_MAX_CHARS, HIGHLIGHT_MAX_LINES } from './constants'
import type { PreviewFile, PreviewMeta } from './types'
import { formatPreviewBytes } from './utils'
import CsvPreviewTable from './CsvPreviewTable'
import SyntaxPreview from './SyntaxPreview'

interface TextPreviewContentProps {
    file: PreviewFile
    content: string
    meta: PreviewMeta
    projectPath?: string
    onInternalLinkClick?: (href: string) => Promise<void> | void
    gitDiffText?: string
    csvDistinctColorsEnabled: boolean
    focusLine?: number | null
    isExpanded?: boolean
}

function exceedsLineLimit(value: string, limit: number): boolean {
    if (!value || limit <= 0) return false

    let lineCount = 1
    for (let index = 0; index < value.length; index += 1) {
        const charCode = value.charCodeAt(index)
        if (charCode !== 10) continue

        lineCount += 1
        if (lineCount > limit) return true
    }

    return false
}

function TextPreviewContent({
    file,
    content,
    meta,
    projectPath,
    onInternalLinkClick,
    gitDiffText,
    csvDistinctColorsEnabled,
    focusLine,
    isExpanded = false
}: TextPreviewContentProps) {
    const isMarkdown = file.type === 'md'
    const isLargeTextPreview = useMemo(() => {
        return content.length > HIGHLIGHT_MAX_CHARS || exceedsLineLimit(content, HIGHLIGHT_MAX_LINES)
    }, [content])

    const [jsonState, setJsonState] = useState<{
        formatted: string | null
        invalid: boolean
        isFormatting: boolean
        fallbackReason: 'truncated' | 'invalid' | null
    }>({
        formatted: null,
        invalid: false,
        isFormatting: false,
        fallbackReason: null
    })

    const useLightweightMarkdown = isLargeTextPreview || meta.truncated

    useEffect(() => {
        if (file.type !== 'json') {
            setJsonState({
                formatted: null,
                invalid: false,
                isFormatting: false,
                fallbackReason: null
            })
            return
        }

        let cancelled = false
        let timeoutId: number | null = null

        setJsonState((current) => ({
            formatted: current.formatted && current.formatted === content ? current.formatted : null,
            invalid: false,
            isFormatting: true,
            fallbackReason: null
        }))

        const formatJsonPreview = () => {
            try {
                const formatted = JSON.stringify(JSON.parse(content), null, 2)
                if (!cancelled) {
                    setJsonState({
                        formatted,
                        invalid: false,
                        isFormatting: false,
                        fallbackReason: null
                    })
                }
            } catch {
                if (!cancelled) {
                    setJsonState({
                        formatted: null,
                        invalid: !meta.truncated,
                        isFormatting: false,
                        fallbackReason: meta.truncated ? 'truncated' : 'invalid'
                    })
                }
            }
        }

        timeoutId = window.setTimeout(formatJsonPreview, isLargeTextPreview ? 0 : 0)

        return () => {
            cancelled = true
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId)
            }
        }
    }, [content, file.type, isLargeTextPreview, meta.truncated])

    const previewSize = formatPreviewBytes(meta.previewBytes)
    const totalSize = formatPreviewBytes(meta.size)
    const markdownContainerClassName = isExpanded
        ? 'w-full min-h-full bg-sparkle-card p-6'
        : 'w-full max-w-4xl min-h-full bg-sparkle-card rounded-xl p-6 border border-white/5'

    return (
        <div className={cn(
            isExpanded
                ? 'w-full flex flex-col items-stretch gap-0'
                : 'w-full h-full min-h-0 flex flex-col items-center gap-3',
            isMarkdown && isExpanded && 'bg-sparkle-card'
        )}>
            {meta.truncated && (
                <div className={isExpanded ? 'w-full px-3 py-2 text-xs text-amber-200 bg-amber-500/10 border-y border-amber-500/20' : 'w-full max-w-5xl px-3 py-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg'}>
                    Preview truncated for stability.
                    {previewSize ? ` Showing ${previewSize}` : ''}
                    {totalSize ? ` of ${totalSize}` : ''}.
                </div>
            )}

            {file.type === 'md' && (
                <div className={markdownContainerClassName}>
                    <MarkdownRenderer
                        content={content}
                        filePath={file.path}
                        onInternalLinkClick={onInternalLinkClick}
                        lightweight={useLightweightMarkdown}
                    />
                </div>
            )}

            {file.type === 'json' && (
                <div className={isExpanded ? 'w-full h-full min-h-0 bg-sparkle-card overflow-hidden' : 'w-full h-full min-h-0 max-w-[96%] bg-sparkle-card border border-white/5 overflow-hidden'}>
                    {jsonState.formatted ? (
                        <SyntaxPreview content={jsonState.formatted} language="json" filePath={file.path} focusLine={focusLine} height={isExpanded ? '100%' : undefined} />
                    ) : jsonState.isFormatting ? (
                        <div className="flex h-full items-center justify-center">
                            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65">
                                <RefreshCw size={14} className="animate-spin text-[var(--accent-primary)]" />
                                Formatting JSON preview...
                            </div>
                        </div>
                    ) : (
                        <div className={isExpanded ? 'h-full flex flex-col' : ''}>
                            {jsonState.invalid && (
                                <div className="text-xs text-amber-300 px-4 pt-3">Invalid JSON format. Showing raw content.</div>
                            )}
                            {jsonState.fallbackReason === 'truncated' && (
                                <div className="text-xs text-sky-300/80 px-4 pt-3">Preview is truncated, so JSON formatting is unavailable. Showing raw content.</div>
                            )}
                            <div className={isExpanded ? 'flex-1 min-h-0' : ''}>
                                <SyntaxPreview content={content} language="json" filePath={file.path} projectPath={projectPath} gitDiffText={gitDiffText} focusLine={focusLine} height={isExpanded ? '100%' : undefined} />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {file.type === 'csv' && (
                <div className="w-full h-full min-h-0 flex-1">
                    <CsvPreviewTable
                        content={content}
                        language={file.language}
                        useDistinctColumnColors={csvDistinctColorsEnabled}
                    />
                </div>
            )}

            {file.type === 'code' && (
                <div className={isExpanded ? 'w-full h-full min-h-0 bg-sparkle-card overflow-hidden' : 'w-full h-full min-h-0 max-w-[96%] bg-sparkle-card border border-white/5 overflow-hidden'}>
                    <SyntaxPreview content={content} language={file.language || 'text'} filePath={file.path} projectPath={projectPath} gitDiffText={gitDiffText} focusLine={focusLine} height={isExpanded ? '100%' : undefined} />
                </div>
            )}

            {file.type === 'text' && (
                <div className={isExpanded ? 'w-full h-full min-h-0 bg-sparkle-card overflow-hidden' : 'w-full h-full min-h-0 max-w-[96%] bg-sparkle-card border border-white/5 overflow-hidden'}>
                    <SyntaxPreview content={content} language="text" filePath={file.path} projectPath={projectPath} gitDiffText={gitDiffText} focusLine={focusLine} height={isExpanded ? '100%' : undefined} />
                </div>
            )}
        </div>
    )
}

export default memo(TextPreviewContent, (previous, next) => {
    const sameBasePreview = (
        previous.file.path === next.file.path
        && previous.file.type === next.file.type
        && previous.file.language === next.file.language
        && previous.content === next.content
        && previous.meta.previewBytes === next.meta.previewBytes
        && previous.meta.size === next.meta.size
        && previous.meta.truncated === next.meta.truncated
        && previous.isExpanded === next.isExpanded
    )

    if (!sameBasePreview) return false

    if (previous.file.type === 'md' && next.file.type === 'md') {
        return previous.onInternalLinkClick === next.onInternalLinkClick
    }

    return (
        previous.projectPath === next.projectPath
        && previous.onInternalLinkClick === next.onInternalLinkClick
        && previous.gitDiffText === next.gitDiffText
        && previous.csvDistinctColorsEnabled === next.csvDistinctColorsEnabled
        && previous.focusLine === next.focusLine
    )
})

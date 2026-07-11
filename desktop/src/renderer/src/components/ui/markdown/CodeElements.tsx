import { memo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronUp, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { hasColorToken, renderColorAwareText } from './colorTokens'
import { MermaidDiagram } from './MermaidDiagram'

const flatCodeTheme = Object.fromEntries(
    Object.entries(oneDark).map(([selector, style]) => [
        selector,
        {
            ...(style as Record<string, unknown>),
            background: 'transparent',
            backgroundColor: 'transparent',
            textShadow: 'none'
        }
    ])
)

const TREE_HINTS = ['\u251c\u2500\u2500', '\u2514\u2500\u2500', '\u2502']
const TREE_GLYPH_REGEX = /[\u251c\u2514\u2502\u2500\u252c\u2534\u253c]/
const TREE_LINE_REGEX = /^([\s\u251c\u2514\u2502\u2500\u252c\u2534\u253c]*(?:\u251c\u2500\u2500|\u2514\u2500\u2500|\u2502\s+)?)(.*?)$/
const CODE_HIGHLIGHT_CHAR_LIMIT = 12_000
const CODE_HIGHLIGHT_LINE_LIMIT = 350

function looksLikeFolderStructure(text: string): boolean {
    if (TREE_HINTS.some((hint) => text.includes(hint))) return true
    return TREE_GLYPH_REGEX.test(text)
}

export const CodeBlock = memo(function CodeBlock({
    language,
    children,
    maxLines
}: {
    language?: string
    children: string
    maxLines?: number
}) {
    const [copied, setCopied] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const codeBlockRef = useRef<HTMLDivElement | null>(null)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(children)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (language === 'mermaid') {
        return (
            <div className="my-4">
                <MermaidDiagram chart={children} />
            </div>
        )
    }

    const isFolderStructure = looksLikeFolderStructure(children)
    const displayLanguage = language || (isFolderStructure ? 'structure' : 'code')
    const hasColorPreviewTokens = hasColorToken(children)
    const normalizedLines = children.split('\n')
    const lineLimit = Number.isFinite(maxLines) && Number(maxLines) > 0 ? Math.floor(Number(maxLines)) : 0
    const shouldCollapse = lineLimit > 0 && normalizedLines.length > lineLimit
    const visibleLines = shouldCollapse && !expanded ? normalizedLines.slice(0, lineLimit) : normalizedLines
    const visibleText = visibleLines.join('\n')
    const shouldUsePlainCodeView = visibleText.length > CODE_HIGHLIGHT_CHAR_LIMIT || visibleLines.length > CODE_HIGHLIGHT_LINE_LIMIT
    const hiddenLineCount = Math.max(0, normalizedLines.length - lineLimit)
    const estimatedLineHeight = 26
    const collapsedMaxHeight = lineLimit > 0 ? (lineLimit * estimatedLineHeight) + 36 : undefined
    const expandedMaxHeight = shouldCollapse ? Math.max((normalizedLines.length * estimatedLineHeight) + 48, 320) : undefined

    const handleExpand = () => {
        setExpanded(true)
    }

    const handleCollapse = () => {
        setExpanded(false)
        requestAnimationFrame(() => {
            codeBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
    }

    return (
        <div ref={codeBlockRef} className="relative my-4 overflow-hidden rounded-lg border border-white/10 bg-sparkle-card">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2">
                <span className="text-xs font-mono uppercase tracking-wide text-sparkle-text-secondary">
                    {displayLanguage}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                >
                    {copied ? (
                        <>
                            <Check size={12} className="text-green-400" />
                            <span className="text-green-400">Copied!</span>
                        </>
                    ) : (
                        <>
                            <Copy size={12} />
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>

            <div
                className="relative overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={
                    shouldCollapse
                        ? { maxHeight: expanded ? expandedMaxHeight : collapsedMaxHeight }
                        : undefined
                }
            >
                {shouldCollapse ? (
                    <div
                        className={`pointer-events-none absolute right-3 top-3 z-10 transition-all duration-250 ${
                            expanded ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={handleCollapse}
                            className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-[var(--accent-primary)]/50 bg-sparkle-bg/90 px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)] backdrop-blur-sm transition-colors hover:bg-[var(--accent-primary)]/15"
                        >
                            <ChevronUp size={12} />
                            Show less
                        </button>
                    </div>
                ) : null}

                {isFolderStructure ? (
                    <pre className="m-0 overflow-x-auto bg-sparkle-card p-4">
                        <code className="whitespace-pre text-sm font-mono leading-6">
                            {visibleLines.map((line, index) => {
                                const match = line.match(TREE_LINE_REGEX)
                                if (!match) {
                                    return (
                                        <div key={index} className="text-sparkle-text-dark">
                                            {line}
                                        </div>
                                    )
                                }

                                const [, prefix, name] = match
                                const trimmedName = name.trim()
                                const isFolder = trimmedName.endsWith('/') || (!trimmedName.includes('.') && trimmedName.length > 0)

                                return (
                                    <div key={index} className="hover:bg-white/[0.03]">
                                        <span className="text-sparkle-text-muted">{prefix}</span>
                                        <span className={isFolder ? 'text-blue-400' : 'text-emerald-400'}>{name}</span>
                                    </div>
                                )
                            })}
                        </code>
                    </pre>
                ) : hasColorPreviewTokens ? (
                    <pre className="m-0 overflow-x-auto bg-sparkle-card p-4">
                        <code className="whitespace-pre text-sm font-mono leading-6 text-sparkle-text-dark">
                            {visibleLines.map((line, index) => (
                                <div key={index} className="-mx-4 px-4 hover:bg-white/[0.03]">
                                    {line.length > 0 ? renderColorAwareText(line, `code-color-${index}`) : '\u00A0'}
                                </div>
                            ))}
                        </code>
                    </pre>
                ) : shouldUsePlainCodeView ? (
                    <pre className="m-0 overflow-x-auto bg-sparkle-card p-4">
                        <code className="whitespace-pre text-sm font-mono leading-6 text-sparkle-text-dark">
                            {visibleText}
                        </code>
                    </pre>
                ) : (
                    <SyntaxHighlighter
                        language={language || 'text'}
                        style={flatCodeTheme as any}
                        customStyle={{
                            margin: 0,
                            padding: '1rem',
                            background: 'var(--color-card)',
                            fontSize: '0.875rem',
                            lineHeight: '1.6'
                        }}
                        showLineNumbers={normalizedLines.length > 3 && visibleLines.length <= 200}
                        lineNumberStyle={{ color: 'var(--color-text-muted)', paddingRight: '1rem' }}
                        wrapLines
                        lineProps={{ style: { background: 'transparent', display: 'block', width: '100%' } }}
                    >
                        {visibleText}
                    </SyntaxHighlighter>
                )}
            </div>

            {shouldCollapse && !expanded ? (
                <div className="border-t border-white/10 bg-white/[0.03] px-4 py-2">
                    <button
                        type="button"
                        onClick={handleExpand}
                        className="text-xs font-medium text-[var(--accent-primary)] transition-colors hover:text-sparkle-text"
                    >
                        {`Read more (${hiddenLineCount} more lines)`}
                    </button>
                </div>
            ) : null}
        </div>
    )
}, (previous, next) => (
    previous.language === next.language
    && previous.children === next.children
    && previous.maxLines === next.maxLines
))

export const InlineCode = memo(function InlineCode({ children }: { children: ReactNode }) {
    const text = String(children)
    const isFolderStructure =
        text.includes('\u251c\u2500\u2500')
        || text.includes('\u2514\u2500\u2500')
        || text.includes('\u2502')
        || (text.includes('/') && text.split('\n').length > 2)

    if (isFolderStructure) {
        return (
            <pre className="my-4 overflow-x-auto rounded-lg border border-white/10 bg-sparkle-card p-4">
                <code className="whitespace-pre text-sm font-mono leading-relaxed text-sparkle-text-dark">
                    {text.split('\n').map((line, index) => {
                        const match = line.match(/^([\s\u251c\u2514\u2502\u2500]+)?(.+)$/)
                        if (!match) return <div key={index}>{line}</div>

                        const [, prefix = '', name] = match
                        const isFolder = name.endsWith('/')

                        return (
                            <div key={index} className="-mx-4 px-4 hover:bg-white/[0.03]">
                                <span className="text-sparkle-text-muted">{prefix}</span>
                                <span className={isFolder ? 'text-blue-400' : 'text-green-400'}>{name}</span>
                            </div>
                        )
                    })}
                </code>
            </pre>
        )
    }

    return (
        <code className="mx-0.5 rounded border border-white/10 bg-sparkle-accent px-1.5 py-0.5 text-sm font-mono text-pink-300">
            {renderColorAwareText(text, 'inline-code', true)}
        </code>
    )
}, (previous, next) => String(previous.children) === String(next.children))

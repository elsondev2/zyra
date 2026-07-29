import { memo } from 'react'
import { PrismLight as SyntaxHighlighter, createElement as createSyntaxElement } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import type { InlineDiffLine } from './AssistantInlineDiffPreview'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('scss', scss)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('yaml', yaml)

const syntaxTheme = Object.fromEntries(
    Object.entries(oneDark).map(([selector, style]) => [selector, {
        ...(style as Record<string, unknown>),
        background: 'transparent',
        backgroundColor: 'transparent',
        fontFamily: 'inherit',
        textShadow: 'none'
    }])
)

const rowToneClassName: Record<InlineDiffLine['kind'], string> = {
    context: 'bg-[#111827] text-[#d8dee9]',
    addition: 'bg-[#10271f] text-[#d7f6e3]',
    deletion: 'bg-[#2a171c] text-[#ffd8d8]',
    hunk: 'bg-[#172033] text-[#a8c2e6]',
    notice: 'bg-[#151b27] text-[#b9c3d0]'
}

const languageByExtension: Record<string, string> = {
    bash: 'bash',
    cjs: 'javascript',
    css: 'css',
    htm: 'markup',
    html: 'markup',
    js: 'javascript',
    json: 'json',
    json5: 'json',
    jsonc: 'json',
    jsx: 'jsx',
    markdown: 'markdown',
    md: 'markdown',
    mdx: 'markdown',
    mjs: 'javascript',
    mts: 'typescript',
    py: 'python',
    python: 'python',
    scss: 'scss',
    sh: 'bash',
    ts: 'typescript',
    tsx: 'tsx',
    vue: 'markup',
    xml: 'markup',
    yaml: 'yaml',
    yml: 'yaml'
}

function resolveLanguage(filePath: string): string {
    const normalized = filePath.toLowerCase().split(/[?#]/, 1)[0]
    const extension = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.') + 1) : ''
    return languageByExtension[extension] || 'text'
}

function getSyntaxSource(line: InlineDiffLine): string {
    if (line.kind === 'hunk' || line.kind === 'notice') return line.text
    return line.text.length > 0 ? line.text.slice(1) : ''
}

function getDiffMarker(line: InlineDiffLine): string {
    if (line.kind === 'addition') return '+'
    if (line.kind === 'deletion') return '-'
    if (line.kind === 'context') return ' '
    return ''
}

function withoutTrailingNewline<T extends { value?: string | number; children?: T[] }>(node: T): T {
    if (typeof node.value === 'string' && node.value.endsWith('\n')) {
        return { ...node, value: node.value.slice(0, -1) }
    }
    if (!node.children?.length) return node

    const children = [...node.children]
    children[children.length - 1] = withoutTrailingNewline(children[children.length - 1])
    return { ...node, children }
}

export const AssistantInlineDiffSyntax = memo(function AssistantInlineDiffSyntax({
    lines,
    displayPath
}: {
    lines: InlineDiffLine[]
    displayPath: string
}) {
    const source = lines.map(getSyntaxSource).join('\n')

    return (
        <SyntaxHighlighter
            language={resolveLanguage(displayPath)}
            style={syntaxTheme}
            PreTag="div"
            CodeTag="div"
            customStyle={{
                margin: 0,
                padding: 0,
                minWidth: '100%',
                width: 'max-content',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                lineHeight: 'inherit',
                textShadow: 'none'
            }}
            codeTagProps={{ style: { display: 'block', fontFamily: 'inherit', textShadow: 'none' } }}
            renderer={({ rows, stylesheet, useInlineStyles }) => (
                <>
                    {lines.map((line, index) => {
                        const syntaxRow = rows[index]
                        return (
                            <div
                                key={index}
                                className={cn('grid min-h-5 grid-cols-[3.25rem_3.25rem_minmax(max-content,1fr)]', rowToneClassName[line.kind])}
                            >
                                <span className="select-none border-r border-white/[0.05] bg-black/10 pr-2 text-right text-[#78879a] tabular-nums">
                                    {line.oldLine ?? ''}
                                </span>
                                <span className="select-none border-r border-white/[0.06] bg-black/10 pr-2 text-right text-[#78879a] tabular-nums">
                                    {line.newLine ?? ''}
                                </span>
                                <span className="whitespace-pre px-2">
                                    <span className={cn(
                                        'inline-block w-[1ch] select-none',
                                        line.kind === 'addition' && 'text-[#73d69a]',
                                        line.kind === 'deletion' && 'text-[#ff8585]'
                                    )}>{getDiffMarker(line)}</span>
                                    {syntaxRow
                                        ? createSyntaxElement({
                                            node: withoutTrailingNewline(syntaxRow),
                                            stylesheet,
                                            useInlineStyles,
                                            key: `syntax-${index}`
                                        })
                                        : getSyntaxSource(line)}
                                </span>
                            </div>
                        )
                    })}
                </>
            )}
        >
            {source}
        </SyntaxHighlighter>
    )
})

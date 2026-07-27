/**
 * GitHub-style Markdown renderer with a bounded compiled-tree cache.
 * Completed assistant messages are immutable, so virtual-list remounts can reuse
 * their parsed React tree instead of running unified/remark again while scrolling.
 */

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { Element, Root } from 'hast'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { urlAttributes } from 'html-url-attributes'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { defaultUrlTransform } from 'react-markdown'
import { cn } from '@/lib/utils'
import { createMarkdownComponents } from './markdown/components'
import { prewarmCodeBlockHighlight } from './markdown/CodeElements'
import {
    MarkdownInteractionLayer,
    type MarkdownInternalLinkHandler,
    type MarkdownLinkNoticeHandler
} from './markdown/MarkdownInteractionLayer'
import { isWindowsPathHref, normalizeMarkdownHref, rewriteMarkdownFileUriHref } from './markdown/linkNavigation'
import { looksLikeMarkdownFileReference } from './markdown/fileReferences'
import { createMarkdownClipboardPayload } from './markdown/markdownClipboard'
import { useMarkdownVisualTheme } from './markdown/markdownTheme'

export interface MarkdownRendererProps {
    content: string
    className?: string
    filePath?: string
    codeBlockMaxLines?: number
    lightweight?: boolean
    cacheKey?: string
    /** Compile this changing fragment without retaining every intermediate version. */
    transient?: boolean
    linkSearchRoot?: string
    onInternalLinkClick?: MarkdownInternalLinkHandler
    onLinkNotice?: MarkdownLinkNoticeHandler
    visualTheme?: 'light' | 'dark'
}

type CompiledMarkdownEntry = {
    content: string
    contentLength: number
    node: ReactNode
}

type MarkdownAstNode = {
    type?: string
    meta?: unknown
    data?: { hProperties?: Record<string, unknown> }
    children?: MarkdownAstNode[]
}

function remarkPreserveCodeMeta() {
    return (tree: MarkdownAstNode) => {
        const visitNode = (node: MarkdownAstNode) => {
            if (node.type === 'code' && typeof node.meta === 'string' && node.meta.trim()) {
                node.data = {
                    ...node.data,
                    hProperties: {
                        ...node.data?.hProperties,
                        dataCodeMeta: node.meta.trim()
                    }
                }
            }
            node.children?.forEach(visitNode)
        }
        visitNode(tree)
    }
}

const MARKDOWN_SANITIZE_SCHEMA = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), 'details', 'summary', 'picture', 'source'],
    attributes: {
        ...defaultSchema.attributes,
        '*': [
            ...(defaultSchema.attributes?.['*'] || []).filter((attribute) => attribute !== 'title'),
            'align'
        ],
        code: [...(defaultSchema.attributes?.code || []), 'dataCodeMeta'],
        details: [...(defaultSchema.attributes?.details || []), 'open'],
        div: [...(defaultSchema.attributes?.div || []), 'dataCacheRaw'],
        source: [...(defaultSchema.attributes?.source || []), 'src', 'srcSet', 'type', 'media']
    },
    protocols: {
        ...defaultSchema.protocols,
        href: [...(defaultSchema.protocols?.href || []), 'file', 'zyra', 'devscope'],
        src: [...(defaultSchema.protocols?.src || []), 'file', 'zyra', 'devscope']
    }
} satisfies Parameters<typeof rehypeSanitize>[0]

const RAW_HTML_TAG_REGEX = /<\/?[A-Za-z][^>\n]*>/
const DEFERRED_MARKDOWN_LENGTH = 120_000
const MAX_COMPILED_ENTRIES = 320
const MAX_COMPILED_CONTENT_LENGTH = 6_000_000
const compiledMarkdown = new Map<string, CompiledMarkdownEntry>()
let compiledContentLength = 0
let markdownCompilationCount = 0
const pendingPreparation = new Map<string, MarkdownRendererProps>()
let preparationIdleId: number | null = null

function markdownUrlTransform(href: string): string {
    const rewrittenHref = rewriteMarkdownFileUriHref(href) ?? href
    const normalizedHref = normalizeMarkdownHref(rewrittenHref)
    return isWindowsPathHref(normalizedHref) ? normalizedHref : defaultUrlTransform(normalizedHref)
}

function contentFingerprint(content: string): string {
    let hash = 2166136261
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return `${content.length}:${(hash >>> 0).toString(36)}`
}

function resolveCompiledKey(props: MarkdownRendererProps): string {
    return [
        props.cacheKey || contentFingerprint(props.content),
        props.filePath || '',
        props.codeBlockMaxLines || 0,
        props.lightweight ? 'light' : 'full',
        props.visualTheme || 'dark'
    ].join('|')
}

function touchCompiledEntry(key: string, entry: CompiledMarkdownEntry): ReactNode {
    compiledMarkdown.delete(key)
    compiledMarkdown.set(key, entry)
    return entry.node
}

function retainCompiledEntry(key: string, entry: CompiledMarkdownEntry): ReactNode {
    const previous = compiledMarkdown.get(key)
    if (previous) compiledContentLength -= previous.contentLength
    compiledMarkdown.set(key, entry)
    compiledContentLength += entry.contentLength

    while (compiledMarkdown.size > MAX_COMPILED_ENTRIES || compiledContentLength > MAX_COMPILED_CONTENT_LENGTH) {
        const oldest = compiledMarkdown.entries().next().value as [string, CompiledMarkdownEntry] | undefined
        if (!oldest) break
        compiledMarkdown.delete(oldest[0])
        compiledContentLength -= oldest[1].contentLength
    }
    return entry.node
}

function readElementText(node: Element): string {
    return node.children.map((child) => {
        if (child.type === 'text') return child.value
        if (child.type === 'element') return readElementText(child)
        return ''
    }).join('')
}

function createHeadingSlug(value: string): string {
    const slug = value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
    return slug || 'section'
}

const AUTO_PATH_BLOCKED_TAGS = new Set(['a', 'code', 'pre', 'script', 'style'])
const AUTO_PATH_TOKEN_REGEX = /[^\s<>"'`]+/g

function splitAutoPathText(value: string): Array<{ type: 'text'; value: string } | Element> {
    const children: Array<{ type: 'text'; value: string } | Element> = []
    let cursor = 0
    for (const match of value.matchAll(AUTO_PATH_TOKEN_REGEX)) {
        const rawToken = match[0]
        const tokenStart = match.index || 0
        const leadingMatch = rawToken.match(/^[([{]+/)?.[0] || ''
        let candidate = rawToken.slice(leadingMatch.length)
        let trailing = ''
        while (candidate && /[)\]},;!?]$/.test(candidate)) {
            trailing = `${candidate.slice(-1)}${trailing}`
            candidate = candidate.slice(0, -1)
        }
        if (candidate.endsWith('.') && looksLikeMarkdownFileReference(candidate.slice(0, -1))) {
            trailing = `.${trailing}`
            candidate = candidate.slice(0, -1)
        }
        if (!candidate || !looksLikeMarkdownFileReference(candidate)) continue

        const candidateStart = tokenStart + leadingMatch.length
        if (candidateStart > cursor) children.push({ type: 'text', value: value.slice(cursor, candidateStart) })
        children.push({
            type: 'element',
            tagName: 'code',
            properties: { dataAutoPath: 'true' },
            children: [{ type: 'text', value: candidate }]
        })
        cursor = tokenStart + rawToken.length - trailing.length
    }
    if (children.length === 0) return [{ type: 'text', value }]
    if (cursor < value.length) children.push({ type: 'text', value: value.slice(cursor) })
    return children
}

function enhancePlainPathReferences(node: Root | Element, blocked = false): void {
    const nextBlocked = blocked || (node.type === 'element' && AUTO_PATH_BLOCKED_TAGS.has(node.tagName))
    const nextChildren: Root['children'] = []
    for (const child of node.children) {
        if (child.type === 'text' && !nextBlocked) {
            nextChildren.push(...splitAutoPathText(child.value))
            continue
        }
        if (child.type === 'element') enhancePlainPathReferences(child, nextBlocked)
        nextChildren.push(child)
    }
    node.children = nextChildren as typeof node.children
}

function prepareMarkdownTree(tree: Root): void {
    const headingCounts = new Map<string, number>()
    visit(tree, 'element', (node: Element) => {
        if (/^h[1-6]$/.test(node.tagName)) {
            const existingId = String(node.properties.id || '').trim()
            if (existingId) {
                const count = (headingCounts.get(existingId) || 0) + 1
                headingCounts.set(existingId, count)
                if (count > 1) node.properties.id = `${existingId}-${count}`
            } else {
                const baseSlug = createHeadingSlug(readElementText(node))
                const count = (headingCounts.get(baseSlug) || 0) + 1
                headingCounts.set(baseSlug, count)
                node.properties.id = count === 1 ? baseSlug : `${baseSlug}-${count}`
            }
        }

        for (const property in urlAttributes) {
            if (!(property in node.properties)) continue
            const supportedTags = urlAttributes[property]
            if (supportedTags && !supportedTags.includes(node.tagName)) continue
            node.properties[property] = markdownUrlTransform(String(node.properties[property] || ''))
        }
    })
    enhancePlainPathReferences(tree)
}

function compileMarkdown(props: MarkdownRendererProps): ReactNode {
    markdownCompilationCount += 1
    const hasRawHtml = !props.lightweight && RAW_HTML_TAG_REGEX.test(props.content)
    const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkPreserveCodeMeta)
        .use(remarkRehype, { allowDangerousHtml: hasRawHtml })

    if (hasRawHtml) processor.use(rehypeRaw)
    processor.use(rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA)

    const tree = processor.runSync(processor.parse(props.content)) as Root
    prepareMarkdownTree(tree)
    const components = createMarkdownComponents(props.filePath, {
        codeBlockMaxLines: props.codeBlockMaxLines,
        plainCodeBlocks: props.lightweight,
        visualTheme: props.visualTheme
    })

    return toJsxRuntime(tree, {
        Fragment,
        components,
        ignoreInvalidStyle: true,
        jsx,
        jsxs,
        passKeys: true,
        passNode: false
    })
}

export function getMarkdownRenderCacheStats(): { entries: number; compilations: number; contentLength: number } {
    return {
        entries: compiledMarkdown.size,
        compilations: markdownCompilationCount,
        contentLength: compiledContentLength
    }
}

export function prepareMarkdownRender(props: MarkdownRendererProps): ReactNode {
    if (props.transient) return compileMarkdown(props)
    const key = resolveCompiledKey(props)
    const cached = compiledMarkdown.get(key)
    if (cached?.content === props.content) return touchCompiledEntry(key, cached)

    return retainCompiledEntry(key, {
        content: props.content,
        contentLength: props.content.length,
        node: compileMarkdown(props)
    })
}

function prewarmFencedCodeBlocks(props: MarkdownRendererProps): void {
    const fencePattern = /(```|~~~)([^\r\n]*)\r?\n([\s\S]*?)\1/g
    for (const match of props.content.matchAll(fencePattern)) {
        const language = match[2]?.trim().split(/\s+/, 1)[0] || undefined
        const source = String(match[3] || '').replace(/\r?\n$/, '')
        prewarmCodeBlockHighlight(language, source, props.codeBlockMaxLines)
    }
}

function drainMarkdownPreparation(deadline: IdleDeadline): void {
    preparationIdleId = null
    let prepared = 0
    while (pendingPreparation.size > 0 && prepared < 2 && deadline.timeRemaining() > 3) {
        const next = pendingPreparation.entries().next().value as [string, MarkdownRendererProps] | undefined
        if (!next) break
        pendingPreparation.delete(next[0])
        prepareMarkdownRender(next[1])
        if (!next[1].lightweight) prewarmFencedCodeBlocks(next[1])
        prepared += 1
    }
    if (pendingPreparation.size > 0) schedulePreparationDrain()
}

function schedulePreparationDrain(): void {
    if (preparationIdleId !== null || pendingPreparation.size === 0) return
    preparationIdleId = window.requestIdleCallback(drainMarkdownPreparation)
}

export function prewarmMarkdownRenders(items: MarkdownRendererProps[]): () => void {
    const queued: Array<[string, MarkdownRendererProps]> = []
    for (const item of items) {
        const key = resolveCompiledKey(item)
        if (compiledMarkdown.get(key)?.content === item.content) continue
        pendingPreparation.set(key, item)
        queued.push([key, item])
    }
    schedulePreparationDrain()
    return () => {
        for (const [key, item] of queued) {
            if (pendingPreparation.get(key) === item) pendingPreparation.delete(key)
        }
    }
}

export function MarkdownContentRenderer(props: MarkdownRendererProps) {
    const { content, className, filePath, codeBlockMaxLines, lightweight = false, cacheKey, transient = false, linkSearchRoot, onInternalLinkClick, onLinkNotice } = props
    const activeVisualTheme = useMarkdownVisualTheme()
    const documentRef = useRef<HTMLDivElement | null>(null)
    const visualTheme = props.visualTheme || activeVisualTheme
    const markdownProps = useMemo(
        () => ({ content, filePath, codeBlockMaxLines, lightweight, cacheKey, transient, visualTheme }),
        [cacheKey, codeBlockMaxLines, content, filePath, lightweight, transient, visualTheme]
    )
    const renderIdentity = useMemo(() => ({}), [cacheKey, codeBlockMaxLines, content, filePath, lightweight, transient, visualTheme])
    const shouldDeferCompilation = !transient && content.length >= DEFERRED_MARKDOWN_LENGTH
    const [preparedIdentity, setPreparedIdentity] = useState<object | null>(null)

    useEffect(() => {
        if (!shouldDeferCompilation) return
        let cancelled = false
        const prepare = () => {
            prepareMarkdownRender(markdownProps)
            if (!cancelled) setPreparedIdentity(renderIdentity)
        }
        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(prepare, { timeout: 180 })
            return () => {
                cancelled = true
                window.cancelIdleCallback(idleId)
            }
        }
        const timeoutId = window.setTimeout(prepare, 0)
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
        }
    }, [markdownProps, renderIdentity, shouldDeferCompilation])

    const renderReady = !shouldDeferCompilation || preparedIdentity === renderIdentity
    const renderedContent = useMemo(
        () => renderReady ? prepareMarkdownRender(markdownProps) : null,
        [markdownProps, renderReady]
    )
    const handleCopy = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !event.clipboardData) return
        const payload = createMarkdownClipboardPayload(selection)
        if (!payload) return
        event.preventDefault()
        event.clipboardData.setData('text/plain', payload.text)
        event.clipboardData.setData('text/html', payload.html)
    }, [])

    return (
        <div
            ref={documentRef}
            className={cn('markdown-body select-text break-words [overflow-wrap:break-word]', className)}
            onCopy={handleCopy}
        >
            <MarkdownInteractionLayer
                rootRef={documentRef}
                filePath={filePath}
                searchRootPath={linkSearchRoot}
                contentKey={renderReady ? content : ''}
                onInternalLinkClick={onInternalLinkClick}
                onLinkNotice={onLinkNotice}
            />
            {renderReady ? renderedContent : (
                <div className="my-4 space-y-2.5" role="status" aria-label="Preparing Markdown document">
                    <div className="h-3 w-3/5 animate-pulse rounded-full bg-sparkle-text-muted/12" />
                    <div className="h-3 w-full animate-pulse rounded-full bg-sparkle-text-muted/10" />
                    <div className="h-3 w-5/6 animate-pulse rounded-full bg-sparkle-text-muted/10" />
                    <span className="sr-only">Preparing document…</span>
                </div>
            )}
        </div>
    )
}

export default memo(
    MarkdownContentRenderer,
    (previous, next) =>
        previous.content === next.content &&
        previous.className === next.className &&
        previous.filePath === next.filePath &&
        previous.codeBlockMaxLines === next.codeBlockMaxLines &&
        previous.lightweight === next.lightweight &&
        previous.cacheKey === next.cacheKey &&
        previous.transient === next.transient &&
        previous.linkSearchRoot === next.linkSearchRoot &&
        previous.onInternalLinkClick === next.onInternalLinkClick &&
        previous.onLinkNotice === next.onLinkNotice &&
        previous.visualTheme === next.visualTheme
)

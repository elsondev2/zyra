/**
 * GitHub-style Markdown Renderer
 * Renders markdown with syntax highlighting, proper styling, and all GFM features
 */

import { memo, useMemo, useRef } from 'react'
import Markdown from 'react-markdown'
import { defaultUrlTransform } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { createMarkdownComponents } from './markdown/components'
import { MarkdownInteractionLayer } from './markdown/MarkdownInteractionLayer'
import { isWindowsPathHref, rewriteMarkdownFileUriHref } from './markdown/linkNavigation'

export interface MarkdownRendererProps {
    content: string
    className?: string
    filePath?: string
    codeBlockMaxLines?: number
    lightweight?: boolean
    onInternalLinkClick?: (href: string) => Promise<void> | void
}

const RAW_HTML_TAG_REGEX = /<\/?[A-Za-z][^>\n]*>/

function markdownUrlTransform(href: string): string {
    return rewriteMarkdownFileUriHref(href) ?? (isWindowsPathHref(href) ? href : defaultUrlTransform(href))
}

export function MarkdownContentRenderer({ content, className, filePath, codeBlockMaxLines, lightweight = false, onInternalLinkClick }: MarkdownRendererProps) {
    const documentRef = useRef<HTMLDivElement | null>(null)
    const components = useMemo(
        () => createMarkdownComponents(filePath, {
            codeBlockMaxLines,
            plainCodeBlocks: lightweight
        }),
        [filePath, codeBlockMaxLines, lightweight]
    )
    const rehypePlugins = useMemo(
        () => (!lightweight && RAW_HTML_TAG_REGEX.test(content) ? [rehypeRaw] : []),
        [content, lightweight]
    )

    return (
        <div ref={documentRef} className={cn('markdown-body select-text break-words [overflow-wrap:break-word]', className)}>
            <MarkdownInteractionLayer
                rootRef={documentRef}
                filePath={filePath}
                onInternalLinkClick={onInternalLinkClick}
            />
            <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={rehypePlugins}
                components={components}
                urlTransform={markdownUrlTransform}
            >
                {content}
            </Markdown>
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
        previous.onInternalLinkClick === next.onInternalLinkClick
)

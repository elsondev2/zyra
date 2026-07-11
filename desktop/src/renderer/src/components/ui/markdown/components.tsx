import type { Components } from 'react-markdown'
import { Children, Fragment, cloneElement, isValidElement, type HTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Info, Lightbulb, ShieldAlert, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CodeBlock, InlineCode } from './CodeElements'
import { renderColorAwareChildren } from './colorTokens'
import { looksLikeMarkdownFileReference } from './fileReferences'
import { resolveImageSrc, resolveImageSrcSet } from './paths'
import { resolveMarkdownLinkTarget } from './linkNavigation'

type DivProps = HTMLAttributes<HTMLDivElement> & { align?: string }
type SourceProps = HTMLAttributes<HTMLSourceElement> & { src?: string; srcSet?: string }
type ParagraphProps = HTMLAttributes<HTMLParagraphElement> & { align?: string }
type HeadingProps = HTMLAttributes<HTMLHeadingElement> & { align?: string }

type MarkdownAlertType = 'tip' | 'note' | 'important' | 'warning' | 'caution'

const MARKDOWN_ALERT_META: Record<MarkdownAlertType, {
    label: string
    icon: typeof Lightbulb
    className: string
}> = {
    tip: {
        label: 'Tip',
        icon: Lightbulb,
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    },
    note: {
        label: 'Note',
        icon: Info,
        className: 'border-sky-500/30 bg-sky-500/10 text-sky-100'
    },
    important: {
        label: 'Important',
        icon: ShieldAlert,
        className: 'border-violet-500/30 bg-violet-500/10 text-violet-100'
    },
    warning: {
        label: 'Warning',
        icon: AlertTriangle,
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-100'
    },
    caution: {
        label: 'Caution',
        icon: Siren,
        className: 'border-rose-500/30 bg-rose-500/10 text-rose-100'
    }
}

function flattenNodeText(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (!node) return ''
    if (Array.isArray(node)) return node.map(flattenNodeText).join('')
    if (isValidElement<{ children?: ReactNode }>(node)) return flattenNodeText(node.props.children)
    return ''
}

function detectMarkdownAlert(children: ReactNode): {
    type: MarkdownAlertType
    children: ReactNode
} | null {
    const childArray = Children.toArray(children)
    if (childArray.length === 0) return null

    const firstMeaningfulIndex = childArray.findIndex((child) => flattenNodeText(child).trim().length > 0)
    if (firstMeaningfulIndex < 0) return null

    const firstChild = childArray[firstMeaningfulIndex]
    const firstChildText = flattenNodeText(firstChild).trim()
    const match = firstChildText.match(/^\[!(TIP|NOTE|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i)
    if (!match) return null

    const type = match[1].toLowerCase() as MarkdownAlertType
    const remainder = match[2]?.trim() || ''
    const nextChildren = [...childArray]

    if (remainder && isValidElement<{ children?: ReactNode }>(firstChild)) {
        nextChildren[firstMeaningfulIndex] = cloneElement(firstChild, undefined, remainder)
    } else if (remainder) {
        nextChildren[firstMeaningfulIndex] = remainder
    } else {
        nextChildren.splice(firstMeaningfulIndex, 1)
    }

    return {
        type,
        children: nextChildren
    }
}

function getAlignmentClass(align?: string): string | null {
    const normalized = String(align || '').trim().toLowerCase()
    if (normalized === 'center') return 'text-center items-center'
    if (normalized === 'right') return 'text-right items-end'
    if (normalized === 'left') return 'text-left items-start'
    return null
}

export function createMarkdownComponents(
    filePath?: string,
    options?: {
        codeBlockMaxLines?: number
        plainCodeBlocks?: boolean
        onInternalLinkClick?: (href: string) => Promise<void> | void
    }
): Components {
    return {
        h1: ({ children, className, align, ...props }: HeadingProps) => (
            <h1 className={cn('mt-8 mb-4 border-b border-white/10 pb-2 text-2xl font-bold text-sparkle-text first:mt-0', getAlignmentClass(align), className)} {...props}>
                {children}
            </h1>
        ),
        div: ({ className, ...props }: DivProps) => {
            const alignmentClass = getAlignmentClass(props.align)
            return <div className={cn(className, alignmentClass && 'flex flex-col', alignmentClass)} {...props} />
        },
        h2: ({ children, className, align, ...props }: HeadingProps) => (
            <h2 className={cn('mt-8 mb-3 border-b border-white/10 pb-2 text-xl font-semibold text-sparkle-text first:mt-0', getAlignmentClass(align), className)} {...props}>
                {children}
            </h2>
        ),
        h3: ({ children, className, align, ...props }: HeadingProps) => (
            <h3 className={cn('text-lg font-semibold text-sparkle-text mt-6 mb-3 first:mt-0', getAlignmentClass(align), className)} {...props}>{children}</h3>
        ),
        h4: ({ children, className, align, ...props }: HeadingProps) => <h4 className={cn('text-base font-semibold text-sparkle-text mt-4 mb-2', getAlignmentClass(align), className)} {...props}>{children}</h4>,
        h5: ({ children, className, align, ...props }: HeadingProps) => <h5 className={cn('text-sm font-semibold text-sparkle-text mt-4 mb-2', getAlignmentClass(align), className)} {...props}>{children}</h5>,
        h6: ({ children, className, align, ...props }: HeadingProps) => (
            <h6 className={cn('text-sm font-semibold text-sparkle-text-dark mt-4 mb-2', getAlignmentClass(align), className)} {...props}>{children}</h6>
        ),
        p: ({ children, className, align, ...props }: ParagraphProps) => (
            <p className={cn('text-sparkle-text-dark leading-relaxed mb-4 last:mb-0 break-words [overflow-wrap:break-word]', getAlignmentClass(align), className)} {...props}>
                {renderColorAwareChildren(children, 'p')}
            </p>
        ),
        a: ({ href, children }) => {
            const rawHref = String(href || '').trim()
            const isAnchorLink = rawHref.startsWith('#')
            const internalTarget = rawHref && resolveMarkdownLinkTarget(rawHref, filePath)
            const isInternalLink = Boolean(internalTarget)

            if (isAnchorLink) {
                return (
                    <a
                        href={href}
                        draggable={false}
                        className="text-[var(--accent-primary)] hover:text-white hover:underline"
                    >
                        {renderColorAwareChildren(children, 'a')}
                    </a>
                )
            }

            if (isInternalLink) return (
                <a
                    href={href}
                    draggable={false}
                    className="cursor-pointer text-[var(--accent-primary)] hover:text-white hover:underline"
                >
                    {renderColorAwareChildren(children, 'a')}
                </a>
            )

            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    draggable={false}
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                    {renderColorAwareChildren(children, 'a')}
                </a>
            )
        },
        strong: ({ children }) => (
            <strong className="font-semibold text-sparkle-text">
                {renderColorAwareChildren(children, 'strong')}
            </strong>
        ),
        em: ({ children }) => (
            <em className="italic text-sparkle-text-dark">{renderColorAwareChildren(children, 'em')}</em>
        ),
        code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !className

            if (isInline) {
                const text = flattenNodeText(children).trim()
                if (filePath && looksLikeMarkdownFileReference(text) && resolveMarkdownLinkTarget(text, filePath)) {
                    return (
                        <code
                            data-devscope-file-reference={text}
                            draggable={false}
                            className="mx-0.5 cursor-pointer rounded border border-white/10 bg-sparkle-accent px-1.5 py-0.5 font-mono text-sm text-pink-300"
                        >
                            {children}
                        </code>
                    )
                }
                return <InlineCode>{children}</InlineCode>
            }

            if (options?.plainCodeBlocks) {
                return (
                    <pre className="my-4 overflow-x-auto rounded-lg border border-white/10 bg-sparkle-card p-4">
                        <code className="whitespace-pre text-sm font-mono leading-6 text-sparkle-text-dark">
                            {String(children).replace(/\n$/, '')}
                        </code>
                    </pre>
                )
            }

            return (
                <CodeBlock
                    language={match?.[1]}
                    maxLines={options?.codeBlockMaxLines}
                >
                    {String(children).replace(/\n$/, '')}
                </CodeBlock>
            )
        },
        pre: ({ children, ...props }) => {
            const childArray = Children.toArray(children)
            if (childArray.length === 1 && isValidElement(childArray[0])) {
                return <Fragment>{children}</Fragment>
            }

            return (
                <pre className="overflow-x-auto whitespace-pre rounded-lg border border-white/10 bg-sparkle-card p-4 font-mono text-sm leading-none" {...props}>
                    {children}
                </pre>
            )
        },
        ul: ({ children }) => (
            <ul className="list-disc list-outside ml-6 mb-4 space-y-1 text-sparkle-text-dark">{children}</ul>
        ),
        ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-6 mb-4 space-y-1 text-sparkle-text-dark">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed pl-1 break-words [overflow-wrap:break-word]">{renderColorAwareChildren(children, 'li')}</li>,
        blockquote: ({ children }) => {
            const alert = detectMarkdownAlert(children)
            if (alert) {
                const meta = MARKDOWN_ALERT_META[alert.type]
                const Icon = meta.icon

                return (
                    <blockquote className={cn('my-4 rounded-xl border px-4 py-3', meta.className)}>
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                            <Icon size={16} />
                            <span>{meta.label}</span>
                        </div>
                        <div className="space-y-3 text-sm leading-relaxed text-white/88">
                            {renderColorAwareChildren(alert.children, 'blockquote')}
                        </div>
                    </blockquote>
                )
            }

            return (
                <blockquote className="my-4 rounded-r-lg border-l-4 border-blue-500/50 bg-blue-500/5 py-1 pl-4 text-sparkle-text-secondary italic">
                    {renderColorAwareChildren(children, 'blockquote')}
                </blockquote>
            )
        },
        hr: () => <hr className="my-6 border-white/10" />,
        img: ({ src, alt }) => (
            <img
                src={resolveImageSrc(src || '', filePath)}
                alt={alt || ''}
                className="my-4 h-auto max-w-full rounded-lg border border-white/10"
            />
        ),
        picture: ({ children }) => (
            <picture className="my-4 block max-w-full">
                {children}
            </picture>
        ),
        source: ({ src, srcSet, ...props }: SourceProps) => (
            <source
                {...props}
                src={src ? resolveImageSrc(src, filePath) : undefined}
                srcSet={srcSet ? resolveImageSrcSet(srcSet, filePath) : undefined}
            />
        ),
        table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full border-collapse text-sm">{children}</table>
            </div>
        ),
        thead: ({ children }) => <thead className="bg-sparkle-accent">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
            <tr className="border-b border-white/10 transition-colors last:border-0 hover:bg-sparkle-accent">
                {children}
            </tr>
        ),
        th: ({ children }) => (
            <th className="border-r border-white/10 px-4 py-3 text-left font-semibold text-sparkle-text last:border-r-0">
                {renderColorAwareChildren(children, 'th')}
            </th>
        ),
        td: ({ children }) => (
            <td className="border-r border-white/10 px-4 py-3 text-sparkle-text-dark last:border-r-0 break-words [overflow-wrap:break-word]">
                {renderColorAwareChildren(children, 'td')}
            </td>
        ),
        input: ({ type, checked }) => {
            if (type !== 'checkbox') return null

            return (
                <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mr-2 rounded border-white/10 bg-transparent checked:border-blue-500 checked:bg-blue-500"
                />
            )
        },
        del: ({ children }) => <del className="text-sparkle-text-secondary line-through">{children}</del>
    }
}

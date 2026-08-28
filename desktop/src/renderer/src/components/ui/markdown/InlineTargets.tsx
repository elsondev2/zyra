import { memo, useMemo, useState, type ReactNode } from 'react'
import { FolderClosed, Globe2 } from 'lucide-react'
import { FileEntryIcon } from '@/components/ui/FileEntryIcon'
import { cn } from '@/lib/utils'

const FAILED_FAVICON_HOSTS = new Set<string>()
const FAVICON_SIZE = 32

export function compactMarkdownPathLabel(pathValue: string, maxLength = 72): string {
    const rawValue = String(pathValue || '').trim()
    if (!rawValue || rawValue.length <= maxLength) return rawValue

    const separator = rawValue.includes('\\') ? '\\' : '/'
    const windowsRoot = rawValue.match(/^[A-Za-z]:[\\/]/)?.[0] || ''
    const posixRoot = !windowsRoot && rawValue.startsWith('/') ? '/' : ''
    const root = windowsRoot || posixRoot
    const withoutRoot = root ? rawValue.slice(root.length) : rawValue
    const segments = withoutRoot.split(/[\\/]+/).filter(Boolean)
    const prefix = root
        ? `${root}${root.endsWith(separator) ? '' : separator}...${separator}`
        : `...${separator}`
    const budget = Math.max(18, maxLength - prefix.length)
    const retained: string[] = []
    let retainedLength = 0

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const segment = segments[index]
        const nextLength = retainedLength + segment.length + (retained.length > 0 ? 1 : 0)
        if (nextLength > budget && retained.length > 0) break
        retained.unshift(segment)
        retainedLength = nextLength
    }

    const tail = retained.join(separator)
    if (!tail) return rawValue.slice(-maxLength)
    return `${prefix}${tail}`
}

function stripFileLocationSuffix(pathValue: string): string {
    const withoutHash = pathValue.split('#', 1)[0] || pathValue
    const withoutQuery = withoutHash.split('?', 1)[0] || withoutHash
    return withoutQuery.replace(/:\d+(?::\d+)?$/, '')
}

export function resolveExternalMarkdownHost(href: string): string | null {
    try {
        const parsed = new URL(href)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        return parsed.hostname || null
    } catch {
        return null
    }
}

export const MarkdownSiteIcon = memo(function MarkdownSiteIcon({ host, className }: { host: string; className?: string }) {
    const [failedHost, setFailedHost] = useState<string | null>(null)
    const failed = failedHost === host || FAILED_FAVICON_HOSTS.has(host)

    return (
        <span className={cn('markdown-inline-site-icon', className)} aria-hidden="true">
            {failed ? (
                <Globe2 className="size-full" />
            ) : (
                <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${FAVICON_SIZE}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full rounded-[3px]"
                    onError={() => {
                        FAILED_FAVICON_HOSTS.add(host)
                        setFailedHost(host)
                    }}
                />
            )}
        </span>
    )
})

export const MarkdownExternalLinkContent = memo(function MarkdownExternalLinkContent({
    href,
    children
}: {
    href: string
    children: ReactNode
}) {
    const host = useMemo(() => resolveExternalMarkdownHost(href), [href])
    if (!host) return <>{children}</>

    return (
        <>
            <span className="markdown-inline-link-leading">
                <MarkdownSiteIcon host={host} />
            </span>
            {children}
        </>
    )
})

export const MarkdownFileTagContent = memo(function MarkdownFileTagContent({
    pathValue,
    children,
    theme,
    focusLine,
    compact = false,
    displayPath
}: {
    pathValue: string
    children: ReactNode
    theme: 'light' | 'dark'
    focusLine?: number
    compact?: boolean
    displayPath?: string
}) {
    const iconPath = stripFileLocationSuffix(pathValue)
    return (
        <>
            <FileEntryIcon
                pathValue={iconPath}
                kind="file"
                theme={theme}
                loading="lazy"
                className={cn('markdown-inline-file-icon markdown-inline-target-file-icon', compact && 'size-3')}
            />
            <FolderClosed
                aria-hidden="true"
                className={cn('markdown-inline-file-icon markdown-inline-target-directory-icon text-amber-400/90', compact && 'size-3')}
            />
            <span className="markdown-inline-file-label min-w-0" title={displayPath}>
                {displayPath ? compactMarkdownPathLabel(displayPath) : children}
            </span>
            {focusLine ? <span className="markdown-inline-file-location">L{focusLine}</span> : null}
        </>
    )
})

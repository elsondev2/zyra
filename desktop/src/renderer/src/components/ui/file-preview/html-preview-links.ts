import { desktopWebLink } from '@shared/desktop-link-policy'
import { openDesktopLink } from '@/lib/desktop-links'
import { getFileExtensionFromName } from '@/lib/filesystem/fileSystemPaths'
import { resolvePreviewType } from './utils'
import type { PreviewHtmlLocation, PreviewOpenOptions } from './types'

type HtmlLinkTarget =
    | { kind: 'fragment'; hash: string }
    | { kind: 'web'; url: string }
    | { kind: 'local'; path: string; location: PreviewHtmlLocation }

function fileBaseUrl(path: string): URL {
    const normalized = path.replace(/\\/g, '/')
    const url = new URL('file:///')
    if (normalized.startsWith('//')) {
        const end = normalized.indexOf('/', 2)
        url.hostname = end < 0 ? normalized.slice(2) : normalized.slice(2, end)
        url.pathname = encodeURI(end < 0 ? '/' : normalized.slice(end)).replace(/#/g, '%23').replace(/\?/g, '%3F')
    } else url.pathname = encodeURI(normalized.startsWith('/') ? normalized : `/${normalized}`).replace(/#/g, '%23').replace(/\?/g, '%3F')
    return url
}

export function resolveHtmlPreviewLink(href: string, sourcePath: string): HtmlLinkTarget | null {
    const value = href.trim()
    if (!value || value.length > 16_384) return null
    if (value.startsWith('#')) return { kind: 'fragment', hash: value }
    try {
        const url = new URL(value, fileBaseUrl(sourcePath))
        if (url.username || url.password) return null
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            const safe = desktopWebLink(url.href)
            return safe ? { kind: 'web', url: safe } : null
        }
        if (!['file:', 'zyra:', 'devscope:'].includes(url.protocol)) return null
        let path = decodeURIComponent(url.pathname)
        if (url.protocol !== 'file:' && /^[a-z]$/i.test(url.hostname)) path = `${url.hostname}:${path}`
        else if (url.hostname && url.hostname !== 'localhost') path = `//${url.hostname}${path}`
        else if (/^\/[a-z]:\//i.test(path)) path = path.slice(1)
        if (!path || path.includes('\0')) return null
        if (sourcePath.includes('\\')) path = path.replace(/\//g, '\\')
        url.searchParams.delete('devscope-preview')
        return { kind: 'local', path, location: { search: url.search, hash: url.hash } }
    } catch { return null }
}

export async function navigateHtmlPreviewLink({ href, filePath, openPreview, isCurrent = () => true }: {
    href: string
    filePath: string
    isCurrent?: () => boolean
    openPreview?: (file: { name: string; path: string }, extension: string, options?: PreviewOpenOptions) => Promise<void>
}): Promise<boolean> {
    if (!isCurrent()) return true
    const target = resolveHtmlPreviewLink(href, filePath)
    if (!target) return false
    if (target.kind === 'fragment') return true
    if (target.kind === 'web') {
        const result = await openDesktopLink(target.url)
        if (!result.success && !result.cancelled) throw new Error(result.error || 'Could not open this web link.')
        return true
    }
    if (!openPreview) throw new Error('Local links are unavailable in this preview.')
    const info = await window.devscope.getPathInfo(target.path)
    if (!isCurrent()) return true
    if (!info.success || !info.exists) throw new Error('The linked file could not be found.')
    const name = info.path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || info.path
    const extension = getFileExtensionFromName(name)
    const type = info.type === 'directory' ? null : resolvePreviewType(name, extension)
    if (info.type !== 'directory' && !type) throw new Error('This link points to a file that cannot be previewed.')
    await openPreview({ name, path: info.path }, extension, {
        targetKind: info.type === 'directory' ? 'directory' : 'file',
        openNavigator: true,
        revealNavigatorTarget: true,
        ...(type?.type === 'html' ? { htmlLocation: target.location } : {})
    })
    return true
}

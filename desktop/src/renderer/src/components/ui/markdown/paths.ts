function getFileUrl(path: string): string {
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('zyra://')) return path
    if (path.startsWith('devscope://')) return `zyra://${path.slice('devscope://'.length)}`

    const normalizedPath = path.replace(/\\/g, '/')
    const isUncPath = normalizedPath.startsWith('//')
    const trimmed = isUncPath
        ? normalizedPath.slice(2)
        : normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath
    const encodedPath = encodeURI(trimmed).replace(/#/g, '%23').replace(/\?/g, '%3F')

    return isUncPath ? `zyra://${encodedPath}` : `zyra:///${encodedPath}`
}

export function resolveImageSrc(src: string, filePath?: string): string {
    if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('file:')) {
        return src
    }

    if (!filePath) return src

    const normalizePath = (path: string) => path.replace(/\\/g, '/')
    const normalizedFilePath = normalizePath(filePath)
    const fileDir = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'))

    if (src.match(/^[a-zA-Z]:/) || src.startsWith('/')) {
        return getFileUrl(src)
    }

    const parts = fileDir.split('/')
    const srcParts = normalizePath(src).split('/')

    for (const part of srcParts) {
        if (part === '.') continue
        if (part === '..') {
            parts.pop()
        } else {
            parts.push(part)
        }
    }

    return getFileUrl(parts.join('/'))
}

export function resolveImageSrcSet(srcSet: string, filePath?: string): string {
    const raw = String(srcSet || '').trim()
    if (!raw) return raw

    return raw
        .split(',')
        .map((candidate) => {
            const trimmed = candidate.trim()
            if (!trimmed) return trimmed

            const firstWhitespace = trimmed.search(/\s/)
            if (firstWhitespace < 0) {
                return resolveImageSrc(trimmed, filePath)
            }

            const src = trimmed.slice(0, firstWhitespace)
            const descriptor = trimmed.slice(firstWhitespace).trim()
            const resolvedSrc = resolveImageSrc(src, filePath)
            return descriptor ? `${resolvedSrc} ${descriptor}` : resolvedSrc
        })
        .join(', ')
}

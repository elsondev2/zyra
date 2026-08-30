const MIME_TYPES: Record<string, string> = {
    aac: 'audio/aac',
    avif: 'image/avif',
    avi: 'video/x-msvideo',
    bmp: 'image/bmp',
    c: 'text/plain',
    cc: 'text/plain',
    cpp: 'text/plain',
    css: 'text/css',
    csv: 'text/csv',
    flac: 'audio/flac',
    gif: 'image/gif',
    htm: 'text/html',
    html: 'text/html',
    ini: 'text/plain',
    ico: 'image/x-icon',
    jfif: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'application/javascript',
    jsx: 'text/plain',
    json: 'application/json',
    log: 'text/plain',
    m4a: 'audio/mp4',
    m4v: 'video/mp4',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    md: 'text/plain',
    markdown: 'text/plain',
    oga: 'audio/ogg',
    ogg: 'application/ogg',
    ogv: 'video/ogg',
    opus: 'audio/ogg',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    toml: 'text/plain',
    ts: 'text/plain',
    tsx: 'text/plain',
    txt: 'text/plain',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    wav: 'audio/wav',
    webm: 'video/webm',
    webp: 'image/webp',
    xml: 'text/plain',
    yaml: 'text/plain',
    yml: 'text/plain'
}

export function resolveProtocolFilePath(requestUrl: string): string {
    const url = new URL(requestUrl)
    let filePath = decodeURIComponent(url.pathname)

    if (url.hostname && url.hostname.length === 1 && /^[a-zA-Z]$/.test(url.hostname)) {
        return `${url.hostname}:${filePath}`
    }
    if (url.hostname) {
        return `//${url.hostname}${filePath}`
    }
    if (process.platform === 'win32' && filePath.startsWith('/')) {
        return filePath.slice(1)
    }
    return filePath
}

export function resolveFileMimeType(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() || ''
    return MIME_TYPES[extension] || 'application/octet-stream'
}

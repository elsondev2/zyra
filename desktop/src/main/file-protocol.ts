import { protocol } from 'electron'
import log from 'electron-log'

const MIME_TYPES: Record<string, string> = {
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm'
}

function resolveProtocolFilePath(requestUrl: string) {
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

function resolveMimeType(filePath: string) {
    const extension = filePath.split('.').pop()?.toLowerCase() || ''
    return MIME_TYPES[extension] || 'application/octet-stream'
}

export function registerFileProtocol(fileProtocol: string) {
    protocol.registerBufferProtocol(fileProtocol, (request, callback) => {
        let filePath = ''

        try {
            filePath = resolveProtocolFilePath(request.url)
        } catch (error) {
            log.error('Failed to resolve protocol URL:', request.url, error)
            callback({ statusCode: 500, data: Buffer.from('') })
            return
        }

        import('fs').then(({ readFile }) => {
            readFile(filePath, (error, data) => {
                if (error) {
                    log.error('Failed to read file:', filePath, error)
                    callback({ statusCode: 404, data: Buffer.from('') })
                    return
                }

                callback({
                    statusCode: 200,
                    data,
                    mimeType: resolveMimeType(filePath),
                    headers: {
                        'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
                    }
                })
            })
        }).catch((error) => {
            log.error('Failed to import fs:', error)
            callback({ statusCode: 500, data: Buffer.from('') })
        })
    })
}

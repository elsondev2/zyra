import { protocol } from 'electron'
import log from 'electron-log'
import { resolveFileMimeType, resolveProtocolFilePath } from './local-file-content'

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
                    mimeType: resolveFileMimeType(filePath),
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

import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer, request as requestHttp, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_HOST,
    BROWSER_ASSISTANT_CLIENT_ID_HEADER,
    BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX,
    BROWSER_CLIENT_HOST_ORIGIN,
    BROWSER_CLIENT_HOST_PORT,
    BROWSER_FILE_BRIDGE_PATH
} from '../shared/browser-assistant-bridge'

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost'])
const STATIC_CACHE_SECONDS = 365 * 24 * 60 * 60

const CONTENT_TYPES: Record<string, string> = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
}

type BrowserBridgeUpstream = {
    host: string
    port: number
    capability: string
}

type BrowserClientHostDependencies = {
    bridge: BrowserBridgeUpstream
    staticRoot?: string
    devRendererUrl?: string
    host?: string
    port?: number
}

export class BrowserClientHost {
    private server: Server | null = null

    constructor(private readonly dependencies: BrowserClientHostDependencies) {}

    async start(): Promise<{ host: string; port: number; origin: string }> {
        if (this.server) return this.address()
        if (!this.dependencies.devRendererUrl) {
            const indexPath = join(this.requireStaticRoot(), 'index.html')
            await access(indexPath).catch(() => {
                throw new Error(`The browser renderer is missing at ${indexPath}.`)
            })
        }

        const server = createServer((request, response) => {
            void this.handleRequest(request, response).catch((error) => {
                this.writeError(
                    response,
                    500,
                    error instanceof Error ? error.message : 'The Zyra browser host failed.'
                )
            })
        })
        this.server = server
        try {
            await new Promise<void>((resolveStart, rejectStart) => {
                const fail = (error: Error) => {
                    server.off('listening', ready)
                    rejectStart(error)
                }
                const ready = () => {
                    server.off('error', fail)
                    resolveStart()
                }
                server.once('error', fail)
                server.once('listening', ready)
                server.listen(this.dependencies.port ?? BROWSER_CLIENT_HOST_PORT, this.dependencies.host ?? BROWSER_ASSISTANT_BRIDGE_HOST)
            })
        } catch (error) {
            this.server = null
            server.close()
            throw error
        }
        return this.address()
    }

    async stop(): Promise<void> {
        const server = this.server
        this.server = null
        if (!server) return
        await new Promise<void>((resolveStop) => server.close(() => resolveStop()))
    }

    private address(): { host: string; port: number; origin: string } {
        const address = this.server?.address()
        const host = this.dependencies.host ?? BROWSER_ASSISTANT_BRIDGE_HOST
        const port = address && typeof address !== 'string'
            ? address.port
            : this.dependencies.port ?? BROWSER_CLIENT_HOST_PORT
        return { host, port, origin: `http://${host}:${port}` }
    }

    private requireStaticRoot(): string {
        if (!this.dependencies.staticRoot) throw new Error('The production browser renderer path is unavailable.')
        return resolve(this.dependencies.staticRoot)
    }

    private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        this.writeSecurityHeaders(response)
        const localOrigin = this.resolveLocalOrigin(request)
        if (!localOrigin) {
            this.writeError(response, 403, 'Zyra browser requests require the local Zyra origin.')
            return
        }

        const requestUrl = new URL(request.url || '/', localOrigin)
        if (this.shouldCanonicalizeRendererOrigin(request, requestUrl)) {
            const address = this.address()
            response.statusCode = 308
            response.setHeader('Location', `http://${BROWSER_ASSISTANT_BRIDGE_HOST}:${address.port}${requestUrl.pathname}${requestUrl.search}`)
            response.setHeader('Cache-Control', 'no-store')
            response.end()
            return
        }
        if (this.isBridgePath(requestUrl.pathname)) {
            await this.proxyBridgeRequest(request, response, requestUrl, localOrigin)
            return
        }
        if (this.dependencies.devRendererUrl) {
            await this.proxyRendererRequest(request, response)
            return
        }
        await this.serveStaticRequest(request, response, requestUrl)
    }

    private resolveLocalOrigin(request: IncomingMessage): string | null {
        const hostHeader = String(request.headers.host || '').trim()
        if (!hostHeader || /[\s\\/]/.test(hostHeader)) return null
        let hostUrl: URL
        try {
            hostUrl = new URL(`http://${hostHeader}`)
        } catch {
            return null
        }
        if (!LOCAL_HOSTNAMES.has(hostUrl.hostname.toLowerCase())) return null
        const address = this.address()
        const requestedPort = hostUrl.port ? Number(hostUrl.port) : 80
        if (requestedPort !== address.port) return null
        const localOrigin = hostUrl.origin
        const requestOrigin = String(request.headers.origin || '').trim()
        if (requestOrigin) {
            try {
                if (new URL(requestOrigin).origin.toLowerCase() !== localOrigin.toLowerCase()) return null
            } catch {
                return null
            }
        }
        if (String(request.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return null
        return localOrigin
    }

    private shouldCanonicalizeRendererOrigin(request: IncomingMessage, requestUrl: URL): boolean {
        return requestUrl.hostname.toLowerCase() === 'localhost'
            && (request.method === 'GET' || request.method === 'HEAD')
            && !this.isBridgePath(requestUrl.pathname)
    }

    private isBridgePath(pathname: string): boolean {
        return pathname === BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX
            || pathname.startsWith(`${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}/`)
    }

    private async proxyBridgeRequest(
        request: IncomingMessage,
        response: ServerResponse,
        requestUrl: URL,
        localOrigin: string
    ): Promise<void> {
        if (request.method === 'OPTIONS') {
            response.statusCode = 204
            response.end()
            return
        }
        if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'POST') {
            this.writeError(response, 405, 'Browser bridge method is not allowed.')
            return
        }
        const upstreamPathname = requestUrl.pathname.slice(BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX.length) || '/'
        const isFileContentRequest = upstreamPathname === BROWSER_FILE_BRIDGE_PATH
            && (request.method === 'GET' || request.method === 'HEAD')
        const hasClientHeader = request.headers[BROWSER_ASSISTANT_BRIDGE_HEADER] === BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
        const sameOriginFileSubresource = isFileContentRequest && this.isSameOriginSubresource(request, localOrigin)
        if (!hasClientHeader && !sameOriginFileSubresource) {
            this.writeError(response, 403, 'Browser bridge client header is missing.')
            return
        }

        const upstreamPath = `${upstreamPathname}${requestUrl.search}`
        await new Promise<void>((resolveProxy) => {
            const upstream = requestHttp({
                host: this.dependencies.bridge.host,
                port: this.dependencies.bridge.port,
                path: upstreamPath,
                method: request.method,
                headers: {
                    Accept: String(request.headers.accept || '*/*'),
                    'Content-Type': String(request.headers['content-type'] || 'application/json'),
                    Origin: localOrigin,
                    ...(request.headers.range ? { Range: String(request.headers.range) } : {}),
                    ...(request.headers[BROWSER_ASSISTANT_CLIENT_ID_HEADER]
                        ? { [BROWSER_ASSISTANT_CLIENT_ID_HEADER]: String(request.headers[BROWSER_ASSISTANT_CLIENT_ID_HEADER]) }
                        : {}),
                    [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
                    [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: this.dependencies.bridge.capability
                }
            }, (upstreamResponse) => {
                response.statusCode = upstreamResponse.statusCode || 502
                for (const header of ['accept-ranges', 'content-range', 'content-security-policy', 'content-type', 'cache-control', 'content-length', 'vary'] as const) {
                    const value = upstreamResponse.headers[header]
                    if (value !== undefined) response.setHeader(header, value)
                }
                upstreamResponse.on('end', resolveProxy)
                upstreamResponse.pipe(response)
            })
            upstream.on('error', () => {
                this.writeError(response, 503, 'The Zyra Desktop browser bridge is unavailable.')
                resolveProxy()
            })
            request.on('aborted', () => upstream.destroy())
            response.on('close', () => {
                upstream.destroy()
                resolveProxy()
            })
            request.pipe(upstream)
        })
    }

    private isSameOriginSubresource(request: IncomingMessage, localOrigin: string): boolean {
        if (String(request.headers['sec-fetch-site'] || '').toLowerCase() === 'same-origin') return true
        const referer = String(request.headers.referer || '').trim()
        if (!referer) return false
        try {
            return new URL(referer).origin.toLowerCase() === localOrigin.toLowerCase()
        } catch {
            return false
        }
    }

    private async proxyRendererRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            this.writeError(response, 405, 'The Zyra browser renderer is read-only.')
            return
        }
        const rendererUrl = new URL(request.url || '/', this.dependencies.devRendererUrl)
        const configuredRenderer = new URL(this.dependencies.devRendererUrl!)
        rendererUrl.protocol = configuredRenderer.protocol
        rendererUrl.hostname = configuredRenderer.hostname
        rendererUrl.port = configuredRenderer.port
        await new Promise<void>((resolveProxy) => {
            const upstream = requestHttp(rendererUrl, {
                method: request.method,
                headers: {
                    Accept: String(request.headers.accept || '*/*'),
                    'User-Agent': String(request.headers['user-agent'] || '')
                }
            }, (upstreamResponse) => {
                response.statusCode = upstreamResponse.statusCode || 502
                for (const header of ['content-type', 'cache-control', 'content-length', 'etag', 'last-modified'] as const) {
                    const value = upstreamResponse.headers[header]
                    if (value !== undefined) response.setHeader(header, value)
                }
                upstreamResponse.on('end', resolveProxy)
                upstreamResponse.pipe(response)
            })
            upstream.on('error', () => {
                this.writeError(response, 503, 'The Zyra development renderer is unavailable.')
                resolveProxy()
            })
            response.on('close', () => {
                upstream.destroy()
                resolveProxy()
            })
            upstream.end()
        })
    }

    private async serveStaticRequest(request: IncomingMessage, response: ServerResponse, requestUrl: URL): Promise<void> {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            this.writeError(response, 405, 'The Zyra browser renderer is read-only.')
            return
        }
        const staticRoot = this.requireStaticRoot()
        let decodedPath: string
        try {
            decodedPath = decodeURIComponent(requestUrl.pathname)
        } catch {
            this.writeError(response, 400, 'The browser path is invalid.')
            return
        }
        if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
            this.writeError(response, 400, 'The browser path is invalid.')
            return
        }

        const requestedPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '')
        let filePath = resolve(staticRoot, requestedPath)
        if (!this.isWithinRoot(staticRoot, filePath)) {
            this.writeError(response, 403, 'The browser path is outside the renderer.')
            return
        }

        let fileStat = await stat(filePath).catch(() => null)
        if ((!fileStat || !fileStat.isFile()) && !extname(requestedPath)) {
            filePath = join(staticRoot, 'index.html')
            fileStat = await stat(filePath).catch(() => null)
        }
        if (!fileStat?.isFile()) {
            this.writeError(response, 404, 'Browser asset not found.')
            return
        }

        const extension = extname(filePath).toLowerCase()
        const etag = `W/\"${fileStat.size.toString(16)}-${Math.round(fileStat.mtimeMs).toString(16)}\"`
        response.statusCode = request.headers['if-none-match'] === etag ? 304 : 200
        response.setHeader('Content-Type', CONTENT_TYPES[extension] || 'application/octet-stream')
        response.setHeader('Content-Length', String(fileStat.size))
        response.setHeader('ETag', etag)
        response.setHeader(
            'Cache-Control',
            requestedPath.startsWith('assets/')
                ? `public, max-age=${STATIC_CACHE_SECONDS}, immutable`
                : 'no-cache'
        )
        if (response.statusCode === 304 || request.method === 'HEAD') {
            response.end()
            return
        }
        await new Promise<void>((resolveRead, rejectRead) => {
            const stream = createReadStream(filePath)
            stream.on('error', rejectRead)
            stream.on('end', resolveRead)
            response.on('close', resolveRead)
            stream.pipe(response)
        })
    }

    private isWithinRoot(root: string, candidate: string): boolean {
        const pathFromRoot = relative(root, candidate)
        return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
    }

    private writeSecurityHeaders(response: ServerResponse): void {
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader('Referrer-Policy', 'no-referrer')
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
        response.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()')
    }

    private writeError(response: ServerResponse, statusCode: number, error: string): void {
        if (response.headersSent) {
            response.end()
            return
        }
        this.writeSecurityHeaders(response)
        response.statusCode = statusCode
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify({ ok: false, error }))
    }
}

export function getBrowserClientHostOrigins(port = BROWSER_CLIENT_HOST_PORT): Set<string> {
    return new Set([
        port === BROWSER_CLIENT_HOST_PORT ? BROWSER_CLIENT_HOST_ORIGIN : `http://127.0.0.1:${port}`,
        `http://localhost:${port}`
    ])
}

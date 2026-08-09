import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { request as requestHttp } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_DESCRIPTOR_NAME,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_HOST,
    BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX,
    type BrowserAssistantBridgeDescriptor
} from '../../src/shared/browser-assistant-bridge'

function resolveDescriptorPath(): string {
    if (process.env.ZYRA_BROWSER_ASSISTANT_BRIDGE_DESCRIPTOR) {
        return process.env.ZYRA_BROWSER_ASSISTANT_BRIDGE_DESCRIPTOR
    }
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'Zyra-dev', BROWSER_ASSISTANT_BRIDGE_DESCRIPTOR_NAME)
}

async function readDescriptor(): Promise<BrowserAssistantBridgeDescriptor> {
    const descriptor = JSON.parse(await readFile(resolveDescriptorPath(), 'utf8')) as Partial<BrowserAssistantBridgeDescriptor>
    if (
        descriptor.host !== BROWSER_ASSISTANT_BRIDGE_HOST
        || !Number.isSafeInteger(descriptor.port)
        || Number(descriptor.port) < 1_024
        || Number(descriptor.port) > 65_535
        || typeof descriptor.capability !== 'string'
        || descriptor.capability.length < 32
    ) {
        throw new Error('The Zyra browser bridge descriptor is invalid.')
    }
    return descriptor as BrowserAssistantBridgeDescriptor
}

function resolveRequestOrigin(request: IncomingMessage): string | null {
    const host = String(request.headers.host || '').toLowerCase()
    const hostName = host.replace(/^\[/, '').replace(/\](?::\d+)?$/, '').split(':')[0]
    if (hostName !== 'localhost' && hostName !== '127.0.0.1') return null

    const originHeader = String(request.headers.origin || '')
    if (!originHeader) return `http://${host}`
    try {
        const origin = new URL(originHeader)
        if (origin.protocol !== 'http:' || origin.host.toLowerCase() !== host) return null
        return origin.origin
    } catch {
        return null
    }
}

function writeProxyError(response: ServerResponse, statusCode: number, error: string): void {
    if (response.headersSent) {
        response.end()
        return
    }
    response.statusCode = statusCode
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ ok: false, error }))
}

async function proxyBrowserAssistantRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = resolveRequestOrigin(request)
    if (!origin) {
        writeProxyError(response, 403, 'Browser bridge requests require the local Zyra origin.')
        return
    }
    if (request.method === 'OPTIONS') {
        response.statusCode = 204
        response.end()
        return
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
        writeProxyError(response, 405, 'Browser bridge method is not allowed.')
        return
    }

    let descriptor: BrowserAssistantBridgeDescriptor
    try {
        descriptor = await readDescriptor()
    } catch {
        writeProxyError(response, 503, 'The Zyra Desktop browser bridge is unavailable. Keep Desktop running and reload this page.')
        return
    }

    const originalUrl = request.url || '/'
    const upstreamPath = originalUrl.slice(BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX.length) || '/'
    const upstream = requestHttp({
        host: descriptor.host,
        port: descriptor.port,
        path: upstreamPath,
        method: request.method,
        headers: {
            Accept: String(request.headers.accept || '*/*'),
            'Content-Type': String(request.headers['content-type'] || 'application/json'),
            Origin: origin,
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
            [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: descriptor.capability
        }
    }, (upstreamResponse) => {
        response.statusCode = upstreamResponse.statusCode || 502
        for (const header of ['content-type', 'cache-control', 'content-length'] as const) {
            const value = upstreamResponse.headers[header]
            if (value !== undefined) response.setHeader(header, value)
        }
        upstreamResponse.pipe(response)
    })
    upstream.on('error', () => {
        writeProxyError(response, 503, 'The Zyra Desktop browser bridge disconnected. Reload after Desktop is running.')
    })
    request.on('aborted', () => upstream.destroy())
    response.on('close', () => upstream.destroy())
    request.pipe(upstream)
}

export function browserAssistantBridgeProxyPlugin(): Plugin {
    return {
        name: 'zyra-browser-assistant-bridge-proxy',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (!String(request.url || '').startsWith(BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX)) {
                    next()
                    return
                }
                void proxyBrowserAssistantRequest(request, response)
            })
        }
    }
}

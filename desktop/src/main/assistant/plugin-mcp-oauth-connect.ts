import { auth, Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { PluginMcpCredentialStore } from './plugin-mcp-credential-store'
import { PluginMcpOAuthProvider } from './plugin-mcp-oauth-provider'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveZyraRoot } from '../zyra/zyra-root'

const SIGN_IN_TIMEOUT_MS = 5 * 60_000

function allowedAuthorizationUrl(url: URL): boolean {
    return url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
}

export async function connectPluginMcpOAuth(input: {
    server: { url: string; oauthResource?: string; scopes?: string[]; googleDesktop?: boolean; oauth?: { clientId: string; clientSecret?: string; callbackPort?: number } }
    authorizeBeforeConnect?: boolean
    googleApi?: boolean
    verifyConnection?: () => Promise<{ toolCount: number }>
    signal?: AbortSignal
    serviceName?: string
    credentialKey: string
    store: PluginMcpCredentialStore
    openExternal: (url: string) => Promise<void>
}): Promise<{ toolCount: number; authenticated: boolean }> {
    input.signal?.throwIfAborted()
    const pages = await import(/* @vite-ignore */ pathToFileURL(join(resolveZyraRoot(), 'src', 'auth-callback-page.mjs')).href)
    const page = (failed = false) => pages.renderAuthCallbackPage({ serviceName: input.serviceName || 'Account', failed })
    let resolveCallback!: (value: URL) => void
    let rejectCallback!: (reason: Error) => void
    const callback = new Promise<URL>((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject })
    void callback.catch(() => undefined)
    let expectedState = ''
    const callbackPath = input.server.googleDesktop || input.server.oauth?.callbackPort ? '/' : '/oauth/callback'
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1')
        if (request.method !== 'GET' || url.pathname !== callbackPath) {
            response.writeHead(404).end()
            return
        }
        if (!expectedState || url.searchParams.get('state') !== expectedState) {
            response.writeHead(400, pages.AUTH_CALLBACK_HEADERS).end(page(true))
            return
        }
        const failed = url.searchParams.has('error') || !url.searchParams.get('code')
        response.writeHead(failed ? 400 : 200, pages.AUTH_CALLBACK_HEADERS).end(page(failed))
        resolveCallback(url)
    })
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(input.server.oauth?.callbackPort || 0, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
    const address = server.address()
    if (!address || typeof address === 'string') { server.close(); throw new Error('Could not start Plugin MCP sign-in callback.') }
    const redirectUrl = `http://127.0.0.1:${address.port}${callbackPath}`
    const provider = new PluginMcpOAuthProvider(input.store, input.credentialKey, redirectUrl, async (authorizationUrl) => {
        if (!allowedAuthorizationUrl(authorizationUrl)) throw new Error('Plugin MCP authorization URL is not secure.')
        await input.openExternal(authorizationUrl.toString())
    }, input.server, input.signal)
    expectedState = provider.expectedState
    let client = new Client({ name: 'zyra', version: '0.6.2' })
    let transport = new StreamableHTTPClientTransport(new URL(input.server.url), { authProvider: provider })
    let authenticated = false
    const waitForCallback = async (): Promise<URL> => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Plugin MCP sign-in timed out.')), SIGN_IN_TIMEOUT_MS)
            timer.unref?.()
        })
        try {
            const url = await Promise.race([callback, timeout])
            if (url.searchParams.get('state') !== provider.expectedState) throw new Error('Plugin MCP sign-in state did not match.')
            if (url.searchParams.has('error')) throw new Error('Plugin MCP sign-in was declined or failed.')
            if (!url.searchParams.get('code')) throw new Error('Plugin MCP sign-in returned no authorization code.')
            return url
        } finally { if (timer) clearTimeout(timer) }
    }
    const cancelled = () => { rejectCallback(new Error('Plugin sign-in was cancelled.')); server.close() }
    input.signal?.addEventListener('abort', cancelled, { once: true })
    try {
        input.signal?.throwIfAborted()
        // Google's initialize/list-tools can be public. Connect must authorize
        // explicitly, using only this product's scopes rather than every scope
        // advertised in protected-resource metadata.
        if (input.authorizeBeforeConnect) {
            const options = {
                serverUrl: input.googleApi ? 'https://accounts.google.com' : input.server.url,
                scope: input.server.scopes?.join(' '), forceReauthorization: Boolean(input.googleApi),
                ...(input.googleApi ? { fetchFn: async (url: string | URL, init?: RequestInit) => {
                    if (!['https://accounts.google.com', 'https://oauth2.googleapis.com'].includes(new URL(url).origin)) throw new Error('Google OAuth discovery changed to an untrusted endpoint.')
                    try { return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(input.signal ? [input.signal] : []), ...(init?.signal ? [init.signal] : [])]) }) }
                    catch { throw new Error('Google sign-in request failed or was cancelled.') }
                } } : {}),
            }
            if (await auth(provider, options) === 'REDIRECT') {
                const url = await waitForCallback()
                await auth(provider, { ...options, authorizationCode: url.searchParams.get('code') || undefined, iss: url.searchParams.get('iss') || undefined })
            }
            authenticated = true
        }
        input.signal?.throwIfAborted()
        if (input.verifyConnection) return { ...await input.verifyConnection(), authenticated }
        if (input.googleApi) throw new Error('Google API access must be verified before marking this connection connected.')
        const connectAndDiscover = async () => {
            input.signal?.throwIfAborted()
            await client.connect(transport, { signal: input.signal, timeout: 30_000 })
            const tools = await client.listTools(undefined, { signal: input.signal, timeout: 30_000 })
            input.signal?.throwIfAborted()
            if (!tools.tools.length) throw new Error('The service connected but advertised no tools. This Plugin is not ready to use yet.')
            return { toolCount: tools.tools.length, authenticated }
        }
        // Some providers make initialization public and challenge tools/list.
        // Both phases belong to the same explicit Connect + OAuth operation.
        try { return await connectAndDiscover() }
        catch (error) {
            if (!(error instanceof UnauthorizedError)) throw error
            if (input.authorizeBeforeConnect) throw new Error('Sign-in completed, but the provider denied access. Check the account permissions and provider policy.')
            const callbackUrl = await waitForCallback()
            input.signal?.throwIfAborted()
            await transport.finishAuth(callbackUrl.searchParams)
            await client.close().catch(() => undefined)
            client = new Client({ name: 'zyra', version: '0.6.2' })
            transport = new StreamableHTTPClientTransport(new URL(input.server.url), { authProvider: provider })
            authenticated = true
            return await connectAndDiscover()
        }
    } finally {
        input.signal?.removeEventListener('abort', cancelled)
        rejectCallback(new Error('Plugin MCP sign-in ended.'))
        server.close()
        await client.close().catch(() => undefined)
    }
}

import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AssistantPluginMcpConnectionStatus, AssistantPluginMcpSource } from '../../shared/assistant/contracts'
import { resolveZyraRoot } from '../zyra/zyra-root'
import type { AssistantPluginRegistry } from './assistant-plugin-registry'
import { PluginMcpCredentialStore, pluginMcpCredentialKey } from './plugin-mcp-credential-store'
import { connectPluginMcpOAuth } from './plugin-mcp-oauth-connect'
import { PluginMcpOAuthProvider } from './plugin-mcp-oauth-provider'
import { GooglePluginMcpClient, googleApiService } from './google-plugin-mcp-client'
import { GooglePluginApiAuth } from './google-plugin-api-auth'

type GoogleApiService = NonNullable<ReturnType<typeof googleApiService>>
type GoogleApiClient = {
    verifyAccount(options?: { signal?: AbortSignal }): Promise<{ toolCount: number }>
    listTools(params?: unknown, options?: { signal?: AbortSignal }): Promise<{ tools: unknown[] }>
    callTool(input: { name: string; arguments: Record<string, unknown> }, options?: { signal?: AbortSignal }): Promise<unknown>
    close(): Promise<void>
}
type McpServer = AssistantPluginMcpSource['servers'][number]
type McpPool = { listTools(pluginId: string, serverName: string): Promise<unknown[]>; close(): Promise<void> }
type McpPoolConstructor = new (sources: AssistantPluginMcpSource[], options: { authorize: () => Promise<boolean> }) => McpPool

let poolClassPromise: Promise<McpPoolConstructor> | null = null
async function poolClass(): Promise<McpPoolConstructor> {
    poolClassPromise ??= import(/* @vite-ignore */ pathToFileURL(join(resolveZyraRoot(), 'src', 'plugins', 'plugin-mcp-pool.mjs')).href)
        .then((module) => module.ZyraPluginMcpPool as McpPoolConstructor)
    return poolClassPromise
}

export class PluginMcpConnections {
    readonly credentials: PluginMcpCredentialStore
    private readonly googleClient: GooglePluginMcpClient
    private readonly googleAuth = new Map<string, GooglePluginApiAuth>()
    private readonly connecting = new Map<string, AbortController>()
    private readonly revoked = new Set<string>()

    constructor(
        private readonly registry: AssistantPluginRegistry,
        credentialFile: string,
        encryption: { isAvailable(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string },
        private readonly openExternal: (url: string) => Promise<void>,
        private readonly onDisconnect: (pluginId: string, serverName: string) => Promise<void> | void = () => undefined
    ) {
        this.credentials = new PluginMcpCredentialStore(credentialFile, encryption)
        this.googleClient = new GooglePluginMcpClient(new PluginMcpCredentialStore(join(dirname(credentialFile), 'google-mcp-client.enc'), encryption))
    }

    private async server(pluginId: string, serverName: string): Promise<{ source: AssistantPluginMcpSource; server: McpServer; key: string }> {
        const source = await this.registry.getInstalledMcpSource(pluginId)
        const server = source?.servers.find((entry) => entry.name === serverName)
        if (!source || !server) throw new Error('This MCP server is not available in the active Plugin release.')
        return { source, server, key: pluginMcpCredentialKey(pluginId, serverName, server) }
    }

    async list(pluginId: string): Promise<AssistantPluginMcpConnectionStatus[]> {
        const source = await this.registry.getInstalledMcpSource(pluginId)
        if (!source) return []
        return Promise.all(source.servers.map(async (server) => {
            const key = pluginMcpCredentialKey(pluginId, server.name, server)
            const record = await this.credentials.get(key)
            const api = googleApiService(server)
            return {
                pluginId,
                name: source.name,
                server: server.name,
                kind: server.kind,
                destination: server.kind === 'http' ? api?.destination || new URL(server.url).host : server.command,
                state: this.revoked.has(key) ? 'not-connected' as const
                    : record?.approvedDigest === source.contentDigest && !this.connecting.has(key) && (!api || record[api.verifiedFlag] === true) ? 'connected' as const
                    : record?.approvedDigest ? 'needs-review' as const : 'not-connected' as const
            }
        }))
    }

    async connect(pluginId: string, serverName: string): Promise<{ toolCount: number; authenticated: boolean }> {
        const { source, server, key } = await this.server(pluginId, serverName)
        if (this.connecting.has(key)) throw new Error('This Plugin connection is already signing in.')
        const controller = new AbortController()
        this.connecting.set(key, controller)
        const api = googleApiService(server)
        const approvedDigest = source.contentDigest
        const assertCurrentSource = async () => {
            controller.signal.throwIfAborted()
            const current = await this.registry.getInstalledMcpSource(pluginId)
            const currentServer = current?.servers.find(entry => entry.name === serverName)
            if (!current || !currentServer || current.contentDigest !== approvedDigest || pluginMcpCredentialKey(pluginId, serverName, currentServer) !== key) throw new Error('The Plugin release or server configuration changed while connecting. Refresh and connect the reviewed release again.')
            controller.signal.throwIfAborted()
        }
        let accountVerified = false
        try {
            let result: { toolCount: number; authenticated: boolean }
            if (server.kind === 'http' && !server.bearerTokenEnvVar) {
                if (api) {
                    await this.onDisconnect(pluginId, serverName)
                    this.googleAuth.delete(key)
                }
                const configuration = await this.googleClient.configuration(server.url)
                result = await connectPluginMcpOAuth({
                    server: { ...server, ...configuration, ...(api ? { oauthResource: undefined } : {}) },
                    googleApi: Boolean(api), signal: controller.signal, serviceName: source.name,
                    authorizeBeforeConnect: Boolean(configuration), credentialKey: key, store: this.credentials, openExternal: this.openExternal,
                    ...(api ? { verifyConnection: async () => {
                        const client = await this.apiClient(key, server, api)
                        try { const verified = await client.verifyAccount({ signal: controller.signal }); accountVerified = true; return verified }
                        finally { await client.close() }
                    } } : {}),
                })
            } else {
                const Pool = await poolClass()
                const pool = new Pool([source], { authorize: async () => true })
                try { result = { toolCount: (await pool.listTools(pluginId, serverName)).length, authenticated: false } }
                finally { await pool.close() }
            }
            if (api && !accountVerified) throw new Error(`Google sign-in ended without verifying ${api.name} API access.`)
            if (!Number.isInteger(result.toolCount) || result.toolCount <= 0) throw new Error('The service connected but advertised no tools. This Plugin is not ready to use yet.')
            await assertCurrentSource()
            await this.credentials.update(key, (record) => {
                controller.signal.throwIfAborted()
                return { ...record, approvedDigest, ...(api ? { [api.verifiedFlag]: true } : {}) }
            })
            try { await assertCurrentSource() }
            catch (error) {
                // Preserve encrypted tokens, but never leave a late verification
                // approved after its reviewed release or destination changed.
                await this.credentials.update(key, record => record.approvedDigest === approvedDigest
                    ? { ...record, approvedDigest: undefined, ...(api ? { [api.verifiedFlag]: undefined } : {}) } : record)
                throw error
            }
            this.revoked.delete(key)
            return result
        } finally { if (this.connecting.get(key) === controller) this.connecting.delete(key) }
    }

    async disconnect(pluginId: string, serverName: string): Promise<void> {
        const { key } = await this.server(pluginId, serverName)
        this.revoked.add(key)
        this.connecting.get(key)?.abort(new Error('Plugin connection was disconnected.'))
        this.googleAuth.delete(key)
        try { await this.credentials.disconnect(key) }
        finally { await this.onDisconnect(pluginId, serverName) }
    }

    async isApproved(source: AssistantPluginMcpSource, server: McpServer): Promise<boolean> {
        const key = pluginMcpCredentialKey(source.pluginId, server.name, server)
        const record = await this.credentials.get(key)
        return !this.revoked.has(key) && !this.connecting.has(key) && record?.approvedDigest === source.contentDigest
    }

    private async apiClient(key: string, server: McpServer, api: GoogleApiService): Promise<GoogleApiClient> {
        if (server.kind !== 'http') throw new Error(`${api.name} API needs its registered HTTP source.`)
        let auth = this.googleAuth.get(key)
        if (!auth) {
            auth = new GooglePluginApiAuth(this.credentials, key, async () => {
                const configuration = await this.googleClient.configuration(server.url)
                if (!configuration) throw new Error('Google sign-in registration is unavailable.')
                return configuration.oauth
            }, globalThis.fetch, api.name.replace(/^Google /u, ''))
            this.googleAuth.set(key, auth)
        }
        const module = await import(/* @vite-ignore */ pathToFileURL(join(resolveZyraRoot(), 'src', 'plugins', api.module)).href)
        return new module[api.client]({
            getAccess: auth.getAccess.bind(auth),
            onAuthorizationFailure: async () => this.markApiUnverified(key, api),
        }) as GoogleApiClient
    }

    private async markApiUnverified(key: string, api: GoogleApiService): Promise<void> {
        await this.credentials.update(key, record => Object.keys(record).length ? { ...record, [api.verifiedFlag]: undefined } : null)
    }

    async clientFor(source: AssistantPluginMcpSource, server: McpServer, signal?: AbortSignal): Promise<GoogleApiClient | undefined> {
        const api = googleApiService(server)
        if (!api) return undefined
        if (!await this.isApproved(source, server)) throw new Error(`${api.name} connection was not approved. Connect it in Plugins settings.`)
        const key = pluginMcpCredentialKey(source.pluginId, server.name, server)
        const client = await this.apiClient(key, server, api)
        try {
            await client.verifyAccount({ signal })
            await this.credentials.update(key, record => {
                signal?.throwIfAborted()
                if (this.revoked.has(key) || this.connecting.has(key) || record.approvedDigest !== source.contentDigest) throw new Error(`${api.name} was disconnected or its pinned release changed.`)
                return { ...record, [api.verifiedFlag]: true }
            })
            signal?.throwIfAborted()
            return client
        } catch (error) {
            await client.close()
            await this.markApiUnverified(key, api)
            throw error
        }
    }

    async authProviderFor(source: AssistantPluginMcpSource, server: McpServer): Promise<PluginMcpOAuthProvider | undefined> {
        if (server.kind !== 'http') return undefined
        const key = pluginMcpCredentialKey(source.pluginId, server.name, server)
        const record = await this.credentials.get(key)
        if (!Object.values(record?.issuers || {}).some((entry) => Boolean(entry.tokens))) return undefined
        return new PluginMcpOAuthProvider(this.credentials, key, 'http://127.0.0.1/oauth/callback', async () => {
            throw new Error('Reconnect this Plugin MCP server in Plugins settings to sign in again.')
        }, { ...server, ...await this.googleClient.configuration(server.url) })
    }
}

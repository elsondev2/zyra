import { randomBytes } from 'node:crypto'
import type {
    OAuthClientInformationContext,
    OAuthClientMetadata,
    OAuthClientProvider,
    OAuthDiscoveryState,
    StoredOAuthClientInformation,
    StoredOAuthTokens
} from '@modelcontextprotocol/client'
import { PluginMcpCredentialStore } from './plugin-mcp-credential-store'

function issuerKey(context?: OAuthClientInformationContext): string { return context?.issuer || 'default' }

export class PluginMcpOAuthProvider implements OAuthClientProvider {
    private verifier = ''
    private discovery: OAuthDiscoveryState | undefined
    private lastIssuer = 'default'
    readonly expectedState = randomBytes(24).toString('base64url')

    constructor(
        private readonly store: PluginMcpCredentialStore,
        private readonly key: string,
        readonly redirectUrl: string,
        private readonly openAuthorization: (url: URL) => Promise<void>,
        private readonly serverConfig?: { url: string; oauthResource?: string; scopes?: string[]; googleDesktop?: boolean; oauth?: { clientId: string; clientSecret?: string } },
        private readonly signal?: AbortSignal
    ) {}

    get clientMetadata(): OAuthClientMetadata {
        return {
            client_name: 'Zyra',
            redirect_uris: [this.redirectUrl],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: this.serverConfig?.oauth?.clientSecret ? 'client_secret_post' : 'none',
            ...(this.serverConfig?.scopes?.length ? { scope: this.serverConfig.scopes.join(' ') } : {})
        }
    }

    state(): string { return this.expectedState }

    async clientInformation(context?: OAuthClientInformationContext): Promise<StoredOAuthClientInformation | undefined> {
        if (this.serverConfig?.googleDesktop && context && new URL(context.issuer).origin !== 'https://accounts.google.com') {
            throw new Error('Google MCP authorization issuer does not match Google.')
        }
        if (this.serverConfig?.googleDesktop && this.serverConfig.oauth) {
            return {
                client_id: this.serverConfig.oauth.clientId,
                ...(this.serverConfig.oauth.clientSecret ? { client_secret: this.serverConfig.oauth.clientSecret, token_endpoint_auth_method: 'client_secret_post' } : {}),
                ...(context ? { issuer: context.issuer } : {})
            }
        }
        const record = await this.store.get(this.key)
        const issuer = issuerKey(context)
        const entry = record?.issuers?.[issuer] || (context ? undefined : record?.issuers?.[this.lastIssuer] || Object.values(record?.issuers || {})[0])
        return entry?.client as StoredOAuthClientInformation | undefined || (this.serverConfig?.oauth ? {
            client_id: this.serverConfig.oauth.clientId,
            ...(this.serverConfig.oauth.clientSecret ? { client_secret: this.serverConfig.oauth.clientSecret } : {})
        } : undefined)
    }

    async saveClientInformation(client: StoredOAuthClientInformation, context?: OAuthClientInformationContext): Promise<void> {
        const issuer = issuerKey(context)
        this.lastIssuer = issuer
        await this.store.update(this.key, (record) => ({
            ...record, issuers: { ...record.issuers, [issuer]: { ...record.issuers?.[issuer], client } }
        }))
    }

    async tokens(context?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> {
        const record = await this.store.get(this.key)
        const issuer = issuerKey(context)
        const entry = record?.issuers?.[issuer] || (context ? undefined : record?.issuers?.[this.lastIssuer] || Object.values(record?.issuers || {})[0])
        return entry?.tokens as StoredOAuthTokens | undefined
    }

    async saveTokens(tokens: StoredOAuthTokens, context?: OAuthClientInformationContext): Promise<void> {
        const issuer = issuerKey(context)
        this.lastIssuer = issuer
        this.signal?.throwIfAborted()
        await this.store.update(this.key, (record) => {
            this.signal?.throwIfAborted()
            return {
                ...record, ...(this.serverConfig?.googleDesktop ? { gmailApiVerified: undefined, calendarApiVerified: undefined, driveApiVerified: undefined } : {}),
                issuers: { ...record.issuers, [issuer]: { ...record.issuers?.[issuer], tokens } }
            }
        })
    }

    redirectToAuthorization(url: URL): Promise<void> {
        if (this.serverConfig?.googleDesktop) {
            if (url.origin !== 'https://accounts.google.com') throw new Error('Google MCP authorization must use Google sign-in.')
            url.searchParams.set('access_type', 'offline')
            url.searchParams.set('prompt', 'consent')
            url.searchParams.set('scope', this.serverConfig.scopes?.join(' ') || '')
        }
        return this.openAuthorization(url)
    }
    async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
        if (!this.serverConfig?.oauthResource) return undefined
        const server = new URL(serverUrl)
        const configured = new URL(this.serverConfig.oauthResource)
        if (configured.origin !== server.origin) throw new Error('Plugin OAuth resource does not match its MCP server.')
        if (resource && new URL(resource).origin !== server.origin) throw new Error('Plugin OAuth resource changed origin.')
        return configured
    }
    saveCodeVerifier(verifier: string): void { this.verifier = verifier }
    codeVerifier(): string {
        if (!this.verifier) throw new Error('Plugin MCP OAuth verifier is unavailable. Start sign-in again.')
        return this.verifier
    }
    saveDiscoveryState(state: OAuthDiscoveryState): void { this.discovery = state }
    discoveryState(): OAuthDiscoveryState | undefined { return this.discovery }

    async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
        if (scope === 'verifier' || scope === 'all') this.verifier = ''
        if (scope === 'discovery' || scope === 'all') this.discovery = undefined
        if (scope === 'verifier' || scope === 'discovery') return
        await this.store.update(this.key, (record) => {
            const issuers = Object.fromEntries(Object.entries(record.issuers || {}).map(([issuer, entry]) => [issuer, {
                ...(scope !== 'client' && scope !== 'all' && entry.client ? { client: entry.client } : {}),
                ...(scope !== 'tokens' && scope !== 'all' && entry.tokens ? { tokens: entry.tokens } : {})
            }]))
            return { ...record, issuers, approvedDigest: undefined, gmailApiVerified: undefined, calendarApiVerified: undefined, driveApiVerified: undefined }
        })
    }
}

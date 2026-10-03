import { PluginMcpCredentialStore } from './plugin-mcp-credential-store'
const ISSUER = 'https://accounts.google.com'
type Tokens = { access_token: string; token_type?: string; refresh_token?: string; expires_at?: number; scope?: string; [key: string]: unknown }
type Access = { accessToken: string; scopes: string[] }
type Client = { clientId: string; clientSecret: string }
function tokensFrom(record: Awaited<ReturnType<PluginMcpCredentialStore['get']>>): Tokens | undefined {
    const tokens = record?.issuers?.[ISSUER]?.tokens as Tokens | undefined
    return tokens && typeof tokens.access_token === 'string' && tokens.access_token.length > 0 && (tokens.token_type === undefined || typeof tokens.token_type === 'string' && tokens.token_type.toLowerCase() === 'bearer') ? tokens : undefined
}
async function json(response: Response): Promise<Record<string, any>> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Google returned no authorization response.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > 64 * 1024) throw new Error('Google authorization response exceeds its limit.')
            chunks.push(value)
        }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response.')
        return data
    } catch { await reader.cancel().catch(() => undefined); throw new Error('Google returned an invalid authorization response.') }
    finally { reader.releaseLock() }
}
/** Host-only credential access. Granted scopes come from Google's tokeninfo,
 * never from the plugin's requested scopes or an assumed full-account grant. */
export class GooglePluginApiAuth {
    private cached: (Access & { until: number }) | undefined
    private refreshing: Promise<void> | undefined
    constructor(
        private readonly store: PluginMcpCredentialStore,
        private readonly key: string,
        private readonly getClient: () => Promise<Client>,
        private readonly request: typeof fetch = globalThis.fetch,
        private readonly serviceName = 'Gmail'
    ) {}

    private async invalidate(tokens: Tokens): Promise<void> {
        this.cached = undefined
        await this.store.update(this.key, record => {
            if (tokensFrom(record)?.access_token !== tokens.access_token) return record
            const entry = record.issuers?.[ISSUER]
            return { ...record, approvedDigest: undefined, gmailApiVerified: undefined, calendarApiVerified: undefined, driveApiVerified: undefined,
                issuers: { ...record.issuers, [ISSUER]: { ...(entry?.client ? { client: entry.client } : {}) } } }
        })
    }

    private async refresh(tokens: Tokens, signal: AbortSignal): Promise<void> {
        if (this.refreshing) return this.refreshing
        const work = (async () => {
            if (!tokens.refresh_token) {
                await this.invalidate(tokens)
                throw new Error(`Google ${this.serviceName} authorization expired. Reconnect this account.`)
            }
            const client = await this.getClient()
            signal.throwIfAborted()
            let response: Response
            try {
                response = await this.request('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal,
                    headers: { 'content-type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.clientId, client_secret: client.clientSecret }),
                })
            } catch { throw new Error(`Google ${this.serviceName} token refresh failed or was cancelled. Reconnect if this persists.`) }
            const data = await json(response)
            if (!response.ok) {
                if (data.error === 'invalid_grant' || data.error === 'invalid_token') await this.invalidate(tokens)
                throw new Error(data.error === 'invalid_grant' || data.error === 'invalid_token' ? `Google revoked or expired ${this.serviceName} authorization. Reconnect this account.` : `Google declined the ${this.serviceName} token refresh. Check the app registration and reconnect.`)
            }
            if (typeof data.access_token !== 'string' || !data.access_token || String(data.token_type || '').toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error(`Google returned an invalid ${this.serviceName} token refresh.`)
            signal.throwIfAborted()
            await this.store.update(this.key, record => {
                signal.throwIfAborted()
                if (tokensFrom(record)?.access_token !== tokens.access_token) throw new Error(`${this.serviceName} authorization changed during refresh. Retry after reconnecting.`)
                const entry = record.issuers?.[ISSUER]
                return { ...record, issuers: { ...record.issuers, [ISSUER]: { ...entry, tokens: {
                    access_token: data.access_token, token_type: data.token_type,
                    refresh_token: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : tokens.refresh_token,
                    expires_at: Date.now() + data.expires_in * 1000,
                    ...(typeof data.scope === 'string' ? { scope: data.scope } : {}), issuer: ISSUER,
                } } } }
            })
            this.cached = undefined
        })()
        this.refreshing = work
        try { await work } finally { if (this.refreshing === work) this.refreshing = undefined }
    }

    async getAccess({ signal, forceRefresh = false }: { signal?: AbortSignal; forceRefresh?: boolean } = {}): Promise<Access> {
        const activeSignal = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])])
        activeSignal.throwIfAborted()
        let tokens = tokensFrom(await this.store.get(this.key))
        if (!tokens) throw new Error(`${this.serviceName} is not authorized. Connect this account in Plugins settings.`)
        if (forceRefresh || typeof tokens.expires_at === 'number' && tokens.expires_at <= Date.now() + 30_000) {
            await this.refresh(tokens, activeSignal)
            tokens = tokensFrom(await this.store.get(this.key))
            if (!tokens) throw new Error(`${this.serviceName} was disconnected during authorization.`)
        }
        activeSignal.throwIfAborted()
        if (this.cached?.accessToken === tokens.access_token && this.cached.until > Date.now()) return { accessToken: this.cached.accessToken, scopes: [...this.cached.scopes] }
        const client = await this.getClient()
        const verify = async (): Promise<Response> => {
            // This fixed Google endpoint documents access_token as a query
            // parameter. The URL stays inside the host and is never logged,
            // forwarded to the agent, persisted, or shown in a browser.
            const url = new URL('https://www.googleapis.com/oauth2/v2/tokeninfo')
            url.searchParams.set('access_token', tokens!.access_token)
            try { return await this.request(url, { method: 'POST', redirect: 'error', signal: activeSignal }) }
            catch { throw new Error(`Google ${this.serviceName} scope verification failed or was cancelled.`) }
        }
        let response = await verify()
        if ([400, 401].includes(response.status) && !forceRefresh) {
            await response.body?.cancel().catch(() => undefined)
            await this.refresh(tokens, activeSignal)
            tokens = tokensFrom(await this.store.get(this.key))
            if (!tokens) throw new Error(`${this.serviceName} was disconnected during authorization.`)
            response = await verify()
        }
        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined)
            if ([400, 401].includes(response.status)) await this.invalidate(tokens)
            throw new Error(`Google could not verify the current ${this.serviceName} authorization. Reconnect if this persists.`)
        }
        const info = await json(response)
        if ((info.issued_to || info.audience) !== client.clientId || info.audience && info.audience !== client.clientId) throw new Error(`Google ${this.serviceName} authorization belongs to a different application. Reconnect this account.`)
        if (typeof info.scope !== 'string' || !Number.isFinite(info.expires_in) || info.expires_in <= 0) throw new Error(`Google returned no valid ${this.serviceName} granted-scope information. Reconnect this account.`)
        const scopes = [...new Set(info.scope.split(/\s+/u).filter(Boolean))]
        activeSignal.throwIfAborted()
        await this.store.update(this.key, record => {
            activeSignal.throwIfAborted()
            if (tokensFrom(record)?.access_token !== tokens!.access_token) throw new Error(`${this.serviceName} authorization changed during verification. Reconnect and retry.`)
            const entry = record.issuers?.[ISSUER]
            return { ...record, issuers: { ...record.issuers, [ISSUER]: { ...entry, tokens: { ...tokens, scope: scopes.join(' '), expires_at: Date.now() + info.expires_in * 1000 } } } }
        })
        this.cached = { accessToken: tokens.access_token, scopes, until: Date.now() + Math.min(60_000, Math.max(0, info.expires_in * 1000 - 30_000)) }
        return { accessToken: this.cached.accessToken, scopes: [...scopes] }
    }
}

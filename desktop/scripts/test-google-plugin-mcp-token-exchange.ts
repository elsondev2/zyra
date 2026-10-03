import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auth } from '@modelcontextprotocol/client'
import { GooglePluginMcpClient, GOOGLE_MCP_CLIENT_KEY } from '../src/main/assistant/google-plugin-mcp-client'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
import { PluginMcpOAuthProvider } from '../src/main/assistant/plugin-mcp-oauth-provider'

const root = await mkdtemp(join(tmpdir(), 'zyra-google-token-exchange-'))
const encryption = {
    isAvailable: () => true,
    encrypt: (value: string) => Buffer.from(value).map(byte => byte ^ 0x5a),
    decrypt: (value: Buffer) => Buffer.from(value).map(byte => byte ^ 0x5a).toString('utf8')
}
const clientId = '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com'
const clientSecret = 'synthetic-desktop-client-secret'
const serverUrl = 'https://gmailmcp.googleapis.com/mcp/v1'
const originalFetch = globalThis.fetch
let tokenRequests = 0
try {
    const registrationFile = join(root, 'registration.enc')
    const registration = new PluginMcpCredentialStore(registrationFile, encryption)
    await registration.update(GOOGLE_MCP_CLIENT_KEY, () => ({ issuers: { 'https://accounts.google.com': { client: { client_id: clientId, client_secret: clientSecret } } } }))
    const configuration = await new GooglePluginMcpClient(registration).configuration(serverUrl)
    let authorization: URL | undefined
    const tokensFile = join(root, 'tokens.enc')
    const provider = new PluginMcpOAuthProvider(new PluginMcpCredentialStore(tokensFile, encryption), 'gmail', 'http://127.0.0.1:49152/', async url => { authorization = url }, { url: serverUrl, ...configuration! })
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.origin === 'https://gmailmcp.googleapis.com' && url.pathname.includes('.well-known/oauth-protected-resource')) {
            return Response.json({ resource: serverUrl, authorization_servers: ['https://accounts.google.com'], scopes_supported: ['admin'] })
        }
        if (url.origin === 'https://accounts.google.com' && url.pathname.includes('.well-known/')) {
            return Response.json({ issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth', token_endpoint: 'https://oauth2.googleapis.com/token', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'] })
        }
        if (url.href === 'https://oauth2.googleapis.com/token') {
            const params = new URLSearchParams(String(init?.body))
            tokenRequests++
            assert.equal(params.get('client_id'), clientId)
            if (!params.get('client_secret')) return Response.json({ error: 'invalid_request', error_description: 'client_secret is missing.' }, { status: 400 })
            assert.equal(params.get('client_secret'), clientSecret)
            if (params.get('grant_type') === 'refresh_token') {
                assert.equal(params.get('refresh_token'), 'synthetic-refresh-token')
                return Response.json({ access_token: 'synthetic-refreshed-access-token', token_type: 'Bearer', expires_in: 3600 })
            }
            assert.equal(params.get('grant_type'), 'authorization_code')
            assert.ok(params.get('code_verifier'), 'PKCE remains required')
            assert.equal(params.get('redirect_uri'), 'http://127.0.0.1:49152/')
            return Response.json({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', token_type: 'Bearer', expires_in: 3600 })
        }
        throw new Error(`Unexpected synthetic OAuth destination: ${url.origin}${url.pathname}`)
    }) as typeof fetch
    assert.equal(await auth(provider, { serverUrl, scope: configuration!.scopes.join(' ') }), 'REDIRECT')
    assert.equal(authorization?.searchParams.has('client_secret'), false, 'the secret never appears in the browser authorization URL')
    assert.equal(authorization?.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(await auth(provider, { serverUrl, authorizationCode: 'synthetic-code', iss: 'https://accounts.google.com', scope: configuration!.scopes.join(' ') }), 'AUTHORIZED')
    assert.equal(tokenRequests, 1)
    assert.equal((await provider.tokens({ issuer: 'https://accounts.google.com' }))?.access_token, 'synthetic-access-token')
    assert.equal(await auth(provider, { serverUrl, scope: configuration!.scopes.join(' ') }), 'AUTHORIZED')
    assert.equal(tokenRequests, 2, 'refresh uses the same registered Desktop client secret')
    assert.equal((await provider.tokens({ issuer: 'https://accounts.google.com' }))?.access_token, 'synthetic-refreshed-access-token')
    assert.equal((await provider.tokens({ issuer: 'https://accounts.google.com' }))?.refresh_token, 'synthetic-refresh-token')
    assert.equal((await readFile(registrationFile)).includes(Buffer.from(clientSecret)), false)
    assert.equal((await readFile(tokensFile)).includes(Buffer.from('synthetic-access-token')), false)
    console.log('Google Desktop token request carries encrypted registration fields, PKCE and exact scopes without exposing the secret in browser URLs.')
} finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }) }

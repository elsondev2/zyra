import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginMcpCredentialStore, pluginMcpCredentialKey } from '../src/main/assistant/plugin-mcp-credential-store'
import { GOOGLE_MCP_CLIENT_KEY } from '../src/main/assistant/google-plugin-mcp-client'

let received: any
let denyMailbox = false
const originalFetch = globalThis.fetch
mock.module('../src/main/assistant/plugin-mcp-oauth-connect', () => ({
    connectPluginMcpOAuth: async (input: any) => {
        received = input
        await input.store.update(input.credentialKey, (record: any) => ({ ...record, gmailApiVerified: undefined, issuers: { 'https://accounts.google.com': { tokens: { access_token: 'synthetic', token_type: 'Bearer' } } } }))
        return { ...await input.verifyConnection(), authenticated: true }
    }
}))
const { PluginMcpConnections } = await import('../src/main/assistant/plugin-mcp-connections')
const root = await mkdtemp(join(tmpdir(), 'zyra-google-wiring-'))
const encryption = {
    isAvailable: () => true,
    encrypt: (value: string) => Buffer.from(value).map(byte => byte ^ 0x5a),
    decrypt: (value: Buffer) => Buffer.from(value).map(byte => byte ^ 0x5a).toString('utf8')
}
try {
    const server = { name: 'gmail', kind: 'http' as const, url: 'https://gmailmcp.googleapis.com/mcp/v1', scopes: ['admin'], oauth: { clientId: 'untrusted-client', clientSecret: 'untrusted-package-secret' } }
    const source = { pluginId: 'gmail-plugin', name: 'Gmail', contentDigest: 'pinned-release', servers: [server] }
    const connections = new PluginMcpConnections({ getInstalledMcpSource: async () => source } as never, join(root, 'mcp-oauth.enc'), encryption, async () => undefined)
    const id = '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com'
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.origin === 'https://www.googleapis.com' && url.pathname === '/oauth2/v2/tokeninfo') return Response.json({ issued_to: id, audience: id, scope: 'https://www.googleapis.com/auth/gmail.readonly', expires_in: 3600 })
        if (url.origin === 'https://gmail.googleapis.com' && url.pathname.endsWith('/profile')) return denyMailbox ? Response.json({ error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, { status: 403 }) : Response.json({ emailAddress: 'synthetic@example.test' })
        if (url.origin === 'https://gmail.googleapis.com' && url.pathname.endsWith('/messages')) return Response.json({ messages: [] })
        throw new Error('Unexpected Gmail test destination.')
    }) as typeof fetch
    const registration = new PluginMcpCredentialStore(join(root, 'google-mcp-client.enc'), encryption)
    const secret = 'synthetic-desktop-client-secret'
    await registration.update(GOOGLE_MCP_CLIENT_KEY, () => ({ issuers: { 'https://accounts.google.com': { client: { client_id: id, client_secret: secret } } } }))
    assert.deepEqual(await connections.connect(source.pluginId, server.name), { toolCount: 10, authenticated: true })
    assert.equal(received.googleApi, true, 'Gmail connects through regular Google OAuth and the API verifier')
    assert.equal(received.authorizeBeforeConnect, true)
    assert.equal(received.server.oauth.clientId, id)
    assert.equal(received.server.oauth.clientSecret, secret, 'package-supplied client secrets must not override the app registration')
    assert.equal(received.server.scopes.includes('admin'), false)
    assert.equal(received.credentialKey, pluginMcpCredentialKey(source.pluginId, server.name, server), 'registration must not change the pinned descriptor identity')
    assert.equal((await connections.list(source.pluginId))[0].state, 'connected')
    assert.equal((await connections.list(source.pluginId))[0].destination, 'gmail.googleapis.com')
    const apiClient = await connections.clientFor(source as never, server)
    assert.ok(apiClient)
    assert.equal((await apiClient.listTools()).tools.length, 10, 'a partial Google grant filters runtime tool discovery')
    await apiClient.callTool({ name: 'search_messages', arguments: { query: 'in:inbox' } })
    await apiClient.close()
    const provider = await connections.authProviderFor(source as never, server)
    const information = await provider?.clientInformation({ issuer: 'https://accounts.google.com' })
    assert.equal(information?.client_id, id)
    assert.equal(information?.client_secret, secret)
    assert.equal(information?.token_endpoint_auth_method, 'client_secret_post')
    await assert.rejects(() => provider!.clientInformation({ issuer: 'https://attacker.example' }), /does not match/u)
    assert.throws(() => provider!.redirectToAuthorization(new URL('https://attacker.example/authorize')), /Google sign-in/u)
    denyMailbox = true
    await assert.rejects(() => connections.connect(source.pluginId, server.name), /regular Gmail API is disabled/u)
    assert.equal((await connections.list(source.pluginId))[0].state, 'needs-review', 'sign-in/discovery is not enough to claim Connected')
    denyMailbox = false
    await connections.connect(source.pluginId, server.name)
    const originalDisconnect = connections.credentials.disconnect.bind(connections.credentials)
    connections.credentials.disconnect = async () => { throw new Error('Synthetic credential-removal failure.') }
    await assert.rejects(() => connections.disconnect(source.pluginId, server.name), /credential-removal failure/u)
    assert.equal(await connections.isApproved(source as never, server), false, 'failed credential deletion still blocks runtime access')
    assert.equal((await connections.list(source.pluginId))[0].state, 'not-connected')
    connections.credentials.disconnect = originalDisconnect
    await connections.connect(source.pluginId, server.name)
    await connections.disconnect(source.pluginId, server.name)
    await assert.rejects(() => connections.clientFor(source as never, server), /not approved/u)
    assert.equal((await connections.list(source.pluginId))[0].state, 'not-connected')
    const originalUpdate = connections.credentials.update.bind(connections.credentials)
    let approvalWritten!: () => void
    let releaseApproval!: () => void
    const written = new Promise<void>(resolve => { approvalWritten = resolve })
    const release = new Promise<void>(resolve => { releaseApproval = resolve })
    connections.credentials.update = async (key, change) => {
        let approving = false
        await originalUpdate(key, record => { const next = change(record); approving = next?.gmailApiVerified === true; return next })
        if (approving) { approvalWritten(); await release }
    }
    const lateConnect = connections.connect(source.pluginId, server.name)
    void lateConnect.catch(() => undefined)
    await written
    const lateDisconnect = connections.disconnect(source.pluginId, server.name)
    releaseApproval()
    await assert.rejects(() => lateConnect, /disconnected/u)
    await lateDisconnect
    connections.credentials.update = originalUpdate
    assert.equal((await connections.list(source.pluginId))[0].state, 'not-connected', 'late cancellation must not reapprove the server')
    assert.ok(await registration.get(GOOGLE_MCP_CLIENT_KEY), 'disconnect removes user tokens, not developer registration')
    console.log('Google plugin source -> encrypted registration -> OAuth -> connection state and runtime refresh wiring passed.')
} finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }) }

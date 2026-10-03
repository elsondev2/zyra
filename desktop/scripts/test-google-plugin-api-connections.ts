import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginMcpCredentialStore, pluginMcpCredentialKey } from '../src/main/assistant/plugin-mcp-credential-store'
import { GOOGLE_MCP_CLIENT_KEY } from '../src/main/assistant/google-plugin-mcp-client'
let received: any
mock.module('../src/main/assistant/plugin-mcp-oauth-connect', () => ({
    connectPluginMcpOAuth: async (input: any) => {
        received = input
        await input.store.update(input.credentialKey, (record: any) => ({ ...record, gmailApiVerified: undefined, calendarApiVerified: undefined, driveApiVerified: undefined,
            issuers: { 'https://accounts.google.com': { tokens: { access_token: 'synthetic-google-api-token', token_type: 'Bearer' } } } }))
        return { ...await input.verifyConnection(), authenticated: true }
    }
}))
const { PluginMcpConnections } = await import('../src/main/assistant/plugin-mcp-connections')
const root = await mkdtemp(join(tmpdir(), 'zyra-all-google-api-'))
const encryption = { isAvailable: () => true, encrypt: (value: string) => Buffer.from(value).map(byte => byte ^ 0x5a), decrypt: (value: Buffer) => Buffer.from(value).map(byte => byte ^ 0x5a).toString('utf8') }
const originalFetch = globalThis.fetch
const id = '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com'
const rows = [
    { service: 'gmail', name: 'gmail', host: 'gmailmcp.googleapis.com', destination: 'gmail.googleapis.com', prefix: '/gmail/v1/', scopes: ['gmail.readonly'], flag: 'gmailApiVerified', write: 'send_draft', args: { draftId: 'fixture_id' } },
    { service: 'calendar', name: 'google-calendar', host: 'calendarmcp.googleapis.com', destination: 'www.googleapis.com/calendar/v3', prefix: '/calendar/v3/', scopes: ['calendar.calendarlist.readonly', 'calendar.events.readonly', 'calendar.events.freebusy'], flag: 'calendarApiVerified', write: 'create_event', args: {} },
    { service: 'drive', name: 'google-drive', host: 'drivemcp.googleapis.com', destination: 'www.googleapis.com/drive/v3', prefix: '/drive/v3/', scopes: ['drive.readonly'], flag: 'driveApiVerified', write: 'create_file', args: { name: 'Fixture', mimeType: 'application/vnd.google-apps.folder' } }
]
try {
    const registration = new PluginMcpCredentialStore(join(root, 'google-mcp-client.enc'), encryption)
    await registration.update(GOOGLE_MCP_CLIENT_KEY, () => ({ issuers: { 'https://accounts.google.com': { client: { client_id: id, client_secret: 'synthetic-desktop-client-secret' } } } }))
    for (const row of rows) {
        let denyRead = false
        let changeRelease = false
        let apiReads = 0
        const server = { name: row.name, kind: 'http' as const, url: `https://${row.host}/mcp/v1`, scopes: ['admin'], oauth: { clientId: 'untrusted-package-id', clientSecret: 'untrusted-package-secret' } }
        const source = { pluginId: `${row.service}-fixture`, name: row.service, contentDigest: 'reviewed-release', servers: [server] }
        const connections = new PluginMcpConnections({ getInstalledMcpSource: async () => ({ ...source, servers: [{ ...server }] }) } as never, join(root, `${row.service}-tokens.enc`), encryption, async () => { throw Error('Synthetic OAuth must not open a real sign-in.') })
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : String(input))
            if (url.origin === 'https://www.googleapis.com' && url.pathname === '/oauth2/v2/tokeninfo') return Response.json({ issued_to: id, audience: id, scope: row.scopes.map(scope => `https://www.googleapis.com/auth/${scope}`).join(' '), expires_in: 3600 })
            assert.equal(init?.method || 'GET', 'GET', 'readiness and denied writes never issue a mutation')
            assert.equal(url.origin, row.service === 'gmail' ? 'https://gmail.googleapis.com' : 'https://www.googleapis.com')
            assert.ok(url.pathname.startsWith(row.prefix), 'never contacts the preview MCP endpoint')
            apiReads++
            if (changeRelease) source.contentDigest = 'replacement-release'
            if (denyRead) return Response.json({ error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, { status: 403 })
            if (row.service === 'gmail') return Response.json({ emailAddress: 'synthetic@example.test' })
            if (row.service === 'calendar') return Response.json({ items: [{ id: 'primary', summary: 'Fixture', timeZone: 'UTC' }] })
            return Response.json({ user: { displayName: 'Fixture', emailAddress: 'synthetic@example.test' } })
        }) as typeof fetch
        const connected = await connections.connect(source.pluginId, server.name)
        assert.ok(connected.toolCount > 1)
        assert.equal(received.googleApi, true)
        assert.equal(received.authorizeBeforeConnect, true)
        assert.equal(received.server.oauth.clientId, id)
        assert.equal(received.server.scopes.includes('admin'), false)
        assert.equal(received.credentialKey, pluginMcpCredentialKey(source.pluginId, server.name, server))
        assert.equal((await connections.list(source.pluginId))[0].state, 'connected')
        assert.equal((await connections.list(source.pluginId))[0].destination, row.destination)
        assert.equal((await connections.credentials.get(received.credentialKey) as any)[row.flag], true)
        const client = await connections.clientFor(source as never, server)
        assert.ok(client)
        const tools = (await client.listTools()).tools
        assert.ok(!tools.some((tool: any) => tool.name === row.write), 'readonly grants hide writes despite broader requested consent')
        const before = apiReads
        await assert.rejects(() => client.callTool({ name: row.write, arguments: row.args }), /not granted|permission|authorization/iu)
        assert.equal(apiReads, before, 'direct write calls cannot bypass the actual grant')
        await client.close()
        denyRead = true
        await assert.rejects(() => connections.connect(source.pluginId, server.name), /disabled|denied/iu)
        assert.equal((await connections.list(source.pluginId))[0].state, 'needs-review', 'sign-in alone is not Connected when the real product API fails')
        denyRead = false
        changeRelease = true
        await assert.rejects(() => connections.connect(source.pluginId, server.name), /changed/u)
        assert.equal((await connections.list(source.pluginId))[0].state, 'needs-review', 'verification of an old release never approves its replacement')
        changeRelease = false
        source.contentDigest = 'reviewed-release'
        await connections.connect(source.pluginId, server.name)
        await connections.disconnect(source.pluginId, server.name)
        assert.equal((await connections.list(source.pluginId))[0].state, 'not-connected')
        await assert.rejects(() => connections.clientFor(source as never, server), /not approved/u)
    }
    assert.ok(await registration.get(GOOGLE_MCP_CLIENT_KEY), 'user disconnects preserve app-owned encrypted registration')
    console.log('All Google API routes: app registration, actual readonly grants, real-read readiness, failed verification, pinned-release races and disconnect passed.')
} finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }) }

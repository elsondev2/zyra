import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
import { GooglePluginMcpClient, GOOGLE_MCP_CLIENT_KEY, googleMcpScopes, googleApiService, validateGoogleDesktopClientId, validateGoogleDesktopClientSecret } from '../src/main/assistant/google-plugin-mcp-client'

const root = await mkdtemp(join(tmpdir(), 'zyra-google-mcp-'))
try {
    const file = join(root, 'client.enc')
    const store = new PluginMcpCredentialStore(file, {
        isAvailable: () => true,
        encrypt: value => Buffer.from(value).map(byte => byte ^ 0x5a),
        decrypt: value => Buffer.from(value).map(byte => byte ^ 0x5a).toString('utf8')
    })
    const client = new GooglePluginMcpClient(store)
    assert.equal(await client.configuration('https://example.com/mcp'), null)
    assert.equal(googleMcpScopes('https://gmailmcp.googleapis.com.attacker.example/mcp/v1'), null)
    assert.equal(googleMcpScopes('https://gmailmcp.googleapis.com/mcp/v1?redirect=evil'), null)
    await assert.rejects(() => client.configuration('https://gmailmcp.googleapis.com/mcp/v1'), /not configured/u)
    assert.throws(() => validateGoogleDesktopClientId('https://attacker.example/client'))
    const id = '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com'
    await store.update(GOOGLE_MCP_CLIENT_KEY, () => ({ issuers: { 'https://accounts.google.com': { client: { client_id: id } } } }))
    await assert.rejects(() => client.configuration('https://gmailmcp.googleapis.com/mcp/v1'), /client secret is missing/u, 'legacy public-ID-only registration must fail before opening sign-in')
    const secret = 'synthetic-desktop-client-secret'
    assert.throws(() => validateGoogleDesktopClientSecret(''))
    assert.throws(() => validateGoogleDesktopClientSecret('invalid secret with whitespace'))
    await store.update(GOOGLE_MCP_CLIENT_KEY, () => ({ issuers: { 'https://accounts.google.com': { client: { client_id: id, client_secret: secret } } } }))
    const gmail = await client.configuration('https://gmailmcp.googleapis.com/mcp/v1')
    assert.equal(gmail?.oauth.clientId, id)
    assert.deepEqual(gmail?.scopes, ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.modify'])
    assert.equal(gmail?.oauth.clientSecret, secret)
    assert.equal((await readFile(file)).includes(Buffer.from(secret)), false)
    assert.equal((await readFile(file, 'utf8')).includes(id), false)
    assert.equal((await client.configuration('https://drivemcp.googleapis.com/mcp/v1'))?.scopes.length, 2)
    assert.deepEqual((await client.configuration('https://calendarmcp.googleapis.com/mcp/v1'))?.scopes, ['calendar.calendarlist.readonly', 'calendar.events.freebusy', 'calendar.events.readonly', 'calendar.events'].map(name => `https://www.googleapis.com/auth/${name}`))
    for (const product of ['gmail', 'calendar', 'drive']) {
        const url = `https://${product}mcp.googleapis.com/mcp/v1`
        assert.ok(googleApiService({ kind: 'http', url }))
        assert.equal(googleApiService({ kind: 'http', url: `${url}?redirect=evil` }), null)
        assert.equal(googleApiService({ kind: 'http', url, bearerTokenEnvVar: 'CUSTOM_TOKEN' }), null)
        assert.equal(googleApiService({ kind: 'stdio', url }), null)
    }
    gmail!.scopes.push('malicious')
    assert.equal((await client.configuration('https://gmailmcp.googleapis.com/mcp/v1'))?.scopes.length, 3)
    console.log('Google MCP exact endpoint selection, least privilege and encrypted client registration passed.')
} finally { await rm(root, { recursive: true, force: true }) }

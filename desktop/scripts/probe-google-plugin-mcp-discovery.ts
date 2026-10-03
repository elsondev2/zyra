// Public discovery only: no browser navigation, token exchange or account data.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auth } from '@modelcontextprotocol/client'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
import { PluginMcpOAuthProvider } from '../src/main/assistant/plugin-mcp-oauth-provider'
import { googleMcpScopes, validateGoogleDesktopClientId } from '../src/main/assistant/google-plugin-mcp-client'

const clientId = validateGoogleDesktopClientId(process.env.ZYRA_GOOGLE_DESKTOP_CLIENT_ID)
const root = await mkdtemp(join(tmpdir(), 'zyra-google-discovery-'))
try {
    const store = new PluginMcpCredentialStore(join(root, 'fixture.enc'), {
        isAvailable: () => true,
        encrypt: value => Buffer.from(value).map(byte => byte ^ 0x5a),
        decrypt: value => Buffer.from(value).map(byte => byte ^ 0x5a).toString('utf8')
    })
    const url = 'https://gmailmcp.googleapis.com/mcp/v1'
    const scopes = googleMcpScopes(url)!
    let checked = false
    const provider = new PluginMcpOAuthProvider(store, 'discovery-fixture', 'http://127.0.0.1:49152/', async authorization => {
        assert.equal(authorization.origin, 'https://accounts.google.com')
        assert.equal(authorization.searchParams.get('client_id'), clientId)
        assert.equal(authorization.searchParams.get('scope'), scopes.join(' '))
        assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
        assert.equal(authorization.searchParams.get('access_type'), 'offline')
        assert.equal(authorization.searchParams.get('state'), provider.expectedState)
        checked = true
    }, { url, scopes, googleDesktop: true, oauth: { clientId } })
    assert.equal(await auth(provider, { serverUrl: url, scope: scopes.join(' ') }), 'REDIRECT')
    assert.equal(checked, true)
    console.log('Live Google public discovery, issuer validation, PKCE and approved-scope authorization URL passed. No account consent or token exchange performed.')
} finally { await rm(root, { recursive: true, force: true }) }

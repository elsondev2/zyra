import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PluginMcpCredentialStore, pluginMcpCredentialKey } from '../src/main/assistant/plugin-mcp-credential-store'
import { PluginMcpOAuthProvider } from '../src/main/assistant/plugin-mcp-oauth-provider'

const root = await mkdtemp(path.join(os.tmpdir(), 'zyra-mcp-secret-test-'))
const file = path.join(root, 'credentials', 'mcp.enc')
const encryption = {
    isAvailable: () => true,
    encrypt: (value: string) => Buffer.from(value, 'utf8').map((byte) => byte ^ 0x5a),
    decrypt: (value: Buffer) => Buffer.from(value).map((byte) => byte ^ 0x5a).toString('utf8')
}
try {
    const store = new PluginMcpCredentialStore(file, encryption)
    const key = pluginMcpCredentialKey('plugin-a', 'remote', { url: 'https://example.com/mcp' })
    assert.equal(await store.get(key), null)
    await store.update(key, () => ({ approvedDigest: 'release-1', issuers: { 'https://auth.example.com': { tokens: { access_token: 'private-test-token' } } } }))
    assert.equal((await store.get(key))?.approvedDigest, 'release-1')
    assert.equal((await readFile(file, 'utf8')).includes('private-test-token'), false, 'credential bytes are encrypted on disk')
    const reopened = new PluginMcpCredentialStore(file, encryption)
    assert.equal((await reopened.get(key))?.issuers?.['https://auth.example.com']?.tokens && true, true)
    const staticKey = pluginMcpCredentialKey('plugin-b', 'static-oauth', { url: 'https://example.com/mcp' })
    const provider = new PluginMcpOAuthProvider(reopened, staticKey, 'http://127.0.0.1:12798/', async () => undefined, {
        url: 'https://example.com/mcp', oauthResource: 'https://example.com/resource', scopes: ['read', 'write'],
        oauth: { clientId: 'fixture-client', clientSecret: 'fixture-secret' }
    })
    assert.equal((await provider.clientInformation({ issuer: 'https://auth.example.com' }))?.client_id, 'fixture-client')
    assert.equal(provider.clientMetadata.scope, 'read write')
    assert.equal((await provider.validateResourceURL('https://example.com/mcp'))?.toString(), 'https://example.com/resource')
    await assert.rejects(() => provider.validateResourceURL('https://different.example/mcp'), /does not match/u)
    await provider.saveTokens({ access_token: 'static-fixture-token', token_type: 'Bearer' }, { issuer: 'https://auth.example.com' })
    assert.equal((await provider.tokens())?.access_token, 'static-fixture-token')
    assert.equal((await readFile(file, 'utf8')).includes('static-fixture-token'), false)
    await reopened.update(staticKey, record => ({ ...record, approvedDigest: 'reviewed-source', gmailApiVerified: true, calendarApiVerified: true, driveApiVerified: true }))
    await provider.invalidateCredentials('tokens')
    const invalidated = await reopened.get(staticKey)
    assert.equal(invalidated?.approvedDigest, undefined, 'revoked/invalid OAuth tokens cannot leave a generic connection labelled Connected')
    for (const flag of ['gmailApiVerified', 'calendarApiVerified', 'driveApiVerified'] as const) assert.equal(invalidated?.[flag], undefined)
    assert.equal(await provider.tokens(), undefined)
    await reopened.disconnect(key)
    assert.equal(await reopened.get(key), null)
} finally { await rm(root, { recursive: true, force: true }) }
console.log('Plugin MCP credential isolation and encrypted persistence passed.')

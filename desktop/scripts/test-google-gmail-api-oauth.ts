import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectPluginMcpOAuth } from '../src/main/assistant/plugin-mcp-oauth-connect'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
const root = await mkdtemp(join(tmpdir(), 'zyra-gmail-api-oauth-'))
const store = new PluginMcpCredentialStore(join(root, 'credentials.enc'), { isAvailable: () => true, encrypt: text => Buffer.from(text).map(byte => byte ^ 0x5a), decrypt: bytes => Buffer.from(bytes).map(byte => byte ^ 0x5a).toString() })
const nativeFetch = globalThis.fetch
const issuer = 'https://accounts.google.com'
const clientId = '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com'
const clientSecret = 'synthetic-desktop-client-secret'
const scopes = ['readonly', 'compose', 'modify'].map(name => `https://www.googleapis.com/auth/gmail.${name}`)
let redirects = 0
let tokenRequests = 0
let verifications = 0
const server = { url: 'https://gmailmcp.googleapis.com/mcp/v1', googleDesktop: true, scopes, oauth: { clientId, clientSecret } }
try {
  await store.update('gmail', () => ({ gmailApiVerified: true, issuers: { [issuer]: { tokens: { access_token: 'synthetic-old-access', refresh_token: 'synthetic-old-refresh', issuer, token_type: 'Bearer' } } } }))
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === '127.0.0.1') return nativeFetch(input, init)
    assert.notEqual(url.origin, 'https://gmailmcp.googleapis.com', 'Gmail sign-in never discovers or initializes the preview MCP server')
    if (url.origin === issuer && url.pathname.includes('oauth-protected-resource')) return new Response(null, { status: 404 })
    if (url.origin === issuer && url.pathname.includes('.well-known/')) return Response.json({ issuer, authorization_endpoint: `${issuer}/o/oauth2/v2/auth`, token_endpoint: 'https://oauth2.googleapis.com/token', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post'] })
    assert.equal(url.href, 'https://oauth2.googleapis.com/token')
    const params = new URLSearchParams(String(init?.body))
    assert.equal(params.get('grant_type'), 'authorization_code', 'Reconnect requests consent rather than silently refreshing the old narrower grant')
    assert.equal(params.get('client_id'), clientId)
    assert.equal(params.get('client_secret'), clientSecret)
    assert.ok(params.get('code_verifier'))
    tokenRequests++
    return Response.json({ access_token: 'synthetic-new-access', refresh_token: 'synthetic-new-refresh', token_type: 'Bearer', expires_in: 3600, scope: scopes[0] })
  }) as typeof fetch
  const result = await connectPluginMcpOAuth({
    server, googleApi: true, authorizeBeforeConnect: true, credentialKey: 'gmail', store,
    serviceName: 'Gmail',
    openExternal: async value => {
      redirects++
      const authorization = new URL(value)
      assert.equal(authorization.origin, issuer)
      assert.equal(authorization.searchParams.has('client_secret'), false)
      assert.equal(authorization.searchParams.get('scope'), scopes.join(' '))
      assert.equal(authorization.searchParams.get('access_type'), 'offline')
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      const wrong = new URL(callback)
      wrong.searchParams.set('code', 'synthetic-code')
      wrong.searchParams.set('state', 'wrong-state')
      assert.equal((await nativeFetch(wrong)).status, 400)
      callback.searchParams.set('code', 'synthetic-code')
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      callback.searchParams.set('iss', issuer)
      assert.equal((await nativeFetch(callback)).status, 200)
    },
    verifyConnection: async () => {
      verifications++
      const record = await store.get('gmail')
      assert.equal(record?.gmailApiVerified, undefined, 'OAuth by itself is not a verified Gmail API connection')
      assert.equal((record?.issuers?.[issuer]?.tokens as any).scope, scopes[0], 'Google partial consent is retained')
      return { toolCount: 10 }
    },
  })
  assert.deepEqual(result, { toolCount: 10, authenticated: true })
  assert.equal(redirects, 1)
  assert.equal(tokenRequests, 1)
  assert.equal(verifications, 1)
  const controller = new AbortController()
  await assert.rejects(() => connectPluginMcpOAuth({
    server, googleApi: true, authorizeBeforeConnect: true, credentialKey: 'cancelled', store,
    signal: controller.signal, openExternal: async () => { controller.abort(new Error('Cancel sign-in.')) },
    verifyConnection: async () => { throw new Error('Cancelled sign-in must not verify API access.') },
  }), /cancelled/u)
  assert.equal((await store.get('cancelled'))?.issuers?.[issuer]?.tokens, undefined)
  assert.equal(tokenRequests, 1)
  console.log('Google Gmail API OAuth uses standard discovery/PKCE/consent, retains partial grants and cancels without preview MCP traffic.')
} finally { globalThis.fetch = nativeFetch; await rm(root, { recursive: true, force: true }) }

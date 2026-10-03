import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GoogleGmailApiAuth } from '../src/main/assistant/google-gmail-api-auth'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
const root = await mkdtemp(join(tmpdir(), 'zyra-gmail-api-auth-'))
const issuer = 'https://accounts.google.com'
const readonly = 'https://www.googleapis.com/auth/gmail.readonly'
const modify = 'https://www.googleapis.com/auth/gmail.modify'
const client = { clientId: '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com', clientSecret: 'synthetic-client-secret' }
const file = join(root, 'credentials.enc')
const store = new PluginMcpCredentialStore(file, { isAvailable: () => true, encrypt: text => Buffer.from(text).map(byte => byte ^ 0x5a), decrypt: bytes => Buffer.from(bytes).map(byte => byte ^ 0x5a).toString() })
const save = (access = 'synthetic-access') => store.update('gmail', () => ({ approvedDigest: 'pinned', issuers: { [issuer]: { tokens: { access_token: access, refresh_token: 'synthetic-refresh', token_type: 'Bearer', scope: modify } } } }))
let verifications = 0
let refreshes = 0
let actualScope = readonly
let infoClient = client.clientId
let revoked = false
const request = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  assert.equal(init?.redirect, 'error')
  if (url.origin === 'https://www.googleapis.com' && url.pathname === '/oauth2/v2/tokeninfo') {
    assert.equal(init?.method, 'POST')
    verifications++
    return Response.json({ issued_to: infoClient, audience: infoClient, scope: actualScope, expires_in: 3600 })
  }
  assert.equal(url.href, 'https://oauth2.googleapis.com/token')
  const params = new URLSearchParams(String(init?.body))
  assert.equal(params.get('grant_type'), 'refresh_token')
  assert.equal(params.get('refresh_token'), 'synthetic-refresh')
  assert.equal(params.get('client_secret'), client.clientSecret)
  assert.equal(params.has('scope'), false, 'refresh never expands scopes')
  refreshes++
  if (revoked) return Response.json({ error: 'invalid_grant' }, { status: 400 })
  return Response.json({ access_token: `synthetic-new-access-${refreshes}`, token_type: 'Bearer', expires_in: 3600, scope: modify })
}) as typeof fetch
try {
  await save()
  await store.update('unrelated-plugin', () => ({ approvedDigest: 'keep', issuers: { other: { tokens: { access_token: 'unrelated-synthetic-token' } } } }))
  const auth = new GoogleGmailApiAuth(store, 'gmail', async () => client, request)
  assert.deepEqual((await auth.getAccess()).scopes, [readonly], 'requested/stored hints do not imply a grant')
  assert.deepEqual((await auth.getAccess()).scopes, [readonly])
  assert.equal(verifications, 1)
  assert.equal(((await store.get('gmail'))?.issuers?.[issuer]?.tokens as any).scope, readonly)
  assert.equal((await readFile(file)).includes(Buffer.from('synthetic-access')), false)
  assert.deepEqual((await auth.getAccess({ forceRefresh: true })).scopes, [readonly])
  assert.equal(refreshes, 1)
  assert.equal(((await store.get('gmail'))?.issuers?.[issuer]?.tokens as any).refresh_token, 'synthetic-refresh')
  actualScope = ''
  assert.deepEqual((await auth.getAccess({ forceRefresh: true })).scopes, [], 'partial/empty grants are not replaced with requested scopes')
  actualScope = readonly
  revoked = true
  await assert.rejects(() => auth.getAccess({ forceRefresh: true }), /revoked or expired/u)
  assert.equal((await store.get('gmail'))?.approvedDigest, undefined)
  assert.equal((await store.get('gmail'))?.issuers?.[issuer]?.tokens, undefined)
  await assert.rejects(() => auth.getAccess(), /not authorized/u)
  assert.equal((await store.get('unrelated-plugin'))?.approvedDigest, 'keep')
  revoked = false
  infoClient = 'wrong-application'
  await save('synthetic-other-access')
  await assert.rejects(() => new GoogleGmailApiAuth(store, 'gmail', async () => client, request).getAccess(), /different application/u)
  infoClient = client.clientId
  const failing = new GoogleGmailApiAuth(store, 'gmail', async () => client, (async () => { throw new Error('Never expose synthetic token-bearing URL here.') }) as typeof fetch)
  await assert.rejects(() => failing.getAccess(), error => error instanceof Error && /scope verification failed/u.test(error.message) && !error.message.includes('token-bearing'))
  const aborted = new AbortController()
  aborted.abort(new Error('Cancelled test.'))
  await assert.rejects(() => auth.getAccess({ signal: aborted.signal }), /Cancelled test/u)

  await save('synthetic-race-access')
  let started!: () => void
  let finish!: () => void
  const waiting = new Promise<void>(resolve => { started = resolve })
  const release = new Promise<void>(resolve => { finish = resolve })
  const raceRequest = (async () => { started(); await release; return Response.json({ access_token: 'synthetic-race-new', token_type: 'Bearer', expires_in: 3600 }) }) as typeof fetch
  const race = new GoogleGmailApiAuth(store, 'gmail', async () => client, raceRequest)
  const pending = race.getAccess({ forceRefresh: true })
  void pending.catch(() => undefined)
  await waiting
  await store.disconnect('gmail')
  finish()
  await assert.rejects(() => pending, /authorization changed/u)
  assert.equal(await store.get('gmail'), null, 'disconnect cannot resurrect tokens after a slow refresh')
  console.log('Gmail actual scope verification, encrypted refresh, revocation, client binding, redacted failures and disconnect fences passed.')
} finally { await rm(root, { recursive: true, force: true }) }

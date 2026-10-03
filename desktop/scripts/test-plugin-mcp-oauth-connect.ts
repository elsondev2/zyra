import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
import { connectPluginMcpOAuth } from '../src/main/assistant/plugin-mcp-oauth-connect'

const root = await mkdtemp(path.join(os.tmpdir(), 'zyra-mcp-oauth-test-'))
const store = new PluginMcpCredentialStore(path.join(root, 'mcp.enc'), {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value, 'utf8').map((byte) => byte ^ 0x5a),
    decrypt: (value) => Buffer.from(value).map((byte) => byte ^ 0x5a).toString('utf8')
})
const server = createServer(async (request, response) => {
    if (request.method === 'DELETE') { response.writeHead(200).end(); return }
    if (request.method !== 'POST') { response.writeHead(405).end(); return }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (message.id === undefined) { response.writeHead(202).end(); return }
    const result = message.method === 'initialize'
        ? { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'oauth-entry-test', version: '1.0.0' } }
        : { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
})
let oauthBase = ''
let publicInitialize = false
const protectedServer = createServer(async (request, response) => {
    const url = new URL(request.url || '/', oauthBase)
    if (request.method === 'GET' && url.pathname.includes('oauth-protected-resource')) {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
            resource: `${oauthBase}/mcp`, authorization_servers: [oauthBase], scopes_supported: ['read', 'write', 'admin']
        }))
        return
    }
    if (request.method === 'GET' && url.pathname.includes('oauth-authorization-server')) {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
            issuer: oauthBase, authorization_endpoint: `${oauthBase}/authorize`, token_endpoint: `${oauthBase}/token`,
            registration_endpoint: `${oauthBase}/register`, response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none']
        }))
        return
    }
    if (request.method === 'POST' && url.pathname === '/register') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({
            client_id: 'fixture-client', redirect_uris: metadata.redirect_uris,
            response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none'
        }))
        return
    }
    if (request.method === 'POST' && url.pathname === '/token') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
            access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 3600
        }))
        return
    }
    if (url.pathname === '/mcp' && request.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (request.headers.authorization !== 'Bearer fixture-access-token' && !(publicInitialize && ['initialize', 'notifications/initialized'].includes(message.method))) {
            response.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${oauthBase}/.well-known/oauth-protected-resource"` }).end()
            return
        }
        if (message.id === undefined) { response.writeHead(202).end(); return }
        const result = message.method === 'initialize'
            ? { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'protected-fixture', version: '1.0.0' } }
            : { tools: [{ name: 'protected_echo', inputSchema: { type: 'object' } }] }
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
        return
    }
    response.writeHead(404).end()
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
await new Promise<void>((resolve) => protectedServer.listen(0, '127.0.0.1', resolve))
try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Fixture server has no port.')
    const result = await connectPluginMcpOAuth({
        server: { url: `http://127.0.0.1:${address.port}/mcp` }, credentialKey: 'fixture-key', store,
        openExternal: async () => { throw new Error('Public MCP server should not open sign-in.') }
    })
    assert.deepEqual(result, { toolCount: 1, authenticated: false })
    const protectedAddress = protectedServer.address()
    if (!protectedAddress || typeof protectedAddress === 'string') throw new Error('Protected fixture has no port.')
    oauthBase = `http://127.0.0.1:${protectedAddress.port}`
    let redirects = 0
    const protectedResult = await connectPluginMcpOAuth({
        server: { url: `${oauthBase}/mcp` }, credentialKey: 'protected-fixture', store,
        openExternal: async (authorizationUrl) => {
            redirects += 1
            const authorization = new URL(authorizationUrl)
            assert.equal(authorization.origin, oauthBase)
            const callback = new URL(authorization.searchParams.get('redirect_uri') || '')
            const wrongState = new URL(callback)
            wrongState.searchParams.set('code', 'fixture-code')
            wrongState.searchParams.set('state', 'wrong-state')
            assert.equal((await fetch(wrongState)).status, 400)
            callback.searchParams.set('code', 'fixture-code')
            callback.searchParams.set('state', authorization.searchParams.get('state') || '')
            callback.searchParams.set('iss', oauthBase)
            const response = await fetch(callback)
            assert.equal(response.status, 200)
        }
    })
    assert.deepEqual(protectedResult, { toolCount: 1, authenticated: true })
    assert.equal(redirects, 1)
    assert.equal((await store.get('protected-fixture'))?.issuers?.[oauthBase]?.tokens && true, true)
    const forced = await connectPluginMcpOAuth({
        server: { url: `${oauthBase}/mcp`, scopes: ['read'], oauth: { clientId: 'registered-fixture-client' } },
        authorizeBeforeConnect: true, credentialKey: 'forced-fixture', store,
        openExternal: async (authorizationUrl) => {
            const authorization = new URL(authorizationUrl)
            assert.equal(authorization.searchParams.get('client_id'), 'registered-fixture-client')
            assert.equal(authorization.searchParams.get('scope'), 'read', 'resource metadata cannot expand the approved scopes')
            const callback = new URL(authorization.searchParams.get('redirect_uri') || '')
            callback.searchParams.set('code', 'fixture-code')
            callback.searchParams.set('state', authorization.searchParams.get('state') || '')
            callback.searchParams.set('iss', oauthBase)
            assert.equal((await fetch(callback)).status, 200)
        }
    })
    assert.deepEqual(forced, { toolCount: 1, authenticated: true })
    publicInitialize = true
    const lateChallenge = await connectPluginMcpOAuth({
        server: { url: `${oauthBase}/mcp` }, credentialKey: 'late-tools-challenge', store,
        openExternal: async authorizationUrl => {
            const authorization = new URL(authorizationUrl)
            const callback = new URL(authorization.searchParams.get('redirect_uri') || '')
            callback.searchParams.set('code', 'fixture-code')
            callback.searchParams.set('state', authorization.searchParams.get('state') || '')
            callback.searchParams.set('iss', oauthBase)
            assert.equal((await fetch(callback)).status, 200)
        }
    })
    assert.deepEqual(lateChallenge, { toolCount: 1, authenticated: true }, 'Connect must finish OAuth even when initialization is public and tools/list challenges')
} finally { server.close(); protectedServer.close(); await rm(root, { recursive: true, force: true }) }
console.log('Plugin MCP public and OAuth sign-in flows, state check, and encrypted tokens passed.')

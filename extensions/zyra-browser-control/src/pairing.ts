// @ts-nocheck
import { POLL_INTERVAL_MS, PROTOCOL_VERSION, assertBoundedMessage } from './protocol.js'
import { readConnectionIdentity } from './connection-identity'

const SESSION_KEY = 'zyraPairingSessionV1'
let polling = false
let transportTail = Promise.resolve()

export async function connectAutomatically({ clientOrigin: requestedOrigin, expectedNamespaceId } = {}) {
  const saved = await chrome.storage.local.get(['browserInstanceId','browserName'])
  const instanceId = saved.browserInstanceId || crypto.randomUUID().replace(/-/g, '')
  const browserName = saved.browserName || `Chrome ${instanceId.slice(-4)}`
  await chrome.storage.local.set({ browserInstanceId: instanceId, browserName })
  let session, lastError
  // Once a broker has been selected, reconnect only to that exact origin. A
  // failed cached pairing must never cause an automatic prod/dev switch.
  const candidates = requestedOrigin ? [requestedOrigin] : ['http://127.0.0.1:47821','http://127.0.0.1:47822']
  for (const clientOrigin of candidates) {
    try {
      const response = await fetch(`${clientOrigin}/v1/extension/connect`, {
        method:'POST', headers:{'x-zyra-browser-client-id':instanceId}, cache:'no-store', signal:AbortSignal.timeout(3000)
      })
      const value = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(value.error || 'Open the latest Zyra Desktop to connect this browser.')
      if (!Number.isInteger(value.port) || !value.pairId || !value.token || !value.expiresAt || value.clientOrigin !== clientOrigin) throw new Error('Zyra returned an invalid browser connection.')
      // Keep only installation metadata from the connection handshake. Its
      // runtime phase/connection fields are descriptive, never liveness.
      session = {
        port: value.port, pairId: value.pairId, token: value.token, expiresAt: value.expiresAt, clientOrigin: value.clientOrigin, browserName,
        ...readConnectionIdentity(value.runtimeStatus, expectedNamespaceId)
      }
      break
    } catch (reason) {
      // A missing app should not hide a useful response from the other app channel.
      if (!(reason instanceof TypeError) && reason?.name !== 'TimeoutError') lastError = reason
    }
  }
  if (!session) throw lastError || new Error('Waiting for Zyra Desktop. This browser will connect automatically when it opens.')
  await chrome.storage.session.set({ [SESSION_KEY]: session })
  return session
}

export async function pairWithZyra({ port, code }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter the loopback port shown by Zyra.')
  if (!/^\d{8}$/.test(code)) throw new Error('Enter the eight-digit pairing code shown by Zyra.')
  const extensionId = chrome.runtime.id
  const nonce = randomToken(24)
  const hello = await post(port, '/v1/pair/hello', { protocolVersion: PROTOCOL_VERSION, extensionId, nonce, code })
  const proof = await hmac(code, `${nonce}:${hello.challenge}`)
  const paired = await post(port, '/v1/pair/prove', { protocolVersion: PROTOCOL_VERSION, sessionId: hello.sessionId, proof })
  const session = { port, pairId: paired.pairId, token: paired.token, expiresAt: paired.expiresAt }
  await chrome.storage.session.set({ [SESSION_KEY]: session })
  return { pairId: session.pairId, expiresAt: session.expiresAt }
}

export async function getPairingSession() {
  const stored = await chrome.storage.session.get(SESSION_KEY)
  const session = stored[SESSION_KEY]
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    await clearPairingSession()
    return null
  }
  return session
}

export async function clearPairingSession() {
  await chrome.storage.session.remove(SESSION_KEY)
}

export async function sendEvent(event) {
  const session = await getPairingSession()
  if (!session) throw new Error('Pair the extension with Zyra first.')
  const result = await authenticatedPost(session, '/v1/event', event)
  return result
}

let pollingGeneration = 0
export function startPolling(handleRequest, handleDisconnect, handleAppearance, handleConfirmed) {
  if (polling) return
  polling = true
  const generation = ++pollingGeneration
  const current = () => polling && generation === pollingGeneration
  const respond = async (session, request) => {
    let response
    try { response = { requestId: request.requestId, ok: true, result: await handleRequest(request.operation, request) } }
    catch (error) { response = { requestId: request.requestId, ok: false, error: error instanceof Error ? error.message : String(error) } }
    if (current()) await authenticatedPost(session, '/v1/respond', assertBoundedMessage(response)).catch(() => undefined)
  }
  void (async () => {
    try {
      while (current()) {
        const session = await getPairingSession()
        if (!session) throw new Error('Pairing ended.')
        const result = await authenticatedPost(session, '/v1/poll', {})
        if (!current()) break
        // A cached token only becomes a live connection after this authenticated
        // broker response succeeds.
        await handleConfirmed?.(session)
        if (result.appearance) handleAppearance?.(result.appearance)
        // Polling stays responsive to cancellation while a bounded input operation runs.
        for (const request of result.requests || []) void respond(session, request)
        await delay(POLL_INTERVAL_MS)
      }
    } catch (error) {
      if (current()) {
        polling = false
        await clearPairingSession()
        await handleDisconnect?.(error).catch(() => undefined)
      }
    } finally { if (generation === pollingGeneration) polling = false }
  })()
}
export function stopPolling() { polling = false; pollingGeneration++ }

function authenticatedPost(session, pathname, body) {
  const operation = transportTail.then(() => authenticatedPostNow(session, pathname, body))
  transportTail = operation.catch(() => undefined)
  return operation
}

async function authenticatedPostNow(session, pathname, body) {
  const latest = await getPairingSession()
  if (!latest || latest.pairId !== session.pairId) throw new Error('Chrome pairing expired.')
  session = latest
  const response = await fetch(`http://127.0.0.1:${session.port}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify(assertBoundedMessage(body)),
    cache: 'no-store', signal: AbortSignal.timeout(10_000)
  })
  const result = await response.json().catch(() => ({}))

  if ((await getPairingSession())?.pairId !== session.pairId) throw new Error('Chrome pairing changed.')
  if (result.nextToken) {
    session.token = result.nextToken
    session.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    await chrome.storage.session.set({ [SESSION_KEY]: session })
  }
  if (!response.ok) throw new Error(result.error || `Zyra pairing request failed (${response.status}).`)
  return result
}

async function post(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(assertBoundedMessage(body)), cache: 'no-store', signal: AbortSignal.timeout(10_000)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Zyra pairing request failed (${response.status}).`)
  return result
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bytesToBase64Url(new Uint8Array(signature))
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(bytes) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

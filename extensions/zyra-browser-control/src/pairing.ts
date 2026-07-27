// @ts-nocheck
import { POLL_INTERVAL_MS, PROTOCOL_VERSION, assertBoundedMessage } from './protocol.js'

const SESSION_KEY = 'zyraPairingSessionV1'
let polling = false
let transportTail = Promise.resolve()

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

export function startPolling(handleRequest, handleDisconnect) {
  if (polling) return
  polling = true
  const loop = async () => {
    while (polling) {
      const session = await getPairingSession()
      if (!session) {
        await handleDisconnect?.().catch(() => undefined)
        break
      }
      try {
        const result = await authenticatedPost(session, '/v1/poll', {})
        for (const request of result.requests || []) {
          let response
          try {
            response = { requestId: request.requestId, ok: true, result: await handleRequest(request.operation) }
          } catch (error) {
            response = { requestId: request.requestId, ok: false, error: error instanceof Error ? error.message : String(error) }
          }
          await authenticatedPost(session, '/v1/respond', assertBoundedMessage(response))
        }
      } catch {
        await clearPairingSession()
        await handleDisconnect?.().catch(() => undefined)
        break
      }
      await delay(POLL_INTERVAL_MS)
    }
    polling = false
  }
  void loop()
}

export function stopPolling() {
  polling = false
}

function authenticatedPost(session, pathname, body) {
  const operation = transportTail.then(() => authenticatedPostNow(session, pathname, body))
  transportTail = operation.catch(() => undefined)
  return operation
}

async function authenticatedPostNow(session, pathname, body) {
  const latest = await getPairingSession()
  if (!latest) throw new Error('Chrome pairing expired.')
  session = latest
  const response = await fetch(`http://127.0.0.1:${session.port}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify(assertBoundedMessage(body)),
    cache: 'no-store'
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Zyra pairing request failed (${response.status}).`)
  if (result.nextToken) {
    session.token = result.nextToken
    await chrome.storage.session.set({ [SESSION_KEY]: session })
  }
  return result
}

async function post(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(assertBoundedMessage(body)), cache: 'no-store'
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

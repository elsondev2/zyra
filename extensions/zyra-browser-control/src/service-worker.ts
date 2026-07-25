// @ts-nocheck
import { pairWithZyra, getPairingSession, clearPairingSession, startPolling, stopPolling } from './pairing.js'
import { grantActiveTab, listTabGrants, requireExactTab, revokeTab } from './tab-grants.js'
import { observePage } from './content-observer.js'
import { runPageAction } from './action-runner.js'
import { redactExtensionObservation } from './redaction.js'
import { isAllowedPageUrl } from './protocol.js'

const revisions = new Map()

chrome.runtime.onInstalled.addListener(() => void clearPairingSession())
chrome.runtime.onStartup.addListener(() => void clearPairingSession())

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handlePopupMessage(message).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
  )
  return true
})

void getPairingSession().then((session) => {
  if (session) startPolling(handleBrokerOperation)
})

async function handlePopupMessage(message) {
  if (message?.type === 'pair') {
    const paired = await pairWithZyra({ port: Number(message.port), code: String(message.code || '') })
    startPolling(handleBrokerOperation)
    return paired
  }
  if (message?.type === 'grant-active-tab') return grantActiveTab()
  if (message?.type === 'disconnect') {
    stopPolling()
    await clearPairingSession()
    return { disconnected: true }
  }
  if (message?.type === 'status') return { session: await getPairingSession(), tabs: await listTabGrants() }
  throw new Error('Unknown extension popup request.')
}

async function handleBrokerOperation(operation) {
  if (!operation || typeof operation !== 'object') throw new Error('Invalid broker operation.')
  if (operation.type === 'revoke-tab') {
    await revokeTab(operation.tabId)
    return { revoked: true }
  }
  const { tab } = await requireExactTab(operation.tabId, operation.documentId)
  if (!isAllowedPageUrl(tab.url)) throw new Error('Browser-internal and non-HTTP pages cannot be controlled.')
  if (operation.type === 'observe') return observeExactTab(tab, operation)
  if (operation.type === 'action') return actOnExactTab(tab.id, operation)
  throw new Error(`Unknown broker request: ${operation.type}`)
}

async function observeExactTab(tab, operation) {
  const revision = (revisions.get(tab.id) || 0) + 1
  revisions.set(tab.id, revision)
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    func: observePage,
    args: [revision, operation.bounds || {}]
  })
  const observation = redactExtensionObservation(result || {})
  if (operation.includeScreenshot && tab.active) {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 })
    const bounded = await boundScreenshot(dataUrl)
    if (bounded) observation.screenshotData = bounded
    else observation.redactions.push('screenshot-size-limit')
  } else if (operation.includeScreenshot) {
    observation.redactions.push('screenshot-requires-exact-tab-active')
  }
  return observation
}

async function boundScreenshot(dataUrl) {
  const source = await fetch(dataUrl).then((response) => response.blob())
  const bitmap = await createImageBitmap(source)
  const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height)
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); return null }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 })
  if (blob.size > 350 * 1024) return null
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function actOnExactTab(tabId, operation) {
  const revision = revisions.get(tabId) || 0
  if (operation.observationRevision !== revision) throw new Error(`Stale observation revision. Current revision is ${revision}.`)
  const action = operation.action
  if (action.type === 'navigate') {
    if (!isAllowedPageUrl(action.url)) throw new Error('Only ordinary HTTP and HTTPS navigation is allowed.')
    await chrome.tabs.update(tabId, { url: action.url })
    revisions.set(tabId, revision + 1)
    return { changed: true, documentId: crypto.randomUUID() }
  }
  if (action.type === 'wait') {
    const duration = action.condition?.type === 'delay' ? Math.min(action.timeoutMs, action.condition.durationMs) : Math.min(250, action.timeoutMs)
    await new Promise((resolve) => setTimeout(resolve, duration))
    return { changed: false }
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: runPageAction,
    args: [revision, action]
  })
  return result || { changed: true }
}

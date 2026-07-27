// @ts-nocheck
import { isAllowedPageUrl } from './protocol.js'
import { sendEvent } from './pairing.js'

const GRANTS_KEY = 'zyraExactTabGrantsV1'

export async function grantActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !Number.isInteger(tab.id) || !isAllowedPageUrl(tab.url)) throw new Error('Open an ordinary HTTP or HTTPS tab before granting control.')
  const documentId = crypto.randomUUID()
  const grants = await readGrants()
  grants[String(tab.id)] = { tabId: tab.id, documentId, url: tab.url, grantedAt: Date.now() }
  await chrome.storage.session.set({ [GRANTS_KEY]: grants })
  await sendEvent({ type: 'tab.register', tabId: tab.id, documentId, url: tab.url, title: tab.title || '' })
  return grants[String(tab.id)]
}

export async function requireExactTab(tabId, documentId) {
  const grants = await readGrants()
  const grant = grants[String(tabId)]
  if (!grant || grant.documentId !== documentId) throw new Error('This Chrome tab is not explicitly paired with Zyra.')
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab || !isAllowedPageUrl(tab.url)) {
    await revokeTab(tabId)
    throw new Error('The paired Chrome tab is closed or navigated to a blocked page.')
  }
  return { grant, tab }
}

export async function revokeTab(tabId) {
  const grants = await readGrants()
  if (!grants[String(tabId)]) return
  delete grants[String(tabId)]
  await chrome.storage.session.set({ [GRANTS_KEY]: grants })
  await sendEvent({ type: 'tab.closed', tabId }).catch(() => undefined)
}

export async function listTabGrants() {
  return Object.values(await readGrants())
}

async function readGrants() {
  const stored = await chrome.storage.session.get(GRANTS_KEY)
  return stored[GRANTS_KEY] && typeof stored[GRANTS_KEY] === 'object' ? stored[GRANTS_KEY] : {}
}

chrome.tabs.onRemoved.addListener((tabId) => void revokeTab(tabId))
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Any main-document URL change requires a fresh popup gesture and document token.
  if (changeInfo.url) void revokeTab(tabId)
})

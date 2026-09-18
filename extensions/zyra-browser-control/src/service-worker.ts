import { BrowserScope } from './browser-scope'
import { AppController } from './app-controller'
import { connectAutomatically, pairWithZyra, getPairingSession, clearPairingSession, sendEvent, startPolling, stopPolling } from './pairing'
import { errorInfo, type Activity, type ExtensionState } from './shared/protocol'
import { pageUrl, safeUrl } from './shared/safety'
import { appearanceFromPreferences, isThemePreference, unavailableAppearance, type ThemePreference } from './shared/appearance'
// Configure the toolbar immediately, even while Desktop is starting up.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
let autoConnectPromise: Promise<void> | null = null
let paused = false
let browserName = 'Chrome'
// This is supplied by the authenticated automatic broker handshake. Do not
// infer an environment from the pairing port.
let clientOrigin: string | undefined
let reconnectOrigin: string | null | undefined
let selectedNamespaceId: string | undefined
let installation: ExtensionState['installation']
let connected = false, connecting = false, portNumber = 0, lastError: string | null = null, lastConfirmedAt: string | null = null
let lastStatusBroadcast = 0
let theme: ThemePreference = 'zyra', tabsLayout: 'list' | 'grid' = 'list', appearance = unavailableAppearance
const ports = new Set<chrome.runtime.Port>(), activity: Activity[] = [], active = new Map<string, AbortController>()
const activeTabs = new Map<string, number>()
const sidebarTabs = new Map<string, Set<number>>()
const controller = new AppController(broadcast, () => browserName)
const browserScope = new BrowserScope(controller, error => { if (error) lastError = error; broadcast() })
chrome.tabs.onUpdated.addListener((id, change) => { if (change.status === 'complete') void browserScope.tabCompleted(id) })
const state = (): ExtensionState => ({ installation, connectionPaused: paused, clientOrigin, browserShared: browserScope.active, browserName, connected, connecting, port: portNumber, grants: controller.control.list(), activity, lastError, lastConfirmedAt, theme, zyraAppearance: appearance, tabsLayout })
function broadcast() {
  lastStatusBroadcast = Date.now()
  controller.control.setCursorAppearance(theme, appearance)
  for (const port of ports) { try { port.postMessage(state()) } catch { ports.delete(port) } }
  void chrome.action.setBadgeText({ text: controller.control.list().length ? String(controller.control.list().length) : '' })
}
function abortAll() { for (const abort of active.values()) abort.abort(new Error('Browser access ended.')); active.clear() }
async function disconnect(notify = true) {
  browserScope.disable(); stopPolling(); abortAll(); connected = false; connecting = false
  await controller.release()
  if (notify) await sendEvent({ type: 'session.disconnect' }).catch(() => undefined)
  await clearPairingSession(); broadcast()
}
function beginPolling() {
  startPolling(async (operation: any, request: { requestId: string; deadline?: number }) => {
    if (operation.type === 'cancel') { active.get(operation.requestId)?.abort(new Error('Zyra cancelled this action.')); return { cancelled: true } }
    const abort = new AbortController(), startedAt = Date.now()
    const remaining = (request.deadline || startedAt + 15000) - startedAt
    if (remaining <= 0) throw new Error('This Browser request expired before it could start.')
    const timer = setTimeout(() => abort.abort(new Error('Browser action timed out.')), Math.min(30_000, remaining))
    active.set(request.requestId, abort); activeTabs.set(request.requestId, operation.tabId)
    let failure: ReturnType<typeof errorInfo> | null = null
    try { return await controller.execute(operation, abort.signal) }
    catch (reason) { failure = errorInfo(reason); throw reason }
    finally {
      clearTimeout(timer); active.delete(request.requestId); activeTabs.delete(request.requestId)
      activity.push({ id: request.requestId, method: operation.action?.type || operation.type, tabId: operation.tabId, startedAt, durationMs: Date.now() - startedAt, outcome: failure ? 'error' : 'ok', ...(failure ? { code: failure.code } : {}) })
      if (activity.length > 150) activity.splice(0, activity.length - 150)
      broadcast()
    }
  }, async (reason: unknown) => {
    lastError = reason instanceof Error ? reason.message : 'Zyra Desktop is unavailable.'
    await disconnect(false)
  }, (value: unknown) => {
    try { const next = appearanceFromPreferences({ schemaVersion: 1, shared: value }); if (JSON.stringify(next) !== JSON.stringify(appearance)) { appearance = next; void chrome.storage.local.set({ zyraAppearance: next }); broadcast() } } catch {}
  }, (session: { clientOrigin?: string; namespaceId?: string; runtimeStatus?: { installation?: ExtensionState['installation'] } }) => {
    // Poll success proves that this cached or newly issued pairing is live.
    const wasLive = connected && !connecting && !lastError
    connected = true; connecting = false; lastError = null; lastConfirmedAt = new Date().toISOString()
    if (session.clientOrigin) clientOrigin = session.clientOrigin
    if (session.namespaceId) selectedNamespaceId = session.namespaceId
    installation = session.runtimeStatus?.installation
    if (!wasLive || Date.now() - lastStatusBroadcast >= 15_000) broadcast()
  })
}
const ready = (async () => {
  const saved = await chrome.storage.session.get('grantedIds')
  // Worker restart keeps the connection but never silently restores input authority.
  await Promise.all((saved.grantedIds || []).map((tabId:number) => chrome.debugger.detach({tabId}).catch(() => {})))
  const previousSession = await getPairingSession()
  if (!previousSession) {
    for (const tabId of saved.grantedIds || []) void sendEvent({type:'tab.closed',tabId}).catch(() => {})
  }
  await chrome.storage.session.remove('grantedIds')
  const preferences = await chrome.storage.local.get(['themePreference','tabsLayout','port','connectionPaused','browserName','selectedZyraOrigin','selectedZyraNamespace'])
  theme = isThemePreference(preferences.themePreference) ? preferences.themePreference : 'zyra'
  tabsLayout = preferences.tabsLayout === 'grid' ? 'grid' : 'list'
  portNumber = Number(preferences.port) || 0
  paused = preferences.connectionPaused === true
  browserName = preferences.browserName || 'Chrome'
  if (typeof preferences.selectedZyraOrigin === 'string') reconnectOrigin = preferences.selectedZyraOrigin
  if (typeof preferences.selectedZyraNamespace === 'string') selectedNamespaceId = preferences.selectedZyraNamespace
  const session = await getPairingSession()
  if (session && !paused) {
    // Stored credentials establish only a reconnect attempt. The first poll
    // response is the liveness proof that flips connected to true.
    portNumber = session.port; clientOrigin = session.clientOrigin; reconnectOrigin = session.clientOrigin || null
    connecting = true; beginPolling()
  }
  await chrome.alarms.create('zyra-connect', { periodInMinutes: 0.5 })
  if (!session && !paused) void ensureConnected().catch(() => undefined)
})()
chrome.runtime.onConnect.addListener((port) => {
  if (!['zyra-ui','zyra-sidebar'].includes(port.name) || !port.sender?.url?.startsWith(chrome.runtime.getURL(''))) return
  ports.add(port); void ready.then(() => { port.postMessage(state()); if (!paused) void ensureConnected().catch(() => undefined) })
  port.onDisconnect.addListener(() => {
    ports.delete(port)
    const documentId = port.sender?.documentId
    if (port.name === 'zyra-sidebar' && documentId) {
      const ownedTabs = sidebarTabs.get(documentId); sidebarTabs.delete(documentId)
      for (const tabId of ownedTabs || []) void controller.release(tabId).catch(() => undefined)
    }
  })
})
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return
  void ready.then(() => handle(message, sender.documentId)).then((result) => reply({ok:true,result}), (reason) => reply({ok:false,error:errorInfo(reason)}))
  return true
})
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'zyra-connect') void ready.then(() => { if (!paused) return ensureConnected() }).catch(() => undefined)
})
async function ensureConnected(allowNewBroker = false) {
  if (connected || connecting) return
  // A manually paired broker cannot be reselected without its code. Keep it
  // unavailable rather than silently attaching this browser to another app.
  if (reconnectOrigin === null && !allowNewBroker) return
  if (autoConnectPromise) return autoConnectPromise
  autoConnectPromise = (async () => {
    connecting = true; lastError = null; broadcast()
    try {
      const session = await connectAutomatically(reconnectOrigin ? { clientOrigin: reconnectOrigin, expectedNamespaceId: selectedNamespaceId } : undefined)
      portNumber = session.port; clientOrigin = session.clientOrigin; reconnectOrigin = session.clientOrigin || null; browserName = session.browserName || browserName
      selectedNamespaceId = session.namespaceId
      installation = session.runtimeStatus?.installation
      await chrome.storage.local.set({ selectedZyraOrigin: clientOrigin, selectedZyraNamespace: selectedNamespaceId || '' })
      beginPolling()
    } catch (error) {
      connecting = false
      lastError = error instanceof Error ? error.message : 'Open Zyra Desktop to connect.'
      throw error
    } finally { autoConnectPromise = null; broadcast() }
  })()
  return autoConnectPromise
}
async function handle(message: Record<string, unknown>, documentId?: string) {
  switch(message.type) {
    case 'status': return state()
    case 'tab-context': return { targetId: controller.targetId(Number(message.tabId)) }
    case 'browser-context': return {browserName, targets:controller.control.list().map(tab => ({targetId:controller.targetId(tab.tabId), title:tab.title, url:tab.url}))}
    case 'browser-name': browserName = String(message.name || 'Chrome').trim().slice(0,60) || 'Chrome'; await chrome.storage.local.set({browserName}); await controller.refresh(); broadcast(); return state()
    case 'share-browser': if (!connected) throw new Error('Open Zyra Desktop first.'); await browserScope.enable(); sidebarTabs.clear(); return state()
    case 'refresh-connection': if (!paused) await ensureConnected(); return state()
    case 'auto-connect': paused = false; await chrome.storage.local.set({connectionPaused:false}); await ensureConnected(true); return state()
    case 'current-tab': { const tab = (await chrome.tabs.query({ active:true, lastFocusedWindow:true }))[0]; return tab ? {id:tab.id, windowId:tab.windowId, title:tab.title, url:safeUrl(tab.url || '')} : null }
    case 'connect':
      await disconnect(); connecting = true; lastError = null; clientOrigin = undefined; reconnectOrigin = null; selectedNamespaceId = undefined; installation = undefined;
      await chrome.storage.local.remove(['selectedZyraOrigin', 'selectedZyraNamespace']); broadcast()
      try {
        portNumber = Number(message.port)
        await pairWithZyra({port:portNumber, code:String(message.code || '').replace(/[\s-]/g,'')})
        await chrome.storage.local.set({port:portNumber}); beginPolling()
      } catch (error) {
        connecting = false
        lastError = error instanceof Error ? error.message : 'Zyra Desktop is unavailable.'
        throw error
      } finally { broadcast() }
      return state()
    case 'disconnect': paused = true; await chrome.storage.local.set({connectionPaused:true}); await disconnect(); return state()
    case 'tabs': return (await chrome.tabs.query({})).filter(tab => { try { pageUrl(tab.url || ''); return !tab.incognito } catch { return false } }).map(tab => ({id:tab.id!,title:tab.title || '',url:safeUrl(tab.url || ''),active:tab.active,windowId:tab.windowId}))
    case 'grant':
      if (!connected) throw new Error('Connect Zyra Browser from the Zyra app first.')
      if (!Number.isInteger(message.tabId) || !['read','control'].includes(String(message.mode))) throw new Error('Invalid tab access request.')
      await controller.grant(Number(message.tabId), message.mode as 'read' | 'control', message.sidebar === true ? 'tab' : 'site')
      if (message.sidebar === true && documentId) { const owned = sidebarTabs.get(documentId) || new Set<number>(); owned.add(Number(message.tabId)); sidebarTabs.set(documentId, owned) }
      broadcast(); return state()
    case 'release': {
      const tabId = typeof message.tabId === 'number' ? message.tabId : undefined
      if (tabId === undefined) { browserScope.disable(); abortAll() }
      else for (const [id, abort] of active) if (activeTabs.get(id) === tabId) abort.abort(new Error('Tab access ended.'))
      for (const tabs of sidebarTabs.values()) if (tabId === undefined) tabs.clear(); else tabs.delete(tabId)
      await controller.release(tabId); broadcast(); return state()
    }
    case 'theme': if (!isThemePreference(message.theme)) throw new Error('Unknown theme.'); theme=message.theme; await chrome.storage.local.set({themePreference:theme}); broadcast(); return state()
    case 'tabs-layout': if (message.layout!=='list' && message.layout!=='grid') throw new Error('Unknown tab layout.'); tabsLayout=message.layout; await chrome.storage.local.set({tabsLayout}); broadcast(); return state()
    case 'clear-activity': activity.splice(0); broadcast(); return state()
    case 'open-console': await chrome.runtime.openOptionsPage(); return {opened:true}
    default: throw new Error('Unknown interface command.')
  }
}
// Local media stays behind the existing file bridge. Only this extension's own
// subresources can enter this proxy; no web-accessible resources are declared.
const fetchScope = globalThis as unknown as { addEventListener(type: 'fetch', listener: (event: {request:Request; respondWith(response:Promise<Response>):void}) => void): void }
fetchScope.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.protocol !== 'chrome-extension:' || url.host !== chrome.runtime.id || url.pathname !== '/__zyra_browser_assistant/v1/files/content') return
  if (!connected || !clientOrigin) {
    event.respondWith(Promise.resolve(new Response('Zyra Desktop is unavailable.', { status: 503 })))
    return
  }
  event.respondWith(fetch(`${clientOrigin}${url.pathname}${url.search}`, {
    method:event.request.method,
    headers:{'x-zyra-browser-client':'assistant-v1', ...(event.request.headers.has('range') ? {range:event.request.headers.get('range')!} : {})},
    cache:'no-store', signal:event.request.signal
  }))
})

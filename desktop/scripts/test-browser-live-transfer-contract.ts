import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BROWSER_VIEW_IPC } from '../src/shared/browser-view'
import { isBrowserDevscopeBridgePath } from '../src/shared/browser-assistant-bridge'
import { trustedBrowserGuests } from '../src/main/agent-control/trusted-guest-registry'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const manager = read('../src/main/browser-view-manager.ts')
const presentation = read('../src/main/browser-view-presentation.ts')
const utilityManager = read('../src/main/assistant/assistant-utility-window-manager.ts')
const browserSlot = read('../src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx')
const browserWorkspace = read('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx')
const diffPanel = read('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx')
const main = read('../src/main/index.ts')
const registry = read('../src/main/agent-control/trusted-guest-registry.ts')
const agentControl = read('../src/main/agent-control/index.ts')
const agentControlBroker = read('../src/main/agent-control/agent-control-broker.ts')
const popupManager = read('../src/main/browser-popup-manager.ts')
const preload = read('../src/preload/adapters/browser-view-adapter.ts')
const nativeViewSmokeLauncher = read('./test-assistant-native-view-reparent.mjs')

assert.equal(new Set(Object.values(BROWSER_VIEW_IPC)).size, Object.values(BROWSER_VIEW_IPC).length, 'Browser view channels must remain unique')
assert.equal(isBrowserDevscopeBridgePath(['browserView']), false, 'remote pages cannot invoke native Browser view ownership or transfer APIs')
const fakeGuest = {
    id: 9_991_337,
    isDestroyed: () => false,
    once: () => fakeGuest
} as never
const registeredGuest = trustedBrowserGuests.register(101, fakeGuest)
const guestIdentity = registeredGuest.guestIdentity
trustedBrowserGuests.bind(101, fakeGuest.id, 'browser:transfer-contract', 'thread:transfer-contract', 'incognito')
const transferredGuest = trustedBrowserGuests.transferOwner(fakeGuest.id, 101, 202)
assert.equal(transferredGuest.guestIdentity, guestIdentity, 'authority transfer must retain the trusted guest identity')
assert.equal(transferredGuest.guest.id, fakeGuest.id, 'authority transfer must retain webContents.id')
assert.equal(transferredGuest.ownerWebContentsId, 202, 'only shell authority changes')
assert.match(manager, /input\.sessionMode === 'incognito'[\s\S]*acquireIncognitoSession[\s\S]*getGlobalBrowserSession\(\)[\s\S]*new WebContentsView\(\{[\s\S]*session: browserSession[\s\S]*preload: undefined[\s\S]*sandbox: true[\s\S]*contextIsolation: true[\s\S]*nodeIntegration: false/, 'main must create Browser pages in the requested hardened normal or temporary incognito session')
assert.match(manager, /existing\.sessionMode !== sessionMode[\s\S]*cannot change between normal and incognito mode/, 'a live Browser tab cannot silently swap its storage identity')
assert.match(manager, /sourceWindow\.contentView\.removeChildView\(record\.view\)[\s\S]*destinationWindow\.contentView\.addChildView\(record\.view\)/, 'transfer must reparent the existing native view')
assert.doesNotMatch(manager.match(/private performTransfer[\s\S]*?private applyCurrentSlot/)?.[0] || '', /new WebContentsView/, 'transfer cannot replace the page WebContents')
assert.match(manager, /slot\?\.active[\s\S]*slot\.bounds/, 'destination attachment must wait for a real active renderer slot')
assert.match(manager, /contentSize[\s\S]*setManagedBrowserPresentationScale/, 'native bounds must retain responsive viewport presentation scale')
assert.match(manager, /executeJavaScriptInIsolatedWorld\(999/, 'Agent Control cursor and boundary render above the native page without exposing Zyra APIs')
assert.match(manager, /controlOverlay: \{ controlled: false, cursor: null \}/, 'live Browser ownership retains overlay state across reparenting and navigation')
assert.match(presentation, /userZoomFactor \* entry\.presentationScale/, 'page zoom and fitted device presentation must compose instead of overwriting each other')
assert.match(manager, /assertBrowserPreviewDeveloperTransferable[\s\S]*transferTrustedBrowserTargetOwner[\s\S]*transferBrowserPermissionTargetOwner[\s\S]*transferGuestOwner[\s\S]*transferBrowserPreviewDeveloperOwner/, 'owner-scoped Browser authorities must move with the live guest after finite developer sessions settle')
assert.match(registry, /transferOwner\(guestWebContentsId/, 'trusted guest ownership must be mutable without changing guest identity')
assert.match(agentControl, /browserTargetByGuestIdentity\.get\(entry\.guestIdentity\)[\s\S]*transferTargetOwner/, 'Agent Control must retain the existing target identity while changing shell authority')
assert.match(agentControlBroker, /workspaceForTarget[\s\S]*registered\?\.ownerWebContentsId[\s\S]*workspacesByOwner\.get\(registered\.ownerWebContentsId\)/, 'Agent Control viewport and workspace authority must switch with the target owner')
assert.match(popupManager, /transferGuestOwner\(sourceGuestWebContentsId/, 'opener-bound popup recovery ownership must follow the source tab')

assert.match(browserSlot, /data-assistant-browser-view-slot/, 'renderer Browser pages must be inert native-view slots')
assert.match(browserSlot, /browserView\.reportSlot\(/, 'shell renderers must report typed slot bounds and visibility')
assert.match(browserSlot, /browserView\.command\(/, 'Browser chrome must issue typed main-owned page commands')
assert.match(browserSlot, /type: 'control-overlay'/, 'the shell mirrors Agent Control state into the native page overlay')
assert.doesNotMatch(browserSlot, /createElement\(['"]webview['"]\)|<webview|allowpopups|webpreferences:/, 'renderer Browser pages must not create webview guests')
assert.match(preload, /BROWSER_VIEW_IPC\.ensure[\s\S]*BROWSER_VIEW_IPC\.command[\s\S]*BROWSER_VIEW_IPC\.reportSlot/, 'the preload must expose only the narrow Browser view contract')
assert.match(browserWorkspace, /!transferred[\s\S]*browserView\.close\(tabId\)/, 'ordinary Browser closure must ask main to release the owned native view')
assert.match(diffPanel, /handleCloseTab\(tabId, \{ transferred: true \}\)/, 'a completed live transfer removes only source metadata and cannot close the moved page')

assert.match(utilityManager, /waitForDestination\(tab[\s\S]*browserViews\.transferTo\(tab\.id, window\)/, 'utility destination readiness must use live Browser attachment')
assert.match(utilityManager, /Promise\.all\(\[accepted, transferred\]\)/, 'utility-to-main source removal must wait for both destination acceptance and live reparenting')
assert.match(diffPanel, /createTab\(url, \{ tabId: requestedTabId, sessionMode \}\)/, 'utility-to-main transfer must preserve the stable Browser tab ID and storage mode')
assert.match(diffPanel, /browserTab\?\.id \|\| workspaceTab\.id/, 'main-to-utility transfer must preserve the stable Browser tab ID')
assert.doesNotMatch(diffPanel, /Moving this Browser tab to another window reloads the page/, 'lossless Browser transfer must not ask for reload confirmation')
assert.match(main, /browserViews: browserViewManager/, 'the utility transfer coordinator must use the main Browser view service')
assert.equal((main.match(/webviewTag: false/g) || []).length >= 2, true, 'main and utility shell renderers must disable webview tags')
assert.doesNotMatch(main, /will-attach-webview|did-attach-webview/, 'the live Browser architecture must not rely on renderer webview attachment hooks')
assert.match(
    nativeViewSmokeLauncher,
    /process\.platform === 'linux' && process\.env\.CI[\s\S]*'--no-sandbox'/,
    'the native-view smoke must bypass Chromium SUID sandbox setup only on isolated Linux CI runners'
)

console.log('Browser live-transfer contracts: ok')

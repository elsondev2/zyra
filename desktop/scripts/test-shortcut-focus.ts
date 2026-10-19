import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { mock } from 'bun:test'
import { configureShortcutOverrides } from '../src/shared/keybindings'
import { createAssistantChatAndNavigate } from '../src/renderer/src/pages/assistant/create-assistant-chat-and-navigate'
import { subscribeAssistantComposerFocus } from '../src/renderer/src/pages/assistant/assistant-composer-focus'

// Execute the actual native guest input callback without booting Desktop,
// opening a page, reading a user profile, or attaching control services.
const noop = () => {}
mock.module('electron', () => ({ BrowserWindow: class {}, WebContentsView: class {}, dialog: {}, nativeImage: {} }))
mock.module('electron-log', () => ({ default: { info: noop, debug: noop, warn: noop, error: noop } }))
mock.module('../src/main/ipc/trusted-ipc', () => ({ ipcMain: { handle: noop, on: noop } }))
mock.module('../src/main/agent-control', () => ({ bindTrustedBrowserTarget: noop, transferTrustedBrowserTargetOwner: noop }))
mock.module('../src/main/browser-threat-protection-service', () => ({ getBrowserThreatProtectionService: () => null }))
mock.module('../src/main/browser-extension-manager', () => ({ getBrowserExtensionManager: () => null }))
mock.module('../src/main/browser-web-store-install', () => ({ BrowserWebStoreInstall: class {} }))
mock.module('../src/main/ipc/handlers/browser-preview-handlers', () => ({ createIncognitoBrowserSession: noop, disposeIncognitoBrowserSession: noop, getGlobalBrowserSession: noop, isSafeBrowserNavigationUrl: () => true, registerBrowserPermissionTarget: noop, scheduleGlobalBrowserProfileFlush: noop, transferBrowserPermissionTargetOwner: noop }))
mock.module('../src/main/ipc/handlers/browser-preview-developer-handlers', () => ({ assertBrowserPreviewDeveloperTransferable: noop, transferBrowserPreviewDeveloperOwner: noop }))
mock.module('../src/main/browser-local-file-service', () => ({ chooseBrowserLocalFile: noop, getBrowserLocalFilePresentation: noop, isAuthorizedBrowserLocalFileUrl: () => false, revokeBrowserLocalFilesForTab: noop }))
const { BrowserViewManager } = await import('../src/main/browser-view-manager')
const { registerKeybindingRecording } = await import('../src/main/keybindings')
configureShortcutOverrides(() => ({}))
registerKeybindingRecording(noop, noop)
let ownerDestroyed = false
let keyboardOwner = 'guest'
const sequence: string[] = []
const deliveries: unknown[] = []
const owner = { isDestroyed: () => ownerDestroyed, isFullScreen: () => false, webContents: {
    id: 100, isDestroyed: () => ownerDestroyed,
    focus: () => { keyboardOwner = 'host'; sequence.push('focus') },
    send: (_channel: string, payload: unknown) => { sequence.push('send'); deliveries.push(payload) }
} }
const page = Object.assign(new EventEmitter(), { id: 101, session: {} })
const manager = new BrowserViewManager({} as never)
;(manager as unknown as { installPageLifecycle(record: unknown): void }).installPageLifecycle({ view: { webContents: page }, ownerWindow: owner, tabId: 'browser:focus-fixture', sessionMode: 'normal' })
const press = (key: string, extra = {}) => {
    sequence.length = 0; deliveries.length = 0; keyboardOwner = 'guest'
    let prevented = false
    page.emit('before-input-event', { preventDefault: () => { prevented = true } }, { type: 'keyDown', key, control: process.platform !== 'darwin', meta: process.platform === 'darwin', ...extra })
    return prevented
}
assert.equal(press('t'), true)
assert.equal(keyboardOwner, 'host', 'Ctrl/Cmd+T from a focused guest must hand native keyboard ownership back to app chrome')
assert.deepEqual(sequence, ['focus', 'send'], 'host is focused before the new-tab request can mount/focus its input')
assert.deepEqual(deliveries, [{ sourceGuestWebContentsId: 101, action: { type: 'new-tab' } }])
assert.equal(press('l'), true)
assert.deepEqual(sequence, ['focus', 'send'], 'address shortcut also needs the native host, not only DOM input focus')
assert.equal(press('r'), true)
assert.deepEqual(sequence, ['send'], 'reload must leave keyboard focus in the page')
assert.equal(press('x'), false)
assert.deepEqual(sequence, [], 'unhandled page typing stays untouched')
ownerDestroyed = true
assert.equal(press('t'), true)
assert.deepEqual(sequence, [], 'destroyed owners cannot receive a focus or shortcut call')

// The returned destination is authoritative; an old mounted composer must not
// consume the intent while the new route or composer is still hydrating.
let oldFocus = 0
const stopOld = subscribeAssistantComposerFocus(() => { oldFocus++; return true }, 'old-session')
let resolveCreation!: (value: { success: true; sessionId: string }) => void
const routes: string[] = []
const creation = createAssistantChatAndNavigate({ createSessionResult: () => new Promise(resolve => { resolveCreation = resolve }) }, route => routes.push(route))
assert.equal(oldFocus, 0)
assert.deepEqual(routes, [])
resolveCreation({ success: true, sessionId: 'new-session' })
assert.equal((await creation).success, true)
assert.deepEqual(routes, ['/assistant/chat/new-session'])
assert.equal(oldFocus, 0, 'the outgoing chat cannot steal the new chat focus request')
let destinationFocus = 0
const stopDisabled = subscribeAssistantComposerFocus(() => false, 'new-session')
stopDisabled()
const stopDestination = subscribeAssistantComposerFocus(() => { destinationFocus++; return true }, 'new-session')
assert.equal(destinationFocus, 1, 'new-chat shortcut retains focus until the destination composer becomes usable')
stopDestination()
const stopRemount = subscribeAssistantComposerFocus(() => { destinationFocus++; return true }, 'new-session')
assert.equal(destinationFocus, 1, 'settled focus is consumed once, not on every remount')
stopRemount(); stopOld()
let failedFocus = 0
const stopFailure = subscribeAssistantComposerFocus(() => { failedFocus++; return true })
await createAssistantChatAndNavigate({ createSessionResult: async () => ({ success: false, error: 'fixture failure' }) }, () => { throw Error('failed creation cannot navigate') })
assert.equal(failedFocus, 0, 'failed creation cannot request input focus')
stopFailure()
const indexSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
assert.match(indexSource, /command === 'new-chat'[\s\S]{0,100}target\.webContents\.focus\(\)/, 'main-window new-chat delivery focuses renderer contents as well as its BrowserWindow')
const composerSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantComposerView.tsx', import.meta.url), 'utf8')
assert.match(composerSource, /controller\.loadedSessionId/, 'real composer subscribes with the loaded destination identity')
console.log('Shortcut focus: real guest input handoff, page-focus preservation, delayed scoped chat focus and failure isolation passed')

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { mock } from 'bun:test'
import { browserBridgeJsonReplacer, browserBridgeJsonReviver } from '../src/shared/browser-bridge-json'
import { isBrowserDevscopeBridgePath } from '../src/shared/browser-assistant-bridge'
import { dispatchAppMenuCommand } from '../src/renderer/src/components/layout/app-menu-command-actions'
import { extensionQuotaText } from '../src/renderer/src/components/layout/extension-quota'

const bytes = new Uint8Array([0, 1, 127, 255])
const decoded = JSON.parse(JSON.stringify({ faces: [{ data: bytes }] }, browserBridgeJsonReplacer), browserBridgeJsonReviver)
assert(decoded.faces[0].data instanceof Uint8Array)
assert.deepEqual(decoded.faces[0].data, bytes)
assert.deepEqual(JSON.parse('{"type":"Buffer","data":[999]}', browserBridgeJsonReviver), { type: 'Buffer', data: [999] }, 'invalid binary tags are not silently truncated')
assert.equal(extensionQuotaText({ rateLimits: { primary: { remainingPercent: 87, windowDurationMins: 10080 }, secondary: null } } as any), '7d: 87% left')
assert.equal(extensionQuotaText({ rateLimits: { primary: { remainingPercent: 0, windowDurationMins: 300 }, secondary: null } } as any), '5h: 0% left')
assert.equal(extensionQuotaText({ rateLimits: null } as any), 'Quota unavailable')
assert.equal(extensionQuotaText({ requiresOpenaiAuth: true } as any), 'ChatGPT not connected')
assert.equal(extensionQuotaText({ usageError: 'expired', rateLimits: { primary: { remainingPercent: 87 } } } as any), 'Quota unavailable')

const ipc = new EventEmitter() as EventEmitter & { invoke: (channel: string) => Promise<unknown>; send: () => void }
const invoked: string[] = []
ipc.invoke = async channel => { invoked.push(channel); return { success: true } }
ipc.send = () => undefined
mock.module('electron', () => ({ ipcRenderer: ipc }))
const { createWindowAdapter } = await import('../src/preload/adapters/window-adapter')
const adapter = createWindowAdapter()
const destinations: string[] = []
const actions = { navigate: (route: string) => destinations.push(route), search: () => destinations.push('search'), reload: () => destinations.push('reload'), newChat: () => destinations.push('new-chat') }
ipc.emit('window:app-menu-command', {}, 'settings')
ipc.emit('window:app-menu-command', {}, 'javascript:bad')
const unsubscribe = adapter.window.onAppMenuCommand(command => dispatchAppMenuCommand(command, actions))
assert.deepEqual(destinations, ['/settings'], 'cold-start command waits for the renderer listener')
for (const command of ['about', 'search', 'new-chat', 'reload']) ipc.emit('window:app-menu-command', {}, command)
assert.deepEqual(destinations, ['/settings', '/settings/about', 'search', 'new-chat', 'reload'])
unsubscribe()
ipc.emit('window:app-menu-command', {}, 'settings')
const again = adapter.window.onAppMenuCommand(command => dispatchAppMenuCommand(command, actions))
assert.equal(destinations.at(-1), '/settings', 'commands survive listener remounts')
again()
const count = destinations.length
adapter.window.onAppMenuCommand(command => dispatchAppMenuCommand(command, actions))()
assert.equal(destinations.length, count, 'drained commands are not replayed twice')
await adapter.openDesktopSettings()
assert.deepEqual(invoked, ['desktop:open-settings'])
assert(isBrowserDevscopeBridgePath(['openDesktopSettings']))
assert(!isBrowserDevscopeBridgePath(['window', 'close']))
const app = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
assert(app.includes('<AppMenuCommandHost />'), 'normal application shell owns the global command listener')
const footer = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantSidebarFooter.tsx', import.meta.url), 'utf8')
assert(/if \(isBrowserExtension\) return[^\n]*<ExtensionSettingsMenu/.test(footer), 'extension footer never falls through to the desktop updater')
console.log('Browser surface parity: binary font transport, honest quota states, queued desktop navigation, fixed settings endpoint and extension footer routing passed')

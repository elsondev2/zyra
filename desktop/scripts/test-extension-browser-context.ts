import assert from 'node:assert/strict'
import { stripSidebarBrowserContext } from '../src/shared/assistant/browser-context'
const envelope = (value: unknown) => `Hello\n\n<browser-context>${JSON.stringify(value)}</browser-context>`
assert.equal(stripSidebarBrowserContext(envelope({source:'Zyra Chrome sidebar',targetId:'control-target:chrome-tab:abcd'})), 'Hello')
assert.equal(stripSidebarBrowserContext(envelope({source:'Zyra Chrome sidebar',targets:[{targetId:'control-target:chrome-tab:abcd'}]})), 'Hello')
for (const text of ['Hello', 'Hello\n\n<browser-context>broken</browser-context>', envelope({source:'website',targetId:'control-target:chrome-tab:abcd'}), envelope({source:'Zyra Chrome sidebar',targets:[]}), envelope({source:'Zyra Chrome sidebar',targetId:'another-browser'})]) assert.equal(stripSidebarBrowserContext(text),text)
console.log('Sidebar browser context display: ok')

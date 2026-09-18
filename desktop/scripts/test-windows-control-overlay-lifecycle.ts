import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mock } from 'bun:test'

const windows: FakeWindow[] = []
class FakeWindow {
    destroyed = false
    visible = false
    webContents = { executeJavaScript: async () => undefined }
    constructor() { windows.push(this) }
    loadURL() { return Promise.resolve() }
    setIgnoreMouseEvents() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setContentProtection() {}
    setBounds() {}
    getBounds() { return {x:0,y:0,width:100,height:100} }
    isDestroyed() { return this.destroyed }
    isVisible() { return this.visible }
    showInactive() { this.visible = true }
    hide() { this.visible = false }
    destroy() { assert(!this.destroyed, 'a surface is destroyed once'); this.destroyed = true; this.visible = false }
}
const shortcuts = new Set<string>()
mock.module('electron', () => ({
    BrowserWindow: FakeWindow,
    screen: { getPrimaryDisplay: () => ({bounds:{x:0,y:0,width:100,height:100}}) },
    globalShortcut: {
        isRegistered: (key: string) => shortcuts.has(key),
        register: (key: string) => { shortcuts.add(key); return true },
        unregister: (key: string) => shortcuts.delete(key)
    }
}))
const { WindowsControlOverlayManager } = await import('../src/main/agent-control/windows-control-overlay')
const empty = {targets:[],grants:[]}
const active = {
    targets:[{targetId:'window-1',kind:'windows-window',applicationName:'Fixture',title:'Fixture'}],
    grants:[{targetId:'window-1',state:'active',issuedAt:'2026-09-15T00:00:00Z'}]
}
function fixture() {
    const broker = Object.assign(new EventEmitter(), {
        state: () => empty,
        observations: {get:() => undefined},
        targets: {get:() => {throw new Error('No observation yet')}},
        emergencyStop:async () => undefined
    })
    const manager = new WindowsControlOverlayManager(broker as any) as any
    return {broker,manager}
}
const settle = () => new Promise(resolve => setTimeout(resolve,500))
const liveCount = () => windows.filter(window => !window.destroyed).length

// A grant can prewarm a cursor without ever displaying it. Releasing that grant
// must leave zero BrowserWindows, so closing the app can reach window-all-closed.
{
    const {broker,manager} = fixture()
    broker.emit('changed',active)
    assert.equal(liveCount(),1)
    broker.emit('changed',empty)
    assert.equal(liveCount(),0)
    assert.equal(shortcuts.size,0)
    manager.dispose()
}
// Keep the existing exit animation, then release both surfaces.
{
    const {broker,manager} = fixture()
    broker.emit('changed',active)
    manager.ensureSafetyWindow().showInactive()
    broker.emit('changed',empty)
    assert.equal(liveCount(),2)
    await settle()
    assert.equal(liveCount(),0)
    manager.dispose()
}
// A new grant arriving during an exit must not lose its prewarmed windows.
{
    const {broker,manager} = fixture()
    broker.emit('changed',active)
    manager.ensureSafetyWindow().showInactive()
    const cursor = manager.cursorWindow
    broker.emit('changed',empty)
    broker.emit('changed',active)
    await settle()
    assert.equal(liveCount(),2)
    assert.equal(manager.cursorWindow,cursor)
    assert(!cursor.destroyed)
    broker.emit('changed',empty)
    assert.equal(liveCount(),0)
    manager.dispose()
}
// Disposal during a fade cancels pending work and remains idempotent.
{
    const {broker,manager} = fixture()
    broker.emit('changed',active)
    manager.ensureSafetyWindow().showInactive()
    broker.emit('changed',empty)
    manager.dispose()
    manager.dispose()
    await settle()
    assert.equal(liveCount(),0)
}
console.log('Windows control overlay lifecycle: hidden release, animated release, reactivation and disposal passed')

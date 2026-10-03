import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { attachWindowStateEvents } from '../src/main/window-state-events'

class WindowFixture extends EventEmitter {
    maximized = false
    fullscreen = false
    resizable = true
    destroyed = false
    contentsDestroyed = false
    resizableWrites: boolean[] = []
    minimum: [number, number] = [400, 300]
    maximum: [number, number] = [0, 0]
    notices: Array<[string, boolean]> = []
    webContents = Object.assign(new EventEmitter(), {
        isDestroyed: () => this.contentsDestroyed,
        send: (channel: string, value: boolean) => this.notices.push([channel, value])
    })
    isDestroyed() { return this.destroyed }
    isMaximized() { return this.maximized }
    isFullScreen() { return this.fullscreen }
    isResizable() { return this.resizable }
    getMinimumSize() { return this.minimum }
    getMaximumSize() { return this.maximum }
    setMinimumSize(width: number, height: number) { this.minimum = [width, height] }
    setMaximumSize(width: number, height: number) { this.maximum = [width, height] }
    setResizable(value: boolean) {
        this.resizableWrites.push(value); this.resizable = value
        if (!value) { this.minimum = [1920, 1080]; this.maximum = [1920, 1080] }
    }
    attach(platform: NodeJS.Platform = 'win32') { attachWindowStateEvents(this as unknown as BrowserWindow, platform) }
    resizePrevented() {
        let prevented = false
        this.emit('will-resize', { preventDefault: () => { prevented = true } }, { x: 0, y: 0, width: 400, height: 300 }, { edge: 'left' })
        return prevented
    }
}

const window = new WindowFixture()
window.attach()
assert.equal(window.resizable, true, 'Normal windows remain resizable')
assert.equal(window.resizePrevented(), false, 'Normal edge resizing stays allowed')
window.maximized = true
window.emit('maximize')
assert.equal(window.resizable, false, 'Maximizing removes the native resize affordance')
assert.deepEqual(window.minimum, [400, 300], 'Locking preserves the normal minimum constraints')
assert.deepEqual(window.maximum, [0, 0], 'Locking preserves the normal maximum constraints')
assert.equal(window.resizePrevented(), true, 'Maximized manual edge drags are rejected')
window.maximized = false
window.emit('unmaximize')
assert.equal(window.resizable, true, 'Restore re-enables native resizing')

// Electron on Windows can notify before its fullscreen getter changes.
window.emit('enter-full-screen')
assert.equal(window.resizable, false, 'Fullscreen enter is guarded even while the getter is stale')
assert.equal(window.resizePrevented(), true)
assert.deepEqual(window.notices.at(-1), ['window:fullscreen-changed', true], 'Renderer sees the entered state immediately')
window.fullscreen = true
window.emit('maximize')
window.emit('unmaximize')
assert.equal(window.resizable, false, 'Unmaximize during fullscreen cannot unlock the border')
window.emit('leave-full-screen')
assert.equal(window.resizable, true, 'Fullscreen exit restores resizing even while the getter is stale')
assert.deepEqual(window.notices.at(-1), ['window:fullscreen-changed', false])
window.fullscreen = false
assert.equal(window.resizePrevented(), false)

window.maximized = true
window.emit('maximize')
window.fullscreen = true
window.emit('enter-full-screen')
window.emit('leave-full-screen')
window.fullscreen = false
assert.equal(window.resizable, false, 'Leaving fullscreen into maximized mode stays locked')
window.maximized = false
window.emit('unmaximize')
assert.equal(window.resizable, true)

const writes = window.resizableWrites.length
window.webContents.emit('did-finish-load')
assert.equal(window.resizableWrites.length, writes, 'Reloading publishes state without rewriting native styles')
window.destroyed = true
window.emit('enter-full-screen')
assert.equal(window.resizableWrites.length, writes, 'Late events after destruction are ignored')

for (const state of ['maximized', 'fullscreen'] as const) {
    const startup = new WindowFixture()
    startup[state] = true
    startup.attach()
    assert.equal(startup.resizable, false, 'Attaching to an already expanded window immediately guards its border')
}
const fixed = new WindowFixture()
fixed.resizable = false
fixed.attach()
fixed.emit('enter-full-screen'); fixed.emit('leave-full-screen')
assert.equal(fixed.resizable, false, 'An intentionally fixed-size window is never made resizable')
for (const platform of ['darwin', 'linux'] as const) {
    const native = new WindowFixture()
    native.attach(platform); native.emit('enter-full-screen'); native.emit('leave-full-screen')
    assert.equal(native.resizableWrites.length, 0, 'Native frame policy on other platforms is preserved')
}
console.log('Window state: edge guards, restore, transition ordering, reload, fixed windows, and platform policy: ok')

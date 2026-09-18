import assert from 'node:assert/strict'
import { isAccessoryBrowserTabTearOff, movedAccessoryBrowserTabBounds } from '../src/renderer/src/pages/accessories/accessory-browser-tab-drag'
const tab = { left: 20, right: 140, top: 3, bottom: 31 }
const header = { left: 0, right: 900, top: 0, bottom: 34 }
const moved = (x: number, y = 0) => isAccessoryBrowserTabTearOff(movedAccessoryBrowserTabBounds(tab, { x, y }), header)
assert.equal(moved(400), false, 'horizontal motion within the header does not detach')
assert.equal(moved(0, 60), true, 'dragging below the header detaches')
assert.equal(moved(0, -60), true, 'dragging above the header detaches')
assert.equal(moved(1000), true, 'dragging out past the right edge detaches')
assert.equal(moved(-220), true, 'dragging out past the left edge detaches')
assert.equal(isAccessoryBrowserTabTearOff(tab, null), false)
console.log('Accessory Browser tab drag: header motion, vertical and horizontal tear-off edges: ok')

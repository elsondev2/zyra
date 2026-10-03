import assert from 'node:assert/strict'
import { isAssistantSidebarWindowEdgePoint, shouldCloseAssistantSidebarPreview } from '../src/renderer/src/pages/assistant/assistant-sidebar-preview-state'

const edgeBounds = { left: 0, right: 16, top: 34, bottom: 700 }
const point = (clientX: number, clientY = 250) => isAssistantSidebarWindowEdgePoint({ clientX, clientY, viewportWidth: 900, edgeBounds })
for (const x of [-1, 0, 1]) assert.equal(point(x), true, 'Native/client seam retains the window-edge interaction')
for (const x of [-12, 2, 550, 900]) assert.equal(point(x), false, 'Unrelated window positions cannot latch the left preview')
assert.equal(point(0, 33), false, 'Title bar remains outside the hover strip')
assert.equal(point(0, 700), false, 'Coordinates below the viewport are outside')
assert.equal(isAssistantSidebarWindowEdgePoint({ clientX: 900, clientY: 250, viewportWidth: 900,
    edgeBounds: { left: 884, right: 900, top: 34, bottom: 700 } }), true, 'The geometry also supports a right-edge trigger')
assert.equal(isAssistantSidebarWindowEdgePoint({ clientX: 0, clientY: 250, viewportWidth: 900,
    edgeBounds: { left: 8, right: 24, top: 34, bottom: 700 } }), false, 'An inset control does not own the native edge')
assert.equal(shouldCloseAssistantSidebarPreview({ previewPinned: false, pointerInside: true, nativeOverlayActive: false }), false)
assert.equal(shouldCloseAssistantSidebarPreview({ previewPinned: true, pointerInside: false, nativeOverlayActive: false }), false)
assert.equal(shouldCloseAssistantSidebarPreview({ previewPinned: false, pointerInside: false, nativeOverlayActive: true }), false)
assert.equal(shouldCloseAssistantSidebarPreview({ previewPinned: false, pointerInside: false, nativeOverlayActive: false }), true)
console.log('Sidebar edge geometry, pinning and native overlay dismissal policy: ok')

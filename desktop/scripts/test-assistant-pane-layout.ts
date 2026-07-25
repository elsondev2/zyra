import assert from 'node:assert/strict'
import {
    ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX,
    ASSISTANT_MIN_BOTTOM_COMPOSER_INSET_PX,
    ASSISTANT_MIN_CONVERSATION_WIDTH,
    resolveAssistantComposerInsetEnd,
    resolveAssistantLeftSidebarWidth,
    resolveAssistantPaneLayout,
    resolveAssistantScrollButtonBottom,
    resolveAssistantStableComposerInsetEnd
} from '../src/renderer/src/pages/assistant/assistant-pane-layout'

const defaultThreePaneLayout = resolveAssistantPaneLayout({
    viewportWidth: 1200,
    leftSidebarCollapsed: false,
    leftSidebarWidth: 322,
    inspectorOpen: true,
    inspectorWidth: 420
})
assert.equal(defaultThreePaneLayout.autoCollapseLeftSidebar, false)
assert.equal(defaultThreePaneLayout.conversationWidth, 458)

const narrowThreePaneLayout = resolveAssistantPaneLayout({
    viewportWidth: 900,
    leftSidebarCollapsed: false,
    leftSidebarWidth: 322,
    inspectorOpen: true,
    inspectorWidth: 420
})
assert.equal(narrowThreePaneLayout.autoCollapseLeftSidebar, true)
assert.equal(narrowThreePaneLayout.leftSidebarWidth, 0)
assert.equal(narrowThreePaneLayout.conversationWidth, 480)

const leftResizeLayout = resolveAssistantPaneLayout({
    viewportWidth: 900,
    leftSidebarCollapsed: false,
    leftSidebarWidth: 520,
    inspectorOpen: false,
    inspectorWidth: 420
})
assert.equal(leftResizeLayout.leftSidebarWidth, 420)
assert.ok(leftResizeLayout.conversationWidth >= ASSISTANT_MIN_CONVERSATION_WIDTH)

const rightResizeLayout = resolveAssistantPaneLayout({
    viewportWidth: 1200,
    leftSidebarCollapsed: false,
    leftSidebarWidth: 322,
    inspectorOpen: true,
    inspectorWidth: 700
})
assert.equal(rightResizeLayout.autoCollapseLeftSidebar, true)
assert.equal(rightResizeLayout.inspectorWidth, 700)
assert.equal(rightResizeLayout.conversationWidth, 500)

const constrainedRightResizeLayout = resolveAssistantPaneLayout({
    viewportWidth: 1200,
    leftSidebarCollapsed: false,
    leftSidebarWidth: 322,
    inspectorOpen: true,
    inspectorWidth: 438
})
assert.equal(constrainedRightResizeLayout.autoCollapseLeftSidebar, false)
assert.equal(constrainedRightResizeLayout.maxInspectorWidth, 438)
assert.equal(constrainedRightResizeLayout.conversationWidth, ASSISTANT_MIN_CONVERSATION_WIDTH)

assert.equal(resolveAssistantLeftSidebarWidth(0), 322)
assert.equal(resolveAssistantLeftSidebarWidth(390), 390)
assert.equal(resolveAssistantLeftSidebarWidth(520, 360), 360)

assert.equal(resolveAssistantComposerInsetEnd({
    paneTop: 450,
    paneBottom: 600
}), 166)
assert.equal(resolveAssistantComposerInsetEnd({
    paneTop: 450,
    paneBottom: 600,
    attachmentShelfTop: 350
}), 266)
assert.equal(resolveAssistantComposerInsetEnd({
    paneTop: 450.5,
    paneBottom: 600.1,
    attachmentShelfTop: 470
}), 166)
const bottomComposerInset = resolveAssistantComposerInsetEnd({
    paneTop: 450,
    paneBottom: 600,
    contentTopInset: ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX
})
assert.equal(bottomComposerInset, 126)
assert.equal(resolveAssistantScrollButtonBottom(bottomComposerInset, true), 118)
assert.equal(resolveAssistantScrollButtonBottom(0, false), 16)
assert.equal(resolveAssistantScrollButtonBottom(166, true), 158)
assert.equal(resolveAssistantScrollButtonBottom(266, true), 258)
assert.equal(resolveAssistantStableComposerInsetEnd(0, true), ASSISTANT_MIN_BOTTOM_COMPOSER_INSET_PX, 'transient measurement gaps cannot collapse the timeline footer')
assert.equal(resolveAssistantStableComposerInsetEnd(126, true), ASSISTANT_MIN_BOTTOM_COMPOSER_INSET_PX)
assert.equal(resolveAssistantStableComposerInsetEnd(266, true), 266)
assert.equal(resolveAssistantStableComposerInsetEnd(266, false), 0)

console.log('assistant pane layout contract passed')

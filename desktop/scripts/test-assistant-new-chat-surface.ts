import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveAssistantConversationSurfaceMode } from '../src/renderer/src/pages/assistant/assistant-conversation-surface-mode'

assert.equal(
    deriveAssistantConversationSurfaceMode({
        newChatHandoffActive: false,
        selectedSessionUsesNewChatSurface: true,
        showChatOnboardingOverlay: false,
        selectedThreadHasHistoricalContent: true,
        timelineMessageCount: 0,
        activityCount: 4,
        proposedPlanCount: 0,
        isThreadWorking: false,
        connectionBelongsToSelectedChat: false,
        isLoadingSelectedChat: false,
        pendingApprovalCount: 0,
        pendingInputCount: 0,
        hasPendingLabRequest: false
    }),
    'centered-composer',
    'runtime-only connection activities must not turn a new empty session into a blank conversation shell'
)

assert.equal(
    deriveAssistantConversationSurfaceMode({
        newChatHandoffActive: false,
        selectedSessionUsesNewChatSurface: false,
        showChatOnboardingOverlay: false,
        selectedThreadHasHistoricalContent: true,
        timelineMessageCount: 1,
        activityCount: 0,
        proposedPlanCount: 0,
        isThreadWorking: false,
        connectionBelongsToSelectedChat: false,
        isLoadingSelectedChat: false,
        pendingApprovalCount: 0,
        pendingInputCount: 0,
        hasPendingLabRequest: false
    }),
    'conversation',
    'real persisted chat history must keep the timeline and bottom composer'
)

const paneSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantConversationPane.tsx'), 'utf8')
const composerPaneSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantConversationComposerPane.tsx'), 'utf8')
const placementMotionSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/useAssistantComposerPlacementMotion.ts'), 'utf8')
const projectChipSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantNewChatProjectChip.tsx'), 'utf8')
const composerSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/pages/assistant/AssistantComposerView.tsx'), 'utf8')
assert.match(paneSource, /\{!composerIsCentered \? \([\s\S]{0,160}<AssistantConversationTimelinePane/u, 'the hidden timeline must leave layout so it cannot push the centered composer downward')
assert.match(paneSource, /newChatPrompt=\{emptyComposerPrompt\}/u, 'the greeting must remain mounted while its height and opacity animate away')
assert.match(composerPaneSource, /useAssistantComposerPlacementMotion\(props\.paneRef, placement\)/u, 'the composer should animate between centered and docked geometry')
assert.match(composerPaneSource, /transition-\[grid-template-rows,margin,opacity,transform\]/u, 'the New Chat greeting should animate its height, spacing, and opacity')
assert.match(placementMotionSource, /element\.animate\(\[/u, 'placement motion should use FLIP geometry rather than an abrupt layout switch')
assert.match(placementMotionSource, /translate: `\$\{deltaX\}px \$\{deltaY\}px`[\s\S]{0,100}scale: `\$\{scaleX\} 1`/u, 'FLIP motion must use independent translate and scale properties so centered resting transforms remain intact')
assert.match(placementMotionSource, /prefers-reduced-motion: reduce/u, 'composer placement motion should respect reduced-motion preferences')
assert.match(projectChipSource, /data-assistant-new-chat-project-chip="true"/u, 'New Chat should expose its project context on the composer seam')
assert.match(projectChipSource, /No project/u, 'detached New Chat context must be explicit')
assert.match(projectChipSource, /Choose folder…/u, 'the project context menu must retain the real folder picker path')
assert.match(composerSource, /surface-floating[\s\S]{0,260}shadow-\[0_22px_68px/u, 'the centered composer should use the raised floating-surface edge language')

console.log('Assistant new-chat surface: ok')

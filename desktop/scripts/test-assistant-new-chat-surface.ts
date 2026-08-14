import assert from 'node:assert/strict'
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

console.log('Assistant new-chat surface: ok')

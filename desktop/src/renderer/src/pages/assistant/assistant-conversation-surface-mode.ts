export type AssistantConversationSurfaceModeInput = {
    newChatHandoffActive: boolean
    selectedSessionUsesNewChatSurface: boolean
    showChatOnboardingOverlay: boolean
    selectedThreadHasHistoricalContent: boolean
    timelineMessageCount: number
    activityCount: number
    proposedPlanCount: number
    isThreadWorking: boolean
    connectionBelongsToSelectedChat: boolean
    isLoadingSelectedChat: boolean
    pendingApprovalCount: number
    pendingInputCount: number
    hasPendingLabRequest: boolean
}

export function deriveAssistantConversationSurfaceMode(
    input: AssistantConversationSurfaceModeInput
): 'centered-composer' | 'conversation' {
    const hasConversationContent = !input.newChatHandoffActive
        && !input.selectedSessionUsesNewChatSurface
        && Boolean(
            input.selectedThreadHasHistoricalContent
            || input.timelineMessageCount > 0
            || input.activityCount > 0
            || input.proposedPlanCount > 0
            || input.isThreadWorking
            || input.connectionBelongsToSelectedChat
            || input.isLoadingSelectedChat
            || input.pendingApprovalCount > 0
        )
    const centerComposer = !input.showChatOnboardingOverlay
        && !hasConversationContent
        && !input.hasPendingLabRequest
        && input.pendingApprovalCount === 0
        && input.pendingInputCount === 0
    return input.newChatHandoffActive || centerComposer ? 'centered-composer' : 'conversation'
}

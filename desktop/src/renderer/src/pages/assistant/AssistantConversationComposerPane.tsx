import { memo, useCallback, type RefObject, type WheelEvent as ReactWheelEvent } from 'react'
import type { AssistantPendingUserInput, AssistantPlaygroundPendingLabRequest, AssistantTurnUsage } from '@shared/assistant/contracts'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import { cn } from '@/lib/utils'
import { AssistantComposer } from './AssistantComposer'
import { AssistantPendingPlaygroundLabPanel } from './AssistantPendingPlaygroundLabPanel'
import { AssistantPendingTerminalAccessModal, getPendingTerminalAccessRequest } from './AssistantPendingTerminalAccessModal'
import { AssistantPendingUserInputPanel } from './AssistantPendingUserInputPanel'
import { deriveAssistantComposerDisabledReason } from './assistant-composer-capabilities'
import { ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX } from './assistant-pane-layout'
import type { AssistantComposerSendOptions, AssistantElementBounds, AssistantQueuedComposerMessage, ComposerContextFile } from './assistant-composer-types'

export const AssistantConversationComposerPane = memo(function AssistantConversationComposerPane(props: {
    placement?: 'bottom' | 'center'
    paneRef?: RefObject<HTMLDivElement | null>
    newChatPrompt?: string | null
    pendingPlaygroundLabRequest: AssistantPlaygroundPendingLabRequest | null
    pendingUserInputs: AssistantPendingUserInput[]
    commandPending: boolean
    composerDisabled?: boolean
    sending: boolean
    thinking: boolean
    queuedMessageCount: number
    queuedMessages: AssistantQueuedComposerMessage[]
    onForceQueuedMessage?: (messageId: string) => Promise<void> | void
    onDeleteQueuedMessage?: (messageId: string) => Promise<void> | void
    onMoveQueuedMessage?: (messageId: string, targetMessageId: string) => Promise<void> | void
    selectedSessionId: string | null
    resetComposerStateToken?: string | null
    selectedSessionMode: 'work' | 'playground'
    assistantAvailable: boolean
    assistantConnected: boolean
    selectedProjectPath: string | null
    availableModels: Array<{ id: string; label: string; description?: string }>
    activeModel: string | undefined
    modelsLoading: boolean
    latestTurnUsage?: AssistantTurnUsage | null
    runtimeMode: 'approval-required' | 'full-access'
    interactionMode: 'default' | 'plan'
    activeProfile: 'safe-dev' | 'yolo-fast'
    zyraProfile: 'default' | 'builder'
    onZyraProfileChange: (profile: 'default' | 'builder') => void
    activeStatusLabel: string
    isConnecting?: boolean
    reconnectPending?: boolean
    onStop?: () => Promise<void> | void
    onReconnect?: () => Promise<void> | void
    onOverflowWheel?: (deltaY: number) => void
    onBlockedSend?: (message: string) => void
    onOpenAttachmentPreview?: (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => Promise<void> | void
    onAttachmentShelfBoundsChange?: (bounds: AssistantElementBounds | null) => void
    sendPrompt: (
        prompt: string,
        contextFiles: ComposerContextFile[],
        options: AssistantComposerSendOptions
    ) => Promise<boolean>
    refreshModels: () => void
    respondUserInput: (requestId: string, answers: Record<string, string | string[]>) => Promise<void>
    setPlaygroundTerminalAccess: (enabled: boolean) => void
    setPlaygroundTerminalAccessRequestMuted: (muted: boolean) => void
    approvePendingPlaygroundLabRequest: (input: { title?: string; source: 'empty' | 'git-clone'; repoUrl?: string }) => Promise<void>
    declinePendingPlaygroundLabRequest: () => Promise<void>
}) {
    const placement = props.placement || 'bottom'
    const hasPendingPlaygroundLabRequest = Boolean(props.pendingPlaygroundLabRequest)
    const pendingTerminalAccessRequest = getPendingTerminalAccessRequest(props.pendingUserInputs)
    const visiblePendingUserInputs = pendingTerminalAccessRequest
        ? props.pendingUserInputs.filter((request) => request.requestId !== pendingTerminalAccessRequest.requestId)
        : props.pendingUserInputs
    const isWaitingForUserInput = visiblePendingUserInputs.length > 0
    const isConnecting = props.isConnecting ?? (props.commandPending && !props.assistantConnected)
    const reconnectPending = props.reconnectPending ?? (props.commandPending && !props.assistantConnected)
    const composerDisabledReason = deriveAssistantComposerDisabledReason({
        sessionId: props.selectedSessionId,
        sessionMode: props.selectedSessionMode,
        projectPath: props.selectedProjectPath
    })
    const handlePaneWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
        if (!props.onOverflowWheel || event.deltaY === 0 || isWaitingForUserInput || hasPendingPlaygroundLabRequest) return
        if (event.target instanceof Element && event.target.closest('[data-assistant-composer-hitbox="true"]')) return

        const lineHeight = Number.parseFloat(window.getComputedStyle(event.currentTarget).lineHeight || '0') || 20
        const pageHeight = event.currentTarget.clientHeight || lineHeight * 3
        const deltaFactor = event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? pageHeight : 1
        event.preventDefault()
        props.onOverflowWheel(event.deltaY * deltaFactor)
    }, [hasPendingPlaygroundLabRequest, isWaitingForUserInput, props.onOverflowWheel])

    return (
        <div
            ref={props.paneRef}
            className={cn(
                'w-full px-4 transition-[padding,transform,opacity] duration-300 ease-out',
                placement === 'center'
                    ? '-translate-y-[7vh] pb-0 pt-0'
                    : 'pointer-events-none absolute inset-x-0 bottom-0 z-40 translate-y-0 pb-4'
            )}
            style={placement === 'bottom' ? { paddingTop: ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX } : undefined}
            onWheel={handlePaneWheel}
        >
            {isWaitingForUserInput ? (
                <AssistantPendingUserInputPanel
                    pendingUserInputs={visiblePendingUserInputs}
                    responding={props.commandPending}
                    onRespond={props.respondUserInput}
                    sessionId={props.selectedSessionId}
                    assistantAvailable={props.assistantAvailable}
                    assistantConnected={props.assistantConnected}
                    selectedProjectPath={props.selectedProjectPath}
                    availableModels={props.availableModels}
                    activeModel={props.activeModel}
                    modelsLoading={props.modelsLoading}
                    runtimeMode={props.runtimeMode}
                    interactionMode={props.interactionMode}
                    activeProfile={props.activeProfile}
                    activeStatusLabel={props.activeStatusLabel}
                    isConnecting={isConnecting}
                />
            ) : null}
            {pendingTerminalAccessRequest ? (
                <AssistantPendingTerminalAccessModal
                    request={pendingTerminalAccessRequest}
                    responding={props.commandPending}
                    onRespond={props.respondUserInput}
                    onSetTerminalAccess={props.setPlaygroundTerminalAccess}
                    onSetRequestMuted={props.setPlaygroundTerminalAccessRequestMuted}
                />
            ) : null}
            {!isWaitingForUserInput && hasPendingPlaygroundLabRequest && props.pendingPlaygroundLabRequest ? (
                <AssistantPendingPlaygroundLabPanel
                    request={props.pendingPlaygroundLabRequest}
                    responding={props.commandPending}
                    onApprove={props.approvePendingPlaygroundLabRequest}
                    onDecline={props.declinePendingPlaygroundLabRequest}
                />
            ) : null}
            {!hasPendingPlaygroundLabRequest && !isWaitingForUserInput && !pendingTerminalAccessRequest ? (
                <div
                    className={cn(
                        'mx-auto w-full transition-[max-width] duration-300 ease-out',
                        placement === 'center' ? 'max-w-2xl' : 'max-w-[760px]'
                    )}
                    data-assistant-composer-hitbox="true"
                >
                    {placement === 'center' && props.newChatPrompt ? (
                        <div className="pointer-events-none mb-5 px-2 text-center">
                            <p
                                className="mx-auto max-w-[680px] text-[30px] font-medium leading-[1.08] tracking-[-0.035em] text-sparkle-text/90"
                                style={{ fontFamily: '"Bricolage Grotesque", "Bricolage Grotesque Variable", "Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif' }}
                            >
                                {props.newChatPrompt}
                            </p>
                        </div>
                    ) : null}
                    <AssistantComposer
                        sessionId={props.selectedSessionId}
                        resetStateToken={props.resetComposerStateToken}
                        placement={placement}
                        disabled={Boolean(composerDisabledReason) || props.composerDisabled === true}
                        disabledReason={composerDisabledReason}
                        isSending={props.sending}
                        isThinking={props.thinking}
                        thinkingLabel={props.activeStatusLabel}
                        queuedMessageCount={props.queuedMessageCount}
                        queuedMessages={props.queuedMessages}
                        onForceQueuedMessage={props.onForceQueuedMessage}
                        onDeleteQueuedMessage={props.onDeleteQueuedMessage}
                        onMoveQueuedMessage={props.onMoveQueuedMessage}
                        isConnected={props.assistantConnected}
                        isConnecting={isConnecting}
                        activeModel={props.activeModel}
                        modelOptions={props.availableModels}
                        modelsLoading={props.modelsLoading}
                        modelsError={null}
                        latestTurnUsage={props.latestTurnUsage}
                        activeProfile={props.activeProfile}
                        zyraProfile={props.zyraProfile}
                        onZyraProfileChange={props.onZyraProfileChange}
                        runtimeMode={props.runtimeMode}
                        interactionMode={props.interactionMode}
                        projectPath={props.selectedProjectPath}
                        onReconnect={props.onReconnect}
                        onOverflowWheel={props.onOverflowWheel}
                        onBlockedSend={props.onBlockedSend}
                        onOpenAttachmentPreview={props.onOpenAttachmentPreview}
                        onAttachmentShelfBoundsChange={props.onAttachmentShelfBoundsChange}
                        onRefreshModels={props.refreshModels}
                        onStop={props.onStop}
                        onSend={props.sendPrompt}
                        reconnectPending={reconnectPending}
                    />
                </div>
            ) : null}
        </div>
    )
})

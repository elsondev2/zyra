import type { AssistantInteractionMode, AssistantModelInfo, AssistantReasoningEffort, AssistantRuntimeMode, AssistantTurnUsage } from '@shared/assistant/contracts'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import type { AssistantBusyMessageMode } from '@/lib/settings'

export type ComposerContextFile = {
    id: string
    path: string
    name?: string
    content?: string
    mimeType?: string
    kind?: 'image' | 'doc' | 'code' | 'file'
    sizeBytes?: number
    previewText?: string
    previewDataUrl?: string
    source?: 'manual' | 'paste'
    animateIn?: boolean
}

export type AssistantElementBounds = {
    top: number
    right: number
    bottom: number
    left: number
    width: number
    height: number
}

export type AssistantComposerSendOptions = {
    model?: string
    runtimeMode: AssistantRuntimeMode
    interactionMode: AssistantInteractionMode
    effort: AssistantReasoningEffort
    serviceTier?: 'fast'
    dispatchMode?: 'immediate' | 'queue' | 'force'
}

export type AssistantQueuedComposerMessage = {
    id: string
    prompt: string
    contextFiles: ComposerContextFile[]
    dispatchMode: 'queue' | 'force'
    status: 'queued' | 'paused'
}

export type AssistantComposerDisabledReason = 'no-session' | 'project-required'

export type AssistantComposerProps = {
    sessionId?: string | null
    resetStateToken?: string | null
    placement?: 'bottom' | 'center'
    onSend: (prompt: string, contextFiles: ComposerContextFile[], options: AssistantComposerSendOptions) => Promise<boolean>
    onStop?: () => Promise<void> | void
    onReconnect?: () => Promise<void> | void
    onOverflowWheel?: (deltaY: number) => void
    onBlockedSend?: (message: string) => void
    onCancelDirty?: () => void
    onOpenAttachmentPreview?: (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => Promise<void> | void
    onAttachmentShelfBoundsChange?: (bounds: AssistantElementBounds | null) => void
    disabled: boolean
    disabledReason?: AssistantComposerDisabledReason | null
    allowEmptySubmit?: boolean
    isSending: boolean
    isThinking: boolean
    thinkingLabel?: string
    isConnected: boolean
    isConnecting?: boolean
    activeModel?: string
    activeEffort?: AssistantReasoningEffort | null
    modelOptions?: AssistantModelInfo[]
    modelsLoading?: boolean
    modelsError?: string | null
    onRefreshModels?: () => void
    activeProfile?: string
    zyraProfile?: 'default' | 'builder'
    onZyraProfileChange?: (profile: 'default' | 'builder') => void
    runtimeMode?: AssistantRuntimeMode
    interactionMode?: AssistantInteractionMode
    projectPath?: string | null
    acceptBrowserAnnotations?: boolean
    compact?: boolean
    submitLabel?: string
    dirtySubmitLabel?: string
    cancelLabel?: string
    showCancelWhenDirty?: boolean
    queuedMessageCount?: number
    queuedMessages?: AssistantQueuedComposerMessage[]
    onForceQueuedMessage?: (messageId: string) => Promise<void> | void
    onDeleteQueuedMessage?: (messageId: string) => Promise<void> | void
    onMoveQueuedMessage?: (messageId: string, targetMessageId: string) => Promise<void> | void
    onUpdateQueuedMessage?: (messageId: string, prompt: string) => Promise<void> | void
    busyMessageMode?: AssistantBusyMessageMode
    reconnectPending?: boolean
    latestTurnUsage?: AssistantTurnUsage | null
}

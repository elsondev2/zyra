import { useCallback, useEffect, useLayoutEffect, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import {
    ChevronDown,
    ChevronUp,
    Zap,
    FileCode2,
    FileImage,
    FileText,
    GripVertical,
    ListTodo,
    MessageSquare,
    Pencil,
    Plus,
    SendHorizontal,
    Trash2,
    X
} from 'lucide-react'
import AssistantAttachmentPreviewModal from './AssistantAttachmentPreviewModal'
import { ComposerAttachmentsShelf, ComposerFooterControls, ComposerMentionMenu, ComposerSendButton, ComposerVoiceButton } from './AssistantComposerSections'
import { formatAssistantModelLabel } from './assistant-model-labels'
import {
    renderInlineMentionOverlay,
    reconcileInlineMentionTags,
} from './assistant-composer-inline-mentions'
import type { AssistantComposerController } from './useAssistantComposerController'
import { deriveAssistantComposerViewState } from './assistant-composer-view-state'
import {
    getContentTypeTag,
    getContextFileMeta,
    isPastedTextAttachment,
    toKbLabel
} from './assistant-composer-utils'

const FULL_ACCESS_CONFIRM_SUPPRESSED_KEY = 'zyra-ui:full-access-confirm-suppressed:v1'

function writeFullAccessConfirmSuppressed(value: boolean) {
    try {
        window.localStorage.setItem(FULL_ACCESS_CONFIRM_SUPPRESSED_KEY, value ? 'true' : 'false')
    } catch {
        // Keep full-access toggle usable if localStorage is unavailable.
    }
}

export function AssistantComposerView({ controller }: { controller: AssistantComposerController }) {
    const navigate = useNavigate()
    const { settings } = useSettings()
    const transcriptionEnabled = settings.assistantTranscriptionEnabled
    const capabilities = controller.capabilities
    const canSend = capabilities.canSend
    const showBusySendActions = capabilities.showBusySendActions
    const defaultBusyActionLabel = controller.busyMessageMode === 'force' ? 'Force' : 'Queue'
    const secondaryBusyActionLabel = controller.busyMessageMode === 'force' ? 'Queue' : 'Force'
    const [showBrowserSpeechFallbackModal, setShowBrowserSpeechFallbackModal] = useState(false)
    const [textareaScrollTop, setTextareaScrollTop] = useState(0)
    const [draggedQueuedMessageId, setDraggedQueuedMessageId] = useState<string | null>(null)
    const attachmentShelfRef = useRef<HTMLDivElement | null>(null)
    const hasFloatingShelf = controller.queuedMessages.length > 0 || controller.contextFiles.length > 0
    const hasInlineMentionOverlay = controller.text.length > 0 && controller.inlineMentionTags.length > 0
    const {
        iconTheme,
        voiceBusy
    } = deriveAssistantComposerViewState({
        capabilities,
        controller,
        settings
    })
    const composerPlaceholder = controller.selectedInteractionMode === 'plan'
        ? 'Add plan step...'
        : capabilities.placeholder

    useEffect(() => {
        if (settings.assistantTranscriptionEngine !== 'browser') {
            setShowBrowserSpeechFallbackModal(false)
            return
        }
        if (controller.voiceInput.speechErrorKind === 'network') {
            setShowBrowserSpeechFallbackModal(true)
        }
    }, [controller.voiceInput.speechErrorKind, settings.assistantTranscriptionEngine])

    useLayoutEffect(() => {
        const host = attachmentShelfRef.current
        if (!host) {
            controller.onAttachmentShelfBoundsChange?.(null)
            return
        }

        const measure = () => {
            const itemRects = Array.from(host.querySelectorAll<HTMLElement>('[data-composer-attachment-item="true"]'))
                .map((element) => element.getBoundingClientRect())
                .filter((rect) => rect.width > 0 && rect.height > 0)

            if (itemRects.length === 0) {
                controller.onAttachmentShelfBoundsChange?.(null)
                return
            }

            const bounds = itemRects.reduce((acc, rect) => ({
                top: Math.min(acc.top, rect.top),
                right: Math.max(acc.right, rect.right),
                bottom: Math.max(acc.bottom, rect.bottom),
                left: Math.min(acc.left, rect.left),
                width: 0,
                height: 0
            }), {
                top: itemRects[0].top,
                right: itemRects[0].right,
                bottom: itemRects[0].bottom,
                left: itemRects[0].left,
                width: 0,
                height: 0
            })

            controller.onAttachmentShelfBoundsChange?.({
                ...bounds,
                width: Math.max(0, bounds.right - bounds.left),
                height: Math.max(0, bounds.bottom - bounds.top)
            })
        }

        const frameId = window.requestAnimationFrame(measure)
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
        observer?.observe(host)
        window.addEventListener('resize', measure)

        return () => {
            window.cancelAnimationFrame(frameId)
            observer?.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [
        controller.contextFiles.length,
        controller.onAttachmentShelfBoundsChange,
        controller.placement,
        controller.queuedMessages.length
    ])

    const syncTextareaScroll = useCallback((element: HTMLTextAreaElement | null) => {
        setTextareaScrollTop(element?.scrollTop ?? 0)
    }, [])

    const getNormalizedWheelDelta = useCallback((element: HTMLElement, deltaY: number, deltaMode: number) => {
        const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight || '0') || 20
        const pageHeight = element.clientHeight || lineHeight * 3
        const deltaFactor = deltaMode === 1 ? lineHeight : deltaMode === 2 ? pageHeight : 1
        return deltaY * deltaFactor
    }, [])

    const handleShelfWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
        if (!controller.onOverflowWheel || event.deltaY === 0) return
        event.preventDefault()
        controller.onOverflowWheel(getNormalizedWheelDelta(event.currentTarget, event.deltaY, event.deltaMode))
    }, [controller.onOverflowWheel, getNormalizedWheelDelta])

    const handleTextareaWheel = useCallback((event: ReactWheelEvent<HTMLTextAreaElement>) => {
        if (!controller.onOverflowWheel || event.deltaY === 0) return

        const element = event.currentTarget
        const normalizedDeltaY = getNormalizedWheelDelta(element, event.deltaY, event.deltaMode)
        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
        event.preventDefault()
        event.stopPropagation()

        if (maxScrollTop <= 0) {
            syncTextareaScroll(element)
            controller.onOverflowWheel(normalizedDeltaY)
            return
        }

        if (normalizedDeltaY < 0) {
            if (element.scrollTop > 1) {
                element.scrollTop = Math.max(0, element.scrollTop + normalizedDeltaY)
                syncTextareaScroll(element)
                return
            }
            element.scrollTop = 0
            syncTextareaScroll(element)
            controller.onOverflowWheel(normalizedDeltaY)
            return
        }

        if (normalizedDeltaY > 0) {
            if (maxScrollTop - element.scrollTop > 1) {
                element.scrollTop = Math.min(maxScrollTop, element.scrollTop + normalizedDeltaY)
                syncTextareaScroll(element)
                return
            }
            element.scrollTop = maxScrollTop
            syncTextareaScroll(element)
            controller.onOverflowWheel(normalizedDeltaY)
        }
    }, [controller.onOverflowWheel, getNormalizedWheelDelta, syncTextareaScroll])

    return (
        <>
            <div className="relative flex pointer-events-none flex-col gap-0">
                {hasFloatingShelf ? (
                    <div ref={attachmentShelfRef} className="pointer-events-none absolute inset-x-0 bottom-full z-50 mb-[-2px]">
                        <div className="flex flex-col gap-1" onWheel={handleShelfWheel}>
                            <AnimatedHeight isOpen={controller.queuedMessages.length > 0} duration={220}>
                                <div
                                    data-composer-attachment-item="true"
                                    className="pointer-events-auto mx-auto w-[calc(100%-1rem)] overflow-hidden rounded-[20px] rounded-b-[4px] border border-white/[0.06] bg-sparkle-card/95 shadow-[0_8px_18px_rgba(0,0,0,0.10)] backdrop-blur-xl sm:w-[calc(100%-2.25rem)]"
                                >
                                    <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-1.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">
                                            Queued {controller.queuedMessages.length}
                                        </span>
                                    </div>
                                    <div className={cn(
                                        'custom-scrollbar overflow-y-auto',
                                        controller.queuedMessages.length >= 3 && 'max-h-[9.75rem]'
                                    )}>
                                        {controller.queuedMessages.map((queuedMessage, index) => {
                                            const isForce = queuedMessage.dispatchMode === 'force'
                                            const isPaused = queuedMessage.status === 'paused'
                                            const queuePromptLabel = queuedMessage.prompt.trim() || 'Attachment-only message'
                                            const queuedFileCount = queuedMessage.contextFiles.length
                                            const canForceQueuedMessage = Boolean(controller.onForceQueuedMessage) && (!isForce || isPaused)
                                            const canEditQueuedMessage = Boolean(controller.onDeleteQueuedMessage)
                                            const editQueuedMessage = () => {
                                                if (!canEditQueuedMessage) return
                                                controller.restoreQueuedMessageToDraft(queuedMessage)
                                                void controller.onDeleteQueuedMessage?.(queuedMessage.id)
                                            }
                                            return (
                                                <div
                                                    key={queuedMessage.id}
                                                    onDragOver={(event) => {
                                                        if (!controller.onMoveQueuedMessage || !draggedQueuedMessageId || draggedQueuedMessageId === queuedMessage.id) return
                                                        event.preventDefault()
                                                        event.dataTransfer.dropEffect = 'move'
                                                    }}
                                                    onDrop={(event) => {
                                                        if (!controller.onMoveQueuedMessage || !draggedQueuedMessageId || draggedQueuedMessageId === queuedMessage.id) return
                                                        event.preventDefault()
                                                        void controller.onMoveQueuedMessage(draggedQueuedMessageId, queuedMessage.id)
                                                        setDraggedQueuedMessageId(null)
                                                    }}
                                                    className={cn(
                                                        'relative flex items-start gap-2.5 px-3.5 py-2',
                                                        index > 0 && 'border-t border-white/[0.06]',
                                                        isForce && 'bg-amber-500/10',
                                                        isPaused && 'bg-rose-500/10',
                                                        draggedQueuedMessageId === queuedMessage.id && 'opacity-45'
                                                    )}
                                                >
                                                    <div className={cn(
                                                        'mt-1 shrink-0',
                                                        controller.onMoveQueuedMessage ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                                                        isForce
                                                            ? 'text-amber-100/45'
                                                            : isPaused
                                                                ? 'text-rose-100/45'
                                                                : 'text-white/20'
                                                    )}
                                                        draggable={Boolean(controller.onMoveQueuedMessage)}
                                                        onDragStart={(event) => {
                                                            if (!controller.onMoveQueuedMessage) return
                                                            setDraggedQueuedMessageId(queuedMessage.id)
                                                            event.dataTransfer.effectAllowed = 'move'
                                                            event.dataTransfer.setData('text/plain', queuedMessage.id)
                                                        }}
                                                        onDragEnd={() => setDraggedQueuedMessageId(null)}
                                                        title="Drag to reorder queued messages"
                                                    >
                                                        <GripVertical size={14} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        {isPaused || queuedFileCount > 0 ? (
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                {isPaused ? (
                                                                    <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-100/85">
                                                                        Retry needed
                                                                    </span>
                                                                ) : null}
                                                                {queuedFileCount > 0 ? (
                                                                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/28">
                                                                        {queuedFileCount} file{queuedFileCount === 1 ? '' : 's'}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={editQueuedMessage}
                                                            disabled={!canEditQueuedMessage}
                                                            className="mt-0.5 block w-full cursor-text whitespace-pre-wrap break-words text-left text-[12.5px] leading-5 text-sparkle-text transition-colors hover:text-white disabled:cursor-default disabled:text-sparkle-text"
                                                            title={queuePromptLabel}
                                                            style={{
                                                                display: '-webkit-box',
                                                                WebkitBoxOrient: 'vertical',
                                                                WebkitLineClamp: 2,
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {queuePromptLabel}
                                                        </button>
                                                    </div>
                                                    <div className="ml-2 flex shrink-0 items-center justify-end gap-1 self-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => void controller.onDeleteQueuedMessage?.(queuedMessage.id)}
                                                            disabled={!controller.onDeleteQueuedMessage}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-white/[0.02] text-white/38 transition-colors hover:bg-rose-500/12 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-35"
                                                            title="Delete queued message"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                        <button
                                                        type="button"
                                                        onClick={editQueuedMessage}
                                                            disabled={!canEditQueuedMessage}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-white/[0.02] text-white/38 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                                            title="Edit queued message"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void controller.onForceQueuedMessage?.(queuedMessage.id)}
                                                            disabled={!canForceQueuedMessage}
                                                            className={cn(
                                                                'inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors',
                                                                canForceQueuedMessage
                                                                    ? 'bg-amber-500/12 text-amber-100 hover:bg-amber-500/18'
                                                                    : 'bg-white/[0.05] text-white/35'
                                                            )}
                                                            title={canForceQueuedMessage
                                                                ? 'Interrupt the current turn and send this queued message next'
                                                                : isForce
                                                                    ? 'This queued message is already forced'
                                                                    : 'Force send is unavailable right now'}
                                                        >
                                                            <Zap size={11} />
                                                            <span>{canForceQueuedMessage ? 'Force' : 'Forced'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </AnimatedHeight>
                            <ComposerAttachmentsShelf
                                contextFiles={controller.contextFiles}
                                compact={controller.compact}
                                removingAttachmentIds={controller.removingAttachmentIds}
                                onOpenAttachmentPreview={controller.onOpenAttachmentPreview}
                                onPreview={controller.setPreviewAttachment}
                                onRemove={controller.removeAttachment}
                            />
                        </div>
                    </div>
                ) : null}
                <div ref={controller.composerRootRef} className="pointer-events-auto relative z-40">
                    <div className={cn(
                        'group relative overflow-visible rounded-[18px] border transition-[background-color,border-color,box-shadow] duration-200',
                        controller.placement === 'bottom'
                            ? 'border-white/[0.09] bg-[color-mix(in_srgb,var(--color-card)_97%,transparent)] shadow-[0_18px_54px_rgba(0,0,0,0.30),0_1px_0_rgba(255,255,255,0.045),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-1px_0_rgba(0,0,0,0.18)] backdrop-blur-md'
                            : 'border-[color-mix(in_srgb,var(--color-border)_78%,transparent)] bg-sparkle-card'
                    )}>
                        {controller.placement === 'bottom' ? (
                            <>
                                <div
                                    className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(116deg,rgba(255,255,255,0.04),rgba(255,255,255,0.014)_26%,transparent_58%)] opacity-55"
                                    aria-hidden="true"
                                />
                                <div
                                    className="pointer-events-none absolute inset-x-4 top-0 h-px rounded-full bg-white/[0.08]"
                                    aria-hidden="true"
                                />
                            </>
                        ) : null}
                        <input
                            ref={controller.filePickerRef}
                            type="file"
                            className="hidden"
                            multiple
                            accept="image/*,text/*,.md,.markdown,.txt,.json,.yaml,.yml,.xml,.csv,.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.kt,.cs,.cpp,.c,.h,.css,.scss,.sass,.html,.sql,.toml,.sh,.ps1"
                            onChange={(event) => {
                                const files = event.target.files
                                if (files?.length) {
                                    for (const file of Array.from(files)) void controller.attachFile(file, 'manual')
                                }
                                event.currentTarget.value = ''
                            }}
                        />
                        <div ref={controller.mentionMenuRef} className="relative px-3 pb-1.5 pt-2.5 sm:px-3.5 sm:pt-3">
                            <ComposerMentionMenu
                                isOpen={controller.showMentionMenu}
                                mentionCanScrollUp={controller.mentionCanScrollUp}
                                mentionCanScrollDown={controller.mentionCanScrollDown}
                                mentionLoading={controller.mentionLoading}
                                mentionCandidates={controller.mentionCandidates}
                                activeMentionIndex={controller.activeMentionIndex}
                                mentionListRef={controller.mentionListRef}
                                iconTheme={iconTheme}
                                onScroll={(element) => controller.syncScrollAffordance(element, controller.setMentionCanScrollUp, controller.setMentionCanScrollDown)}
                                onApplyMention={controller.applyMentionCandidate}
                            />

                            <div className="flex min-h-[50px] items-start gap-2">
                                <button
                                    type="button"
                                    onClick={() => controller.filePickerRef.current?.click()}
                                    disabled={capabilities.attachDisabled}
                                    className="mt-0.5 rounded-md p-1 text-sparkle-text-muted transition-colors hover:bg-sparkle-card-hover hover:text-sparkle-text disabled:opacity-50"
                                    title={capabilities.attachDisabled
                                        ? capabilities.detailLabel || 'Attachments are unavailable right now'
                                        : 'Attach files'}
                                >
                                    <Plus size={15} />
                                </button>
                                <div className="relative min-w-0 flex-1">
                                    {hasInlineMentionOverlay ? (
                                        <div
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 overflow-hidden"
                                        >
                                            <div
                                                className={cn(
                                                    'whitespace-pre-wrap break-words pl-[3px] pr-2 text-sparkle-text',
                                                    controller.compact ? 'min-h-[44px] text-[13.5px] leading-[1.35rem]' : 'min-h-[50px] text-[14.5px] leading-[1.4rem]'
                                                )}
                                                style={{ transform: `translateY(-${textareaScrollTop}px)` }}
                                            >
                                                {renderInlineMentionOverlay(controller.text, controller.inlineMentionTags, (tag, rawToken) => (
                                                    <span
                                                        key={tag.id}
                                                        className="rounded-md bg-[var(--accent-primary)]/12 px-1 py-0.5 text-[var(--accent-primary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_18%,transparent)] [box-decoration-break:clone]"
                                                    >
                                                        {rawToken}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    <textarea
                                        ref={controller.textareaRef}
                                        rows={3}
                                        value={controller.text}
                                        onChange={(event) => {
                                            const nextText = event.target.value
                                            controller.setInlineMentionTags((current) => reconcileInlineMentionTags(controller.text, nextText, current))
                                            controller.setText(nextText)
                                            controller.setComposerCursor(event.target.selectionStart ?? nextText.length)
                                            if (controller.historyCursor != null) controller.setHistoryCursor(null)
                                        }}
                                        onClick={(event) => controller.syncComposerCursor(event.currentTarget)}
                                        onScroll={(event) => syncTextareaScroll(event.currentTarget)}
                                        onKeyUp={(event) => controller.syncComposerCursor(event.currentTarget)}
                                        onSelect={(event) => controller.syncComposerCursor(event.currentTarget)}
                                        onKeyDown={controller.handleKeyDown}
                                        onPaste={controller.handlePaste}
                                        onWheel={handleTextareaWheel}
                                        spellCheck={!hasInlineMentionOverlay}
                                        className={cn(
                                            'relative max-h-[120px] w-full resize-none overflow-y-auto bg-transparent pl-[3px] pr-2 font-normal tracking-normal [letter-spacing:0] caret-sparkle-text outline-none placeholder:font-normal placeholder:tracking-normal placeholder:[letter-spacing:0] placeholder:text-sparkle-text-muted/70 selection:bg-sparkle-card-hover',
                                            controller.compact ? 'min-h-[44px] text-[13.5px] leading-[1.35rem]' : 'min-h-[50px] text-[14.5px] leading-[1.4rem]',
                                            hasInlineMentionOverlay ? 'text-transparent' : 'text-sparkle-text'
                                        )}
                                        placeholder={composerPlaceholder}
                                        disabled={capabilities.inputDisabled || voiceBusy}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className={cn('flex items-center justify-between px-1.5 pb-1.5 sm:px-2 sm:pb-2', controller.isCompactFooter ? 'gap-2' : 'flex-wrap gap-2.5 sm:flex-nowrap sm:gap-3')}>
                        <ComposerFooterControls
                            isCompactFooter={controller.isCompactFooter}
                            placement={controller.placement}
                            controlsLocked={capabilities.controlsLocked}
                            modelDropdownRef={controller.modelDropdownRef}
                            showModelDropdown={controller.showModelDropdown}
                                setShowModelDropdown={controller.setShowModelDropdown}
                                modelsLoading={controller.modelsLoading}
                                modelsError={controller.modelsError}
                                modelQuery={controller.modelQuery}
                                setModelQuery={controller.setModelQuery}
                                setActiveModelIndex={controller.setActiveModelIndex}
                                modelCanScrollUp={controller.modelCanScrollUp}
                                modelCanScrollDown={controller.modelCanScrollDown}
                                setModelCanScrollUp={controller.setModelCanScrollUp}
                                setModelCanScrollDown={controller.setModelCanScrollDown}
                                modelListRef={controller.modelListRef}
                                filteredModelOptions={controller.filteredModelOptions}
                                activeModelIndex={controller.activeModelIndex}
                                selectedModel={controller.selectedModel}
                                selectedModelLabel={controller.selectedModelLabel}
                                latestModelId={controller.latestModelId}
                                setSelectedModel={controller.setSelectedModel}
                                onRefreshModels={controller.onRefreshModels}
                                traitsDropdownRef={controller.traitsDropdownRef}
                                showTraitsDropdown={controller.showTraitsDropdown}
                                setShowTraitsDropdown={controller.setShowTraitsDropdown}
                                EFFORT_OPTIONS={controller.EFFORT_OPTIONS}
                                selectedEffort={controller.selectedEffort}
                                setSelectedEffort={controller.setSelectedEffort}
                                EFFORT_LABELS={controller.EFFORT_LABELS}
                                fastModeEnabled={controller.fastModeEnabled}
                                setFastModeEnabled={controller.setFastModeEnabled}
                                selectedInteractionMode={controller.selectedInteractionMode}
                                setSelectedInteractionMode={controller.setSelectedInteractionMode}
                                selectedRuntimeMode={controller.selectedRuntimeMode}
                                setSelectedRuntimeMode={controller.setSelectedRuntimeMode}
                                displayedProfile={controller.displayedProfile}
                                zyraProfile={controller.zyraProfile}
                                onZyraProfileChange={controller.onZyraProfileChange}
                                setShowFullAccessConfirm={controller.setShowFullAccessConfirm}
                                isConnected={controller.isConnected}
                                isConnecting={controller.isConnecting}
                                reconnectPending={controller.reconnectPending}
                                onReconnect={controller.onReconnect}
                            />

                            <div className="flex shrink-0 items-center gap-2">
                                {controller.showCancelWhenDirty && controller.isDirty ? (
                                    <button
                                        type="button"
                                        onClick={controller.handleCancelDirty}
                                        className="inline-flex h-[36px] items-center justify-center rounded-full border border-transparent bg-white/[0.03] px-3.5 text-[12px] font-semibold text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                                    >
                                        {controller.cancelLabel}
                                    </button>
                                ) : null}
                                <ComposerVoiceButton
                                    supported={transcriptionEnabled && controller.voiceInput.isSupported}
                                    isRecording={controller.voiceInput.isRecording}
                                    disabled={capabilities.voiceDisabled || controller.voiceInput.isTranscribing}
                                    onToggle={controller.voiceInput.toggleRecording}
                                />
                                {controller.queuedMessageCount > 0 ? (
                                    <span className="inline-flex h-[36px] items-center rounded-full border border-transparent bg-white/[0.03] px-3 text-[11px] font-medium text-sparkle-text-secondary">
                                        {controller.queuedMessageCount} queued
                                    </span>
                                ) : null}
                                {showBusySendActions ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => void controller.handleSend()}
                                            className="inline-flex h-[36px] items-center justify-center rounded-full border border-white/10 bg-[#2246a8] px-3.5 text-[12px] font-semibold text-white transition-all duration-150 hover:scale-[1.03] hover:border-white/20 hover:bg-[#2955ca]"
                                            title={`${defaultBusyActionLabel} this message while the current turn is still running`}
                                        >
                                            {defaultBusyActionLabel}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void (controller.busyMessageMode === 'force' ? controller.handleQueueSend() : controller.handleForceSend())}
                                            className="inline-flex h-[36px] items-center justify-center rounded-full border border-transparent bg-white/[0.03] px-3.5 text-[12px] font-semibold text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                                            title={`${secondaryBusyActionLabel} this message instead of using the default busy-send action`}
                                        >
                                            {secondaryBusyActionLabel}
                                        </button>
                                        <ComposerSendButton
                                            disabled={capabilities.sendDisabled || voiceBusy}
                                            isConnected={controller.isConnected}
                                            isThinking={true}
                                            canSend={false}
                                            label={controller.isDirty && controller.dirtySubmitLabel ? controller.dirtySubmitLabel : controller.submitLabel}
                                            reconnectPending={controller.reconnectPending}
                                            onStop={controller.onStop}
                                            onReconnect={controller.onReconnect}
                                            onSend={() => void controller.handleSend()}
                                        />
                                    </>
                                ) : (
                                    <ComposerSendButton
                                        disabled={capabilities.sendDisabled || voiceBusy}
                                        isConnected={controller.isConnected}
                                        isThinking={controller.isThinking}
                                        canSend={canSend}
                                        label={controller.isDirty && controller.dirtySubmitLabel ? controller.dirtySubmitLabel : controller.submitLabel}
                                        reconnectPending={controller.reconnectPending}
                                        onStop={controller.onStop}
                                        onReconnect={controller.onReconnect}
                                        onSend={() => void controller.handleSend()}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <AssistantAttachmentPreviewModal
                    file={controller.previewAttachment}
                    meta={controller.previewAttachment ? getContextFileMeta(controller.previewAttachment) : null}
                    contentType={controller.previewAttachment ? getContentTypeTag(controller.previewAttachment) : ''}
                    sizeLabel={controller.previewAttachment ? toKbLabel(controller.previewAttachment.sizeBytes) : ''}
                    showFormattingWarning={controller.previewAttachment ? isPastedTextAttachment(controller.previewAttachment) : false}
                    onUpdatePastedText={controller.updateContextFileText}
                    onClose={() => controller.setPreviewAttachment(null)}
                />
            </div>

            <ConfirmModal
                isOpen={controller.showFullAccessConfirm}
                title="Switch to full access?"
                message="Zyra will stop asking before commands and give this thread full local access. Use it when you trust the project and want faster edits."
                confirmLabel="Switch to full access"
                cancelLabel="Keep supervised"
                variant="warning"
                checkboxLabel="Don't ask again on this device"
                onConfirm={(options) => {
                    if (options?.checkboxChecked) writeFullAccessConfirmSuppressed(true)
                    controller.setSelectedRuntimeMode('full-access')
                    controller.setShowFullAccessConfirm(false)
                }}
                onCancel={() => controller.setShowFullAccessConfirm(false)}
            />
            <ConfirmModal
                isOpen={showBrowserSpeechFallbackModal}
                title="Browser speech failed"
                message="The runtime speech service could not complete transcription. Open assistant settings to switch engines or install the local Vosk model."
                confirmLabel="Open settings"
                cancelLabel="Dismiss"
                variant="info"
                onConfirm={() => {
                    setShowBrowserSpeechFallbackModal(false)
                    navigate('/settings/account?highlight=transcription')
                }}
                onCancel={() => setShowBrowserSpeechFallbackModal(false)}
            />
        </>
    )
}

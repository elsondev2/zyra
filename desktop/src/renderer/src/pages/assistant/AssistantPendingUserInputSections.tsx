import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, RefObject } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, CircleHelp, Plus, SquarePen } from 'lucide-react'
import type { AssistantPendingUserInput, AssistantUserInputQuestion } from '@shared/assistant/contracts'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'
import { ComposerFooterControls, ComposerSendButton } from './AssistantComposerSections'
import type { AssistantComposerController } from './useAssistantComposerController'

const CUSTOM_ANSWER_LABEL = 'Write your own answer'

export function AssistantPendingUserInputStage(props: {
    questionShellOpen: boolean
    questionShellMinimized: boolean
    animatedStepRef: RefObject<HTMLDivElement | null>
    isReviewStep: boolean
    activeQuestion: AssistantUserInputQuestion | null
    activePrompt: AssistantPendingUserInput
    pendingUserInputsLength: number
    progress: {
        questionIndex: number
        answeredQuestionCount: number
        hasAnswer: boolean
        isReviewStep: boolean
        isCustomAnswer: boolean
        selectedAnswer: string
    }
    reviewAnswers: Array<{ question: AssistantUserInputQuestion; index: number; answer: string }>
    responding: boolean
    returnToReview: boolean
    expandedOptionKey: string | null
    customOptionKey: string | null
    showCustomComposer: boolean
    customTextareaRef: RefObject<HTMLTextAreaElement | null>
    composerCapabilities: { attachDisabled: boolean; inputDisabled: boolean; placeholder: string }
    setQuestionIndex: (value: number | ((current: number) => number)) => void
    setReturnToReview: (value: boolean) => void
    setExpandedOptionKey: (value: string | null | ((current: string | null) => string | null)) => void
    onToggleQuestionShellMinimized: () => void
    handleSelectOption: (questionId: string, optionLabel: string) => void
    handleSelectCustom: (questionId: string) => void
    handleCustomAnswerChange: (questionId: string, value: string) => void
    handleCustomTextareaKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
}) {
    const {
        questionShellOpen,
        questionShellMinimized,
        animatedStepRef,
        isReviewStep,
        activeQuestion,
        activePrompt,
        pendingUserInputsLength,
        progress,
        reviewAnswers,
        responding,
        returnToReview,
        expandedOptionKey,
        customOptionKey,
        showCustomComposer,
        customTextareaRef,
        composerCapabilities,
        setQuestionIndex,
        setReturnToReview,
        setExpandedOptionKey,
        onToggleQuestionShellMinimized,
        handleSelectOption,
        handleSelectCustom,
        handleCustomAnswerChange,
        handleCustomTextareaKeyDown
    } = props

    return (
        <AnimatedHeight isOpen={questionShellOpen} duration={240}>
            <div ref={animatedStepRef} className="mb-3 overflow-hidden rounded-[18px] border border-white/5 bg-sparkle-bg/85">
                <div data-guided-animate className={cn('px-4 pt-3 transition-[padding] duration-200', questionShellMinimized ? 'pb-3' : 'border-b border-white/5 pb-2.5')}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sparkle-text-muted">
                                {isReviewStep ? 'Review Decisions' : activeQuestion?.header}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[11px]">
                            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-semibold uppercase tracking-[0.12em] text-emerald-200">
                                Guided Input
                            </span>
                            <span className="rounded-full bg-white/[0.03] px-2 py-0.5 font-medium tabular-nums text-sparkle-text-secondary">
                                {isReviewStep ? 'Review' : `${progress.questionIndex + 1}/${activePrompt.questions.length}`}
                            </span>
                            {pendingUserInputsLength > 1 ? (
                                <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-sparkle-text-muted">
                                    1/{pendingUserInputsLength}
                                </span>
                            ) : null}
                            <button
                                type="button"
                                onClick={onToggleQuestionShellMinimized}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.04] text-sparkle-text-secondary transition-colors hover:bg-white/[0.07] hover:text-sparkle-text"
                                title={questionShellMinimized ? 'Expand question' : 'Minimize question'}
                                aria-label={questionShellMinimized ? 'Expand guided question' : 'Minimize guided question'}
                                aria-expanded={!questionShellMinimized}
                            >
                                {questionShellMinimized ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                        </div>
                    </div>
                    {!questionShellMinimized ? (
                        <p className="mt-1.5 text-[13px] leading-5 text-sparkle-text">
                            {isReviewStep ? 'Review every choice before sending it back.' : activeQuestion?.question}
                        </p>
                    ) : null}
                </div>

                {!questionShellMinimized && isReviewStep ? (
                    <div className="space-y-1.5 px-3 py-2.5">
                        {reviewAnswers.map(({ question, index, answer }) => (
                            <button
                                data-guided-animate
                                key={question.id}
                                type="button"
                                disabled={responding}
                                onClick={() => {
                                    setQuestionIndex(index)
                                    setReturnToReview(true)
                                }}
                                className="flex w-full items-start justify-between gap-3 rounded-2xl bg-white/[0.02] px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.1] px-1.5 text-[10px] font-semibold tabular-nums text-sparkle-text">
                                            {index + 1}
                                        </span>
                                        <span className="truncate text-[12px] font-medium text-sparkle-text">
                                            {question.question}
                                        </span>
                                    </span>
                                    <span className="mt-1.5 flex items-center gap-2">
                                        <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-sparkle-text-secondary">
                                            {question.header}
                                        </span>
                                        <span className="min-w-0 truncate text-[12px] text-sparkle-text-muted">
                                            {answer || 'No answer provided'}
                                        </span>
                                    </span>
                                </span>
                                <span className="mt-0.5 shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-sparkle-text">
                                    Change
                                </span>
                            </button>
                        ))}
                    </div>
                ) : !questionShellMinimized && activeQuestion ? (
                    <div className="space-y-1.5 px-3 py-2.5">
                        {activeQuestion.options.map((option, index) => {
                            const selected = progress.selectedAnswer === option.label
                            const optionKey = `${activeQuestion.id}:${option.label}`
                            const hasDetails = Boolean(option.description && option.description !== option.label)
                            const detailsOpen = expandedOptionKey === optionKey && hasDetails
                            return (
                                <div
                                    data-guided-animate
                                    key={optionKey}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleSelectOption(activeQuestion.id, option.label)}
                                    onKeyDown={(event) => {
                                        if (responding) return
                                        if (event.key === 'Enter' || event.key === 'NumpadEnter') {
                                            event.preventDefault()
                                            handleSelectOption(activeQuestion.id, option.label)
                                        }
                                    }}
                                    role="button"
                                    tabIndex={responding ? -1 : 0}
                                    aria-pressed={selected}
                                    aria-disabled={responding}
                                    className={cn(
                                        'group/option w-full rounded-2xl px-3 py-2 text-left transition-colors',
                                        selected
                                            ? 'bg-emerald-500/[0.08] text-sparkle-text'
                                            : 'bg-white/[0.02] text-sparkle-text-secondary hover:bg-white/[0.04] hover:text-sparkle-text',
                                        responding && 'cursor-not-allowed opacity-60'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2">
                                                <span className={cn(
                                                    'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                                                    selected ? 'bg-emerald-500/18 text-emerald-200' : 'bg-white/[0.08] text-sparkle-text-secondary'
                                                )}>
                                                    {index + 1}
                                                </span>
                                                <span className="text-[12px] font-medium">{option.label}</span>
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            {hasDetails ? (
                                                <button
                                                    type="button"
                                                    disabled={responding}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        setExpandedOptionKey((current) => current === optionKey ? null : optionKey)
                                                    }}
                                                    aria-label={detailsOpen ? `Hide details for ${option.label}` : `Show details for ${option.label}`}
                                                    aria-pressed={detailsOpen}
                                                    className={cn(
                                                        'inline-flex h-5 w-5 items-center justify-center rounded-full transition-all disabled:opacity-50',
                                                        detailsOpen
                                                            ? 'bg-white/[0.12] text-sparkle-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] opacity-100'
                                                            : 'bg-white/[0.06] text-sparkle-text-secondary opacity-0 group-hover/option:opacity-100 group-focus-within/option:opacity-100 hover:bg-white/[0.12] hover:text-sparkle-text'
                                                    )}
                                                >
                                                    <CircleHelp size={12} strokeWidth={2} aria-hidden="true" />
                                                </button>
                                            ) : null}
                                            <span className={cn(
                                                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                                selected ? 'border-emerald-300/35 bg-emerald-400/12' : 'border-white/12 bg-transparent'
                                            )}>
                                                <span className={cn(
                                                    'h-2 w-2 rounded-full transition-colors',
                                                    selected ? 'bg-emerald-200' : 'bg-transparent'
                                                )} />
                                            </span>
                                        </span>
                                    </div>
                                    <AnimatedHeight isOpen={detailsOpen} duration={220}>
                                        <div className="pl-7 pr-1 pt-1">
                                            <p className="text-[11px] leading-4 text-sparkle-text-muted">
                                                {option.description}
                                            </p>
                                        </div>
                                    </AnimatedHeight>
                                </div>
                            )
                        })}

                        <div
                            data-guided-animate
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectCustom(activeQuestion.id)}
                            onKeyDown={(event) => {
                                if (responding) return
                                if (event.key === 'Enter' || event.key === 'NumpadEnter') {
                                    event.preventDefault()
                                    handleSelectCustom(activeQuestion.id)
                                }
                            }}
                            role="button"
                            tabIndex={responding || showCustomComposer ? -1 : 0}
                            aria-pressed={showCustomComposer}
                            aria-disabled={responding}
                            className={cn(
                                'group/custom w-full rounded-2xl px-3 py-2 text-left transition-colors',
                                showCustomComposer
                                    ? 'bg-sky-500/[0.08] text-sparkle-text'
                                    : 'bg-white/[0.02] text-sparkle-text-secondary hover:bg-white/[0.04] hover:text-sparkle-text',
                                responding && 'cursor-not-allowed opacity-60'
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className={cn(
                                            'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                                            showCustomComposer ? 'bg-sky-500/18 text-sky-200' : 'bg-white/[0.08] text-sparkle-text-secondary'
                                        )}>
                                            <SquarePen size={10} />
                                        </span>
                                        <span className="text-[12px] font-medium">{CUSTOM_ANSWER_LABEL}</span>
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                    {customOptionKey ? (
                                        <button
                                            type="button"
                                            disabled={responding}
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                setExpandedOptionKey((current) => current === customOptionKey ? null : customOptionKey)
                                            }}
                                            aria-label={expandedOptionKey === customOptionKey ? 'Hide details for writing your own answer' : 'Show details for writing your own answer'}
                                            aria-pressed={expandedOptionKey === customOptionKey}
                                            className={cn(
                                                'inline-flex h-5 w-5 items-center justify-center rounded-full transition-all disabled:opacity-50',
                                                expandedOptionKey === customOptionKey
                                                    ? 'bg-white/[0.12] text-sparkle-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] opacity-100'
                                                    : 'bg-white/[0.06] text-sparkle-text-secondary opacity-0 group-hover/custom:opacity-100 group-focus-within/custom:opacity-100 hover:bg-white/[0.12] hover:text-sparkle-text'
                                            )}
                                        >
                                            <CircleHelp size={12} strokeWidth={2} aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    <span className={cn(
                                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                        showCustomComposer ? 'border-sky-300/35 bg-sky-400/12' : 'border-white/12 bg-transparent'
                                    )}>
                                        <span className={cn(
                                            'h-2 w-2 rounded-full transition-colors',
                                            showCustomComposer ? 'bg-sky-200' : 'bg-transparent'
                                        )} />
                                    </span>
                                </span>
                            </div>
                            <AnimatedHeight isOpen={expandedOptionKey === customOptionKey} duration={220}>
                                <div className="pl-7 pr-1 pt-1">
                                    <p className="text-[11px] leading-4 text-sparkle-text-muted">
                                        Use the composer area below when none of the predefined answers fit.
                                    </p>
                                </div>
                            </AnimatedHeight>
                        </div>
                    </div>
                ) : null}
            </div>
        </AnimatedHeight>
    )
}

export function AssistantPendingUserInputFooter(props: {
    composerController: AssistantComposerController
    composerCapabilities: {
        controlsLocked: boolean
        sendDisabled: boolean
    }
    responding: boolean
    progressQuestionIndex: number
    isReviewStep: boolean
    returnToReview: boolean
    canAdvance: boolean
    actionLabel: string
    onBack: () => void
    onAdvance: () => void
}) {
    const {
        composerController,
        composerCapabilities,
        responding,
        progressQuestionIndex,
        isReviewStep,
        returnToReview,
        canAdvance,
        actionLabel,
        onBack,
        onAdvance
    } = props

    return (
        <div className={cn('flex items-center justify-between px-1.5 pb-1.5 sm:px-2 sm:pb-2', composerController.isCompactFooter ? 'gap-0.5' : 'flex-wrap gap-1 sm:flex-nowrap sm:gap-0')}>
            <ComposerFooterControls
                isCompactFooter={composerController.isCompactFooter}
                controlsLocked={composerCapabilities.controlsLocked}
                modelDropdownRef={composerController.modelDropdownRef}
                showModelDropdown={composerController.showModelDropdown}
                setShowModelDropdown={composerController.setShowModelDropdown}
                modelsLoading={composerController.modelsLoading}
                modelsError={composerController.modelsError}
                modelQuery={composerController.modelQuery}
                setModelQuery={composerController.setModelQuery}
                setActiveModelIndex={composerController.setActiveModelIndex}
                modelCanScrollUp={composerController.modelCanScrollUp}
                modelCanScrollDown={composerController.modelCanScrollDown}
                setModelCanScrollUp={composerController.setModelCanScrollUp}
                setModelCanScrollDown={composerController.setModelCanScrollDown}
                modelListRef={composerController.modelListRef}
                filteredModelOptions={composerController.filteredModelOptions}
                activeModelIndex={composerController.activeModelIndex}
                selectedModel={composerController.selectedModel}
                selectedModelLabel={composerController.selectedModelLabel}
                latestModelId={composerController.latestModelId}
                setSelectedModel={composerController.setSelectedModel}
                onRefreshModels={composerController.onRefreshModels}
                traitsDropdownRef={composerController.traitsDropdownRef}
                showTraitsDropdown={composerController.showTraitsDropdown}
                setShowTraitsDropdown={composerController.setShowTraitsDropdown}
                EFFORT_OPTIONS={composerController.EFFORT_OPTIONS}
                selectedEffort={composerController.selectedEffort}
                setSelectedEffort={composerController.setSelectedEffort}
                EFFORT_LABELS={composerController.EFFORT_LABELS}
                fastModeEnabled={composerController.fastModeEnabled}
                setFastModeEnabled={composerController.setFastModeEnabled}
                selectedInteractionMode={composerController.selectedInteractionMode}
                setSelectedInteractionMode={composerController.setSelectedInteractionMode}
                selectedRuntimeMode={composerController.selectedRuntimeMode}
                setSelectedRuntimeMode={composerController.setSelectedRuntimeMode}
                displayedProfile={composerController.displayedProfile}
                setShowFullAccessConfirm={composerController.setShowFullAccessConfirm}
            />

            <div className="flex shrink-0 items-center gap-2">
                {(progressQuestionIndex > 0 || isReviewStep) ? (
                    <button
                        type="button"
                        disabled={responding}
                        onClick={onBack}
                        className="inline-flex min-w-[104px] items-center justify-center gap-1 rounded-full bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-sparkle-text-secondary transition-colors hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-50"
                    >
                        <ArrowLeft size={12} />
                        {returnToReview ? 'Review' : 'Back'}
                    </button>
                ) : null}
                <ComposerSendButton
                    disabled={composerCapabilities.sendDisabled}
                    isConnected={composerController.isConnected}
                    isThinking={false}
                    canSend={canAdvance}
                    label={actionLabel}
                    onSend={() => void onAdvance()}
                />
            </div>
        </div>
    )
}

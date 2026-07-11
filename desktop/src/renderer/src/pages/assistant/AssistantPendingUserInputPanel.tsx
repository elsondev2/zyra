import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, Plus } from 'lucide-react'
import type { AssistantPendingUserInput } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import {
    AssistantPendingUserInputFooter,
    AssistantPendingUserInputStage
} from './AssistantPendingUserInputSections'
import {
    deriveAssistantComposerCapabilities,
    deriveAssistantComposerDisabledReason
} from './assistant-composer-capabilities'
import { useAssistantComposerController } from './useAssistantComposerController'
import type { AssistantComposerSendOptions, ComposerContextFile } from './assistant-composer-types'
import {
    buildAssistantPendingUserInputAnswers,
    deriveAssistantPendingUserInputProgress,
    findFirstUnansweredAssistantPendingUserInputQuestionIndex,
    type AssistantPendingUserInputDraftAnswers
} from './assistant-pending-user-input'

const CUSTOM_ANSWER_LABEL = 'Write your own answer'

export const AssistantPendingUserInputPanel = memo(function AssistantPendingUserInputPanel(props: {
    pendingUserInputs: AssistantPendingUserInput[]
    responding: boolean
    onRespond: (requestId: string, answers: Record<string, string>) => Promise<void> | void
    sessionId: string | null
    assistantAvailable: boolean
    assistantConnected: boolean
    selectedProjectPath: string | null
    availableModels: Array<{ id: string; label: string; description?: string }>
    activeModel: string | undefined
    modelsLoading: boolean
    runtimeMode: 'approval-required' | 'full-access'
    interactionMode: 'default' | 'plan'
    activeProfile: 'safe-dev' | 'yolo-fast'
    activeStatusLabel: string
    isConnecting?: boolean
}) {
    const { pendingUserInputs, responding, onRespond } = props
    const activePrompt = pendingUserInputs[0] || null
    const composerDisabledReason = deriveAssistantComposerDisabledReason({
        sessionId: props.sessionId
    })
    const [draftAnswersByRequestId, setDraftAnswersByRequestId] = useState<Record<string, AssistantPendingUserInputDraftAnswers>>({})
    const [questionIndex, setQuestionIndex] = useState(0)
    const [customQuestionIdByRequestId, setCustomQuestionIdByRequestId] = useState<Record<string, string | null>>({})
    const [questionShellOpen, setQuestionShellOpen] = useState(false)
    const [questionShellMinimized, setQuestionShellMinimized] = useState(false)
    const [returnToReview, setReturnToReview] = useState(false)
    const [expandedOptionKey, setExpandedOptionKey] = useState<string | null>(null)
    const customTextareaRef = useRef<HTMLTextAreaElement | null>(null)
    const animatedStepRef = useRef<HTMLDivElement | null>(null)

    const composerController = useAssistantComposerController({
        sessionId: props.sessionId,
        onSend: async (_prompt: string, _contextFiles: ComposerContextFile[], _options: AssistantComposerSendOptions) => false,
        disabled: Boolean(composerDisabledReason),
        disabledReason: composerDisabledReason,
        allowEmptySubmit: true,
        isSending: responding,
        isThinking: false,
        thinkingLabel: props.activeStatusLabel,
        isConnected: props.assistantConnected,
        isConnecting: props.isConnecting ?? false,
        activeModel: props.activeModel,
        modelOptions: props.availableModels,
        modelsLoading: props.modelsLoading,
        modelsError: null,
        activeProfile: props.activeProfile,
        runtimeMode: props.runtimeMode,
        interactionMode: props.interactionMode,
        projectPath: props.selectedProjectPath,
        submitLabel: 'Continue'
    })

    const activeDraftAnswers = useMemo(
        () => activePrompt ? draftAnswersByRequestId[activePrompt.requestId] || {} : {},
        [activePrompt, draftAnswersByRequestId]
    )
    const progress = useMemo(
        () => deriveAssistantPendingUserInputProgress(activePrompt, activeDraftAnswers, questionIndex),
        [activeDraftAnswers, activePrompt, questionIndex]
    )

    useEffect(() => {
        const pendingRequestIds = new Set(pendingUserInputs.map((entry) => entry.requestId))
        setDraftAnswersByRequestId((current) => {
            const nextEntries = Object.entries(current).filter(([requestId]) => pendingRequestIds.has(requestId))
            return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries)
        })
        setCustomQuestionIdByRequestId((current) => {
            const nextEntries = Object.entries(current).filter(([requestId]) => pendingRequestIds.has(requestId))
            return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries)
        })
    }, [pendingUserInputs])

    useEffect(() => {
        if (!activePrompt) {
            setQuestionIndex(0)
            setReturnToReview(false)
            setExpandedOptionKey(null)
            setQuestionShellMinimized(false)
            return
        }
        setQuestionShellOpen(false)
        setQuestionShellMinimized(false)
        setReturnToReview(false)
        setExpandedOptionKey(null)
        setQuestionIndex(findFirstUnansweredAssistantPendingUserInputQuestionIndex(activePrompt.questions, activeDraftAnswers))
    }, [activePrompt?.requestId])

    useEffect(() => {
        setExpandedOptionKey(null)
    }, [activePrompt?.requestId, questionIndex])

    useEffect(() => {
        if (!activePrompt) return
        const frame = window.requestAnimationFrame(() => setQuestionShellOpen(true))
        return () => window.cancelAnimationFrame(frame)
    }, [activePrompt?.requestId])

    const handleSelectOption = useCallback((questionId: string, optionLabel: string) => {
        if (!activePrompt) return
        setDraftAnswersByRequestId((current) => ({
            ...current,
            [activePrompt.requestId]: {
                ...(current[activePrompt.requestId] || {}),
                [questionId]: optionLabel
            }
        }))
        setCustomQuestionIdByRequestId((current) => ({
            ...current,
            [activePrompt.requestId]: current[activePrompt.requestId] === questionId ? null : current[activePrompt.requestId] ?? null
        }))
    }, [activePrompt])

    const handleSelectCustom = useCallback((questionId: string) => {
        if (!activePrompt) return
        const activeQuestion = activePrompt.questions.find((question) => question.id === questionId) || null
        setCustomQuestionIdByRequestId((current) => ({
            ...current,
            [activePrompt.requestId]: questionId
        }))
        setDraftAnswersByRequestId((current) => {
            const currentAnswers = current[activePrompt.requestId] || {}
            const currentAnswer = String(currentAnswers[questionId] || '')
            const nextAnswer = activeQuestion?.options.some((option) => option.label === currentAnswer) ? '' : currentAnswer
            return {
                ...current,
                [activePrompt.requestId]: {
                    ...currentAnswers,
                    [questionId]: nextAnswer
                }
            }
        })
        window.requestAnimationFrame(() => {
            const textarea = customTextareaRef.current
            if (!textarea) return
            textarea.focus()
            const cursor = textarea.value.length
            textarea.setSelectionRange(cursor, cursor)
        })
    }, [activePrompt])

    const handleCustomAnswerChange = useCallback((questionId: string, value: string) => {
        if (!activePrompt) return
        setCustomQuestionIdByRequestId((current) => ({
            ...current,
            [activePrompt.requestId]: questionId
        }))
        setDraftAnswersByRequestId((current) => ({
            ...current,
            [activePrompt.requestId]: {
                ...(current[activePrompt.requestId] || {}),
                [questionId]: value
            }
        }))
    }, [activePrompt])

    const handleAdvance = useCallback(async () => {
        if (!activePrompt || !progress) return
        const resolvedAnswers = buildAssistantPendingUserInputAnswers(activePrompt.questions, activeDraftAnswers)

        if (progress.isReviewStep) {
            if (!resolvedAnswers) return
            await onRespond(activePrompt.requestId, resolvedAnswers)
            return
        }

        if (!progress.hasAnswer) return
        if (returnToReview) {
            setQuestionIndex(activePrompt.questions.length)
            setReturnToReview(false)
            return
        }
        if (progress.questionIndex < activePrompt.questions.length - 1) {
            setQuestionIndex(progress.questionIndex + 1)
            return
        }
        setQuestionIndex(activePrompt.questions.length)
    }, [activeDraftAnswers, activePrompt, onRespond, progress])

    useEffect(() => {
        const activeQuestion = progress?.activeQuestion
        if (!activePrompt || !activeQuestion || responding) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return
            const target = event.target
            if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return

            const digit = Number.parseInt(event.key, 10)
            if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
                const option = activeQuestion.options[digit - 1]
                if (!option) return
                event.preventDefault()
                handleSelectOption(activeQuestion.id, option.label)
                return
            }

            if ((event.key === 'Enter' || event.key === 'NumpadEnter') && progress.hasAnswer) {
                event.preventDefault()
                void handleAdvance()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [activePrompt, handleAdvance, handleSelectOption, progress, responding])

    useLayoutEffect(() => {
        if (!progress?.activeQuestion || !activePrompt) return
        const activeCustomQuestionId = customQuestionIdByRequestId[activePrompt.requestId] || null
        const shouldFocusCustomComposer = activeCustomQuestionId === progress.activeQuestion.id || progress.isCustomAnswer
        if (!shouldFocusCustomComposer) return
        const textarea = customTextareaRef.current
        if (!textarea) return
        textarea.focus()
        const cursor = textarea.value.length
        textarea.setSelectionRange(cursor, cursor)
    }, [activePrompt, customQuestionIdByRequestId, progress?.activeQuestion, progress?.isCustomAnswer])

    if (!activePrompt || !progress) return null

    const activeQuestion = progress.activeQuestion
    const isReviewStep = progress.isReviewStep
    const activeCustomQuestionId = customQuestionIdByRequestId[activePrompt.requestId] || null
    const showCustomComposer = Boolean(
        activeQuestion
        && (activeCustomQuestionId === activeQuestion.id || progress.isCustomAnswer)
    )
    const animatedStageKey = isReviewStep
        ? `${activePrompt.requestId}:review`
        : `${activePrompt.requestId}:${activeQuestion?.id || questionIndex}`
    const customOptionKey = activeQuestion ? `${activeQuestion.id}:__custom__` : null
    const answeredAllQuestions = progress.answeredQuestionCount >= activePrompt.questions.length
    const actionLabel = responding ? 'Finish' : isReviewStep ? 'Finish' : returnToReview ? 'Back to review' : 'Continue'
    const canAdvance = isReviewStep ? answeredAllQuestions : progress.hasAnswer
    const reviewAnswers = activePrompt.questions.map((question, index) => ({
        question,
        index,
        answer: String(activeDraftAnswers[question.id] || '')
    }))
    const composerCapabilities = deriveAssistantComposerCapabilities({
        mode: 'guided',
        disabled: composerController.disabled,
        disabledReason: composerDisabledReason,
        isConnected: composerController.isConnected,
        isConnecting: props.isConnecting ?? false,
        isSending: false,
        isThinking: false,
        allowEmptySubmit: false,
        hasContent: canAdvance,
        controlsLocked: true,
        attachmentsLocked: true,
        isResponding: responding,
        isReviewStep
    })
    const composerStatusToneClass = composerCapabilities.tone === 'warning'
        ? 'text-amber-200'
        : composerCapabilities.tone === 'info'
            ? 'text-sky-200'
            : 'text-sparkle-text-secondary'
    const composerStatusDotClass = composerCapabilities.tone === 'warning'
        ? 'bg-amber-300/80'
        : composerCapabilities.tone === 'info'
            ? 'bg-sky-300/80'
            : 'bg-white/35'

    const handleCustomTextareaKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        event.stopPropagation()
        if ('nativeEvent' in event && 'stopImmediatePropagation' in event.nativeEvent) {
            event.nativeEvent.stopImmediatePropagation()
        }
        if (!activeQuestion || isReviewStep || responding) return
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (event.key !== 'Enter' && event.key !== 'NumpadEnter') return
        if (event.shiftKey) return
        if (!progress.hasAnswer) return
        event.preventDefault()
        void handleAdvance()
    }, [activeQuestion, handleAdvance, isReviewStep, progress.hasAnswer, responding])

    useEffect(() => {
        const container = animatedStepRef.current
        if (!container) return

        const animatedNodes = Array.from(container.querySelectorAll<HTMLElement>('[data-guided-animate]'))
        animatedNodes.forEach((node, index) => {
            node.animate(
                [
                    {
                        opacity: 0,
                        transform: 'translateY(14px) scale(0.982)',
                        filter: 'blur(3px)'
                    },
                    {
                        opacity: 1,
                        transform: 'translateY(0) scale(1)',
                        filter: 'blur(0px)'
                    }
                ],
                {
                    duration: 280 + index * 48,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    fill: 'both'
                }
            )
        })
    }, [animatedStageKey])

    return (
        <div className="mx-auto w-full max-w-3xl">
            <div ref={composerController.composerRootRef} className="pointer-events-auto relative z-10">
                <div className="group rounded-[20px] border border-white/10 bg-sparkle-card transition-[border-color,box-shadow] duration-200">
                    <div className="relative px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
                        <AssistantPendingUserInputStage
                            questionShellOpen={questionShellOpen}
                            questionShellMinimized={questionShellMinimized}
                            animatedStepRef={animatedStepRef}
                            isReviewStep={isReviewStep}
                            activeQuestion={activeQuestion}
                            activePrompt={activePrompt}
                            pendingUserInputsLength={pendingUserInputs.length}
                            progress={{
                                questionIndex: progress.questionIndex,
                                answeredQuestionCount: progress.answeredQuestionCount,
                                hasAnswer: progress.hasAnswer,
                                isReviewStep: progress.isReviewStep,
                                isCustomAnswer: progress.isCustomAnswer,
                                selectedAnswer: progress.selectedAnswer || ''
                            }}
                            reviewAnswers={reviewAnswers}
                            responding={responding}
                            returnToReview={returnToReview}
                            expandedOptionKey={expandedOptionKey}
                            customOptionKey={customOptionKey}
                            showCustomComposer={showCustomComposer}
                            customTextareaRef={customTextareaRef}
                            composerCapabilities={composerCapabilities}
                            setQuestionIndex={setQuestionIndex}
                            setReturnToReview={setReturnToReview}
                            setExpandedOptionKey={setExpandedOptionKey}
                            onToggleQuestionShellMinimized={() => setQuestionShellMinimized((current) => !current)}
                            handleSelectOption={handleSelectOption}
                            handleSelectCustom={handleSelectCustom}
                            handleCustomAnswerChange={handleCustomAnswerChange}
                            handleCustomTextareaKeyDown={handleCustomTextareaKeyDown}
                        />

                        <div data-guided-animate className="flex min-h-[56px] items-start gap-2">
                            <button
                                type="button"
                                disabled={composerCapabilities.attachDisabled}
                                className="mt-0.5 rounded-full p-1 text-sparkle-text-muted opacity-35"
                                title={composerCapabilities.attachDisabled
                                    ? composerCapabilities.detailLabel || 'Attachments are disabled right now'
                                    : 'Attach files'}
                            >
                                <Plus size={18} />
                            </button>
                            <div className="relative min-w-0 flex-1">
                                <textarea
                                    ref={customTextareaRef}
                                    autoFocus={showCustomComposer && !isReviewStep}
                                    rows={3}
                                    value={isReviewStep ? 'Review the decisions above, then press Finish.' : (showCustomComposer ? progress.selectedAnswer || '' : '')}
                                    onFocus={() => {
                                        if (activeQuestion && !isReviewStep) handleSelectCustom(activeQuestion.id)
                                    }}
                                    onChange={(event) => {
                                        if (!activeQuestion || isReviewStep) return
                                        handleCustomAnswerChange(activeQuestion.id, event.target.value)
                                    }}
                                    onKeyDownCapture={(event) => {
                                        event.stopPropagation()
                                        if ('nativeEvent' in event && 'stopImmediatePropagation' in event.nativeEvent) {
                                            event.nativeEvent.stopImmediatePropagation()
                                        }
                                    }}
                                    onKeyDown={handleCustomTextareaKeyDown}
                                    className={cn(
                                        'relative w-full resize-none overflow-y-auto bg-transparent pl-[3px] pr-2 text-sparkle-text outline-none placeholder:text-sparkle-text/20 selection:bg-white/15 min-h-[58px] text-[14px] leading-[1.45rem]',
                                        isReviewStep && 'text-sparkle-text-secondary'
                                    )}
                                    placeholder={composerCapabilities.placeholder}
                                    disabled={composerCapabilities.inputDisabled}
                                />
                            </div>
                        </div>
                    </div>

                    <AssistantPendingUserInputFooter
                        composerController={composerController}
                        composerCapabilities={composerCapabilities}
                        responding={responding}
                        progressQuestionIndex={progress.questionIndex}
                        isReviewStep={isReviewStep}
                        returnToReview={returnToReview}
                        canAdvance={canAdvance}
                        actionLabel={actionLabel}
                        onBack={() => {
                            if (returnToReview) {
                                setQuestionIndex(activePrompt.questions.length)
                                setReturnToReview(false)
                                return
                            }
                            setQuestionIndex((current) => Math.max(0, current - 1))
                        }}
                        onAdvance={() => void handleAdvance()}
                    />
                </div>
            </div>
        </div>
    )
})

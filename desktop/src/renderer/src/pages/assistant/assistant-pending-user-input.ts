import type { AssistantPendingUserInput, AssistantUserInputQuestion } from '@shared/assistant/contracts'

export type AssistantPendingUserInputDraftAnswers = Record<string, string>

export type AssistantPendingUserInputProgress = {
    questionIndex: number
    activeQuestion: AssistantUserInputQuestion | null
    selectedAnswer: string | null
    normalizedSelectedAnswer: string | null
    selectedOptionLabel: string | null
    isCustomAnswer: boolean
    hasAnswer: boolean
    answeredQuestionCount: number
    isLastQuestion: boolean
    isReviewStep: boolean
}

export function buildAssistantPendingUserInputAnswers(
    questions: ReadonlyArray<AssistantUserInputQuestion>,
    draftAnswers: AssistantPendingUserInputDraftAnswers
): Record<string, string> | null {
    const answers: Record<string, string> = {}

    for (const question of questions) {
        const answer = String(draftAnswers[question.id] || '').trim()
        if (!answer) return null
        answers[question.id] = answer
    }

    return answers
}

export function findFirstUnansweredAssistantPendingUserInputQuestionIndex(
    questions: ReadonlyArray<AssistantUserInputQuestion>,
    draftAnswers: AssistantPendingUserInputDraftAnswers
): number {
    const unansweredIndex = questions.findIndex((question) => !String(draftAnswers[question.id] || '').trim())
    if (unansweredIndex >= 0) return unansweredIndex
    return Math.max(questions.length - 1, 0)
}

export function deriveAssistantPendingUserInputProgress(
    pendingInput: AssistantPendingUserInput | null,
    draftAnswers: AssistantPendingUserInputDraftAnswers,
    questionIndex: number
): AssistantPendingUserInputProgress | null {
    if (!pendingInput) return null

    const questions = pendingInput.questions
    if (questions.length === 0) {
        return {
            questionIndex: 0,
            activeQuestion: null,
            selectedAnswer: null,
            normalizedSelectedAnswer: null,
            selectedOptionLabel: null,
            isCustomAnswer: false,
            hasAnswer: false,
            answeredQuestionCount: 0,
            isLastQuestion: true,
            isReviewStep: true
        }
    }

    const normalizedQuestionIndex = Math.max(0, Math.min(questionIndex, questions.length))
    const isReviewStep = normalizedQuestionIndex >= questions.length
    const activeQuestion = isReviewStep ? null : questions[normalizedQuestionIndex] || null
    const selectedAnswer = activeQuestion ? String(draftAnswers[activeQuestion.id] || '') || null : null
    const normalizedSelectedAnswer = selectedAnswer?.trim() || null
    const isCustomAnswer = Boolean(
        activeQuestion
        && normalizedSelectedAnswer
        && !activeQuestion.options.some((option) => option.label === normalizedSelectedAnswer)
    )

    return {
        questionIndex: normalizedQuestionIndex,
        activeQuestion,
        selectedAnswer,
        normalizedSelectedAnswer,
        selectedOptionLabel: isCustomAnswer ? null : normalizedSelectedAnswer,
        isCustomAnswer,
        hasAnswer: Boolean(normalizedSelectedAnswer),
        answeredQuestionCount: questions.reduce((count, question) => count + (String(draftAnswers[question.id] || '').trim() ? 1 : 0), 0),
        isLastQuestion: !isReviewStep && normalizedQuestionIndex >= questions.length - 1,
        isReviewStep
    }
}

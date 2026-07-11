export function toCodexUserInputAnswer(value: unknown): { answers: string[] } {
    if (typeof value === 'string') {
        return { answers: [value] }
    }

    if (Array.isArray(value)) {
        return { answers: value.filter((entry): entry is string => typeof entry === 'string') }
    }

    if (value && typeof value === 'object') {
        const maybeAnswers = (value as { answers?: unknown }).answers
        if (Array.isArray(maybeAnswers)) {
            return { answers: maybeAnswers.filter((entry): entry is string => typeof entry === 'string') }
        }
    }

    return { answers: [] }
}

export function toCodexUserInputAnswers(
    answers: Record<string, string | string[]>
): Record<string, { answers: string[] }> {
    return Object.fromEntries(
        Object.entries(answers).map(([questionId, value]) => [questionId, toCodexUserInputAnswer(value)])
    )
}

export function isMissingRolloutResumeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '')
    return /no rollout found for thread id/i.test(message)
}

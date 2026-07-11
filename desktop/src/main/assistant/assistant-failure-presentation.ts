export type AssistantModelNoticeKind = 'usage-limit' | 'rate-limit'

export type AssistantModelNoticePresentation = {
    kind: AssistantModelNoticeKind
    title: string
    message: string
    rawMessage: string
    model: string | null
}

function modelDisplayName(model?: string | null): string | null {
    const normalized = String(model || '').trim()
    if (!normalized) return null
    return normalized.split('/').filter(Boolean).pop() || normalized
}

export function getAssistantModelNoticePresentation(
    rawMessage: string | null | undefined,
    model?: string | null
): AssistantModelNoticePresentation | null {
    const normalized = String(rawMessage || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return null

    const displayModel = modelDisplayName(model)
    if (/usage limit (?:has been )?reached|usage limit.*reset|you(?:'|â€™)?ve reached.*usage limit/i.test(normalized)) {
        return {
            kind: 'usage-limit',
            title: 'Usage limit reached',
            message: displayModel
                ? `${displayModel} has reached its current usage limit. Switch models or try again later.`
                : 'This model has reached its current usage limit. Switch models or try again later.',
            rawMessage: normalized,
            model: displayModel
        }
    }

    if (/\brate limit\b|too many requests|\b429\b/i.test(normalized)) {
        return {
            kind: 'rate-limit',
            title: 'Model temporarily busy',
            message: displayModel
                ? `${displayModel} is receiving too many requests right now. Try again shortly or switch models.`
                : 'The model is receiving too many requests right now. Try again shortly or switch models.',
            rawMessage: normalized,
            model: displayModel
        }
    }

    return null
}

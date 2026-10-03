import type { AssistantModelInfo, AssistantReasoningEffort } from './contracts'

export const CHATGPT_REASONING_EFFORTS: readonly AssistantReasoningEffort[] = Object.freeze([
    'low',
    'medium',
    'high',
    'xhigh'
])

export const GPT_56_REASONING_EFFORTS: readonly AssistantReasoningEffort[] = Object.freeze([
    'low',
    'medium',
    'high',
    'xhigh',
    'max'
])

const KNOWN_REASONING_EFFORTS = new Set<AssistantReasoningEffort>([
    'off',
    'none',
    'minimal',
    ...CHATGPT_REASONING_EFFORTS,
    'max'
])

function isDirectOpenAiModel(id: string): boolean {
    return id.startsWith('openai-codex/') || id.startsWith('openai/')
        || (!id.includes('/') && /^(?:gpt-|codex-)/i.test(id))
}
export function isAssistantReasoningEffort(value: unknown): value is AssistantReasoningEffort {
    return typeof value === 'string' && KNOWN_REASONING_EFFORTS.has(value as AssistantReasoningEffort)
}

export function isGpt56AssistantModel(model: string | Pick<AssistantModelInfo, 'id' | 'label'> | null | undefined): boolean {
    const id = typeof model === 'string' ? model : model?.id || ''
    if (id.includes('/') && !id.startsWith('openai-codex/') && !id.startsWith('openai/')) return false
    const value = typeof model === 'string' ? model : `${id} ${model?.label || ''}`
    return /(?:^|[/\s])gpt-5\.6(?:-|$)/i.test(value)
}

export function getAssistantModelReasoningEfforts(
    model: string | AssistantModelInfo | null | undefined
): AssistantReasoningEffort[] {
    if (typeof model !== 'string' && model?.supportedEfforts) {
        const supported = model.supportedEfforts.filter((effort) => (
            isAssistantReasoningEffort(effort)
        ))
        return [...supported]
    }
    const id = typeof model === 'string' ? model : model?.id || ''
    if (!isDirectOpenAiModel(id)) return []
    return [...(isGpt56AssistantModel(model) ? GPT_56_REASONING_EFFORTS : CHATGPT_REASONING_EFFORTS)]
}

export function coerceAssistantReasoningEffortForModel(
    value: unknown,
    model: string | AssistantModelInfo | null | undefined
): AssistantReasoningEffort {
    const efforts = getAssistantModelReasoningEfforts(model)
    if (efforts.length === 0) return 'off'
    const requested = isAssistantReasoningEffort(value) ? value : 'medium'
    if (typeof model !== 'string' && model?.supportedEfforts) return efforts.includes(requested) ? requested : efforts.includes('medium') ? 'medium' : efforts[0]!
    const id = typeof model === 'string' ? model : model?.id || ''
    if (!isDirectOpenAiModel(id)) {
        return efforts.includes(requested) ? requested : efforts[0]
    }

    if (isGpt56AssistantModel(model)) {
        const compatible = requested === 'off' || requested === 'none' || requested === 'minimal' ? 'low' : requested
        return efforts.includes(compatible) ? compatible : 'medium'
    }

    const compatible = requested === 'off' || requested === 'none' || requested === 'minimal'
        ? 'low'
        : requested === 'max'
            ? 'xhigh'
            : requested
    if (efforts.includes(compatible)) return compatible

    const order = CHATGPT_REASONING_EFFORTS
    const requestedIndex = Math.max(0, order.indexOf(compatible))
    for (let index = requestedIndex; index < order.length; index += 1) {
        if (efforts.includes(order[index])) return order[index]
    }
    for (let index = requestedIndex - 1; index >= 0; index -= 1) {
        if (efforts.includes(order[index])) return order[index]
    }
    return efforts[0] || 'medium'
}

import type {
    AssistantApprovalRequestType,
    AssistantRuntimeMode,
    AssistantUserInputQuestion
} from '../../shared/assistant/contracts'

export function readTurnUsage(
    turn: Record<string, unknown> | undefined,
    payload: Record<string, unknown>,
    readNumericValue: (value: unknown) => number | undefined,
    asRecord: (value: unknown) => Record<string, unknown> | undefined
) {
    const usage = asRecord(turn?.['usage'])
        || asRecord(turn?.['tokenUsage'])
        || asRecord(payload['usage'])
        || asRecord(payload['tokenUsage'])

    const inputTokens = readNumericValue(usage?.['inputTokens'] ?? usage?.['input_tokens'])
    const outputTokens = readNumericValue(usage?.['outputTokens'] ?? usage?.['output_tokens'])
    const reasoningOutputTokens = readNumericValue(usage?.['reasoningOutputTokens'] ?? usage?.['reasoning_output_tokens'])
    const cachedInputTokens = readNumericValue(usage?.['cachedInputTokens'] ?? usage?.['cached_input_tokens'])
    const totalTokens = readNumericValue(usage?.['totalTokens'] ?? usage?.['total_tokens'])
    const modelContextWindow = readNumericValue(usage?.['modelContextWindow'] ?? usage?.['model_context_window'])

    if ([inputTokens, outputTokens, reasoningOutputTokens, cachedInputTokens, totalTokens, modelContextWindow].every((value) => value === undefined)) {
        return null
    }

    return {
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
        reasoningOutputTokens: reasoningOutputTokens ?? null,
        cachedInputTokens: cachedInputTokens ?? null,
        totalTokens: totalTokens ?? null,
        modelContextWindow: modelContextWindow ?? null
    }
}

export function isAssistantItemType(itemType: string): boolean {
    return itemType.includes('assistant')
        || itemType.includes('agent message')
        || itemType.includes('agentmessage')
        || itemType.includes('message')
}

export function toUserInputQuestions(
    value: unknown,
    asRecord: (value: unknown) => Record<string, unknown> | undefined,
    asString: (value: unknown) => string | undefined
): AssistantUserInputQuestion[] {
    const questions = Array.isArray(value) ? value : []
    return questions
        .map((entry) => {
            const record = asRecord(entry)
            const options = Array.isArray(record?.['options']) ? record['options'] : []
            const id = asString(record?.['id'])
            const header = asString(record?.['header'])
            const question = asString(record?.['question'])
            if (!id || !header || !question) return null
            return {
                id,
                header,
                question,
                options: options
                    .map((option) => {
                        const optionRecord = asRecord(option)
                        const label = asString(optionRecord?.['label'])
                        const description = asString(optionRecord?.['description'])
                        if (!label || !description) return null
                        return { label, description }
                    })
                    .filter((option): option is { label: string; description: string } => Boolean(option))
            }
        })
        .filter((question): question is AssistantUserInputQuestion => Boolean(question))
}

export function toApprovalRequestType(method: string): AssistantApprovalRequestType | undefined {
    if (method === 'item/commandExecution/requestApproval') return 'command'
    if (method === 'item/fileRead/requestApproval') return 'file-read'
    if (method === 'item/fileChange/requestApproval') return 'file-change'
    return undefined
}

export function mapRuntimeMode(mode: AssistantRuntimeMode): { approvalPolicy: 'on-request' | 'never'; sandbox: 'workspace-write' | 'danger-full-access' } {
    if (mode === 'full-access') {
        return { approvalPolicy: 'never', sandbox: 'danger-full-access' }
    }
    return { approvalPolicy: 'on-request', sandbox: 'workspace-write' }
}

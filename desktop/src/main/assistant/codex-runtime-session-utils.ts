import type {
    AssistantApprovalRequestType,
    AssistantRuntimeMode,
    AssistantUserInputQuestion,
    AssistantUserInputQuestionType
} from '../../shared/assistant/contracts'

const USER_INPUT_QUESTION_TYPES = new Set<AssistantUserInputQuestionType>([
    'text',
    'single_select',
    'multi_select',
    'confirm',
    'file_select',
    'number',
    'date',
    'ranking'
])

function readQuestionType(value: unknown, hasOptions: boolean): AssistantUserInputQuestionType {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/[ -]+/g, '_') : ''
    return USER_INPUT_QUESTION_TYPES.has(normalized as AssistantUserInputQuestionType)
        ? normalized as AssistantUserInputQuestionType
        : hasOptions ? 'single_select' : 'text'
}

function readFiniteNumber(value: unknown): number | undefined {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
    return Number.isFinite(number) ? number : undefined
}

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
    const cacheWriteTokens = readNumericValue(usage?.['cacheWriteTokens'] ?? usage?.['cache_write_tokens'])
    const totalTokens = readNumericValue(usage?.['totalTokens'] ?? usage?.['total_tokens'])
    const modelContextWindow = readNumericValue(usage?.['modelContextWindow'] ?? usage?.['model_context_window'])
    const cost = asRecord(usage?.['cost'])
    const costUsd = readNumericValue(usage?.['costUsd'] ?? usage?.['cost_usd'] ?? cost?.['total'])

    if ([inputTokens, outputTokens, reasoningOutputTokens, cachedInputTokens, cacheWriteTokens, totalTokens, modelContextWindow, costUsd].every((value) => value === undefined)) {
        return null
    }

    return {
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
        reasoningOutputTokens: reasoningOutputTokens ?? null,
        cachedInputTokens: cachedInputTokens ?? null,
        cacheWriteTokens: cacheWriteTokens ?? null,
        totalTokens: totalTokens ?? null,
        modelContextWindow: modelContextWindow ?? null,
        costUsd: costUsd ?? null
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
            const rawOptions = Array.isArray(record?.['options']) ? record['options'] : []
            const id = asString(record?.['id'])
            const header = asString(record?.['header'])
            const question = asString(record?.['question'] ?? record?.['prompt'])
            if (!id || !header || !question) return null
            const seenOptionLabels = new Set<string>()
            const options = rawOptions
                .map((option) => {
                    const optionRecord = asRecord(option)
                    const label = asString(optionRecord?.['label'] ?? optionRecord?.['value'])
                    if (!label || seenOptionLabels.has(label)) return null
                    seenOptionLabels.add(label)
                    return {
                        label,
                        description: asString(optionRecord?.['description']) || '',
                        ...(optionRecord?.['recommended'] === true ? { recommended: true } : {})
                    }
                })
                .filter((option): option is AssistantUserInputQuestion['options'][number] => Boolean(option))
            const type = readQuestionType(record?.['type'] ?? record?.['kind'], options.length > 0)
            const min = readFiniteNumber(record?.['min'])
            const max = readFiniteNumber(record?.['max'])
            const step = readFiniteNumber(record?.['step'])
            const minSelections = readFiniteNumber(record?.['minSelections'] ?? record?.['min_selections'])
            const maxSelections = readFiniteNumber(record?.['maxSelections'] ?? record?.['max_selections'])
            return {
                id,
                header,
                question,
                type,
                options,
                required: record?.['required'] !== false,
                allowOther: record?.['allowOther'] === true || record?.['allow_other'] === true,
                ...(asString(record?.['placeholder']) ? { placeholder: asString(record?.['placeholder']) } : {}),
                ...(typeof record?.['multiple'] === 'boolean' ? { multiple: record['multiple'] } : {}),
                ...(min !== undefined ? { min } : {}),
                ...(max !== undefined ? { max } : {}),
                ...(step !== undefined ? { step } : {}),
                ...(minSelections !== undefined ? { minSelections } : {}),
                ...(maxSelections !== undefined ? { maxSelections } : {})
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

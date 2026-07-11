import { buildGenerateUrl, normalizeModelName, resolveGeminiModel } from './model-selection'
import type { GeminiResponse, RequestGenerateContentResult } from './types'

function extractResponseText(data: GeminiResponse): string {
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || ''
}

function extractFinishReason(data: GeminiResponse): string | undefined {
    return data.candidates?.[0]?.finishReason
}

function maybeRemoveThinkingConfig(body: Record<string, unknown>): Record<string, unknown> | null {
    const generationConfig = body.generationConfig
    if (!generationConfig || typeof generationConfig !== 'object') return null

    const configRecord = generationConfig as Record<string, unknown>
    if (!('thinkingConfig' in configRecord)) return null

    const { thinkingConfig: _drop, ...restConfig } = configRecord
    return {
        ...body,
        generationConfig: restConfig
    }
}

function shouldRetryWithoutThinkingConfig(status: number, errorMessage: string): boolean {
    if (status !== 400) return false
    return /thinking.?config|thinking.?budget|unknown field|invalid json payload/i.test(errorMessage)
}

export async function requestGenerateContent(
    apiKey: string,
    body: Record<string, unknown>,
    options: { forceModelRefresh?: boolean; preferredModel?: string } = {}
): Promise<RequestGenerateContentResult> {
    let modelName: string
    try {
        if (options.preferredModel?.trim()) {
            modelName = normalizeModelName(options.preferredModel.trim())
        } else {
            modelName = await resolveGeminiModel(apiKey, options.forceModelRefresh)
        }
    } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to resolve Gemini model', rawResponse: err }
    }

    const sendRequest = async (payload: Record<string, unknown>) => {
        const response = await fetch(buildGenerateUrl(apiKey, modelName), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const data = await response.json().catch(() => ({})) as GeminiResponse
        return { response, data }
    }

    let { response, data } = await sendRequest(body)
    const firstErrorMessage = data.error?.message || `HTTP ${response.status}: ${response.statusText}`
    if (!response.ok && shouldRetryWithoutThinkingConfig(response.status, firstErrorMessage)) {
        const fallbackBody = maybeRemoveThinkingConfig(body)
        if (fallbackBody) {
            const fallbackResult = await sendRequest(fallbackBody)
            response = fallbackResult.response
            data = fallbackResult.data
        }
    }

    if (!response.ok) {
        return {
            success: false,
            status: response.status,
            error: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
            modelName,
            rawResponse: data
        }
    }

    const text = extractResponseText(data)
    if (!text) {
        return {
            success: false,
            error: 'Unexpected API response',
            modelName,
            rawResponse: data,
            finishReason: extractFinishReason(data)
        }
    }

    return { success: true, text, modelName, rawResponse: data, finishReason: extractFinishReason(data) }
}

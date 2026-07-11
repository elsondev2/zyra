export interface GeminiResponse {
    candidates?: Array<{
        finishReason?: string
        content?: {
            parts?: Array<{
                text?: string
            }>
        }
    }>
    error?: {
        message?: string
    }
}

export interface GeminiModelInfo {
    name?: string
    supportedGenerationMethods?: string[]
}

export interface GeminiListModelsResponse {
    models?: GeminiModelInfo[]
    nextPageToken?: string
    error?: {
        message?: string
    }
}

export interface RequestGenerateContentResult {
    success: boolean
    text?: string
    error?: string
    status?: number
    modelName?: string
    rawResponse?: unknown
    finishReason?: string
}

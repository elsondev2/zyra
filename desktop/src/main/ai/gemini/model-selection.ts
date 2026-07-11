import log from 'electron-log'
import type { GeminiListModelsResponse, GeminiModelInfo } from './types'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const GEMINI_API_VERSION = 'v1'
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000
const PREFERRED_GEMINI_MODELS = [
    'gemini-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.5-flash'
]

let cachedGeminiModel: string | null = null
let cachedGeminiModelAt = 0

export function normalizeModelName(modelName: string): string {
    return modelName.replace(/^models\//, '')
}

function buildListModelsUrl(apiKey: string, pageToken?: string): string {
    const base = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/models?key=${encodeURIComponent(apiKey)}`
    return pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base
}

export function buildGenerateUrl(apiKey: string, modelName: string): string {
    return `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/models/${encodeURIComponent(normalizeModelName(modelName))}:generateContent?key=${encodeURIComponent(apiKey)}`
}

function hasGenerateContentSupport(model: GeminiModelInfo): boolean {
    const methods = model.supportedGenerationMethods || []
    return methods.some((method) => method.toLowerCase() === 'generatecontent')
}

function chooseBestModel(models: string[]): string | null {
    if (models.length === 0) return null

    for (const preferred of PREFERRED_GEMINI_MODELS) {
        if (models.includes(preferred)) return preferred
    }

    const stableFlash = models.find((name) => /flash/i.test(name) && !/preview|experimental|exp/i.test(name))
    if (stableFlash) return stableFlash

    const anyFlash = models.find((name) => /flash/i.test(name))
    if (anyFlash) return anyFlash

    return models[0]
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
    const modelNames = new Set<string>()
    let pageToken: string | undefined
    let pages = 0

    do {
        const response = await fetch(buildListModelsUrl(apiKey, pageToken))
        const data = await response.json().catch(() => ({})) as GeminiListModelsResponse

        if (!response.ok) {
            throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        for (const model of data.models || []) {
            if (!hasGenerateContentSupport(model)) continue
            if (!model.name) continue
            modelNames.add(normalizeModelName(model.name))
        }

        pageToken = data.nextPageToken
        pages += 1
    } while (pageToken && pages < 5)

    return Array.from(modelNames)
}

export async function resolveGeminiModel(apiKey: string, forceRefresh = false): Promise<string> {
    const isCachedAndFresh = cachedGeminiModel && (Date.now() - cachedGeminiModelAt) < MODEL_CACHE_TTL_MS
    if (!forceRefresh && isCachedAndFresh) {
        return cachedGeminiModel as string
    }

    const availableModels = await listGenerateContentModels(apiKey)
    const selectedModel = chooseBestModel(availableModels)
    if (!selectedModel) {
        throw new Error('No Gemini models supporting generateContent were found for this API key.')
    }

    cachedGeminiModel = selectedModel
    cachedGeminiModelAt = Date.now()
    log.info(`[Gemini] Resolved model: ${selectedModel}`)
    return selectedModel
}

export function shouldRetryWithRefreshedModel(status: number, errorMessage: string): boolean {
    if (status === 404) return true
    return /not found.*supported.*generatecontent|call listmodels/i.test(errorMessage)
}

function chooseFallbackModelForTruncation(models: string[], currentModel?: string): string | null {
    const normalizedCurrent = currentModel ? normalizeModelName(currentModel) : ''
    const candidates = models.map(normalizeModelName).filter((name) => name !== normalizedCurrent)

    const preferredOrder = [
        'gemini-2.0-flash',
        'gemini-flash-latest'
    ]
    for (const preferred of preferredOrder) {
        if (candidates.includes(preferred)) return preferred
    }

    const non25Flash = candidates.find((name) => /flash/i.test(name) && !/2\.5|preview|experimental|exp/i.test(name))
    if (non25Flash) return non25Flash

    return null
}

export async function resolveTruncationFallbackModel(apiKey: string, currentModel?: string): Promise<string | null> {
    try {
        const models = await listGenerateContentModels(apiKey)
        return chooseFallbackModelForTruncation(models, currentModel)
    } catch {
        return null
    }
}

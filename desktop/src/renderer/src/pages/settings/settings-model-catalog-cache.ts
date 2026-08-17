import type { AssistantModelInfo } from '@shared/assistant/contracts'
import { registerSettingsCacheClearer } from '@/lib/settings-cache-registry'

const MODEL_CATALOG_TTL_MS = 5 * 60_000

let cachedModels: AssistantModelInfo[] | null = null
let cachedAt = 0
let catalogGeneration = 0
let pendingModels: { generation: number; promise: Promise<AssistantModelInfo[]> } | null = null

export function readCachedSettingsModels(): AssistantModelInfo[] {
    return cachedModels || []
}

export function rememberSettingsModels(models: AssistantModelInfo[]): AssistantModelInfo[] {
    cachedModels = models
    cachedAt = Date.now()
    return models
}

export function invalidateSettingsModels(): void {
    catalogGeneration += 1
    cachedModels = null
    cachedAt = 0
}

registerSettingsCacheClearer('settings-model-catalog', invalidateSettingsModels)

export async function loadSettingsModels(forceRefresh = false): Promise<AssistantModelInfo[]> {
    if (!forceRefresh && cachedModels && Date.now() - cachedAt < MODEL_CATALOG_TTL_MS) return cachedModels
    const previous = pendingModels
    if (previous) {
        if (!forceRefresh && previous.generation === catalogGeneration) return previous.promise
        await previous.promise.catch(() => undefined)
        if (pendingModels === previous) pendingModels = null
    }

    const generation = catalogGeneration
    const request = window.devscope.assistant.listModels(forceRefresh).then((result) => {
        if (!result.success) throw new Error(result.error || 'Could not load assistant models.')
        return generation === catalogGeneration ? rememberSettingsModels(result.models) : result.models
    })
    const pending = { generation, promise: request }
    pendingModels = pending
    void request.finally(() => {
        if (pendingModels === pending) pendingModels = null
    }).catch(() => undefined)
    return request
}

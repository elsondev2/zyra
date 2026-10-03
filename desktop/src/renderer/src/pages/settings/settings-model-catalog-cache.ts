import type { AssistantModelInfo } from '@shared/assistant/contracts'
import { installModelCatalogPricing } from '@shared/assistant/pricing'
import { registerSettingsCacheClearer } from '@/lib/settings-cache-registry'

const MODEL_CATALOG_TTL_MS = 5 * 60_000

let cachedModels: AssistantModelInfo[] | null = null
let cachedAt = 0
let catalogGeneration = 0
let pendingModels: { generation: number; promise: Promise<AssistantModelInfo[]> } | null = null
const listeners = new Set<(models: AssistantModelInfo[]) => void>()
let unsubscribeEvents: (() => void) | null = null

export function subscribeSettingsModels(listener: (models: AssistantModelInfo[]) => void): () => void {
    listeners.add(listener)
    if (!unsubscribeEvents && typeof window.devscope.assistant.onEvent === 'function') {
        unsubscribeEvents = window.devscope.assistant.onEvent(payload => {
            for (const event of payload.events || (payload.event ? [payload.event] : [])) {
                if (event.type !== 'models.updated' || !Array.isArray(event.payload['models'])) continue
                catalogGeneration += 1
                rememberSettingsModels(event.payload['models'] as AssistantModelInfo[])
            }
        })
    }
    return () => {
        listeners.delete(listener)
        if (!listeners.size) {
            unsubscribeEvents?.()
            unsubscribeEvents = null
        }
    }
}

export function readCachedSettingsModels(): AssistantModelInfo[] {
    return cachedModels || []
}

export function rememberSettingsModels(models: AssistantModelInfo[]): AssistantModelInfo[] {
    installModelCatalogPricing(models)
    cachedModels = models
    cachedAt = Date.now()
    for (const listener of listeners) listener(models)
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

import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AssistantPromptResourcesPayload } from '../../shared/assistant/contracts'
import { resolveZyraRoot } from '../zyra/zyra-root'

interface ZyraPromptResourceModule {
    listZyraPromptResourceManifest(options?: {
        project?: string | null
        root?: string
        projectTrusted?: boolean
    }): Promise<AssistantPromptResourcesPayload>
}

type PromptResourceCacheEntry = {
    expiresAt: number
    value: AssistantPromptResourcesPayload
}

const PROMPT_RESOURCE_CACHE_TTL_MS = 30_000
const PROMPT_RESOURCE_CACHE_MAX_PROJECTS = 24
const promptResourceCache = new Map<string, PromptResourceCacheEntry>()
const promptResourceRequests = new Map<string, Promise<AssistantPromptResourcesPayload>>()
let zyraPromptResourceModulePromise: Promise<ZyraPromptResourceModule> | null = null

async function loadZyraPromptResourceModule(): Promise<ZyraPromptResourceModule> {
    zyraPromptResourceModulePromise ??= import(
        /* @vite-ignore */ pathToFileURL(join(resolveZyraRoot(), 'src', 'zyra-prompt-resources.mjs')).href
    ) as Promise<ZyraPromptResourceModule>
    return zyraPromptResourceModulePromise
}

function projectCacheKey(projectPath?: string | null): string {
    return projectPath ? resolve(projectPath) : '<global>'
}

function cachePromptResources(key: string, value: AssistantPromptResourcesPayload): void {
    promptResourceCache.delete(key)
    promptResourceCache.set(key, {
        expiresAt: Date.now() + PROMPT_RESOURCE_CACHE_TTL_MS,
        value
    })
    while (promptResourceCache.size > PROMPT_RESOURCE_CACHE_MAX_PROJECTS) {
        const oldest = promptResourceCache.keys().next().value as string | undefined
        if (!oldest) break
        promptResourceCache.delete(oldest)
    }
}

export async function listAssistantPromptResources(
    projectPath?: string | null,
    forceRefresh = false
): Promise<AssistantPromptResourcesPayload> {
    const key = projectCacheKey(projectPath)
    if (forceRefresh) promptResourceCache.delete(key)
    const cached = promptResourceCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
        promptResourceCache.delete(key)
        promptResourceCache.set(key, cached)
        return cached.value
    }
    promptResourceCache.delete(key)

    const pending = promptResourceRequests.get(key)
    if (pending) return pending

    const request = loadZyraPromptResourceModule()
        .then((sdk) => sdk.listZyraPromptResourceManifest({
            project: projectPath ? resolve(projectPath) : null,
            root: resolveZyraRoot()
        }))
        .then((value) => {
            cachePromptResources(key, value)
            return value
        })
        .finally(() => {
            if (promptResourceRequests.get(key) === request) promptResourceRequests.delete(key)
        })
    promptResourceRequests.set(key, request)
    return request
}

export function clearAssistantPromptResourceCache(projectPath?: string | null): void {
    if (projectPath === undefined) {
        promptResourceCache.clear()
        return
    }
    promptResourceCache.delete(projectCacheKey(projectPath))
}

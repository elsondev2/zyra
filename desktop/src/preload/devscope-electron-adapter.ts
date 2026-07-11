/**
 * Zyra - Electron Adapter
 */

import type { DevScopeApi } from '../shared/contracts/devscope-api'
import { createAssistantAdapter } from './adapters/assistant-adapter'
import { createDisabledAdapters } from './adapters/disabled-adapters'
import { createMemoryAdapter } from './adapters/memory-adapter'
import { createProjectsAdapter } from './adapters/projects-adapter'
import { createSettingsAndAiAdapter } from './adapters/settings-ai-adapter'
import { createUpdatesAdapter } from './adapters/updates-adapter'
import { createWindowAdapter } from './adapters/window-adapter'

export function createDevScopeElectronAdapter(): DevScopeApi {
    const api: DevScopeApi = {
        ...createSettingsAndAiAdapter(),
        ...createMemoryAdapter(),
        ...createProjectsAdapter(),
        ...createDisabledAdapters(),
        ...createAssistantAdapter(),
        ...createUpdatesAdapter(),
        ...createWindowAdapter()
    } as unknown as DevScopeApi

    return api
}

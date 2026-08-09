/**
 * Zyra - Electron Adapter
 */

import type { DevScopeApi } from '../shared/contracts/devscope-api'
import { createAssistantAdapter } from './adapters/assistant-adapter'
import { createAgentControlAdapter } from './adapters/agent-control-adapter'
import { createDisabledAdapters } from './adapters/disabled-adapters'
import { createFontsAdapter } from './adapters/fonts-adapter'
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
        fonts: createFontsAdapter(),
        ...createAssistantAdapter(),
        agentControl: createAgentControlAdapter(),
        ...createUpdatesAdapter(),
        ...createWindowAdapter()
    } as unknown as DevScopeApi

    return api
}

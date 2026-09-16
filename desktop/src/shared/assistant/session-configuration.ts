import { isAssistantRuntimeMode } from './contracts/runtime'
import { isAssistantReasoningEffort } from './reasoning-efforts'
import type { AssistantUpdateSessionConfigurationInput } from './contracts/ipc'

export function validateAssistantSessionConfiguration(value: unknown): AssistantUpdateSessionConfigurationInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid chat configuration.')
    const input = value as Record<string, unknown>
    const allowed = new Set(['sessionId', 'threadId', 'model', 'runtimeMode', 'effort'])
    if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unsupported chat configuration field.')
    if (typeof input.sessionId !== 'string' || !input.sessionId.trim() || typeof input.threadId !== 'string' || !input.threadId.trim()) throw new Error('Select a chat before changing its configuration.')
    const patch: AssistantUpdateSessionConfigurationInput = { sessionId: input.sessionId, threadId: input.threadId }
    if (input.model !== undefined) {
        if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 300 || /[\r\n]/.test(input.model)) throw new Error('Invalid model.')
        patch.model = input.model.trim()
    }
    if (input.runtimeMode !== undefined) {
        if (!isAssistantRuntimeMode(input.runtimeMode)) throw new Error('Invalid permission mode.')
        patch.runtimeMode = input.runtimeMode
    }
    if (input.effort !== undefined) {
        if (!isAssistantReasoningEffort(input.effort)) throw new Error('Invalid thinking level.')
        patch.effort = input.effort
    }
    if (Object.keys(patch).length === 2) throw new Error('No configuration changes were provided.')
    return patch
}

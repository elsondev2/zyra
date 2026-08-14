import { AssistantService, type AssistantServiceOptions } from './service'

let assistantService: AssistantService | null = null
let assistantServiceOptions: AssistantServiceOptions = {}

export function configureAssistantService(options: AssistantServiceOptions): void {
    if (assistantService) throw new Error('Assistant service is already running.')
    assistantServiceOptions = { ...options }
}

export function getAssistantService(): AssistantService {
    if (!assistantService) {
        assistantService = new AssistantService(assistantServiceOptions)
    }
    return assistantService
}

export function peekAssistantService(): AssistantService | null {
    return assistantService
}

export function disposeAssistantService(): void {
    assistantService?.dispose()
    assistantService = null
}

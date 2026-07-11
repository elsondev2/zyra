import { AssistantService } from './service'

let assistantService: AssistantService | null = null

export function getAssistantService(): AssistantService {
    if (!assistantService) {
        assistantService = new AssistantService()
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

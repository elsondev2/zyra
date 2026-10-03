export type AssistantInspectorNavigationRequest =
    | { workspace: 'explorer' | 'browser' | 'terminal' | 'review' | 'control' | 'resources'; toggle?: boolean }
    | { workspace: 'tabs'; action: 'next' | 'previous' | 'close' }
    | { workspace: 'agents'; agentRunId: string }
    | { workspace: 'agents'; workflowRunId: string }
    | { workspace: 'agents' }

let currentRequest: AssistantInspectorNavigationRequest | null = null
const listeners = new Set<(request: AssistantInspectorNavigationRequest) => void>()

export function requestAssistantInspectorNavigation(request: AssistantInspectorNavigationRequest): void {
    currentRequest = request
    for (const listener of listeners) listener(request)
}

export function acknowledgeAssistantInspectorNavigation(request: AssistantInspectorNavigationRequest): void {
    if (currentRequest === request) currentRequest = null
}

export function subscribeAssistantInspectorNavigation(
    listener: (request: AssistantInspectorNavigationRequest) => void,
    ready = true
): () => void {
    // Opening and restoring the panel happen before its target is consumed.
    // Keep the latest click pending while the destination is mounting.
    if (!ready) return () => undefined
    listeners.add(listener)
    if (currentRequest) listener(currentRequest)
    return () => listeners.delete(listener)
}

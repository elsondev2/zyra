let activeBrowserAssistantClients = 0

export function setActiveBrowserAssistantClientCount(count: number): void {
    activeBrowserAssistantClients = Math.max(0, Math.floor(count))
}

export function hasActiveBrowserAssistantClient(): boolean {
    return activeBrowserAssistantClients > 0
}

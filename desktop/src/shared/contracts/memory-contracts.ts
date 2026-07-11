export type ZyraMemoryLayer = {
    id: string
    title: string
    filePath: string
    size: number
    updatedAt: number
    summary: string
    content: string
}

export type ZyraMemoryOverview = {
    rootPath: string
    memoryDirectory: string
    sessionsDirectory: string
    cliPath: string
    defaultModel: string
    defaultThinking: string
    memoryLayers: ZyraMemoryLayer[]
    recommendedPrompts: string[]
}

export interface ZyraMemoryApi {
    getOverview: () => Promise<{ success: true; overview: ZyraMemoryOverview } | { success: false; error: string }>
}

import type { AssistantActivity } from '@shared/assistant/contracts'

export interface PluginAppViewDescriptor {
    uri: string
    displayMode: 'manual' | 'automatic'
    threadId: string
    pluginId: string
    server: string
    tool: string
    arguments: Record<string, unknown>
    result: { content: unknown[]; isError?: boolean; structuredContent?: unknown }
}

export function pluginAppViewIdentity(view: PluginAppViewDescriptor): string {
    return JSON.stringify([view.threadId, view.pluginId, view.server, view.tool, view.uri])
}

export function pluginAppViewFromActivity(activity: AssistantActivity): PluginAppViewDescriptor | null {
    if (activity.kind !== 'plugin-mcp' || activity.payload?.status !== 'completed') return null
    const value = activity.payload?.appView
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const view = value as Record<string, unknown>
    if (typeof view.uri !== 'string' || !/^ui:\/\/[^\s\u0000-\u001f]+$/u.test(view.uri)) return null
    if (['threadId', 'pluginId', 'server', 'tool'].some((key) => typeof view[key] !== 'string' || !(view[key] as string).trim())) return null
    if (!view.arguments || typeof view.arguments !== 'object' || Array.isArray(view.arguments)) return null
    if (!view.result || typeof view.result !== 'object' || Array.isArray(view.result)) return null
    const result = view.result as Record<string, unknown>
    if (!Array.isArray(result.content)) return null
    return {
        uri: view.uri,
        displayMode: view.displayMode === 'automatic' ? 'automatic' : 'manual',
        threadId: view.threadId as string,
        pluginId: view.pluginId as string,
        server: view.server as string,
        tool: view.tool as string,
        arguments: view.arguments as Record<string, unknown>,
        result: { content: result.content, isError: result.isError === true, structuredContent: result.structuredContent }
    }
}

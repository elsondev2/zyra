import {
    VISUALIZATION_USE_EVENT,
    type VisualizationUseDetail,
    embedVisualizationReference,
} from '@shared/visualization-resources'
import { requestAssistantContextFile } from './assistant-code-context'
import { assistantStore } from '@/lib/assistant/assistant-store-core'
import type { ComposerContextFile } from './assistant-composer-types'

export function visualizationContextFile(detail: VisualizationUseDetail): ComposerContextFile {
    if (!detail || !['html', 'mermaid', 'scene3d'].includes(detail.kind)
        || typeof detail.title !== 'string' || detail.title.length > 160
        || typeof detail.threadId !== 'string' || detail.threadId.length > 256) {
        throw new Error('Invalid saved visualization context.')
    }
    const embed = embedVisualizationReference(detail.id, detail.version)
    return {
        id: `visualization:${detail.id}:${detail.version}`,
        path: `visualization://${detail.id}/${detail.version}`,
        name: `${detail.title} · v${detail.version}`,
        kind: 'code',
        mimeType: 'text/plain',
        source: 'manual',
        animateIn: true,
        content: [
            'Saved visualization resource',
            `ID: ${detail.id}`,
            `Version: ${detail.version}`,
            `Kind: ${detail.kind}`,
            `Pinned embed: ${embed}`,
            'Read this saved version with the visualization tool before editing.',
            'Use this version as baseVersion when building upon it.',
        ].join('\n'),
        previewText: `${detail.title} · v${detail.version}`,
    }
}

function sessionForThread(threadId: string): string | null {
    return assistantStore.getState().snapshot.sessions.find(session =>
        session.threads.some(thread => thread.id === threadId))?.id || null
}

type RoutingDependencies = {
    sessionForThread?: (threadId: string) => string | null
    attachContext?: (file: ComposerContextFile, sessionId: string) => Promise<void>
}

/** The page owns one router, not just the currently mounted composer. An old
 * detached inspector can queue context for its owning chat while another chat
 * is selected. Existing composer context persistence owns the attachment. */
export function subscribeVisualizationContextRouting(dependencies: RoutingDependencies = {}): () => void {
    const received = new Set<string>()
    const route = async (detail: VisualizationUseDetail, requestId: string) => {
        if (received.has(requestId)) return
        try {
            const file = visualizationContextFile(detail)
            const sessionId = (dependencies.sessionForThread || sessionForThread)(detail.threadId)
            if (!sessionId) return
            received.add(requestId)
            if (received.size > 64) received.delete(received.values().next().value!)
            await (dependencies.attachContext || requestAssistantContextFile)(file, sessionId)
        } catch { /* Malformed same-origin events never become composer context. */ }
    }
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(VISUALIZATION_USE_EVENT) : null
    const local = (event: Event) => {
        const detail = (event as CustomEvent<VisualizationUseDetail & { requestId?: string }>).detail
        if (detail) void route(detail, detail.requestId || crypto.randomUUID())
    }
    const remote = (event: MessageEvent) => {
        if (event.data?.detail && typeof event.data.requestId === 'string') {
            void route(event.data.detail, event.data.requestId)
        }
    }
    window.addEventListener(VISUALIZATION_USE_EVENT, local)
    channel?.addEventListener('message', remote)
    return () => {
        window.removeEventListener(VISUALIZATION_USE_EVENT, local)
        channel?.removeEventListener('message', remote)
        channel?.close()
    }
}

export function useSavedVisualization(detail: VisualizationUseDetail): void {
    visualizationContextFile(detail)
    if (!sessionForThread(detail.threadId)) throw new Error('Open the owning chat before using this visualization.')
    const requestId = crypto.randomUUID()
    window.dispatchEvent(new CustomEvent(VISUALIZATION_USE_EVENT, { detail: { ...detail, requestId } }))
    if (typeof BroadcastChannel === 'function') {
        const channel = new BroadcastChannel(VISUALIZATION_USE_EVENT)
        channel.postMessage({ detail, requestId })
        channel.close()
    }
}

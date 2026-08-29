export const RENDERER_DIAGNOSTIC_SIGNAL_CHANNEL = 'zyra:diagnostics:renderer-signal'

export type RendererDiagnosticRoute = {
    pathname: string
    hashPath: string | null
}

export type RendererDiagnosticSurface = {
    name: string
    sourceCharacters: number | null
    itemCount: number | null
    animation: string | null
}

export type RendererDiagnosticInteraction = {
    kind: 'pointer' | 'wheel' | 'keyboard' | 'touch'
    targetTag: string | null
    targetRole: string | null
    at: number
}

export type RendererDiagnosticIpcContext = {
    threadId?: string
    sessionId?: string
    turnId?: string
    tabId?: string
    operation?: string
    direction?: 'older' | 'newer' | 'latest'
    turnLimit?: number
}

export type RendererDiagnosticSignal =
    | {
        kind: 'heartbeat'
        sentAt: number
        route: RendererDiagnosticRoute
        visibility: DocumentVisibilityState
        focused: boolean
        heapUsedBytes: number | null
        heapLimitBytes: number | null
        surface: RendererDiagnosticSurface | null
        lastInteraction: RendererDiagnosticInteraction | null
    }
    | {
        kind: 'event-loop-stall'
        sentAt: number
        durationMs: number
        route: RendererDiagnosticRoute
    }
    | {
        kind: 'long-task'
        sentAt: number
        durationMs: number
        startTimeMs: number
        route: RendererDiagnosticRoute
    }
    | {
        kind: 'interaction'
        sentAt: number
        interaction: RendererDiagnosticInteraction
        route: RendererDiagnosticRoute
    }
    | {
        kind: 'ipc-start'
        sentAt: number
        requestId: string
        channel: string
        context: RendererDiagnosticIpcContext | null
    }
    | {
        kind: 'ipc-end'
        sentAt: number
        requestId: string
        channel: string
        durationMs: number
        outcome: 'success' | 'error'
    }
    | {
        kind: 'lifecycle'
        sentAt: number
        state: 'ready' | 'visible' | 'hidden' | 'pagehide'
        route: RendererDiagnosticRoute
    }

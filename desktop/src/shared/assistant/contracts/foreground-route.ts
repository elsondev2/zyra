export const FOREGROUND_ROUTE_SCHEMA_VERSION = 1 as const

export type ForegroundSurfaceMode = 'chat' | 'voice'
export type ForegroundResponseOwner = 'strong_primary' | 'realtime_foreground'
export type ForegroundRouteStatus = 'active' | 'superseded' | 'released' | 'failed'
export type ForegroundActivationReason =
    | 'conversation_open'
    | 'migration'
    | 'start_voice'
    | 'replace_voice_session'
    | 'exit_voice'
    | 'recovery'
    | 'voice_preparation_failed'

/**
 * Append-only persisted response-ownership record. Field names intentionally
 * match the normative JSON Schema under docs/architecture/voice-agent/schemas.
 */
export interface ForegroundRoute {
    schema_version: typeof FOREGROUND_ROUTE_SCHEMA_VERSION
    foreground_route_id: string
    revision: number
    previous_revision: number | null
    conversation_id: string
    route_epoch: number
    surface_mode: ForegroundSurfaceMode
    response_owner: ForegroundResponseOwner
    status: ForegroundRouteStatus
    activation_reason: ForegroundActivationReason
    context_version: number
    owner_claim_id: string
    realtime_session_id: string | null
    realtime_session_generation: number | null
    supersedes_route_id: string | null
    superseded_by_route_id: string | null
    attached_task_ids: string[]
    created_at: string
    updated_at: string
    terminal_at: string | null
}

export interface ForegroundRouteClaim {
    conversationId: string
    foregroundRouteId: string
    routeEpoch: number
    ownerClaimId: string
    responseOwner: ForegroundResponseOwner
    realtimeSessionId: string | null
    realtimeSessionGeneration: number | null
}

export interface ForegroundRouteExpectation {
    foregroundRouteId: string
    routeEpoch: number
    ownerClaimId: string
}

export interface RealtimeScopeBinding {
    conversationId: string
    realtimeProviderThreadId: string
    realtimeSessionId: string
    realtimeSessionGeneration: number
}

export function foregroundRouteClaim(route: ForegroundRoute): ForegroundRouteClaim {
    return {
        conversationId: route.conversation_id,
        foregroundRouteId: route.foreground_route_id,
        routeEpoch: route.route_epoch,
        ownerClaimId: route.owner_claim_id,
        responseOwner: route.response_owner,
        realtimeSessionId: route.realtime_session_id,
        realtimeSessionGeneration: route.realtime_session_generation
    }
}

import type {
    ForegroundActivationReason,
    ForegroundRoute,
    ForegroundRouteExpectation,
    ForegroundRouteStatus
} from '../../../shared/assistant/contracts'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const TERMINAL_STATUSES = new Set<ForegroundRouteStatus>(['superseded', 'released', 'failed'])

export class ForegroundRouteConflictError extends Error {
    constructor(message: string, readonly code: 'route_conflict' | 'route_invalid' | 'route_quiescence_required') {
        super(message)
        this.name = 'ForegroundRouteConflictError'
    }
}

export interface ForegroundIdentityFactory {
    routeId(conversationId: string, routeEpoch: number): string
    ownerClaimId(conversationId: string, routeEpoch: number): string
}

export interface CreateInitialChatRouteInput {
    conversationId: string
    activationReason: 'conversation_open' | 'migration'
    contextVersion: number
    attachedTaskIds?: string[]
    createdAt: string
    identities: ForegroundIdentityFactory
}

export interface TransitionForegroundRouteInput {
    current: ForegroundRoute
    expectation: ForegroundRouteExpectation
    activationReason: Exclude<ForegroundActivationReason, 'conversation_open' | 'migration'>
    contextVersion: number
    attachedTaskIds?: string[]
    transitionAt: string
    identities: ForegroundIdentityFactory
    realtimeSession?: {
        id: string
        generation: number
    }
}

export interface ForegroundRouteTransition {
    terminated: ForegroundRoute
    activated: ForegroundRoute
}

export function createInitialChatRoute(input: CreateInitialChatRouteInput): ForegroundRoute {
    const route: ForegroundRoute = {
        schema_version: 1,
        foreground_route_id: input.identities.routeId(input.conversationId, 1),
        revision: 1,
        previous_revision: null,
        conversation_id: input.conversationId,
        route_epoch: 1,
        surface_mode: 'chat',
        response_owner: 'strong_primary',
        status: 'active',
        activation_reason: input.activationReason,
        context_version: input.contextVersion,
        owner_claim_id: input.identities.ownerClaimId(input.conversationId, 1),
        realtime_session_id: null,
        realtime_session_generation: null,
        supersedes_route_id: null,
        superseded_by_route_id: null,
        attached_task_ids: normalizeAttachedTaskIds(input.attachedTaskIds),
        created_at: input.createdAt,
        updated_at: input.createdAt,
        terminal_at: null
    }
    validateForegroundRoute(route)
    return route
}

export function transitionForegroundRoute(input: TransitionForegroundRouteInput): ForegroundRouteTransition {
    const current = validateForegroundRoute(input.current)
    assertActiveExpectation(current, input.expectation)
    if (input.contextVersion < current.context_version) {
        throw invalid('A foreground route cannot regress the conversation context version.')
    }
    const transitionMs = parseTimestamp(input.transitionAt, 'transitionAt')
    if (transitionMs < Date.parse(current.created_at)) {
        throw invalid('A foreground route transition cannot precede current-route activation.')
    }

    const target = targetForTransition(current, input.activationReason, input.realtimeSession)
    const nextEpoch = current.route_epoch + 1
    assertSafeInteger(nextEpoch, 'routeEpoch', 1)
    const activatedId = input.identities.routeId(current.conversation_id, nextEpoch)
    const ownerClaimId = input.identities.ownerClaimId(current.conversation_id, nextEpoch)
    if (activatedId === current.foreground_route_id || ownerClaimId === current.owner_claim_id) {
        throw invalid('New route and owner-claim identities must not reuse the prior epoch.')
    }

    const terminated: ForegroundRoute = {
        ...current,
        revision: 2,
        previous_revision: 1,
        status: 'superseded',
        superseded_by_route_id: activatedId,
        updated_at: input.transitionAt,
        terminal_at: input.transitionAt
    }
    const activated: ForegroundRoute = {
        schema_version: 1,
        foreground_route_id: activatedId,
        revision: 1,
        previous_revision: null,
        conversation_id: current.conversation_id,
        route_epoch: nextEpoch,
        surface_mode: target.surfaceMode,
        response_owner: target.surfaceMode === 'voice' ? 'realtime_foreground' : 'strong_primary',
        status: 'active',
        activation_reason: input.activationReason,
        context_version: input.contextVersion,
        owner_claim_id: ownerClaimId,
        realtime_session_id: target.realtimeSessionId,
        realtime_session_generation: target.realtimeSessionGeneration,
        supersedes_route_id: current.foreground_route_id,
        superseded_by_route_id: null,
        attached_task_ids: normalizeAttachedTaskIds(input.attachedTaskIds),
        created_at: input.transitionAt,
        updated_at: input.transitionAt,
        terminal_at: null
    }

    validateForegroundRouteRevision(current, terminated)
    validateForegroundRoute(activated)
    return { terminated, activated }
}

export function releaseForegroundRoute(
    current: ForegroundRoute,
    expectation: ForegroundRouteExpectation,
    status: 'released' | 'failed',
    terminalAt: string
): ForegroundRoute {
    validateForegroundRoute(current)
    assertActiveExpectation(current, expectation)
    const terminalMs = parseTimestamp(terminalAt, 'terminalAt')
    if (terminalMs < Date.parse(current.created_at)) throw invalid('Route release cannot precede activation.')
    const terminal: ForegroundRoute = {
        ...current,
        revision: 2,
        previous_revision: 1,
        status,
        superseded_by_route_id: null,
        updated_at: terminalAt,
        terminal_at: terminalAt
    }
    validateForegroundRouteRevision(current, terminal)
    return terminal
}

export function validateForegroundRoute(route: ForegroundRoute): ForegroundRoute {
    if (!route || typeof route !== 'object') throw invalid('Foreground route must be an object.')
    if (route.schema_version !== 1) throw invalid(`Unsupported foreground-route schema version ${route.schema_version}.`)
    for (const [name, value] of [
        ['foreground_route_id', route.foreground_route_id],
        ['conversation_id', route.conversation_id],
        ['owner_claim_id', route.owner_claim_id]
    ] as const) assertId(value, name)
    assertSafeInteger(route.revision, 'revision', 1)
    assertSafeInteger(route.route_epoch, 'route_epoch', 1)
    assertSafeInteger(route.context_version, 'context_version', 0)
    parseTimestamp(route.created_at, 'created_at')
    const updatedMs = parseTimestamp(route.updated_at, 'updated_at')
    if (updatedMs < Date.parse(route.created_at)) throw invalid('updated_at cannot precede created_at.')
    normalizeAttachedTaskIds(route.attached_task_ids)

    if (route.revision === 1) {
        if (route.previous_revision !== null || route.status !== 'active') {
            throw invalid('Foreground-route revision 1 must begin active with no previous revision.')
        }
    } else if (route.revision === 2) {
        if (route.previous_revision !== 1 || !TERMINAL_STATUSES.has(route.status)) {
            throw invalid('Foreground-route revision 2 must terminally follow revision 1.')
        }
    } else {
        throw invalid('A foreground route supports only active revision 1 and one terminal revision 2.')
    }

    if (route.status === 'active') {
        if (route.terminal_at !== null || route.superseded_by_route_id !== null) {
            throw invalid('An active foreground route cannot have terminal fields.')
        }
    } else {
        if (!route.terminal_at) throw invalid('A terminal foreground route requires terminal_at.')
        const terminalMs = parseTimestamp(route.terminal_at, 'terminal_at')
        if (terminalMs !== updatedMs || terminalMs < Date.parse(route.created_at)) {
            throw invalid('Terminal route timestamps must be equal and nondecreasing.')
        }
        if (route.status === 'superseded') assertId(route.superseded_by_route_id, 'superseded_by_route_id')
        else if (route.superseded_by_route_id !== null) throw invalid('Only superseded routes name a successor.')
    }

    if (route.supersedes_route_id !== null) assertId(route.supersedes_route_id, 'supersedes_route_id')
    if (route.surface_mode === 'chat') {
        if (route.response_owner !== 'strong_primary') throw invalid('Chat routes belong to the strong primary.')
        if (route.realtime_session_id !== null || route.realtime_session_generation !== null) {
            throw invalid('Chat routes cannot carry physical realtime identity.')
        }
        if (!['conversation_open', 'migration', 'exit_voice', 'recovery', 'voice_preparation_failed'].includes(route.activation_reason)) {
            throw invalid(`Activation reason ${route.activation_reason} cannot create a Chat route.`)
        }
    } else if (route.surface_mode === 'voice') {
        if (route.response_owner !== 'realtime_foreground') throw invalid('Voice routes belong to the realtime foreground.')
        assertId(route.realtime_session_id, 'realtime_session_id')
        assertSafeInteger(route.realtime_session_generation, 'realtime_session_generation', 1)
        if (!['start_voice', 'replace_voice_session'].includes(route.activation_reason)) {
            throw invalid(`Activation reason ${route.activation_reason} cannot create a Voice route.`)
        }
    } else {
        throw invalid(`Unsupported foreground surface ${(route as ForegroundRoute).surface_mode}.`)
    }

    if (route.route_epoch === 1) {
        if (route.surface_mode !== 'chat' || route.supersedes_route_id !== null || !['conversation_open', 'migration'].includes(route.activation_reason)) {
            throw invalid('Foreground route epoch 1 must be an initial Chat route.')
        }
    } else if (route.supersedes_route_id === null) {
        throw invalid('Every foreground route after epoch 1 must name its predecessor.')
    }
    return route
}

export function validateForegroundRouteRevision(previous: ForegroundRoute, next: ForegroundRoute): void {
    validateForegroundRoute(previous)
    validateForegroundRoute(next)
    if (previous.status !== 'active' || previous.revision !== 1) throw invalid('Only an active revision 1 can terminate.')
    const immutableKeys: Array<keyof ForegroundRoute> = [
        'schema_version', 'foreground_route_id', 'conversation_id', 'route_epoch', 'surface_mode',
        'response_owner', 'activation_reason', 'context_version', 'owner_claim_id', 'realtime_session_id',
        'realtime_session_generation', 'supersedes_route_id', 'attached_task_ids', 'created_at'
    ]
    for (const key of immutableKeys) {
        if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
            throw invalid(`Foreground-route identity field ${key} is immutable.`)
        }
    }
}

export function assertActiveExpectation(route: ForegroundRoute, expectation: ForegroundRouteExpectation): void {
    if (route.status !== 'active'
        || route.foreground_route_id !== expectation.foregroundRouteId
        || route.route_epoch !== expectation.routeEpoch
        || route.owner_claim_id !== expectation.ownerClaimId) {
        throw new ForegroundRouteConflictError('The foreground owner claim is stale.', 'route_conflict')
    }
}

function targetForTransition(
    current: ForegroundRoute,
    reason: TransitionForegroundRouteInput['activationReason'],
    realtimeSession: TransitionForegroundRouteInput['realtimeSession']
): { surfaceMode: 'chat' | 'voice'; realtimeSessionId: string | null; realtimeSessionGeneration: number | null } {
    const voiceTarget = reason === 'start_voice' || reason === 'replace_voice_session'
    if (reason === 'start_voice' && current.surface_mode !== 'chat') throw invalid('start_voice requires an active Chat route.')
    if (reason === 'replace_voice_session' && current.surface_mode !== 'voice') throw invalid('replace_voice_session requires an active Voice route.')
    if (reason === 'exit_voice' && current.surface_mode !== 'voice') throw invalid('exit_voice requires an active Voice route.')
    if (!['start_voice', 'replace_voice_session', 'exit_voice', 'recovery', 'voice_preparation_failed'].includes(reason)) {
        throw invalid(`Unsupported foreground transition ${reason}.`)
    }

    if (!voiceTarget) {
        if (realtimeSession) throw invalid('A Chat transition cannot carry a realtime session.')
        return { surfaceMode: 'chat', realtimeSessionId: null, realtimeSessionGeneration: null }
    }
    if (!realtimeSession) throw invalid('A Voice transition requires a prepared realtime session.')
    assertId(realtimeSession.id, 'realtimeSession.id')
    assertSafeInteger(realtimeSession.generation, 'realtimeSession.generation', 1)
    if (current.surface_mode === 'voice'
        && current.realtime_session_generation !== null
        && realtimeSession.generation <= current.realtime_session_generation) {
        throw invalid('A replacement realtime session generation must increase.')
    }
    return {
        surfaceMode: 'voice',
        realtimeSessionId: realtimeSession.id,
        realtimeSessionGeneration: realtimeSession.generation
    }
}

function normalizeAttachedTaskIds(value: string[] | undefined): string[] {
    const ids = Array.isArray(value) ? [...value] : []
    if (ids.length > 32 || new Set(ids).size !== ids.length) {
        throw invalid('attached_task_ids must contain at most 32 unique IDs.')
    }
    ids.forEach((id, index) => assertId(id, `attached_task_ids[${index}]`))
    return ids
}

function assertId(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw invalid(`${name} must be a stable ID.`)
}

function assertSafeInteger(value: unknown, name: string, minimum: number): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) throw invalid(`${name} must be a safe integer >= ${minimum}.`)
}

function parseTimestamp(value: unknown, name: string): number {
    if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) throw invalid(`${name} must be an ISO date-time.`)
    return Date.parse(value)
}

function invalid(message: string): ForegroundRouteConflictError {
    return new ForegroundRouteConflictError(message, 'route_invalid')
}

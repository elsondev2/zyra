import { randomUUID } from 'node:crypto'
import type {
    ForegroundRoute,
    ForegroundRouteClaim,
    ForegroundRouteExpectation,
    RealtimeScopeBinding
} from '../../../shared/assistant/contracts'
import { foregroundRouteClaim } from '../../../shared/assistant/contracts'
import type { ForegroundControllerStore } from './foreground-controller-store'
import {
    createInitialChatRoute,
    type ForegroundIdentityFactory,
    transitionForegroundRoute
} from './foreground-route-reducer'

export interface ForegroundClock {
    now(): string
}

export const randomForegroundIdentities: ForegroundIdentityFactory = {
    routeId: (_conversationId, epoch) => `route_${epoch}_${randomUUID()}`,
    ownerClaimId: (_conversationId, epoch) => `claim_${epoch}_${randomUUID()}`
}

export const systemForegroundClock: ForegroundClock = {
    now: () => new Date().toISOString()
}

export interface PreparedRealtimeScope {
    realtimeProviderThreadId: string
    realtimeSessionId: string
    realtimeSessionGeneration: number
}

export class ForegroundRouteController {
    constructor(
        private readonly store: ForegroundControllerStore,
        private readonly identities: ForegroundIdentityFactory = randomForegroundIdentities,
        private readonly clock: ForegroundClock = systemForegroundClock
    ) {}

    initializeChat(input: {
        conversationId: string
        contextVersion: number
        activationReason?: 'conversation_open' | 'migration'
        attachedTaskIds?: string[]
    }): ForegroundRoute {
        const existing = this.store.activeRoute(input.conversationId)
        if (existing) return existing
        return this.store.initializeConversation(createInitialChatRoute({
            conversationId: input.conversationId,
            activationReason: input.activationReason || 'conversation_open',
            contextVersion: input.contextVersion,
            attachedTaskIds: input.attachedTaskIds,
            createdAt: this.clock.now(),
            identities: this.identities
        }))
    }

    activeRoute(conversationId: string): ForegroundRoute {
        const route = this.store.activeRoute(conversationId)
        if (!route) throw new Error(`Conversation ${conversationId} has no active foreground route.`)
        return route
    }

    activeClaim(conversationId: string): ForegroundRouteClaim {
        return foregroundRouteClaim(this.activeRoute(conversationId))
    }

    scopeBinding(routeId: string): RealtimeScopeBinding | null {
        return this.store.scopeBinding(routeId)
    }

    nextRealtimeSessionGeneration(conversationId: string): number {
        const maxGeneration = this.store.routeHistory(conversationId).reduce(
            (maximum, route) => Math.max(maximum, route.realtime_session_generation || 0),
            0
        )
        if (maxGeneration >= Number.MAX_SAFE_INTEGER) throw new Error('Realtime session generation is exhausted.')
        return maxGeneration + 1
    }

    activatePreparedVoice(input: {
        conversationId: string
        expected: ForegroundRouteExpectation
        contextVersion: number
        attachedTaskIds: string[]
        prepared: PreparedRealtimeScope
    }): ForegroundRoute {
        const current = this.activeRoute(input.conversationId)
        const reason = current.surface_mode === 'voice' ? 'replace_voice_session' : 'start_voice'
        const transition = transitionForegroundRoute({
            current,
            expectation: input.expected,
            activationReason: reason,
            contextVersion: input.contextVersion,
            attachedTaskIds: input.attachedTaskIds,
            transitionAt: this.clock.now(),
            identities: this.identities,
            realtimeSession: {
                id: input.prepared.realtimeSessionId,
                generation: input.prepared.realtimeSessionGeneration
            }
        })
        const binding: RealtimeScopeBinding = {
            conversationId: input.conversationId,
            realtimeProviderThreadId: input.prepared.realtimeProviderThreadId,
            realtimeSessionId: input.prepared.realtimeSessionId,
            realtimeSessionGeneration: input.prepared.realtimeSessionGeneration
        }
        return this.store.commitRouteTransition(input.expected, transition, binding)
    }

    exitVoice(input: {
        conversationId: string
        expected: ForegroundRouteExpectation
        contextVersion: number
        attachedTaskIds: string[]
    }): ForegroundRoute {
        return this.transitionToChat({ ...input, reason: 'exit_voice' })
    }

    recoverToChat(input: {
        conversationId: string
        expected: ForegroundRouteExpectation
        contextVersion: number
        attachedTaskIds: string[]
    }): ForegroundRoute {
        return this.transitionToChat({ ...input, reason: 'recovery' })
    }

    voicePreparationFailed(input: {
        conversationId: string
        expected: ForegroundRouteExpectation
        contextVersion: number
        attachedTaskIds: string[]
    }): ForegroundRoute {
        return this.transitionToChat({ ...input, reason: 'voice_preparation_failed' })
    }

    private transitionToChat(input: {
        conversationId: string
        expected: ForegroundRouteExpectation
        contextVersion: number
        attachedTaskIds: string[]
        reason: 'exit_voice' | 'recovery' | 'voice_preparation_failed'
    }): ForegroundRoute {
        const current = this.activeRoute(input.conversationId)
        const transition = transitionForegroundRoute({
            current,
            expectation: input.expected,
            activationReason: input.reason,
            contextVersion: input.contextVersion,
            attachedTaskIds: input.attachedTaskIds,
            transitionAt: this.clock.now(),
            identities: this.identities
        })
        return this.store.commitRouteTransition(input.expected, transition, null)
    }
}

export function routeExpectation(claim: ForegroundRouteClaim): ForegroundRouteExpectation {
    return {
        foregroundRouteId: claim.foregroundRouteId,
        routeEpoch: claim.routeEpoch,
        ownerClaimId: claim.ownerClaimId
    }
}

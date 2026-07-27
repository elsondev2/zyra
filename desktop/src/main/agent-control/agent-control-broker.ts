import { EventEmitter } from 'events'
import type {
    ControlAction,
    ControlActionRequest,
    ControlCapability,
    ControlCursorState,
    ControlGrant,
    ControlObservation,
    ControlPairingState,
    ControlPrincipal,
    ControlStateSnapshot,
    ControlTarget,
    ControlWindowCandidate,
    DelegatedControlLeaseRequest
} from '../../shared/agent-control/contracts'
import type { AgentControlBridgeOperation, RendererControlGrantInput } from '../../shared/agent-control/protocol'
import { CONTROL_BOUNDS, normalizedOrigin } from '../../shared/agent-control/policy'
import {
    assertBridgeMessageSize,
    assertControlActionRequest,
    assertControlCapabilities,
    assertControlIdentifier,
    assertControlPrincipal
} from '../../shared/agent-control/validation'
import { ActionQueue } from './action-queue'
import { AuditStore } from './audit-store'
import { assertActionAllowed, assertGrantSupportsTarget } from './capability-policy'
import { AgentControlError, toAgentControlError } from './control-errors'
import { GrantStore } from './grant-store'
import { ObservationStore } from './observation-store'
import { redactObservation } from './redaction'
import { TargetRegistry } from './target-registry'
import type { AgentControlDriver } from './drivers/driver'

export type BrowserSurfaceController = {
    openTab(principal: ControlPrincipal, reveal: boolean, signal?: AbortSignal): Promise<Extract<ControlTarget, { kind: 'zyra-browser' }>>
    cancelPending(reason?: string): void
}

export type PairingController = {
    start(): Promise<ControlPairingState>
    stop(reason?: string): Promise<void> | void
    state(): ControlPairingState
}

export class AgentControlBroker extends EventEmitter {
    readonly targets = new TargetRegistry()
    readonly grants = new GrantStore()
    readonly observations = new ObservationStore()
    readonly actions = new ActionQueue()
    readonly audit: AuditStore
    private sequence = 0
    private disposed = false
    private browserSurface: BrowserSurfaceController | null = null
    private readonly cursors = new Map<string, ControlCursorState>()

    constructor(
        private readonly options: {
            userDataPath?: string
            drivers?: AgentControlDriver[]
            pairing?: PairingController
        } = {}
    ) {
        super()
        this.audit = new AuditStore(options.userDataPath)
    }

    setBrowserSurfaceController(controller: BrowserSurfaceController | null): void {
        this.browserSurface = controller
    }

    registerTarget(input: {
        target: ControlTarget
        driver: AgentControlDriver
        trustedIdentity: unknown
        ownerWebContentsId?: number
    }): ControlTarget {
        this.assertAlive()
        this.targets.register(input)
        this.audit.append({
            eventType: 'target', targetId: input.target.targetId, targetKind: input.target.kind,
            outcome: 'allowed', message: 'Target registered.', redactions: []
        })
        this.changed()
        return input.target
    }

    handleTargetNavigation(targetId: string, url: string): void {
        const registered = this.targets.get(targetId)
        const origin = normalizedOrigin(url)
        if (registered.target.kind === 'zyra-browser' || registered.target.kind === 'chrome-tab') {
            registered.target.origin = origin
        }
        if (registered.target.kind === 'zyra-browser') {
            registered.target.url = /^https?:\/\//.test(url) ? url.slice(0, CONTROL_BOUNDS.maxUrlLength) : null
        }
        this.observations.invalidate(targetId)
        for (const grant of this.grants.list()) {
            if (grant.targetId !== targetId || grant.state !== 'active' || !grant.allowedOrigins?.length) continue
            if (!origin || !grant.allowedOrigins.includes(origin)) this.grants.revoke(grant.grantId)
        }
        this.changed()
    }

    handleTargetTitle(targetId: string, title: string): void {
        const registered = this.targets.get(targetId)
        if (registered.target.kind !== 'zyra-browser') return
        registered.target.title = String(title || '').slice(0, 512) || null
        this.changed()
    }

    removeTarget(targetId: string, reason = 'Target closed.'): void {
        const registered = this.targets.remove(targetId)
        if (!registered) return
        this.grants.revokeByTarget(targetId)
        this.observations.remove(targetId)
        this.cursors.delete(targetId)
        void registered.driver.release?.(registered)
        this.audit.append({
            eventType: 'target', targetId, targetKind: registered.target.kind,
            outcome: 'cancelled', message: reason, redactions: []
        })
        this.changed()
    }

    requestGrant(input: {
        principal: ControlPrincipal
        targetId: string
        capabilities: ControlCapability[]
        durationMs?: number
        maxActions?: number
        allowedOrigins?: string[]
        allowedExecutableIdentities?: string[]
    }) {
        this.assertAlive()
        const principal = assertControlPrincipal(input.principal)
        const target = this.targets.get(assertControlIdentifier(input.targetId, 'targetId')).target
        const capabilities = assertControlCapabilities(input.capabilities)
        const rawDurationMs = Number(input.durationMs ?? 10 * 60 * 1000)
        const rawMaxActions = Number(input.maxActions ?? 100)
        const durationMs = Math.max(1_000, Math.min(CONTROL_BOUNDS.maxGrantDurationMs, Number.isFinite(rawDurationMs) ? Math.floor(rawDurationMs) : 10 * 60 * 1000))
        const maxActions = Math.max(1, Math.min(CONTROL_BOUNDS.maxGrantActions, Number.isFinite(rawMaxActions) ? Math.floor(rawMaxActions) : 100))
        const expiresAt = new Date(Date.now() + durationMs).toISOString()
        const defaultScopes = defaultGrantScopes(target)
        const allowedOrigins = input.allowedOrigins?.length ? input.allowedOrigins.slice(0, 32) : defaultScopes.allowedOrigins
        const allowedExecutableIdentities = input.allowedExecutableIdentities?.length ? input.allowedExecutableIdentities.slice(0, 32) : defaultScopes.allowedExecutableIdentities
        if (capabilities.includes('navigate') && target.kind !== 'windows-window' && !allowedOrigins?.length) {
            throw new AgentControlError('CONTROL_SCOPE_DENIED', 'Navigation grants require an explicit HTTP(S) origin scope.')
        }
        const request = this.grants.addPending({
            principal,
            targetId: target.targetId,
            capabilities,
            expiresAt,
            maxActions,
            allowedOrigins,
            allowedExecutableIdentities,
            screenshots: capabilities.includes('observe.screenshot')
        })
        this.audit.append({
            eventType: 'grant.requested', principal, targetId: target.targetId, targetKind: target.kind,
            outcome: 'allowed', message: 'Waiting for explicit user approval.', redactions: []
        })
        this.changed()
        return request
    }

    approvePendingGrant(input: RendererControlGrantInput): ControlGrant {
        this.assertAlive()
        const requestId = assertControlIdentifier(input.pendingRequestId, 'pendingRequestId')
        const pending = this.grants.getPending(requestId)
        if (!pending) throw new AgentControlError('CONTROL_GRANT_NOT_FOUND', 'The pending grant request is no longer available.')
        if (pending.targetId !== input.targetId) throw new AgentControlError('CONTROL_SCOPE_DENIED', 'A pending grant cannot be rebound to another target.')
        const capabilities = assertControlCapabilities(input.capabilities)
        if (!capabilities.every((capability) => pending.capabilities.includes(capability))) {
            throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'User approval cannot widen the requested capabilities.')
        }
        const durationMs = Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : 1_000
        const requestedActions = Number.isFinite(Number(input.maxActions)) ? Math.floor(Number(input.maxActions)) : 1
        const requestedExpiry = Math.min(Date.parse(pending.expiresAt), Date.now() + Math.max(1_000, Math.min(durationMs, CONTROL_BOUNDS.maxGrantDurationMs)))
        const maxActions = Math.min(pending.maxActions, Math.max(1, requestedActions))
        const allowedOrigins = narrowScope(input.allowedOrigins, pending.allowedOrigins)
        const allowedExecutableIdentities = narrowScope(input.allowedExecutableIdentities, pending.allowedExecutableIdentities)
        const target = this.targets.get(pending.targetId).target
        const grant = this.grants.issue({
            principal: pending.principal,
            targetId: pending.targetId,
            capabilities,
            expiresAt: new Date(requestedExpiry).toISOString(),
            maxActions,
            allowedOrigins,
            allowedExecutableIdentities,
            issuedBy: 'user'
        })
        assertGrantSupportsTarget(grant, target)
        this.grants.removePending(requestId)
        this.audit.append({
            eventType: 'grant.issued', principal: grant.principal, targetId: grant.targetId, targetKind: target.kind,
            grantId: grant.grantId, outcome: 'allowed', message: 'User approved a bounded control grant.', redactions: []
        })
        this.changed()
        return grant
    }

    rejectPendingGrant(requestId: string): void {
        const pending = this.grants.removePending(assertControlIdentifier(requestId, 'requestId'))
        if (!pending) return
        this.audit.append({
            eventType: 'grant.revoked', principal: pending.principal, targetId: pending.targetId,
            outcome: 'denied', message: 'User declined the grant request.', redactions: []
        })
        this.changed()
    }

    delegate(request: DelegatedControlLeaseRequest): ControlGrant {
        const grant = this.grants.delegate(request)
        const target = this.targets.get(grant.targetId).target
        try {
            assertGrantSupportsTarget(grant, target)
        } catch (error) {
            this.grants.revoke(grant.grantId)
            throw error
        }
        this.audit.append({
            eventType: 'grant.issued', principal: grant.principal, parentPrincipal: request.parentPrincipal,
            targetId: grant.targetId, targetKind: target.kind, grantId: grant.grantId,
            outcome: 'allowed', message: 'Strictly attenuated child lease issued.', redactions: []
        })
        this.changed()
        return grant
    }

    async observe(principal: ControlPrincipal, grantId: string, targetId: string, includeScreenshot = false, signal?: AbortSignal): Promise<ControlObservation> {
        this.assertAlive()
        const grant = this.grants.requireActive(grantId, principal)
        if (grant.targetId !== targetId) throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The grant is bound to another target.')
        if (!grant.capabilities.includes('observe.structure')) throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'The grant does not allow structure observation.')
        if (includeScreenshot && !grant.capabilities.includes('observe.screenshot')) throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'The grant does not allow screenshots.')
        const registered = this.targets.get(targetId)
        assertGrantSupportsTarget(grant, registered.target)
        const startedAt = Date.now()
        try {
            const revision = this.observations.nextRevision(targetId)
            const observation = boundObservation(redactObservation(await registered.driver.observe(registered, { revision, includeScreenshot, signal })))
            this.observations.set(observation)
            this.grants.consume(grantId)
            this.audit.append({
                eventType: 'observation', principal, targetId, targetKind: registered.target.kind, grantId,
                observationRevision: observation.revision, origin: observation.origin,
                outcome: 'completed', elapsedMs: Date.now() - startedAt, redactions: observation.redactions
            })
            this.changed()
            return observation
        } catch (error) {
            this.audit.append({
                eventType: 'observation', principal, targetId, targetKind: registered.target.kind, grantId,
                outcome: 'failed', elapsedMs: Date.now() - startedAt,
                message: error instanceof Error ? error.message : 'Observation failed.', redactions: []
            })
            throw toAgentControlError(error)
        }
    }

    async act(principal: ControlPrincipal, requestValue: unknown, signal?: AbortSignal) {
        this.assertAlive()
        const request = assertControlActionRequest(requestValue)
        const grant = this.grants.requireActive(request.grantId, principal)
        if (grant.targetId !== request.targetId) throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The grant is bound to another target.')
        const registered = this.targets.get(request.targetId)
        assertGrantSupportsTarget(grant, registered.target)
        assertActionAllowed(grant, registered.target, request.action)
        const requestedObservation = this.observations.requireRevision(request.targetId, request.observationRevision)
        assertSafeObservedElementAction(requestedObservation, request.action)
        assertVisualActionInsideObservation(requestedObservation, request.action)
        return this.actions.enqueue(request.targetId, async () => {
            const currentGrant = this.grants.requireActive(request.grantId, principal)
            const previousObservation = this.observations.requireRevision(request.targetId, request.observationRevision)
            assertActionAllowed(currentGrant, registered.target, request.action)
            assertSafeObservedElementAction(previousObservation, request.action)
            assertVisualActionInsideObservation(previousObservation, request.action)
            const startedAt = Date.now()
            try {
                const result = await registered.driver.act(registered, request.action, {
                    revision: request.observationRevision,
                    previousObservation,
                    signal,
                    updateCursor: (patch) => this.updateCursor(request.targetId, principal, request.action.type, patch)
                })
                const revision = this.observations.nextRevision(request.targetId)
                const observation = boundObservation(redactObservation(await registered.driver.observe(registered, {
                    revision,
                    includeScreenshot: false,
                    signal
                })))
                this.observations.set(observation)
                this.grants.consume(request.grantId)
                this.audit.append({
                    eventType: 'action', principal, targetId: request.targetId, targetKind: registered.target.kind,
                    grantId: request.grantId, actionType: request.action.type, origin: observation.origin,
                    executableIdentity: registered.target.kind === 'windows-window' ? registered.target.executableIdentity : undefined,
                    observationRevision: observation.revision, outcome: 'completed', elapsedMs: Date.now() - startedAt,
                    redactions: ['typed-text']
                })
                this.changed()
                return {
                    version: 1 as const,
                    requestId: request.requestId,
                    targetId: request.targetId,
                    previousRevision: request.observationRevision,
                    observation,
                    changed: result.changed,
                    outcome: 'completed' as const
                }
            } catch (error) {
                this.audit.append({
                    eventType: 'action', principal, targetId: request.targetId, targetKind: registered.target.kind,
                    grantId: request.grantId, actionType: request.action.type,
                    outcome: signal?.aborted ? 'cancelled' : 'failed', elapsedMs: Date.now() - startedAt,
                    message: error instanceof Error ? error.message : 'Action failed.', redactions: ['typed-text']
                })
                throw toAgentControlError(error)
            }
        }, signal)
    }

    revokeGrant(grantId: string, principal?: ControlPrincipal): void {
        if (principal) this.grants.requireActive(grantId, principal)
        const grant = this.grants.revoke(grantId)
        if (!grant) return
        this.audit.append({
            eventType: 'grant.revoked', principal: grant.principal, targetId: grant.targetId,
            grantId: grant.grantId, outcome: 'cancelled', message: 'Control grant revoked.', redactions: []
        })
        this.changed()
    }

    revokePrincipal(principal: ControlPrincipal, reason = 'Principal control cancelled.'): void {
        const revoked = this.grants.revokeByPrincipal(principal)
        const pending = this.grants.removePendingByPrincipal(principal)
        for (const grant of revoked) {
            this.audit.append({
                eventType: 'grant.revoked', principal: grant.principal, targetId: grant.targetId,
                grantId: grant.grantId, outcome: 'cancelled', message: reason, redactions: []
            })
        }
        for (const request of pending) {
            this.audit.append({
                eventType: 'grant.revoked', principal: request.principal, targetId: request.targetId,
                outcome: 'cancelled', message: `${reason} Pending request removed.`, redactions: []
            })
        }
        if (revoked.length || pending.length) this.changed()
    }

    async emergencyStop(reason = 'Emergency stop requested by user.'): Promise<void> {
        this.actions.cancelAll(reason)
        this.browserSurface?.cancelPending(reason)
        this.grants.revokeAll()
        this.observations.invalidateAll()
        this.cursors.clear()
        await Promise.allSettled((this.options.drivers || []).map((driver) => Promise.resolve(driver.emergencyStop?.())))
        await this.options.pairing?.stop('emergency-stop')
        this.audit.append({ eventType: 'emergency-stop', outcome: 'cancelled', message: reason, redactions: [] })
        this.changed()
    }

    async startChromePairing(): Promise<ControlPairingState> {
        if (!this.options.pairing) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'Chrome pairing is unavailable.')
        const state = await this.options.pairing.start()
        this.audit.append({ eventType: 'pairing', outcome: 'allowed', message: 'Chrome pairing started.', redactions: ['pairing-secrets'] })
        this.changed()
        return state
    }

    async stopChromePairing(): Promise<void> {
        await this.options.pairing?.stop('user-request')
        this.audit.append({ eventType: 'pairing', outcome: 'cancelled', message: 'Chrome pairing stopped.', redactions: ['pairing-secrets'] })
        this.changed()
    }

    async listWindows(): Promise<ControlWindowCandidate[]> {
        const driver = this.options.drivers?.find((entry) => entry.kind === 'windows-window')
        if (!driver?.listWindows) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'Windows computer use is unavailable.')
        return driver.listWindows()
    }

    async selectWindow(windowToken: string): Promise<ControlTarget> {
        const driver = this.options.drivers?.find((entry) => entry.kind === 'windows-window')
        if (!driver?.selectWindow) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'Windows computer use is unavailable.')
        const selected = await driver.selectWindow(assertControlIdentifier(windowToken, 'windowToken'))
        const target: ControlTarget = { ...selected.target, targetId: this.targets.createTargetId('windows-window') }
        return this.registerTarget({ target, driver, trustedIdentity: selected.trustedIdentity })
    }

    state(): ControlStateSnapshot {
        const grants = this.grants.list()
        return {
            version: 1,
            targets: this.targets.list().map((entry) => entry.target),
            grants,
            pendingGrants: this.grants.listPending(),
            audit: this.audit.list(),
            health: (this.options.drivers || []).map((driver) => ({
                targetKind: driver.kind,
                ...(driver.health?.() || { state: 'ready' as const }),
                updatedAt: new Date().toISOString()
            })),
            cursors: [...this.cursors.values()],
            pairing: this.options.pairing?.state() || { state: 'stopped' },
            active: grants.some((grant) => grant.state === 'active'),
            sequence: this.sequence
        }
    }

    async handleToolOperation(principalValue: unknown, operationValue: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
        this.assertAlive()
        assertBridgeMessageSize(operationValue)
        const principal = assertControlPrincipal(principalValue)
        if (!operationValue || typeof operationValue !== 'object' || Array.isArray(operationValue)) {
            throw new AgentControlError('CONTROL_VALIDATION_ERROR', 'Control operation is invalid.')
        }
        const operation = operationValue as AgentControlBridgeOperation
        switch (operation.operation) {
            case 'open_tab': {
                if (operation.reveal !== undefined && typeof operation.reveal !== 'boolean') {
                    throw new AgentControlError('CONTROL_VALIDATION_ERROR', 'Browser reveal must be a boolean.')
                }
                if (!this.browserSurface) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'The in-app Browser workspace is unavailable.')
                if (principal.type === 'agent' && operation.reveal) {
                    throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Child agents may create background Browser tabs but cannot reveal or take over the user interface.')
                }
                const revealed = principal.type === 'root' && operation.reveal === true
                const target = await this.browserSurface.openTab(principal, revealed, signal)
                return { target, revealed }
            }
            case 'list_targets': {
                const kind = operation.targetKind
                const activeGrants = this.grants.listForPrincipal(principal).filter((grant) => grant.state === 'active')
                if (principal.type === 'root') {
                    return { targets: this.targets.list(kind).map((entry) => entry.target), grants: activeGrants }
                }
                const grantedTargetIds = new Set(activeGrants.map((grant) => grant.targetId))
                const targets = this.targets.list(kind).filter((entry) => (
                    entry.target.kind === 'zyra-browser' || grantedTargetIds.has(entry.target.targetId)
                )).map((entry) => entry.target)
                return { targets, grants: activeGrants }
            }
            case 'list_windows':
                if (principal.type !== 'root') throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Child agents cannot enumerate or select Windows targets.')
                return { windows: await this.listWindows() }
            case 'request_grant': {
                const requestedTarget = this.targets.get(operation.targetId).target
                if (principal.type === 'agent' && requestedTarget.kind !== 'zyra-browser') {
                    throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Child agents may request only an integrated Zyra Browser tab. Chrome and Windows require root delegation.')
                }
                const request = this.requestGrant({
                    principal,
                    targetId: operation.targetId,
                    capabilities: operation.capabilities,
                    durationMs: operation.durationMs,
                    maxActions: operation.maxActions,
                    allowedOrigins: operation.allowedOrigins,
                    allowedExecutableIdentities: operation.allowedExecutableIdentities
                })
                return { pending: true, request }
            }
            case 'delegate_lease': {
                if (principal.type !== 'root') throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Only the root agent may delegate a control lease.')
                const childPrincipal = assertControlPrincipal(operation.childPrincipal)
                if (childPrincipal.type !== 'agent' || childPrincipal.parentThreadId !== principal.threadId) {
                    throw new AgentControlError('CONTROL_PRINCIPAL_MISMATCH', 'The delegated child does not belong to the current root thread.')
                }
                const maxActions = Number(operation.maxActions)
                if (!Number.isSafeInteger(maxActions) || maxActions < 1) throw new AgentControlError('CONTROL_VALIDATION_ERROR', 'Delegated maxActions must be a positive integer.')
                const grant = this.delegate({
                    parentGrantId: assertControlIdentifier(operation.parentGrantId, 'parentGrantId'),
                    parentPrincipal: principal,
                    childPrincipal,
                    targetId: assertControlIdentifier(operation.targetId, 'targetId'),
                    capabilities: assertControlCapabilities(operation.capabilities),
                    expiresAt: String(operation.expiresAt),
                    maxActions,
                    allowedOrigins: operation.allowedOrigins,
                    allowedExecutableIdentities: operation.allowedExecutableIdentities
                })
                return { grant }
            }
            case 'revoke_current_principal':
                if (principal.type !== 'agent') throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Only a delegated child runtime may revoke its principal lease through this operation.')
                this.revokePrincipal(principal, operation.reason || 'Child run ended or was cancelled.')
                return { revoked: true }
            case 'observe': {
                const includeScreenshot = Boolean(operation.includeScreenshot)
                const observation = await this.observe(principal, operation.grantId, operation.targetId, includeScreenshot, signal)
                const registered = this.targets.get(operation.targetId)
                const screenshot = includeScreenshot && observation.screenshotRef
                    ? registered.driver.readScreenshot?.(observation.screenshotRef)
                    : undefined
                return { observation, ...(screenshot ? { screenshot } : {}) }
            }
            case 'act':
                return await this.act(principal, operation, signal) as unknown as Record<string, unknown>
            case 'release':
                this.revokeGrant(operation.grantId, principal)
                return { released: true }
            default:
                throw new AgentControlError('CONTROL_UNKNOWN_OPERATION', 'Unknown control bridge operation.')
        }
    }

    clearAudit(): void {
        this.audit.clear()
        this.changed()
    }

    async dispose(): Promise<void> {
        if (this.disposed) return
        await this.emergencyStop('Application shutdown.')
        this.disposed = true
        await Promise.allSettled((this.options.drivers || []).map((driver) => Promise.resolve(driver.dispose?.())))
        this.removeAllListeners()
    }

    private updateCursor(
        targetId: string,
        principal: ControlPrincipal,
        actionType: ControlAction['type'],
        patch: Partial<Omit<ControlCursorState, 'targetId' | 'updatedAt'>>
    ): void {
        const current = this.cursors.get(targetId)
        const x = Number(patch.x ?? current?.x ?? 0)
        const y = Number(patch.y ?? current?.y ?? 0)
        this.cursors.set(targetId, {
            targetId,
            x: Number.isFinite(x) ? Math.max(0, Math.min(100_000, x)) : 0,
            y: Number.isFinite(y) ? Math.max(0, Math.min(100_000, y)) : 0,
            visible: patch.visible ?? current?.visible ?? true,
            phase: patch.phase ?? current?.phase ?? 'idle',
            actionType,
            principal,
            durationMs: patch.durationMs ?? current?.durationMs,
            updatedAt: new Date().toISOString()
        })
        this.changed()
    }

    private changed(): void {
        this.sequence += 1
        this.emit('changed', this.state())
    }

    private assertAlive(): void {
        if (this.disposed) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'The control broker is disposed.')
    }
}

function boundObservation(observation: ControlObservation): ControlObservation {
    if (Buffer.byteLength(JSON.stringify(observation), 'utf8') <= CONTROL_BOUNDS.maxObservationBytes) return observation
    const totalElements = observation.truncation?.totalElements || observation.elements.length
    const elements = observation.elements.slice()
    while (elements.length > 0 && Buffer.byteLength(JSON.stringify({ ...observation, elements }), 'utf8') > CONTROL_BOUNDS.maxObservationBytes) {
        elements.splice(Math.max(0, elements.length - 50), 50)
    }
    return {
        ...observation,
        elements,
        truncation: { totalElements, returnedElements: elements.length },
        redactions: [...new Set([...observation.redactions, 'observation-size-limit'])]
    }
}

function assertSafeObservedElementAction(observation: ControlObservation, action: ControlAction): void {
    if (!('elementRef' in action) || !action.elementRef) return
    const element = observation.elements.find((entry) => entry.elementRef === action.elementRef)
    if (!element) throw new AgentControlError('CONTROL_STALE_OBSERVATION', 'The element reference is absent from the current bounded observation.', { retryable: true, freshRevision: observation.revision })
    if (action.type === 'type' && element.sensitive) {
        throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Model control cannot type into a password or sensitive field. Pause control and enter it manually.')
    }
    const semantics = `${element.role} ${element.name || ''} ${element.text || ''}`
    if ((action.type === 'click' || action.type === 'type' || action.type === 'select')
        && /buy|purchase|pay|send|publish|post|delete|remove account|install|accept terms|agree|upload/i.test(semantics)) {
        throw new AgentControlError('CONTROL_SIDE_EFFECT_APPROVAL_REQUIRED', 'This observed control may cause an external side effect and requires explicit per-action approval.')
    }
}

function assertVisualActionInsideObservation(observation: ControlObservation, action: ControlAction): void {
    const viewport = observation.viewport
    if (!viewport) return
    const points = action.type === 'move'
        ? [{ x: action.x, y: action.y }]
        : action.type === 'drag'
            ? [{ x: action.fromX, y: action.fromY }, { x: action.toX, y: action.toY }]
            : action.type === 'click' && action.x !== undefined && action.y !== undefined
                ? [{ x: action.x, y: action.y }]
                : action.type === 'scroll' && action.x !== undefined && action.y !== undefined
                    ? [{ x: action.x, y: action.y }]
                    : []
    if (points.some((point) => point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height)) {
        throw new AgentControlError('CONTROL_SCOPE_DENIED', 'Pointer coordinates are outside the latest observed viewport.')
    }
}

function narrowScope(requested: string[] | undefined, pending: string[] | undefined): string[] | undefined {
    if (!pending?.length) return requested?.length ? requested.slice(0, 32) : undefined
    if (!requested?.length) return pending
    if (!requested.every((entry) => pending.includes(entry))) throw new AgentControlError('CONTROL_SCOPE_DENIED', 'User approval cannot widen the requested scope.')
    return [...new Set(requested)]
}

export function defaultGrantScopes(target: ControlTarget): { allowedOrigins?: string[]; allowedExecutableIdentities?: string[] } {
    if (target.kind === 'windows-window') return { allowedExecutableIdentities: [target.executableIdentity] }
    const origin = target.origin || undefined
    return { allowedOrigins: origin ? [normalizedOrigin(origin) || origin] : undefined }
}

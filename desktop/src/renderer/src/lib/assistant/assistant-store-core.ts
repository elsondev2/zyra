import type {
    AssistantApprovalResponseInput,
    AssistantApprovePendingPlaygroundLabRequestInput,
    AssistantAttachSessionToPlaygroundLabInput,
    AssistantClearLogsInput,
    AssistantConnectOptions,
    AssistantCreatePlaygroundLabInput,
    AssistantCreateSessionInput,
    AssistantDeclinePendingPlaygroundLabRequestInput,
    AssistantDeleteMessageInput,
    AssistantDomainEvent,
    AssistantModelInfo,
    AssistantPlaygroundState,
    AssistantSendPromptOptions,
    AssistantSelectThreadInput,
    AssistantSession,
    AssistantSnapshot,
    AssistantThread,
    AssistantUserInputResponseInput
} from '@shared/assistant/contracts'
import type { DevScopeResult } from '@shared/contracts/devscope-api'
import { applyAssistantDomainEvents, createDefaultAssistantSnapshot } from '@shared/assistant/projector'
import { collapseAssistantDeltaEvents } from './event-batching'
import { applyCachedSessionSelection, cacheHydratedThreads, hasCachedSessionSelection, type CachedHydratedThreadState } from './session-hydration-cache'
import { deriveAssistantRuntimeStatus, INITIAL_ASSISTANT_RUNTIME_STATUS, type AssistantStoreState } from './assistant-store-runtime'
import { runAssistantStoreAction } from './assistant-store-action-runner'
import { selectAssistantStoreSession } from './assistant-store-session-selection'
const ASSISTANT_DELTA_EVENT_FLUSH_DELAY_MS = 64
const SNAPSHOT_REFRESH_RECOVERY_ERRORS = new Set([
    'Assistant session not found.',
    'Assistant session has no active thread.'
])

function isEmptyAssistantThread(thread: AssistantThread) {
    return !thread.latestTurn
        && !thread.activePlan
        && (thread.messageCount || 0) === 0
        && thread.proposedPlans.length === 0
        && thread.pendingApprovals.length === 0
        && thread.pendingUserInputs.length === 0
}

type AssistantCreateSessionResult = DevScopeResult<{ sessionId: string; snapshot?: AssistantSnapshot }>

function isReusableEmptySession(session: AssistantSession, input?: AssistantCreateSessionInput) {
    if (session.archived || session.pendingLabRequest) return false
    if (session.threads.length > 0 && !session.threads.every(isEmptyAssistantThread)) return false
    if (input?.mode && session.mode !== input.mode) return false
    if (input?.projectPath !== undefined && (session.projectPath || null) !== (input.projectPath || null)) return false
    if (input?.playgroundLabId !== undefined && (session.playgroundLabId || null) !== (input.playgroundLabId || null)) return false
    if (input?.mode === undefined && session.mode !== 'work') return false
    if (input?.projectPath === undefined && session.projectPath) return false
    if (input?.playgroundLabId === undefined && session.playgroundLabId) return false
    return true
}

class AssistantStore {
    private state: AssistantStoreState = {
        snapshot: createDefaultAssistantSnapshot(),
        status: INITIAL_ASSISTANT_RUNTIME_STATUS,
        hydrating: false,
        hydrated: false,
        modelsLoading: false,
        commandPending: false,
        pendingCreateSessionInput: null,
        selectionHydrationKey: null,
        error: null
    }
    private readonly listeners = new Set<() => void>()
    private readonly hydratedThreadCache = new Map<string, CachedHydratedThreadState>()
    private eventUnsubscribe: (() => void) | null = null
    private retainCount = 0
    private hydratePromise: Promise<void> | null = null
    private modelRefreshPromise: Promise<DevScopeResult<{ models: AssistantModelInfo[] }>> | null = null
    private createSessionPromise: Promise<AssistantCreateSessionResult> | null = null
    private pendingAssistantEvents: AssistantDomainEvent[] = []
    private pendingAssistantEventFlushFrame: number | null = null
    private pendingAssistantEventFlushTimeout: number | null = null
    private readonly pendingSelectionHydrations = new Set<string>()

    subscribe = (listener: () => void) => {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    getState = () => this.state

    retain() {
        this.retainCount += 1
        if (this.retainCount === 1) {
            void this.hydrate()
            this.ensureEventStream()
        }
    }

    release() {
        this.retainCount = Math.max(0, this.retainCount - 1)
        if (this.retainCount === 0 && this.eventUnsubscribe) {
            this.eventUnsubscribe()
            this.eventUnsubscribe = null
        }
        if (this.retainCount === 0) {
            this.clearPendingAssistantEvents()
        }
    }

    clearError() {
        this.setState({ error: null })
    }

    async hydrate() {
        if (this.hydratePromise) return this.hydratePromise
        this.clearPendingAssistantEvents()
        this.setState({ hydrating: true, error: null })
        this.hydratePromise = (async () => {
            try {
                const bootstrap = await window.devscope.assistant.bootstrap()
                const bootstrapSnapshot = bootstrap.snapshot
                const hasKnownModels = bootstrapSnapshot.knownModels.length > 0

                this.setState({
                    snapshot: bootstrapSnapshot,
                    status: bootstrap.status,
                    modelsLoading: !hasKnownModels,
                    error: null
                })

                let startupStatus = bootstrap.status
                let startupError: string | null = null
                const selectedSessionId = bootstrapSnapshot.selectedSessionId
                const selectedSession = bootstrapSnapshot.sessions.find((session) => session.id === selectedSessionId) || null
                const shouldRestoreConnection = Boolean(
                    selectedSessionId
                    && selectedSession?.activeThreadId
                    && bootstrap.status.available
                    && !bootstrap.status.connected
                )

                if (shouldRestoreConnection && selectedSessionId) {
                    try {
                        const result = await window.devscope.assistant.connect({ sessionId: selectedSessionId })
                        if (result.success) {
                            startupStatus = await window.devscope.assistant.getStatus()
                        } else {
                            startupError = result.error
                        }
                    } catch (error) {
                        startupError = error instanceof Error
                            ? error.message
                            : 'Failed to reconnect the selected assistant session.'
                    }
                }

                this.setState({
                    status: startupStatus,
                    hydrating: false,
                    hydrated: true,
                    modelsLoading: !hasKnownModels,
                    error: startupError
                })

                if (!hasKnownModels) {
                    void this.refreshModels(false)
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to load assistant.'
                this.setState({
                    hydrating: false,
                    hydrated: true,
                    modelsLoading: false,
                    error: message
                })
            } finally {
                this.hydratePromise = null
            }
        })()
        return this.hydratePromise
    }

    async refreshModels(forceRefresh = true) {
        if (this.modelRefreshPromise) return this.modelRefreshPromise
        this.setState({ modelsLoading: true, error: null })
        this.modelRefreshPromise = (async () => {
            try {
                const result = await window.devscope.assistant.listModels(forceRefresh)
                if (!result.success) {
                    this.setState({ modelsLoading: false, error: result.error })
                    return result
                }
                this.setState((current) => ({
                    modelsLoading: false,
                    snapshot: {
                        ...current.snapshot,
                        knownModels: result.models
                    }
                }))
                return result
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to refresh models.'
                this.setState({ modelsLoading: false, error: message })
                return { success: false as const, error: message }
            } finally {
                this.modelRefreshPromise = null
            }
        })()
        return this.modelRefreshPromise
    }

    async refresh() {
        await this.hydrate()
    }

    async refreshStatus() {
        try {
            const status = await window.devscope.assistant.getStatus()
            this.setState({ status, error: null })
            return { success: true as const, status }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to refresh assistant status.'
            this.setState({ error: message })
            return { success: false as const, error: message }
        }
    }

    async createSession(input?: AssistantCreateSessionInput): Promise<AssistantCreateSessionResult> {
        if (this.createSessionPromise) return this.createSessionPromise

        const createSessionPromise = this.createSessionImpl(input)
        this.createSessionPromise = createSessionPromise
        try {
            return await createSessionPromise
        } finally {
            this.createSessionPromise = null
        }
    }

    private async createSessionImpl(input?: AssistantCreateSessionInput): Promise<AssistantCreateSessionResult> {
        const reusableEmptySession = this.state.snapshot.sessions.find((session) => isReusableEmptySession(session, input)) || null
        if (reusableEmptySession) {
            this.setState((current) => ({
                error: null,
                commandPending: true,
                pendingCreateSessionInput: input ? { ...input } : {},
                snapshot: current.snapshot,
                status: deriveAssistantRuntimeStatus(current.snapshot, current.status)
            }))
            try {
                const selectionResult = await this.selectSession(reusableEmptySession.id)
                if (!selectionResult.success) return selectionResult
                return { success: true as const, sessionId: reusableEmptySession.id, snapshot: this.state.snapshot }
            } finally {
                this.setState({ commandPending: false, pendingCreateSessionInput: null })
            }
        }

        const previousSnapshot = this.state.snapshot
        this.setState((current) => {
            return {
                error: null,
                commandPending: true,
                pendingCreateSessionInput: input ? { ...input } : {},
                snapshot: current.snapshot,
                status: deriveAssistantRuntimeStatus(current.snapshot, current.status)
            }
        })
        try {
            const result = await window.devscope.assistant.createSession(input)
            if (!result.success) {
                this.setState((current) => ({
                    error: result.error,
                    snapshot: previousSnapshot,
                    status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
                }))
                return result
            }
            const sessionExists = this.state.snapshot.sessions.some((session) => session.id === result.sessionId)
            if (!sessionExists) {
                const hydrateResult = await this.hydrateSessionSnapshot(result.sessionId)
                if (!hydrateResult.success) {
                    this.setState((current) => ({
                        error: hydrateResult.error,
                        snapshot: previousSnapshot,
                        status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
                    }))
                    return hydrateResult
                }
                return result
            }
            const selectionResult = await this.selectSession(result.sessionId, { force: true })
            if (!selectionResult.success) {
                this.setState((current) => ({
                    error: selectionResult.error,
                    snapshot: previousSnapshot,
                    status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
                }))
                return selectionResult
            }
            return result
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Assistant command failed.'
            this.setState((current) => ({
                error: message,
                snapshot: previousSnapshot,
                status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
            }))
            return { success: false as const, error: message }
        } finally {
            this.setState({ commandPending: false, pendingCreateSessionInput: null })
        }
    }

    async selectSession(sessionId: string, options?: { force?: boolean }) {
        return selectAssistantStoreSession({
            state: this.state,
            hydratedThreadCache: this.hydratedThreadCache,
            setState: this.setState,
            requestSessionHydration: (targetSessionId, targetThreadId) => this.requestSessionHydration(targetSessionId, targetThreadId)
        }, sessionId, options)
    }

    async renameSession(sessionId: string, title: string) {
        return this.runAction(() => window.devscope.assistant.renameSession(sessionId, title), false)
    }

    async archiveSession(sessionId: string, archived = true) {
        return this.runAction(() => window.devscope.assistant.archiveSession(sessionId, archived), false)
    }

    async deleteSession(sessionId: string) {
        return this.runAction(() => window.devscope.assistant.deleteSession(sessionId), true)
    }

    async deleteMessage(input: AssistantDeleteMessageInput) {
        return this.runAction(() => window.devscope.assistant.deleteMessage(input), true)
    }

    async clearLogs(input?: AssistantClearLogsInput) {
        return this.runAction(() => window.devscope.assistant.clearLogs(input), false)
    }

    async setSessionProjectPath(sessionId: string, projectPath: string | null) {
        return this.runAction(() => window.devscope.assistant.setSessionProjectPath(sessionId, projectPath), false)
    }

    async setPlaygroundRoot(rootPath: string | null) {
        return this.runPlaygroundAction(() => window.devscope.assistant.setPlaygroundRoot({ rootPath }), true)
    }

    async createPlaygroundLab(input: AssistantCreatePlaygroundLabInput) {
        return this.runPlaygroundAction(() => window.devscope.assistant.createPlaygroundLab(input), true)
    }

    async selectThread(input: AssistantSelectThreadInput, options?: { force?: boolean }) {
        const force = options?.force === true
        const selectedSession = this.state.snapshot.sessions.find((session) => session.id === input.sessionId) || null
        if (!selectedSession) {
            return { success: false as const, error: 'Assistant session not found.' }
        }
        if (!force && this.state.snapshot.selectedSessionId === input.sessionId && selectedSession.activeThreadId === input.threadId) {
            return { success: true as const, snapshot: this.state.snapshot }
        }

        const canHydrateFromCache = hasCachedSessionSelection(
            this.state.snapshot,
            input.sessionId,
            input.threadId,
            this.hydratedThreadCache
        )
        this.setState((current) => {
            const snapshot = applyCachedSessionSelection(
                current.snapshot,
                input.sessionId,
                input.threadId,
                this.hydratedThreadCache
            )
            return {
                error: null,
                commandPending: !canHydrateFromCache,
                snapshot,
                status: deriveAssistantRuntimeStatus(snapshot, current.status)
            }
        })

        try {
            const result = await window.devscope.assistant.selectThread(input)
            if (!result.success) {
                this.setState({ error: result.error })
                return result
            }
            const snapshot = result.snapshot
            if (snapshot) {
                this.setState((current) => ({
                    snapshot,
                    status: deriveAssistantRuntimeStatus(snapshot, current.status)
                }))
            } else if (!canHydrateFromCache) {
                void this.requestSessionHydration(input.sessionId, input.threadId)
            }
            return result
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Assistant command failed.'
            this.setState({ error: message })
            return { success: false as const, error: message }
        } finally {
            this.setState({ commandPending: false })
        }
    }

    async deletePlaygroundLab(input: { labId: string }) {
        return this.runPlaygroundAction(() => window.devscope.assistant.deletePlaygroundLab(input), true)
    }

    async attachSessionToPlaygroundLab(input: AssistantAttachSessionToPlaygroundLabInput) {
        return this.runPlaygroundAction(() => window.devscope.assistant.attachSessionToPlaygroundLab(input), true)
    }

    async approvePendingPlaygroundLabRequest(input: AssistantApprovePendingPlaygroundLabRequestInput) {
        return this.runPlaygroundAction(() => window.devscope.assistant.approvePendingPlaygroundLabRequest(input), true)
    }

    async declinePendingPlaygroundLabRequest(input: AssistantDeclinePendingPlaygroundLabRequestInput) {
        return this.runAction(() => window.devscope.assistant.declinePendingPlaygroundLabRequest(input), true)
    }

    async newThread(sessionId?: string) {
        const targetSessionId = sessionId || this.state.snapshot.selectedSessionId
        const previousSnapshot = this.state.snapshot
        this.setState((current) => {
            if (!targetSessionId) {
                return {
                    error: null,
                    commandPending: true
                }
            }

            const snapshot = {
                ...current.snapshot,
                selectedSessionId: targetSessionId
            }

            return {
                error: null,
                commandPending: true,
                snapshot,
                status: deriveAssistantRuntimeStatus(snapshot, current.status)
            }
        })
        try {
            const result = await window.devscope.assistant.newThread(sessionId)
            if (!result.success) {
                this.setState((current) => ({
                    error: result.error,
                    snapshot: previousSnapshot,
                    status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
                }))
                return result
            }
            const activeSessionId = targetSessionId
            const threadExists = activeSessionId
                ? Boolean(this.state.snapshot.sessions.find((session) => session.id === activeSessionId)?.threads.some((thread) => thread.id === result.threadId))
                : false
            if (activeSessionId && !threadExists) {
                const hydrateResult = await this.hydrateSessionSnapshot(activeSessionId)
                if (!hydrateResult.success) {
                    this.setState((current) => ({
                        error: hydrateResult.error,
                        snapshot: previousSnapshot,
                        status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
                    }))
                    return hydrateResult
                }
            }
            return result
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Assistant command failed.'
            this.setState((current) => ({
                error: message,
                snapshot: previousSnapshot,
                status: deriveAssistantRuntimeStatus(previousSnapshot, current.status)
            }))
            return { success: false as const, error: message }
        } finally {
            this.setState({ commandPending: false })
        }
    }

    async connect(options?: AssistantConnectOptions) {
        const result = await this.runAction(() => window.devscope.assistant.connect(options), true)
        if (!result.success && SNAPSHOT_REFRESH_RECOVERY_ERRORS.has(result.error)) {
            await this.hydrate()
        }
        return result
    }

    async disconnect(sessionId?: string) {
        return this.runAction(() => window.devscope.assistant.disconnect(sessionId), true)
    }

    async sendPrompt(prompt: string, options?: AssistantSendPromptOptions) {
        return this.runAction(() => window.devscope.assistant.sendPrompt(prompt, options), true)
    }

    async interruptTurn(turnId?: string, sessionId?: string) {
        return this.runAction(() => window.devscope.assistant.interruptTurn(turnId, sessionId), true)
    }

    async respondApproval(input: AssistantApprovalResponseInput) {
        return this.runAction(() => window.devscope.assistant.respondApproval(input), true)
    }

    async respondUserInput(input: AssistantUserInputResponseInput) {
        return this.runAction(() => window.devscope.assistant.respondUserInput(input), true)
    }

    async chooseProjectPath(sessionId: string) {
        const folderResult = await window.devscope.selectFolder()
        if (folderResult.success && folderResult.folderPath && !folderResult.cancelled) {
            return this.runAction(
                () => window.devscope.assistant.setSessionProjectPath(sessionId, folderResult.folderPath || null),
                false
            )
        }
        return folderResult
    }

    async createProjectSession() {
        const folderResult = await window.devscope.selectFolder()
        if (!folderResult.success || folderResult.cancelled || !folderResult.folderPath) {
            return folderResult
        }
        const sessionResult = await this.createSession({ mode: 'work' })
        if (!sessionResult.success) {
            return sessionResult
        }
        return this.runAction(
            () => window.devscope.assistant.setSessionProjectPath(sessionResult.sessionId, folderResult.folderPath || null),
            false
        )
    }

    private ensureEventStream() {
        if (this.eventUnsubscribe) return
        this.eventUnsubscribe = window.devscope.assistant.onEvent((payload) => {
            const events = Array.isArray(payload.events)
                ? payload.events
                : payload.event
                    ? [payload.event]
                    : []

            for (const event of events) {
                const currentSequence = this.getExpectedSnapshotSequence()
                if (event.sequence <= currentSequence) continue
                if (event.sequence !== currentSequence + 1) {
                    this.clearPendingAssistantEvents()
                    void this.hydrate()
                    return
                }
                this.queueAssistantEvent(event)
            }
        })
    }

    private getExpectedSnapshotSequence() {
        if (this.pendingAssistantEvents.length > 0) {
            return this.pendingAssistantEvents[this.pendingAssistantEvents.length - 1].sequence
        }
        return this.state.snapshot.snapshotSequence
    }

    private queueAssistantEvent(event: AssistantDomainEvent) {
        this.pendingAssistantEvents.push(event)
        if (event.type === 'thread.message.assistant.delta') {
            if (this.pendingAssistantEventFlushFrame !== null || this.pendingAssistantEventFlushTimeout !== null) return
            this.pendingAssistantEventFlushTimeout = window.setTimeout(() => {
                this.pendingAssistantEventFlushTimeout = null
                this.flushPendingAssistantEvents()
            }, ASSISTANT_DELTA_EVENT_FLUSH_DELAY_MS)
            return
        }

        if (this.pendingAssistantEventFlushTimeout !== null) {
            window.clearTimeout(this.pendingAssistantEventFlushTimeout)
            this.pendingAssistantEventFlushTimeout = null
        }
        if (this.pendingAssistantEventFlushFrame !== null) return

        this.pendingAssistantEventFlushFrame = window.requestAnimationFrame(() => {
            this.pendingAssistantEventFlushFrame = null
            this.flushPendingAssistantEvents()
        })
    }

    private flushPendingAssistantEvents() {
        if (this.pendingAssistantEventFlushFrame !== null) {
            window.cancelAnimationFrame(this.pendingAssistantEventFlushFrame)
            this.pendingAssistantEventFlushFrame = null
        }
        if (this.pendingAssistantEventFlushTimeout !== null) {
            window.clearTimeout(this.pendingAssistantEventFlushTimeout)
            this.pendingAssistantEventFlushTimeout = null
        }
        if (this.pendingAssistantEvents.length === 0) return

        const queuedEvents = collapseAssistantDeltaEvents(this.pendingAssistantEvents)
        this.pendingAssistantEvents = []
        const previousSelectedSessionId = this.state.snapshot.selectedSessionId
        let nextSelectedSessionId = previousSelectedSessionId
        this.setState((current) => {
            const snapshot = applyAssistantDomainEvents(current.snapshot, queuedEvents)
            nextSelectedSessionId = snapshot.selectedSessionId
            return {
                snapshot,
                status: deriveAssistantRuntimeStatus(snapshot, current.status)
            }
        })
        if (nextSelectedSessionId !== previousSelectedSessionId) {
            void this.hydrateSelectedSessionIfNeeded()
        }
    }

    private clearPendingAssistantEvents() {
        if (this.pendingAssistantEventFlushFrame !== null) {
            window.cancelAnimationFrame(this.pendingAssistantEventFlushFrame)
            this.pendingAssistantEventFlushFrame = null
        }
        if (this.pendingAssistantEventFlushTimeout !== null) {
            window.clearTimeout(this.pendingAssistantEventFlushTimeout)
            this.pendingAssistantEventFlushTimeout = null
        }
        this.pendingAssistantEvents = []
    }

    private async hydrateSelectedSessionIfNeeded(): Promise<void> {
        const sessionId = this.state.snapshot.selectedSessionId
        const selectedSession = this.state.snapshot.sessions.find((session) => session.id === sessionId) || null
        const activeThreadId = selectedSession?.activeThreadId || null
        if (!sessionId || !selectedSession || !activeThreadId) return
        await this.requestSessionHydration(sessionId, activeThreadId)
    }

    private buildSelectionHydrationKey(sessionId: string, threadId: string | null) {
        return `${sessionId}:${threadId || ''}`
    }

    private async requestSessionHydration(sessionId: string, threadId: string | null): Promise<void> {
        if (!sessionId || !threadId) return
        if (hasCachedSessionSelection(this.state.snapshot, sessionId, threadId, this.hydratedThreadCache)) return

        const hydrationKey = this.buildSelectionHydrationKey(sessionId, threadId)
        if (this.pendingSelectionHydrations.has(hydrationKey)) return

        this.pendingSelectionHydrations.add(hydrationKey)
        this.setState({ selectionHydrationKey: hydrationKey })
        try {
            const result = await window.devscope.assistant.hydrateSession(sessionId)
            if (!result.success) return

            this.setState((current) => {
                const selectedSession = current.snapshot.sessions.find((session) => session.id === sessionId) || null
                if (current.snapshot.selectedSessionId !== sessionId || selectedSession?.activeThreadId !== threadId) {
                    return {}
                }
                return {
                    snapshot: result.snapshot,
                    status: deriveAssistantRuntimeStatus(result.snapshot, current.status)
                }
            })
        } catch (error) {
            console.warn('[AssistantStore] Failed to hydrate selected session.', error)
        } finally {
            this.pendingSelectionHydrations.delete(hydrationKey)
            this.setState((current) => (
                current.selectionHydrationKey === hydrationKey
                    ? { selectionHydrationKey: null }
                    : {}
            ))
        }
    }

    private applyPlaygroundState(playground: AssistantPlaygroundState) {
        this.setState((current) => ({
            snapshot: {
                ...current.snapshot,
                playground
            }
        }))
    }

    private async hydrateSessionSnapshot(sessionId: string) {
        const result = await window.devscope.assistant.hydrateSession(sessionId)
        if (!result.success) return result

        this.setState((current) => ({
            snapshot: result.snapshot,
            status: deriveAssistantRuntimeStatus(result.snapshot, current.status)
        }))
        return result
    }

    private async runPlaygroundAction<T extends { playground: AssistantPlaygroundState }>(
        work: () => Promise<DevScopeResult<T>>,
        refreshStatusAfter: boolean
    ): Promise<DevScopeResult<T>> {
        const result = await this.runAction(work, refreshStatusAfter)
        if (result.success) {
            this.applyPlaygroundState(result.playground)
        }
        return result
    }

    private async runAction<T = Record<string, unknown>>(
        work: () => Promise<DevScopeResult<T>>,
        refreshStatusAfter: boolean
    ): Promise<DevScopeResult<T>> {
        const result = await runAssistantStoreAction(this.setState, work)
        if (refreshStatusAfter) {
            try {
                const status = await window.devscope.assistant.getStatus()
                this.setState({ status })
            } catch {}
        }
        return result
    }

    private setState = (
        nextState:
            | Partial<AssistantStoreState>
            | ((current: AssistantStoreState) => Partial<AssistantStoreState>)
    ) => {
        const partial = typeof nextState === 'function' ? nextState(this.state) : nextState
        const partialKeys = Object.keys(partial) as Array<keyof AssistantStoreState>
        if (partialKeys.length === 0) return
        let changed = false
        const previousState = this.state
        const mergedState: AssistantStoreState = { ...previousState }
        for (const key of partialKeys) {
            const nextValue = partial[key]
            if (Object.is(previousState[key], nextValue)) continue
            changed = true
            ;(mergedState as Record<keyof AssistantStoreState, AssistantStoreState[keyof AssistantStoreState]>)[key] = nextValue as AssistantStoreState[keyof AssistantStoreState]
        }
        if (!changed) return
        this.state = mergedState
        if (!Object.is(previousState.snapshot, mergedState.snapshot)) {
            cacheHydratedThreads(this.hydratedThreadCache, mergedState.snapshot)
        }
        for (const listener of this.listeners) {
            listener()
        }
    }
}
export type { AssistantStoreState } from './assistant-store-runtime'
export const assistantStore = new AssistantStore()

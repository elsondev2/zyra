import log from 'electron-log'
import type {
    AssistantAccountOverview,
    AssistantApprovePendingPlaygroundLabRequestInput,
    AssistantAttachSessionToPlaygroundLabInput,
    AssistantClearLogsInput,
    AssistantConnectOptions,
    AssistantCreatePlaygroundLabInput,
    AssistantCreateSessionInput,
    AssistantDeclinePendingPlaygroundLabRequestInput,
    AssistantDeleteMessageInput,
    AssistantDeletePlaygroundLabInput,
    AssistantDomainEvent,
    AssistantGetSessionTurnUsageInput,
    AssistantRuntimeStatus,
    AssistantSendPromptOptions,
    AssistantSession,
    AssistantThread
} from '../../shared/assistant/contracts'
import { AssistantTextDeltaBuffer } from './assistant-text-delta-buffer'
import { ZyraPiRuntime } from './zyra-pi-runtime'
import { nowIso } from './utils'
import type { AssistantServiceActionDeps } from './service-action-deps'
import { AssistantPersistence } from './persistence'
import { applyDomainEvent, createDefaultSnapshot } from './projector'
import { approvePendingPlaygroundLabRequestAction, attachSessionToPlaygroundLabAction, createPlaygroundLabAction, declinePendingPlaygroundLabRequestAction, deletePlaygroundLabAction, setPlaygroundRootAction } from './service-playground-actions'
import {
    clearAssistantLogsAction,
    connectAssistantSession,
    createAssistantSessionAction,
    createAssistantThreadAction,
    deleteAssistantMessageAction,
    deleteAssistantSessionAction,
    disconnectAssistantSession,
    getAssistantRuntimeStatusAction,
    getAssistantSessionTurnUsageAction,
    interruptAssistantTurnAction,
    archiveAssistantSessionAction,
    renameAssistantSessionAction,
    respondAssistantApprovalAction,
    respondAssistantUserInputAction,
    selectAssistantSessionAction,
    selectAssistantThreadAction,
    sendAssistantPromptAction,
    setAssistantSessionProjectPathAction
} from './service-session-actions'
import {
    broadcastAssistantPayload,
    createAssistantDomainEvent,
    trimAssistantEvents,
    updateLatestTurnAssistantMessage
} from './service-helpers'
import { handleAssistantRuntimeEvent } from './service-runtime-events'
import {
    type AssistantStateRecord,
    findSessionByThreadId,
    findThreadRecord,
    getActiveThread,
    getSelectedSession,
    requireSession,
    requireThread
} from './service-state'

export class AssistantService {
    private static readonly MAX_IN_MEMORY_EVENTS = 256
    private static readonly ASSISTANT_TEXT_DELTA_FLUSH_MS = 40
    private static readonly ASSISTANT_EVENT_BROADCAST_BATCH_MS = 16

    private readonly runtime = new ZyraPiRuntime()
    private readonly persistence = new AssistantPersistence()
    private readonly assistantTextDeltaBuffer = new AssistantTextDeltaBuffer({
        flushDelayMs: AssistantService.ASSISTANT_TEXT_DELTA_FLUSH_MS,
        onFlush: (entry) => {
            this.appendEvent('thread.message.assistant.delta', entry.occurredAt, {
                threadId: entry.threadId,
                messageId: entry.messageId,
                delta: entry.delta,
                turnId: entry.turnId
            }, entry.sessionId, entry.threadId)
        }
    })
    private readonly subscribers = new Set<number>()
    private readonly planBuffers = new Map<string, string>()
    private readonly assistantTextBuffers = new Map<string, string>()
    private readonly suppressedAssistantTextTurns = new Set<string>()
    private readonly readyPromise: Promise<void>
    private readonly actionDeps: AssistantServiceActionDeps

    private state: AssistantStateRecord = {
        snapshot: createDefaultSnapshot(),
        events: []
    }
    private pendingBroadcastEvents: AssistantDomainEvent[] = []
    private pendingBroadcastTimer: NodeJS.Timeout | null = null

    constructor() {
        this.readyPromise = this.initialize()
        this.actionDeps = {
            runtime: this.runtime,
            ensureReady: () => this.ensureReady(),
            getSnapshot: () => this.state.snapshot,
            hydrateSelectedSession: async (sessionId: string) => {
                this.state.snapshot = await this.persistence.hydrateSelectedSession(this.state.snapshot, sessionId)
            },
            appendEvent: (type, occurredAt, payload, sessionId, threadId) => {
                this.appendEvent(type, occurredAt, payload, sessionId, threadId)
            },
            getSessionRuntimeCwd: (session, thread) => this.getSessionRuntimeCwd(session, thread),
            createSession: (input?: AssistantCreateSessionInput) => this.createSession(input),
            createPlaygroundLab: (input: AssistantCreatePlaygroundLabInput) => this.createPlaygroundLab(input),
            sendPrompt: (prompt: string, options?: AssistantSendPromptOptions) => this.sendPrompt(prompt, options),
            suppressAssistantTextForTurn: (threadId: string, turnId: string) => {
                this.suppressedAssistantTextTurns.add(`${threadId}:${turnId}`)
            }
        }
        this.runtime.on('runtime', (event) => {
            this.handleRuntimeEvent(event)
        })
    }

    subscribe(senderId: number) {
        this.subscribers.add(senderId)
        return { success: true as const }
    }

    unsubscribe(senderId: number) {
        this.subscribers.delete(senderId)
        return { success: true as const }
    }

    async getSnapshot() {
        await this.ensureReady()
        return structuredClone(this.state.snapshot)
    }

    async getBootstrap() {
        await this.ensureReady()
        const status = await this.getStatus()
        return {
            snapshot: structuredClone(this.state.snapshot),
            status
        }
    }

    async getStatus(): Promise<AssistantRuntimeStatus> {
        return getAssistantRuntimeStatusAction(this.actionDeps)
    }

    async listModels(forceRefresh = false) {
        await this.ensureReady()
        const models = await this.runtime.listModels(forceRefresh)
        this.state.snapshot.knownModels = models
        this.persistence.updateMetadata(this.state.snapshot)
        return { success: true as const, models }
    }

    async getAccountOverview() {
        await this.ensureReady()
        const [accountPayload, rateLimitPayload] = await Promise.all([
            this.runtime.getAccount(),
            this.runtime.getAccountRateLimits()
        ])

        const overview: AssistantAccountOverview = {
            account: accountPayload.account,
            authMode: accountPayload.authMode,
            requiresOpenaiAuth: accountPayload.requiresOpenaiAuth,
            rateLimits: rateLimitPayload.rateLimits,
            rateLimitsByLimitId: rateLimitPayload.rateLimitsByLimitId,
            fetchedAt: nowIso()
        }

        return { success: true as const, overview }
    }

    async getSessionTurnUsage(input?: AssistantGetSessionTurnUsageInput) {
        return getAssistantSessionTurnUsageAction(
            this.actionDeps,
            (sessionId) => this.persistence.readSessionTurnUsage(sessionId),
            input
        )
    }

    async connect(options?: AssistantConnectOptions) {
        return connectAssistantSession(this.actionDeps, options)
    }

    async disconnect(sessionId?: string) {
        return disconnectAssistantSession(this.actionDeps, sessionId)
    }

    async createSession(input?: AssistantCreateSessionInput) {
        return createAssistantSessionAction(this.actionDeps, input)
    }

    async selectSession(sessionId: string) {
        return selectAssistantSessionAction(this.actionDeps, sessionId)
    }

    async selectThread(sessionId: string, threadId: string) {
        return selectAssistantThreadAction(this.actionDeps, sessionId, threadId)
    }

    async hydrateSession(sessionId: string) {
        await this.ensureReady()
        requireSession(this.state.snapshot, sessionId)
        this.state.snapshot = await this.persistence.hydrateSelectedSession(this.state.snapshot, sessionId)
        return {
            success: true as const,
            sessionId,
            snapshot: structuredClone(this.state.snapshot)
        }
    }

    async renameSession(sessionId: string, title: string) {
        return renameAssistantSessionAction(this.actionDeps, sessionId, title)
    }

    async archiveSession(sessionId: string, archived = true) {
        return archiveAssistantSessionAction(this.actionDeps, sessionId, archived)
    }

    async deleteSession(sessionId: string) {
        return deleteAssistantSessionAction(this.actionDeps, sessionId)
    }

    async clearLogs(input?: AssistantClearLogsInput) {
        return clearAssistantLogsAction(this.actionDeps, input)
    }

    async deleteMessage(input: AssistantDeleteMessageInput) {
        return deleteAssistantMessageAction(this.actionDeps, input)
    }

    async setSessionProjectPath(sessionId: string, projectPath: string | null) {
        return setAssistantSessionProjectPathAction(this.actionDeps, sessionId, projectPath)
    }

    async setPlaygroundRoot(input: { rootPath: string | null }) {
        return setPlaygroundRootAction(this.actionDeps, input)
    }

    async createPlaygroundLab(input: AssistantCreatePlaygroundLabInput) {
        return createPlaygroundLabAction(this.actionDeps, input)
    }

    async deletePlaygroundLab(input: AssistantDeletePlaygroundLabInput) {
        return deletePlaygroundLabAction(this.actionDeps, input)
    }

    async attachSessionToPlaygroundLab(input: AssistantAttachSessionToPlaygroundLabInput) {
        return attachSessionToPlaygroundLabAction(this.actionDeps, input)
    }

    async newThread(sessionId?: string) {
        return createAssistantThreadAction(this.actionDeps, sessionId)
    }

    async sendPrompt(prompt: string, options?: AssistantSendPromptOptions) {
        return sendAssistantPromptAction(this.actionDeps, prompt, options)
    }

    async interruptTurn(turnId?: string, sessionId?: string) {
        return interruptAssistantTurnAction(this.actionDeps, turnId, sessionId)
    }

    async respondApproval(input: { requestId: string; decision: 'acceptForSession' | 'decline' }) {
        return respondAssistantApprovalAction(this.actionDeps, input)
    }

    async respondUserInput(input: { requestId: string; answers: Record<string, string | string[]> }) {
        return respondAssistantUserInputAction(this.actionDeps, input)
    }

    async approvePendingPlaygroundLabRequest(input: AssistantApprovePendingPlaygroundLabRequestInput) {
        return approvePendingPlaygroundLabRequestAction(this.actionDeps, input)
    }

    async declinePendingPlaygroundLabRequest(input: AssistantDeclinePendingPlaygroundLabRequestInput) {
        return declinePendingPlaygroundLabRequestAction(this.actionDeps, input)
    }

    dispose() {
        this.assistantTextDeltaBuffer.dispose()
        this.runtime.dispose()
        void this.persistence.flush()
    }

    private async initialize() {
        const loaded = await this.persistence.load()
        this.state = {
            snapshot: loaded.snapshot || createDefaultSnapshot(),
            events: loaded.events || []
        }
        void this.runtime.prewarm(false).catch((error) => {
            log.warn('[Assistant] Zyra runtime prewarm failed', error)
        })
    }

    private async ensureReady() {
        await this.readyPromise
    }

    private getSessionRuntimeCwd(
        session: AssistantSession,
        thread: AssistantThread
    ): string {
        return session.projectPath || thread.cwd || process.cwd()
    }

    private appendEvent(
        type: AssistantDomainEvent['type'],
        occurredAt: string,
        payload: Record<string, unknown>,
        sessionId?: string,
        threadId?: string
    ) {
        const event = createAssistantDomainEvent(this.state.snapshot.snapshotSequence, type, occurredAt, payload, sessionId, threadId)
        this.state.events.push(event)
        this.state.events = trimAssistantEvents(this.state.events, AssistantService.MAX_IN_MEMORY_EVENTS)
        this.state.snapshot = applyDomainEvent(this.state.snapshot, event)
        this.persistence.appendEvent(event, this.state.snapshot)
        this.queueBroadcastEvent(event)
    }

    private queueBroadcastEvent(event: AssistantDomainEvent): void {
        this.pendingBroadcastEvents.push(event)
        if (this.pendingBroadcastTimer) return

        this.pendingBroadcastTimer = setTimeout(() => {
            this.pendingBroadcastTimer = null
            this.flushBroadcastEvents()
        }, AssistantService.ASSISTANT_EVENT_BROADCAST_BATCH_MS)
        this.pendingBroadcastTimer.unref?.()
    }

    private flushBroadcastEvents(): void {
        if (this.pendingBroadcastEvents.length === 0) return
        const events = this.pendingBroadcastEvents.splice(0, this.pendingBroadcastEvents.length)
        broadcastAssistantPayload(this.subscribers, events.length === 1 ? { event: events[0] } : { events })
    }

    private handleRuntimeEvent(event: Parameters<typeof handleAssistantRuntimeEvent>[0]) {
        handleAssistantRuntimeEvent(event, {
            planBuffers: this.planBuffers,
            assistantTextBuffers: this.assistantTextBuffers,
            isAssistantTextSuppressed: (threadId, turnId) => Boolean(turnId && this.suppressedAssistantTextTurns.has(`${threadId}:${turnId}`)),
            findSessionByThreadId: (threadId) => findSessionByThreadId(this.state.snapshot, threadId),
            requireThread: (threadId) => requireThread(this.state.snapshot, threadId),
            findThreadRecord: (threadId) => findThreadRecord(this.state.snapshot, threadId),
            queueAssistantTextDelta: (entry) => this.assistantTextDeltaBuffer.queue(entry),
            flushAssistantTextDelta: (target) => this.assistantTextDeltaBuffer.flush(target),
            appendEvent: (type, occurredAt, payload, sessionId, threadId) => this.appendEvent(type, occurredAt, payload, sessionId, threadId),
            updateLatestTurnAssistantMessage: (sessionId, threadId, assistantMessageId, occurredAt) => {
                updateLatestTurnAssistantMessage(this.state.snapshot, sessionId, threadId, assistantMessageId, occurredAt, (type, eventOccurredAt, payload, eventSessionId, eventThreadId) => {
                    this.appendEvent(type, eventOccurredAt, payload, eventSessionId, eventThreadId)
                })
            }
        })

        if (event.type !== 'turn.completed') return

        const completedThreadRecord = findThreadRecord(this.state.snapshot, event.threadId)
        const selectedSession = getSelectedSession(this.state.snapshot)
        const activeThread = getActiveThread(selectedSession)
        if (!selectedSession || !activeThread) return
        if ((completedThreadRecord?.thread.id || event.threadId) !== activeThread.id) return
        if (!activeThread.latestTurn || activeThread.latestTurn.state !== 'completed') return
        if (activeThread.lastSeenCompletedTurnId === activeThread.latestTurn.id) return

        this.appendEvent('thread.updated', event.createdAt, {
            threadId: activeThread.id,
            patch: {
                lastSeenCompletedTurnId: activeThread.latestTurn.id
            }
        }, selectedSession.id, activeThread.id)
    }
}

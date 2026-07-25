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
    AssistantGetHistoryPageInput,
    AssistantGetSessionTurnUsageInput,
    AssistantRuntimeStatus,
    AssistantSendPromptOptions,
    AssistantSession,
    AssistantStartRealtimeVoiceInput,
    AssistantThread,
    FleetOperationInput,
    FleetSnapshot
} from '../../shared/assistant/contracts'
import { isAssistantToolLifecycleStartEvent } from '../../shared/assistant/tool-lifecycle'
import { AssistantTextDeltaBuffer } from './assistant-text-delta-buffer'
import { AssistantActivityDeltaBuffer } from './assistant-activity-delta-buffer'
import { CodexRealtimeVoiceRuntime } from './codex-realtime-voice'
import { ZyraPiRuntime } from './zyra-pi-runtime'
import { nowIso } from './utils'
import type { AssistantServiceActionDeps } from './service-action-deps'
import { AssistantPersistence } from './persistence'
import { toAssistantShellSnapshot } from './persistence-snapshot'
import { FleetProjection } from './fleet-projection'
import { queueGeneratedSessionTitle, shouldGenerateSessionTitleForPrompt } from './session-title-generation'
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
    broadcastAssistantRealtimeVoiceEvent,
    createAssistantDomainEvent,
    trimAssistantEvents,
    updateLatestTurnAssistantMessage
} from './service-helpers'
import {
    buildInternalTextActivity,
    buildStreamingToolActivity,
    handleAssistantRuntimeEvent
} from './service-runtime-events'
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
    private static readonly ASSISTANT_ACTIVITY_DELTA_FLUSH_MS = 48
    private static readonly ASSISTANT_EVENT_BROADCAST_BATCH_MS = 16

    private readonly runtime = new ZyraPiRuntime()
    private readonly realtimeVoiceRuntime = new CodexRealtimeVoiceRuntime()
    private readonly persistence = new AssistantPersistence()
    private readonly fleetProjection = new FleetProjection()
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
    private readonly assistantActivityDeltaBuffer = new AssistantActivityDeltaBuffer({
        flushDelayMs: AssistantService.ASSISTANT_ACTIVITY_DELTA_FLUSH_MS,
        onFlush: (entry) => {
            const threadRecord = findThreadRecord(this.state.snapshot, entry.threadId)
            if (!threadRecord) return
            const existing = threadRecord.thread.activities.find((activity) => activity.id === entry.activityId) || null
            const activity = entry.streamKind === 'reasoning_text' || entry.streamKind === 'reasoning_summary_text'
                ? buildInternalTextActivity({
                    existing,
                    activityId: entry.activityId,
                    text: entry.delta,
                    turnId: entry.turnId,
                    itemId: entry.itemId,
                    occurredAt: entry.occurredAt,
                    status: 'streaming',
                    streamKind: entry.streamKind
                })
                : buildStreamingToolActivity({
                    existing,
                    activityId: entry.activityId,
                    kind: entry.streamKind === 'command_output' ? 'command' : 'file-change',
                    delta: entry.delta,
                    turnId: entry.turnId,
                    itemId: entry.itemId,
                    occurredAt: entry.occurredAt
                })
            this.appendEvent('thread.activity.appended', entry.occurredAt, {
                threadId: entry.threadId,
                activity
            }, entry.sessionId, entry.threadId)
        }
    })
    private readonly subscribers = new Set<number>()
    private readonly realtimeVoiceSubscribers = new Set<number>()
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
            getFirstUserMessageText: (sessionId: string) => this.persistence.readFirstUserMessageText(sessionId),
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
        this.realtimeVoiceRuntime.on('event', (event) => {
            broadcastAssistantRealtimeVoiceEvent(this.realtimeVoiceSubscribers, event)
        })
        void this.readyPromise
            .then(() => this.recoverSelectedSessionTitle())
            .catch((error) => log.warn('[Assistant] Failed to recover the selected chat title', error))
    }

    subscribe(senderId: number) {
        this.subscribers.add(senderId)
        return { success: true as const }
    }

    unsubscribe(senderId: number) {
        this.subscribers.delete(senderId)
        return { success: true as const }
    }

    subscribeRealtimeVoice(senderId: number) {
        this.realtimeVoiceSubscribers.add(senderId)
        return { success: true as const }
    }

    unsubscribeRealtimeVoice(senderId: number) {
        this.realtimeVoiceSubscribers.delete(senderId)
        return { success: true as const }
    }

    async getSnapshot() {
        await this.ensureReady()
        return toAssistantShellSnapshot(this.state.snapshot)
    }

    async getBootstrap() {
        await this.ensureReady()
        const status = await this.getStatus()
        return {
            snapshot: toAssistantShellSnapshot(this.state.snapshot),
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

    async getFleetSnapshot(threadId: string) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, threadId).id
        const snapshot = this.fleetProjection.get(localThreadId)
            || this.state.snapshot.fleetByThreadId[localThreadId]
            || await this.persistence.readFleet(localThreadId)
        return { success: true as const, snapshot: snapshot || null }
    }

    async runFleetOperation(namespace: 'agents' | 'workflows', input: FleetOperationInput) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, input.threadId).id
        const result = await this.runtime.requestFleetOperation(localThreadId, namespace, input.action, input.payload || {})
        const snapshot = (result['snapshot'] || result['fleet']) as FleetSnapshot | undefined
        if (snapshot) {
            this.fleetProjection.apply(localThreadId, snapshot)
            this.persistence.projectFleet(localThreadId, snapshot)
        }
        return { success: true as const, result }
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

    async getThreadDetailBootstrap(threadId: string) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, threadId).id
        return {
            success: true as const,
            detail: await this.persistence.readThreadDetail(localThreadId)
        }
    }

    async getHistoryPage(input: AssistantGetHistoryPageInput) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, input.threadId).id
        return {
            success: true as const,
            page: await this.persistence.readHistoryPage({ ...input, threadId: localThreadId })
        }
    }

    async getReviewIndex(threadId: string) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, threadId).id
        return { success: true as const, index: await this.persistence.readReviewIndex(localThreadId) }
    }

    async searchTurns(threadId: string, query: string, limit?: number) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, threadId).id
        return { success: true as const, result: await this.persistence.searchTurns(localThreadId, query, limit) }
    }

    async getTurnDetail(threadId: string, turnId: string) {
        await this.ensureReady()
        const localThreadId = requireThread(this.state.snapshot, threadId).id
        return { success: true as const, detail: await this.persistence.readTurnDetail(localThreadId, turnId) }
    }

    async renameSession(sessionId: string, title: string) {
        return renameAssistantSessionAction(this.actionDeps, sessionId, title)
    }

    async archiveSession(sessionId: string, archived = true) {
        return archiveAssistantSessionAction(this.actionDeps, sessionId, archived)
    }

    async deleteSession(sessionId: string) {
        await this.ensureReady()
        const threadIds = this.state.snapshot.sessions.find((session) => session.id === sessionId)?.threads.map((thread) => thread.id) || []
        const result = await deleteAssistantSessionAction(this.actionDeps, sessionId)
        for (const threadId of threadIds) {
            this.fleetProjection.remove(threadId)
            delete this.state.snapshot.fleetByThreadId[threadId]
            this.persistence.deleteFleet(threadId)
        }
        return result
    }

    async clearLogs(input?: AssistantClearLogsInput) {
        return clearAssistantLogsAction(this.actionDeps, input)
    }

    async deleteMessage(input: AssistantDeleteMessageInput) {
        await this.ensureReady()
        const sessionId = input.sessionId || this.state.snapshot.selectedSessionId
        if (!sessionId) throw new Error('Assistant session not found.')
        // Deletion planning must see persisted history even when the renderer has only a page loaded.
        this.state.snapshot = await this.persistence.hydrateSelectedSession(this.state.snapshot, sessionId)
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

    async startRealtimeVoice(input: AssistantStartRealtimeVoiceInput) {
        await this.ensureReady()
        const session = getSelectedSession(this.state.snapshot)
        const thread = getActiveThread(session)
        const cwd = session && thread ? this.getSessionRuntimeCwd(session, thread) : process.cwd()
        const result = await this.realtimeVoiceRuntime.start({
            cwd,
            sdp: input.sdp,
            instructions: input.instructions
        })
        return { success: true as const, ...result }
    }

    async stopRealtimeVoice() {
        await this.realtimeVoiceRuntime.stop()
        return { success: true as const }
    }

    async approvePendingPlaygroundLabRequest(input: AssistantApprovePendingPlaygroundLabRequestInput) {
        return approvePendingPlaygroundLabRequestAction(this.actionDeps, input)
    }

    async declinePendingPlaygroundLabRequest(input: AssistantDeclinePendingPlaygroundLabRequestInput) {
        return declinePendingPlaygroundLabRequestAction(this.actionDeps, input)
    }

    dispose() {
        this.assistantTextDeltaBuffer.dispose()
        this.assistantActivityDeltaBuffer.dispose()
        this.realtimeVoiceRuntime.dispose()
        this.runtime.dispose()
        void this.persistence.flush()
    }

    private async initialize() {
        const loaded = await this.persistence.load()
        this.state = {
            snapshot: loaded.snapshot || createDefaultSnapshot(),
            events: loaded.events || []
        }
        this.state.snapshot.fleetByThreadId ||= {}
        for (const session of this.state.snapshot.sessions) {
            for (const thread of session.threads) {
                const fleet = await this.persistence.readFleet(thread.id)
                if (!fleet) continue
                this.fleetProjection.apply(thread.id, fleet)
                this.state.snapshot.fleetByThreadId[thread.id] = fleet
            }
        }
        void this.runtime.prewarm(false).catch((error) => {
            log.warn('[Assistant] Zyra runtime prewarm failed', error)
        })
    }

    private async recoverSelectedSessionTitle(): Promise<void> {
        const session = getSelectedSession(this.state.snapshot)
        const thread = getActiveThread(session)
        if (!session || !thread) return

        const firstUserMessage = await this.persistence.readFirstUserMessageText(session.id)
        if (!shouldGenerateSessionTitleForPrompt(session, firstUserMessage)) return
        const latestUserMessage = await this.persistence.readLatestUserMessageText(session.id)
        if (!latestUserMessage) return

        await queueGeneratedSessionTitle({
            sessionId: session.id,
            threadId: thread.id,
            messageText: latestUserMessage,
            seedTitle: session.title,
            cwd: this.getSessionRuntimeCwd(session, thread),
            preferredModel: thread.model || null,
            generateText: (titlePrompt, titleOptions) => this.runtime.generateText(titlePrompt, titleOptions),
            getSnapshot: () => this.state.snapshot,
            appendEvent: (type, occurredAt, payload, sessionId, threadId) => {
                this.appendEvent(type, occurredAt, payload, sessionId, threadId)
            }
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
        if (isAssistantToolLifecycleStartEvent(event)) {
            if (this.pendingBroadcastTimer) {
                clearTimeout(this.pendingBroadcastTimer)
                this.pendingBroadcastTimer = null
            }
            this.flushBroadcastEvents()
            return
        }
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
        if (event.type === 'turn.started') {
            this.persistence.setStreamingActive(event.threadId, true)
        }
        handleAssistantRuntimeEvent(event, {
            planBuffers: this.planBuffers,
            assistantTextBuffers: this.assistantTextBuffers,
            isAssistantTextSuppressed: (threadId, turnId) => Boolean(turnId && this.suppressedAssistantTextTurns.has(`${threadId}:${turnId}`)),
            findSessionByThreadId: (threadId) => findSessionByThreadId(this.state.snapshot, threadId),
            requireThread: (threadId) => requireThread(this.state.snapshot, threadId),
            findThreadRecord: (threadId) => findThreadRecord(this.state.snapshot, threadId),
            queueAssistantTextDelta: (entry) => this.assistantTextDeltaBuffer.queue(entry),
            flushAssistantTextDelta: (target) => this.assistantTextDeltaBuffer.flush(target),
            queueAssistantActivityDelta: (entry) => this.assistantActivityDeltaBuffer.queue(entry),
            flushAssistantActivityDelta: (target) => this.assistantActivityDeltaBuffer.flush(target),
            appendEvent: (type, occurredAt, payload, sessionId, threadId) => this.appendEvent(type, occurredAt, payload, sessionId, threadId),
            projectFleet: (threadId, snapshot) => {
                this.fleetProjection.apply(threadId, snapshot)
                this.persistence.projectFleet(threadId, snapshot)
            },
            updateLatestTurnAssistantMessage: (sessionId, threadId, assistantMessageId, occurredAt) => {
                updateLatestTurnAssistantMessage(this.state.snapshot, sessionId, threadId, assistantMessageId, occurredAt, (type, eventOccurredAt, payload, eventSessionId, eventThreadId) => {
                    this.appendEvent(type, eventOccurredAt, payload, eventSessionId, eventThreadId)
                })
            }
        })

        if (
            event.type === 'turn.completed'
            || (event.type === 'session.state.changed' && !['starting', 'running', 'waiting'].includes(event.payload.state))
        ) {
            this.persistence.setStreamingActive(event.threadId, false)
        }

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

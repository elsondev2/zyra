import { createHash } from 'node:crypto'
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
    AssistantActivity,
    AssistantMessage,
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
import { materializeCanonicalImage } from './canonical-media-cache'
import { createAssistantSessionRecord } from './service-records'
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
import { resolveCanonicalPresenceThreadState } from './service-canonical-presence'
import {
    type AssistantStateRecord,
    createAssistantThread,
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
    private canonicalImportPromise: Promise<void> | null = null
    private readonly canonicalHistoryState = new Map<string, {
        before: string | null
        hasOlder: boolean
        project: string
        key: string
        sessionId: string
        threadId: string
    }>()

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
        this.runtime.on('catalog.changed', () => {
            void this.queueCanonicalChatImport()
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
        const record = findThreadRecord(this.state.snapshot, threadId)
        if (!record) throw new Error(`Assistant thread not found: ${threadId}`)
        await this.ensureCanonicalHistoryLoaded(record.session, record.thread)
        return {
            success: true as const,
            detail: await this.persistence.readThreadDetail(record.thread.id)
        }
    }

    async getHistoryPage(input: AssistantGetHistoryPageInput) {
        await this.ensureReady()
        const record = findThreadRecord(this.state.snapshot, input.threadId)
        if (!record) throw new Error(`Assistant thread not found: ${input.threadId}`)
        await this.ensureCanonicalHistoryLoaded(record.session, record.thread)
        if (input.before && record.thread.providerThreadId) {
            await this.loadOlderCanonicalHistory(record.thread.providerThreadId)
        }
        return {
            success: true as const,
            page: await this.persistence.readHistoryPage({ ...input, threadId: record.thread.id })
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

    async respondApproval(input: { requestId: string; decision: 'acceptOnce' | 'acceptForSession' | 'decline' }) {
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
        await this.importCanonicalChats()
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

    private async queueCanonicalChatImport(): Promise<void> {
        await this.ensureReady()
        if (this.canonicalImportPromise) return this.canonicalImportPromise
        this.canonicalImportPromise = this.importCanonicalChats().finally(() => {
            this.canonicalImportPromise = null
        })
        return this.canonicalImportPromise
    }

    private async importCanonicalChats(): Promise<void> {
        let chats
        try {
            chats = await this.runtime.listCanonicalChats()
        } catch (error) {
            log.warn('[Assistant] Failed to read the canonical Zyra chat catalog', error)
            return
        }
        for (const chat of chats) {
            if (!chat.canonicalChatId) continue
            const existing = this.state.snapshot.sessions
                .flatMap((session) => session.threads.map((thread) => ({ session, thread })))
                .find(({ thread }) => thread.providerThreadId === chat.canonicalChatId)
            const createdAt = normalizeCatalogDate(chat.createdAt)
            const updatedAt = normalizeCatalogDate(chat.modifiedAt, createdAt)
            const messageCount = Math.max(0, Number(chat.displayMessageCount ?? chat.messageCount) || 0)
            const activityCount = Math.max(0, Number(chat.toolCallCount || 0) + Number(chat.errorCount || 0))
            if (existing) {
                const sessionPatch: Record<string, unknown> = {}
                if (chat.title && chat.title !== existing.session.title) sessionPatch['title'] = chat.title
                if (chat.project && chat.project !== existing.session.projectPath) sessionPatch['projectPath'] = chat.project
                if (chat.archived !== existing.session.archived) sessionPatch['archived'] = chat.archived
                if (Object.keys(sessionPatch).length > 0) {
                    sessionPatch['updatedAt'] = updatedAt
                    this.appendEvent('session.updated', updatedAt, {
                        sessionId: existing.session.id,
                        patch: sessionPatch
                    }, existing.session.id, existing.thread.id)
                }
                const nextCwd = chat.cwd || chat.project
                const nextMessageCount = Math.max(existing.thread.messageCount, messageCount)
                const nextActivityCount = Math.max(existing.thread.activityCount, activityCount)
                const presenceChanged = JSON.stringify(existing.thread.canonicalPresence || null) !== JSON.stringify(chat.presence || null)
                const nextThreadState = resolveCanonicalPresenceThreadState({
                    currentState: existing.thread.state,
                    previousPresence: existing.thread.canonicalPresence,
                    presence: chat.presence
                })
                if (
                    existing.thread.providerThreadId !== chat.canonicalChatId
                    || (nextCwd && existing.thread.cwd !== nextCwd)
                    || existing.thread.messageCount !== nextMessageCount
                    || existing.thread.activityCount !== nextActivityCount
                    || existing.thread.state !== nextThreadState
                    || presenceChanged
                ) {
                    this.appendEvent('thread.updated', updatedAt, {
                        threadId: existing.thread.id,
                        patch: {
                            providerThreadId: chat.canonicalChatId,
                            cwd: nextCwd,
                            messageCount: nextMessageCount,
                            activityCount: nextActivityCount,
                            canonicalPresence: chat.presence,
                            state: nextThreadState,
                            updatedAt
                        }
                    }, existing.session.id, existing.thread.id)
                }
                continue
            }
            const key = createHash('sha256').update(chat.canonicalChatId).digest('hex').slice(0, 24)
            const sessionId = `assistant-session:shared:${key}`
            const threadId = `assistant-thread:shared:${key}`
            if (this.state.snapshot.sessions.some((session) => session.id === sessionId)) continue
            const thread = createAssistantThread(createdAt, null, chat.cwd || chat.project)
            thread.id = threadId
            thread.providerThreadId = chat.canonicalChatId
            thread.messageCount = messageCount
            thread.activityCount = activityCount
            thread.canonicalPresence = chat.presence
            if (chat.presence?.state === 'running') thread.state = 'running'
            thread.updatedAt = updatedAt
            const session = createAssistantSessionRecord({
                sessionId,
                title: chat.title || 'Shared Zyra chat',
                projectPath: chat.project || chat.cwd || null,
                createdAt,
                thread
            })
            session.archived = chat.archived === true
            session.updatedAt = updatedAt
            this.appendEvent('session.created', createdAt, { session }, sessionId, threadId)
        }
    }

    private async ensureCanonicalHistoryLoaded(session: AssistantSession, thread: AssistantThread): Promise<void> {
        const canonicalChatId = thread.providerThreadId
        if (!canonicalChatId || this.canonicalHistoryState.has(canonicalChatId)) return
        const key = createHash('sha256').update(canonicalChatId).digest('hex').slice(0, 24)
        await this.loadCanonicalHistoryPage({
            canonicalChatId,
            project: session.projectPath || thread.cwd || process.cwd(),
            key,
            sessionId: session.id,
            threadId: thread.id,
            before: null,
            fallbackCreatedAt: thread.createdAt
        })
    }

    private async loadOlderCanonicalHistory(canonicalChatId: string): Promise<void> {
        const state = this.canonicalHistoryState.get(canonicalChatId)
        if (!state?.hasOlder || !state.before) return
        const record = findThreadRecord(this.state.snapshot, state.threadId)
        if (!record) return
        await this.loadCanonicalHistoryPage({
            canonicalChatId,
            project: state.project,
            key: state.key,
            sessionId: state.sessionId,
            threadId: state.threadId,
            before: state.before,
            fallbackCreatedAt: record.thread.createdAt
        })
    }

    private async loadCanonicalHistoryPage(input: {
        canonicalChatId: string
        project: string
        key: string
        sessionId: string
        threadId: string
        before: string | null
        fallbackCreatedAt: string
    }): Promise<void> {
        try {
            const history = await this.runtime.readCanonicalChatHistory(input.canonicalChatId, input.project, {
                before: input.before,
                limit: 500
            })
            if (!history) return
            const projection = projectCanonicalTimeline(
                history.entries || [],
                input.canonicalChatId,
                input.key,
                input.fallbackCreatedAt,
                Number(history.pageInfo?.startCursor || 0)
            )
            const record = findThreadRecord(this.state.snapshot, input.threadId)
            if (record && (projection.messages.length > 0 || projection.activities.length > 0)) {
                this.appendEvent('thread.updated', normalizeCatalogDate(history.chat.modifiedAt, record.thread.updatedAt), {
                    threadId: input.threadId,
                    patch: {
                        messages: projection.messages,
                        activities: projection.activities,
                        messageCount: Math.max(record.thread.messageCount, Number(history.chat.displayMessageCount || 0), projection.messages.length),
                        activityCount: Math.max(record.thread.activityCount, Number(history.chat.toolCallCount || 0) + Number(history.chat.errorCount || 0), projection.activities.length)
                    }
                }, input.sessionId, input.threadId)
            }
            this.canonicalHistoryState.set(input.canonicalChatId, {
                before: history.pageInfo?.oldestCursor || null,
                hasOlder: history.pageInfo?.hasOlder === true,
                project: input.project,
                key: input.key,
                sessionId: input.sessionId,
                threadId: input.threadId
            })
        } catch (error) {
            log.warn('[Assistant] Failed to import canonical chat history page', { canonicalChatId: input.canonicalChatId, error })
        }
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
            },
            onApplied: (nextTitle) => this.runtime.updateCanonicalChat(
                thread.providerThreadId || thread.id,
                { title: nextTitle }
            )
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

function normalizeCatalogDate(value: unknown, fallback = nowIso()): string {
    const date = new Date(typeof value === 'string' || typeof value === 'number' ? value : fallback)
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function projectCanonicalTimeline(
    entries: unknown[],
    canonicalChatId: string,
    key: string,
    fallbackCreatedAt: string,
    baseEntryIndex: number
): { messages: AssistantMessage[]; activities: AssistantActivity[] } {
    const messages: AssistantMessage[] = []
    const activities = new Map<string, AssistantActivity>()
    let activeTurnId: string | null = null
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entryValue = entries[entryIndex]
        if (!entryValue || typeof entryValue !== 'object') continue
        const entry = entryValue as Record<string, unknown>
        const timelineSequence = baseEntryIndex + entryIndex + 1
        const entryId = String(entry['id'] || `entry:${key}:${timelineSequence}`)
        const occurredAt = normalizeCatalogDate(entry['timestamp'], fallbackCreatedAt)
        if (entry['type'] !== 'message') {
            if (entry['type'] === 'compaction' || entry['type'] === 'branch_summary') {
                activities.set(`shared-activity:${entryId}`, {
                    id: `shared-activity:${entryId}`,
                    kind: 'context-compaction',
                    tone: 'info',
                    summary: entry['type'] === 'compaction' ? 'Context compacted' : 'Branch summary stored',
                    detail: String(entry['summary'] || '').trim() || undefined,
                    turnId: activeTurnId,
                    timelineSequence,
                    createdAt: occurredAt,
                    payload: { canonicalEntry: entry }
                })
            }
            continue
        }
        const message = asCanonicalRecord(entry['message'])
        if (!message) continue
        const role = String(message['role'] || '')
        const messageId = String(message['id'] || entryId)
        const messageOccurredAt = normalizeCatalogDate(message['timestamp'] || entry['timestamp'], occurredAt)
        const content = canonicalContentParts(message['content'])
        if (role === 'user') {
            activeTurnId = `shared-turn:${key}:${messageId}`
        } else if (role === 'assistant' && !activeTurnId) {
            activeTurnId = `shared-turn:${key}:${messageId}`
        }

        if (role === 'user' || role === 'assistant' || role === 'system') {
            const imageAttachments = content
                .map((part, partIndex) => part['type'] === 'image'
                    ? canonicalImageAttachment(canonicalChatId, messageId, partIndex, part)
                    : null)
                .filter((value): value is string => Boolean(value))
            const text = canonicalMessageText(content)
            const projectedText = role === 'user' && imageAttachments.length > 0
                ? serializeCanonicalAttachments(text, imageAttachments)
                : text
            if (projectedText) {
                messages.push({
                    id: messageId,
                    role,
                    text: projectedText,
                    turnId: role === 'system' ? null : activeTurnId,
                    streaming: false,
                    timelineSequence,
                    createdAt: messageOccurredAt,
                    updatedAt: messageOccurredAt
                })
            }
            if (role === 'assistant' && imageAttachments.length > 0) {
                activities.set(`shared-media:${messageId}`, {
                    id: `shared-media:${messageId}`,
                    kind: 'media',
                    tone: 'info',
                    summary: `${imageAttachments.length} image${imageAttachments.length === 1 ? '' : 's'}`,
                    turnId: activeTurnId,
                    timelineSequence,
                    createdAt: messageOccurredAt,
                    payload: { imageAttachments, canonicalMessageId: messageId }
                })
            }
        }

        const thinking = content
            .filter((part) => part['type'] === 'thinking')
            .map((part) => String(part['thinking'] || part['text'] || ''))
            .join('\n')
            .trim()
        if (thinking) {
            activities.set(`shared-thinking:${messageId}`, {
                id: `shared-thinking:${messageId}`,
                kind: 'reasoning',
                tone: 'info',
                summary: 'Reasoning',
                detail: thinking,
                turnId: activeTurnId,
                timelineSequence,
                createdAt: messageOccurredAt,
                payload: { canonicalMessageId: messageId }
            })
        }

        for (const part of content.filter((candidate) => candidate['type'] === 'toolCall')) {
            const toolCallId = String(part['id'] || `${messageId}:tool:${activities.size + 1}`)
            const toolName = String(part['name'] || 'tool')
            const activityId = `zyra-tool-${toolCallId}`
            activities.set(activityId, {
                id: activityId,
                kind: 'tool',
                tone: 'tool',
                summary: toolName,
                detail: canonicalToolDetail(part['arguments']),
                turnId: activeTurnId,
                timelineSequence,
                createdAt: messageOccurredAt,
                payload: {
                    status: 'running',
                    toolName,
                    args: part['arguments'],
                    toolCallId,
                    canonicalMessageId: messageId
                }
            })
        }

        if (role === 'toolResult') {
            const toolCallId = String(message['toolCallId'] || message['tool_call_id'] || messageId)
            const activityId = `zyra-tool-${toolCallId}`
            const existing = activities.get(activityId)
            const toolName = String(message['toolName'] || existing?.payload?.['toolName'] || 'tool')
            const imagePaths = content
                .map((part, partIndex) => part['type'] === 'image'
                    ? canonicalImageAttachment(canonicalChatId, messageId, partIndex, part)
                    : null)
                .filter((value): value is string => Boolean(value))
            const output = canonicalMessageText(content)
            const isError = message['isError'] === true
            activities.set(activityId, {
                id: activityId,
                kind: existing?.kind || 'tool',
                tone: isError ? 'error' : 'tool',
                summary: isError ? `${toolName} failed` : toolName,
                detail: existing?.detail,
                turnId: existing?.turnId || activeTurnId,
                timelineSequence: existing?.timelineSequence || timelineSequence,
                createdAt: existing?.createdAt || messageOccurredAt,
                payload: {
                    ...(existing?.payload || {}),
                    status: isError ? 'failed' : 'completed',
                    toolName,
                    toolCallId,
                    output,
                    result: content,
                    imageAttachments: imagePaths,
                    completedAt: messageOccurredAt,
                    canonicalMessageId: messageId
                }
            })
        }

        const errorMessage = String(message['errorMessage'] || '').trim()
        if (errorMessage || message['stopReason'] === 'error') {
            activities.set(`shared-error:${messageId}`, {
                id: `shared-error:${messageId}`,
                kind: 'error',
                tone: 'error',
                summary: 'Assistant error',
                detail: errorMessage || 'The assistant turn ended with an error.',
                turnId: activeTurnId,
                timelineSequence,
                createdAt: messageOccurredAt,
                payload: {
                    stopReason: message['stopReason'],
                    canonicalMessageId: messageId
                }
            })
        }
    }
    return { messages, activities: [...activities.values()] }
}

function canonicalContentParts(content: unknown): Record<string, unknown>[] {
    if (typeof content === 'string') return [{ type: 'text', text: content }]
    if (!Array.isArray(content)) return []
    return content.filter((part): part is Record<string, unknown> => Boolean(part && typeof part === 'object'))
}

function canonicalMessageText(content: unknown): string {
    return canonicalContentParts(content)
        .filter((part) => part['type'] === 'text')
        .map((part) => String(part['text'] || ''))
        .join('')
        .trim()
}

function canonicalImageAttachment(
    canonicalChatId: string,
    messageId: string,
    partIndex: number,
    part: Record<string, unknown>
): string | null {
    try {
        const image = materializeCanonicalImage(canonicalChatId, messageId, partIndex, part)
        if (!image) return null
        return [
            `${partIndex + 1}. Image ${partIndex + 1} [IMAGE]`,
            `path: ${image.path}`,
            `mime: ${image.mime}`,
            `size: ${image.size}`,
            'origin: Canonical Zyra transcript'
        ].join('\n')
    } catch (error) {
        log.warn('[Assistant] Failed to cache a canonical transcript image', { canonicalChatId, messageId, error })
        return null
    }
}

function serializeCanonicalAttachments(body: string, attachments: string[]): string {
    return `${body.trimEnd()}\n\nAttached files (${attachments.length}):\n${attachments.join('\n\n')}`.trimStart()
}

function canonicalToolDetail(value: unknown): string | undefined {
    if (value == null) return undefined
    try {
        const serialized = JSON.stringify(value)
        return serialized.length > 2_000 ? `${serialized.slice(0, 2_000)}…` : serialized
    } catch {
        return String(value)
    }
}

function asCanonicalRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

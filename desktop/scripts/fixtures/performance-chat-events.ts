import { AssistantStore } from '../../src/renderer/src/lib/assistant/assistant-store-core'
import { createAssistantLongHistoryFixture } from './assistant-long-history-fixture'
import { getAssistantThreadHydrationRevision } from '../../src/renderer/src/lib/assistant/assistant-thread-hydration-revision'

Object.assign(window, { runPerformanceBenchmark: async ({ sessions = 1000, retained = 12, updates = 200, samples = 5 }) => {
    const times: number[] = []
    const changedHistories: number[] = []
    const changedSessions: number[] = []
    let liveStore: any
    for (let sample = -1; sample < samples; sample++) {
        const snapshot = createAssistantLongHistoryFixture(20, 2048)
        const base = snapshot.sessions[0]!
        const histories: Record<string, any> = {}
        snapshot.sessions = Array.from({ length: sessions }, (_, i) => {
            const thread = { ...(i < retained ? structuredClone(base.threads[0]!) : base.threads[0]!), id: `thread-${i}` }
            if (i < retained) histories[thread.id] = { threadId: thread.id, messages: thread.messages, activities: thread.activities, proposedPlans: thread.proposedPlans, pageInfo: { oldestCursor: `older-${i}`, newestCursor: `newer-${i}`, hasOlder: true, hasNewer: false }, loadingOlder: false, loadingNewer: false, loadOlderError: null, loadNewerError: null, fullyLoaded: false, shellRevision: getAssistantThreadHydrationRevision(thread), lastUsedAt: Date.now() }
            if (i !== 0) { thread.messages = []; thread.activities = []; thread.proposedPlans = [] }
            return { ...base, id: `session-${i}`, activeThreadId: thread.id, threadIds: [thread.id], threads: [thread] }
        })
        snapshot.selectedSessionId = 'session-0'
        const store: any = new AssistantStore()
        store.state = { ...store.getState(), snapshot, historyByThreadId: histories, hydrated: true }
        const oldSessions = snapshot.sessions
        const start = performance.now()
        for (let update = 0; update < updates; update++) {
            store.pendingAssistantEvents = [{ sequence: update + 1, eventId: `event-${update}`, type: 'thread.message.assistant.delta', occurredAt: '2026-09-01T00:00:00.000Z', threadId: 'thread-0', sessionId: 'session-0', payload: { threadId: 'thread-0', messageId: 'fixture-assistant-20', delta: ' x' } }]
            store.flushPendingAssistantEvents()
        }
        const elapsed = performance.now() - start
        const state = store.getState()
        const message = state.snapshot.sessions.find((s: any) => s.id === 'session-0').threads[0].messages.find((m: any) => m.id === 'fixture-assistant-20')
        if (!message.text.endsWith(' x'.repeat(updates))) throw Error('Stream data lost')
        for (let i = 1; i < retained; i++) {
            const history = state.historyByThreadId[`thread-${i}`]
            if (history.pageInfo.oldestCursor !== `older-${i}` || history.messages.length !== 40 || history.activities.length !== 80) throw Error('Background history/cursor lost')
            if (state.snapshot.sessions.find((s: any) => s.id === `session-${i}`).threads[0].messages.length) throw Error('Idle history remained materialized')
        }
        if (sample >= 0) {
            times.push(elapsed)
            changedHistories.push(Object.keys(histories).filter(id => histories[id] !== state.historyByThreadId[id]).length)
            changedSessions.push(oldSessions.filter(s => s !== state.snapshot.sessions.find((next: any) => next.id === s.id)).length)
        }
        liveStore = store
        await new Promise(resolve => requestAnimationFrame(resolve))
    }
    // A cached idle chat still receives tool changes and remains a shell.
    const background = liveStore.getState().historyByThreadId['thread-1']
    const activity = { ...background.activities[0], id: 'new-background-tool', summary: 'Background changed' }
    liveStore.pendingAssistantEvents = [{ sequence: updates + 1, eventId: 'background', type: 'thread.activity.appended', occurredAt: '2026-09-01T00:00:00.000Z', threadId: 'thread-1', payload: { threadId: 'thread-1', activity } }]
    liveStore.flushPendingAssistantEvents()
    if (!liveStore.getState().historyByThreadId['thread-1'].activities.some((a: any) => a.id === activity.id)) throw Error('Background tool update lost')
    let sequence = updates + 1
    const emit = (type: string, threadId: string | undefined, payload: any) => {
        liveStore.pendingAssistantEvents = [{ sequence: ++sequence, eventId: `contract-${sequence}`, type, occurredAt: '2026-09-01T00:00:00.000Z', threadId, payload }]
        liveStore.flushPendingAssistantEvents()
    }
    // A detached window keeps its resident rows while accepting corrections.
    const detached = liveStore.state.historyByThreadId['thread-1']
    liveStore.state.historyByThreadId = { ...liveStore.state.historyByThreadId, 'thread-1': { ...detached, pageInfo: { ...detached.pageInfo, hasNewer: true } } }
    emit('thread.activity.appended', 'thread-1', { threadId: 'thread-1', activity: { ...activity, id: 'outside-window' } })
    if (liveStore.state.historyByThreadId['thread-1'].activities.some((a: any) => a.id === 'outside-window')) throw Error('Detached window widened')
    emit('thread.activity.appended', 'thread-1', { threadId: 'thread-1', activity: { ...activity, summary: 'Resident correction' } })
    if (!liveStore.state.historyByThreadId['thread-1'].activities.some((a: any) => a.id === activity.id && a.summary === 'Resident correction')) throw Error('Detached correction lost')
    // Canonical backfill retains the existing window until rehydration.
    const priorRows = liveStore.state.historyByThreadId['thread-1'].messages
    emit('thread.updated', 'thread-1', { threadId: 'thread-1', patch: { canonicalHistoryModifiedAt: '2026-09-02T00:00:00.000Z', messages: [{ ...priorRows[0], id: 'outside-backfill' }] } })
    if (liveStore.state.historyByThreadId['thread-1'].messages !== priorRows) throw Error('Canonical backfill replaced visible range')
    emit('thread.approval.updated', 'thread-2', { threadId: 'thread-2', approval: { requestId: 'approval', status: 'pending', createdAt: '2026-09-01T00:00:00.000Z' } })
    const permissionThread = liveStore.state.snapshot.sessions.find((s: any) => s.id === 'session-2').threads[0]
    if (!permissionThread.hasPendingApprovals || permissionThread.messages.length !== 40) throw Error('Approval lost cached rows')
    // Deletion must reveal a warm successor within the same store transaction.
    liveStore.hydrateSelectedSessionIfNeeded = async () => {}
    emit('session.deleted', undefined, { sessionId: 'session-0' })
    const successor = liveStore.state.snapshot.sessions.find((s: any) => s.id === liveStore.state.snapshot.selectedSessionId)
    if (!successor || successor.threads.find((t: any) => t.id === successor.activeThreadId)?.messages.length !== 40) throw Error('Warm successor opened empty')
    Object.assign(window, { benchmarkStore: liveStore })
    return { protocol: { sessions, retained, updates, samples, warmups: 1, implementation: 'actual AssistantStore event flush, synthetic bounded histories; no IPC' }, timesMs: times, changedHistories, changedSessions, correctness: { allStreamDeltas: true, backgroundTool: true, retainedCursors: true, idleShells: true, detachedCorrection: true, canonicalBackfill: true, permissionTransition: true, selectedDeletion: true } }
} })

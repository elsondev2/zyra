import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AssistantMessage, AssistantSessionTurnUsageEntry, AssistantThread } from '../src/shared/assistant/contracts'
import { reconcileAssistantUserTurnIds } from '../src/shared/assistant/turn-reconciliation'
import { preserveCanonicalUserReplayBoundaries, reconcileAssistantMessageReplays } from '../src/shared/assistant/message-reconciliation'
import { isAssistantTransportFailure } from '../src/shared/assistant/transport-failure'
import { isCanonicalPresenceActive, resolveCanonicalPresenceAttention } from '../src/main/assistant/service-canonical-presence'
import { ZyraAgentServerWorker } from '../src/main/assistant/zyra-agent-server-worker'
import { buildAssistantDiffTurns } from '../src/renderer/src/pages/assistant/assistant-diff-turns'
import { buildAssistantTurnUsageIndex } from '../src/renderer/src/pages/assistant/assistant-turn-usage-index'

const users = [
    { id: 'user-1', turnId: 'canonical-turn-1', createdAt: '2026-08-19T19:00:00.050Z' },
    { id: 'user-2', turnId: 'canonical-turn-2', createdAt: '2026-08-19T19:02:03.300Z' },
    { id: 'user-3', turnId: 'canonical-turn-3', createdAt: '2026-08-19T19:04:00.050Z' }
]
const persistedTurns = [
    { id: 'local-turn-1', requestedAt: '2026-08-19T19:00:00.000Z' },
    { id: 'local-turn-2', requestedAt: '2026-08-19T19:01:00.493Z' },
    { id: 'local-turn-3', requestedAt: '2026-08-19T19:04:00.000Z' }
]
const reconciled = reconcileAssistantUserTurnIds(users, persistedTurns)
assert.equal(reconciled.resolvedTurnIdByMessageId.get('user-2'), 'local-turn-2', 'a 63-second compaction delay remains one turn between reliable neighboring anchors')
assert.equal(reconciled.turnIdAliases.get('canonical-turn-2'), 'local-turn-2')
const partialHistoryReconciliation = reconcileAssistantUserTurnIds([
    { id: 'partial-user', turnId: 'provider-current', createdAt: '2026-08-19T20:00:00.000Z' }
], [
    { id: 'unloaded-old-turn', requestedAt: '2026-08-19T11:00:00.000Z' }
])
assert.equal(partialHistoryReconciliation.resolvedTurnIdByMessageId.get('partial-user'), 'provider-current', 'an unanchored partial-history tail cannot ordinal-match an unrelated persisted turn')

const delayedReplayMessages = reconcileAssistantMessageReplays([
    {
        id: 'assistant-message-optimistic-delayed',
        role: 'user',
        text: 'same delayed prompt',
        turnId: 'local-turn-2',
        createdAt: '2026-08-19T19:01:00.493Z',
        updatedAt: '2026-08-19T19:01:00.493Z'
    },
    {
        id: 'assistant-message-user-pi-message:user:delayed',
        role: 'user',
        text: 'same delayed prompt',
        turnId: 'canonical-turn-2',
        createdAt: '2026-08-19T19:02:03.300Z',
        updatedAt: '2026-08-19T19:02:03.300Z'
    }
] as AssistantMessage[])
assert.deepEqual(delayedReplayMessages.map((message) => message.id), ['assistant-message-user-pi-message:user:delayed'], 'delayed canonical replay replaces its optimistic user boundary')
const preservedBoundary = preserveCanonicalUserReplayBoundaries([
    {
        id: 'assistant-message-optimistic-delayed',
        role: 'user',
        text: 'same delayed prompt',
        turnId: 'local-turn-2',
        createdAt: '2026-08-19T19:01:00.493Z',
        updatedAt: '2026-08-19T19:01:00.493Z'
    }
] as AssistantMessage[], delayedReplayMessages)
assert.equal(preservedBoundary[0]?.createdAt, '2026-08-19T19:01:00.493Z', 'canonical replacement preserves the real send boundary so work stays below its user prompt')
const repeatedPromptMessages = reconcileAssistantMessageReplays([
    { id: 'assistant-message-user-pi-message:user:first', role: 'user', text: 'repeat me', turnId: 'first', createdAt: '2026-08-19T19:00:00.000Z', updatedAt: '2026-08-19T19:00:00.000Z' },
    { id: 'assistant-message-local-second', role: 'user', text: 'repeat me', turnId: 'second-local', createdAt: '2026-08-19T19:02:00.000Z', updatedAt: '2026-08-19T19:02:00.000Z' },
    { id: 'assistant-message-user-pi-message:user:second', role: 'user', text: 'repeat me', turnId: 'second', createdAt: '2026-08-19T19:02:30.000Z', updatedAt: '2026-08-19T19:02:30.000Z' }
] as AssistantMessage[])
assert.deepEqual(repeatedPromptMessages.map((message) => message.id), [
    'assistant-message-user-pi-message:user:first',
    'assistant-message-user-pi-message:user:second'
], 'legitimate repeated prompts remain separate canonical turns')

const usageEntry = {
    id: 'local-turn-2',
    sessionId: 'session',
    threadId: 'thread',
    model: 'openai-codex/gpt-test',
    state: 'completed',
    requestedAt: persistedTurns[1]!.requestedAt,
    startedAt: persistedTurns[1]!.requestedAt,
    completedAt: '2026-08-19T19:03:00.000Z',
    assistantMessageId: 'assistant-2',
    usage: null,
    updatedAt: '2026-08-19T19:03:00.000Z'
} satisfies AssistantSessionTurnUsageEntry
const usageMessages = users.map((user, index) => ({
    ...user,
    role: 'user' as const,
    text: index === 1 ? 'Delayed canonical prompt' : `Anchor ${index + 1}`,
    updatedAt: user.createdAt
})) satisfies AssistantMessage[]
const usageEntries = persistedTurns.map((turn, index) => index === 1 ? usageEntry : ({
    ...usageEntry,
    id: turn.id,
    requestedAt: turn.requestedAt,
    startedAt: turn.requestedAt,
    completedAt: new Date(Date.parse(turn.requestedAt) + 30_000).toISOString(),
    assistantMessageId: `assistant-${index + 1}`,
    updatedAt: new Date(Date.parse(turn.requestedAt) + 30_000).toISOString()
})) satisfies AssistantSessionTurnUsageEntry[]
const usageIndex = buildAssistantTurnUsageIndex(usageMessages, usageEntries)
assert.equal(usageIndex.get('canonical-turn-2'), usageEntry, 'timeline work summaries resolve canonical message ids to persisted start/completion timing')

const activityOnlyTurns = buildAssistantDiffTurns({
    messages: [],
    activities: [{
        id: 'edit-activity',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Edited file',
        detail: 'src/example.ts',
        turnId: 'canonical-turn-not-loaded-yet',
        createdAt: '2026-08-19T19:01:30.000Z',
        payload: {
            patch: ['--- a/src/example.ts', '+++ b/src/example.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n'),
            paths: ['src/example.ts']
        }
    }],
    turns: [{
        id: 'local-running-turn',
        requestedAt: '2026-08-19T19:01:00.000Z',
        startedAt: '2026-08-19T19:01:00.000Z',
        completedAt: null
    }]
})
assert.equal(activityOnlyTurns.length, 1, 'partial history cannot manufacture a separate File-change activity turn')
assert.equal(activityOnlyTurns[0]?.id, 'local-running-turn')
const currentProviderTurns = buildAssistantDiffTurns({
    messages: [{
        id: 'active-user',
        role: 'user',
        text: 'Active prompt',
        turnId: 'provider-active',
        createdAt: '2026-08-19T19:01:25.000Z',
        updatedAt: '2026-08-19T19:01:25.000Z'
    }],
    activities: [{
        id: 'active-edit',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Edited active file',
        turnId: 'provider-active',
        createdAt: '2026-08-19T19:01:30.000Z',
        payload: {
            patch: ['--- a/src/active.ts', '+++ b/src/active.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n'),
            paths: ['src/active.ts']
        }
    }],
    turns: [{
        id: 'persisted-previous',
        requestedAt: '2026-08-19T19:01:00.000Z',
        startedAt: '2026-08-19T19:01:00.000Z',
        completedAt: '2026-08-19T19:01:20.000Z'
    }]
})
assert.equal(currentProviderTurns.find((turn) => turn.id === 'provider-active')?.files.length, 1, 'an explicit active provider turn cannot be moved into the previous completed turn')
assert.equal(currentProviderTurns.find((turn) => turn.id === 'persisted-previous')?.files.length, 0)

assert.equal(resolveCanonicalPresenceAttention({
    currentHasPendingApprovals: false,
    currentHasPendingUserInputs: false,
    hasLocalPendingApproval: false,
    hasLocalPendingInput: false,
    presence: {
        state: 'running',
        activeTurnId: 'turn',
        clients: [],
        backgroundWorkActive: false,
        attention: 'user-input'
    }
}).hasPendingUserInputs, true, 'app-server user-input attention survives Desktop reattachment')
assert.equal(isCanonicalPresenceActive({ state: 'running' } as AssistantThread['canonicalPresence']), true)
assert.equal(isCanonicalPresenceActive({ state: 'background' } as AssistantThread['canonicalPresence']), true)
assert.equal(isCanonicalPresenceActive({ state: 'ready' } as AssistantThread['canonicalPresence']), false)
assert.equal(isAssistantTransportFailure(Object.assign(new Error('Zyra agent-server connection closed.'), { code: 'AGENT_SERVER_DISCONNECTED' })), true)
assert.equal(isAssistantTransportFailure(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), true)

const detachEvents: unknown[] = []
const worker = new ZyraAgentServerWorker({ detach() {} } as any, 'C:/workspace')
worker.bindSession('canonical-chat', { localThreadId: 'local-thread' })
worker.onEvent((event) => detachEvents.push(event))
worker.markRemoteDetached()
assert.deepEqual(detachEvents, [{ type: 'server.transport.detached', sessionKey: 'canonical-chat' }], 'socket loss is observable before another user action is required')

const runtimeSource = readFileSync(new URL('../src/main/assistant/zyra-pi-runtime.ts', import.meta.url), 'utf8')
const workerSource = readFileSync(new URL('../src/main/assistant/zyra-agent-server-worker.ts', import.meta.url), 'utf8')
const serviceSource = readFileSync(new URL('../src/main/assistant/service.ts', import.meta.url), 'utf8')
assert.match(runtimeSource, /context\.connected && context\.worker\.isAlive\(\)/, 'a stale connected flag cannot suppress reattachment')
assert.match(runtimeSource, /type === 'server\.transport\.detached'[\s\S]*reconnectDetachedSession\(context\)/, 'transport loss starts bounded automatic reattachment')
assert.match(workerSource, /agentServerOrphanedTurnId/, 'journal state that says running without a live server request is reported explicitly')
assert.match(workerSource, /listener\(\{ type: 'server\.transport\.detached'/, 'the worker reports socket loss to its owning runtime')
assert.match(runtimeSource, /agentServerOrphanedTurnId[\s\S]*outcome: 'interrupted'/, 'an unrecoverable app-server restart settles the orphan instead of leaving an empty running turn')
assert.match(serviceSource, /void this\.recoverActiveCanonicalRuntimes\(\)/, 'startup begins restoring active canonical workers without delaying the renderer shell')

console.log('Assistant canonical continuity: ok')

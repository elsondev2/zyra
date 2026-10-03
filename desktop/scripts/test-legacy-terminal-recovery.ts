import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recoverLegacyAssistantInterruptions, readLegacyInterruptedTurn } from '../src/main/assistant/legacy-terminal-recovery'
import { mergeCanonicalPresenceLatestTurn } from '../src/main/assistant/service-canonical-presence'
import { resolveAssistantThreadStatusPill } from '../src/renderer/src/pages/assistant/assistant-sessions-rail-utils'
import { getAssistantInterruptionLabel } from '../src/shared/assistant/interruption'
import type { AssistantSnapshot, AssistantThread } from '../src/shared/assistant/contracts'
import { agentEndOutcome } from '../../src/agent-server/agent-end-outcome.mjs'
import { createFleetSnapshot } from '../../src/agents/contracts.mjs'

const dir = mkdtempSync(join(tmpdir(), 'zyra-legacy-outcome-'))
const id = 'synthetic-canonical'
const turnId = 'synthetic-turn'
const date = '2026-10-02T00:00:00.000Z'
const turn = { id: turnId, state: 'error' as const, requestedAt: date, startedAt: date, completedAt: date, assistantMessageId: null, usage: null }
const thread = { id: 'local-thread', providerThreadId: id, state: 'ready', latestTurn: turn, canonicalPresence: { latestTurn: turn }, lastError: null, lastSeenCompletedTurnId: null, messages: [], activities: [], pendingApprovals: [], pendingUserInputs: [] } as unknown as AssistantThread
const file = join(dir, `${createHash('sha256').update(id).digest('hex')}.jsonl`)
function journal(events: any[]) {
    writeFileSync(file, events.map(event => JSON.stringify({ requestContext: { turnId }, event })).join('\n'))
}
function message(errorMessage: string) { return { type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage } } }
try {
    journal([message('This operation was aborted'), { type: 'agent_end', outcome: 'failed', errorMessage: 'This operation was aborted' }])
    assert.equal(readLegacyInterruptedTurn(dir, id, turnId), true)
    assert.equal(readLegacyInterruptedTurn(dir, id, 'another-turn'), false, 'Recovery cannot borrow another turn outcome')
    const snapshot = { sessions: [{ threads: [structuredClone(thread)] }] } as AssistantSnapshot
    recoverLegacyAssistantInterruptions(snapshot, dir)
    const recovered = snapshot.sessions[0]!.threads[0]!
    assert.equal(recovered.latestTurn?.state, 'interrupted')
    assert.equal(recovered.canonicalPresence?.latestTurn?.state, 'interrupted')
    assert.equal(resolveAssistantThreadStatusPill(recovered, false)?.label, 'Stopped')
    recovered.lastSeenCompletedTurnId = turnId
    assert.notEqual(resolveAssistantThreadStatusPill(recovered, false)?.label, 'Stopped', 'Opening records this stopped turn as seen')
    assert.equal(mergeCanonicalPresenceLatestTurn(recovered.latestTurn, thread.canonicalPresence)?.state, 'interrupted', 'Old canonical replay cannot restore Failed for the same stopped turn')
    assert.equal(mergeCanonicalPresenceLatestTurn(recovered.latestTurn, { ...thread.canonicalPresence!, latestTurn: { ...turn, id: 'new-turn' } })?.state, 'error', 'A different failing turn stays failed')
    recoverLegacyAssistantInterruptions(snapshot, dir)
    assert.equal(recovered.lastSeenCompletedTurnId, turnId, 'Repeated recovery preserves acknowledgement')
    journal([message('Provider rejected the request'), { type: 'agent_end', outcome: 'failed' }])
    assert.equal(readLegacyInterruptedTurn(dir, id, turnId), false)
    journal([message('This operation was aborted'), { type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } }, { type: 'agent_end', outcome: 'completed' }])
    assert.equal(readLegacyInterruptedTurn(dir, id, turnId), false, 'A successful retry supersedes the earlier aborted attempt')
    assert.equal(readLegacyInterruptedTurn(dir, 'missing', turnId), false)
    assert.equal(agentEndOutcome({ type: 'agent_end', outcome: 'failed', errorMessage: 'This operation was aborted' }).outcome, 'interrupted')
    assert.equal(agentEndOutcome({ messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'This operation was aborted' }] }).outcome, 'interrupted')
    assert.equal(agentEndOutcome({ outcome: 'failed', errorMessage: 'Provider rejected the request' }).outcome, 'failed')
    const fleet = createFleetSnapshot({ rootSessionId: 'synthetic', agents: { capped: { status: 'failed', error: { code: 'CHILD_MAX_TURNS' } }, failed: { status: 'failed', error: { code: 'CHILD_PROVIDER_ERROR' } } } })
    assert.equal(fleet.agents.capped.status, 'cancelled')
    assert.equal(fleet.agents.failed.status, 'failed')
    assert.equal(getAssistantInterruptionLabel({ kind: 'stopped', source: 'system', reason: 'turn-limit' }), 'Stopped · Turn limit reached')
    console.log('Legacy terminal recovery: passed (exact-turn journal, sidebar/read state, canonical replay, budget stop, genuine failure)')
} finally { rmSync(dir, { recursive: true, force: true }) }

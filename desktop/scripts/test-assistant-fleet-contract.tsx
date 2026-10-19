import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { renderToStaticMarkup as renderStatic } from 'react-dom/server'
import type { ReactNode } from 'react'
import { SettingsProvider } from '../src/renderer/src/lib/settings'
const renderToStaticMarkup = (children: ReactNode) => renderStatic(<SettingsProvider>{children}</SettingsProvider>)
import type { AgentRunState, AgentTranscriptPage, FleetSnapshot } from '../src/shared/assistant/contracts'
import { ASSISTANT_IPC, assertAssistantIpcContract } from '../src/shared/assistant/contracts'
import { applyAssistantDomainEvent, createDefaultAssistantSnapshot } from '../src/shared/assistant/projector'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { projectFleetSnapshot, readFleetSnapshot } from '../src/main/assistant/fleet-persistence'
import { FleetProjection } from '../src/main/assistant/fleet-projection'
import { AssistantAgentDetailPage } from '../src/renderer/src/pages/assistant/AssistantAgentDetailPage'
import { AssistantModelProviderIcon } from '../src/renderer/src/pages/assistant/AssistantModelProviderIcon'
import { ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE } from '../src/renderer/src/pages/assistant/AssistantAgentDirectory'
import { AssistantFleetWorkspace } from '../src/renderer/src/pages/assistant/AssistantFleetWorkspace'
import { AssistantWorkflowDetailPage } from '../src/renderer/src/pages/assistant/AssistantWorkflowDetailPage'
import { AssistantWorkflowDirectory } from '../src/renderer/src/pages/assistant/AssistantWorkflowDirectory'
import { createWorkflowReviewSeed } from '../src/renderer/src/reviews/agents-review-workflow-fixture'
import { resolveAssistantWorkflowIdentity } from '../src/renderer/src/pages/assistant/assistant-workflow-presentation'
import {
    mergeAssistantAgentTranscriptPages,
    mergeAssistantAgentTranscriptRefresh,
    projectAssistantAgentTranscriptActivities,
    projectAssistantAgentTranscriptMessages,
    resolveAssistantAgentIdentity,
    resolveAssistantAgentLiveActivity
} from '../src/renderer/src/pages/assistant/assistant-agent-presentation'

const serviceSource = await readFile(new URL('../src/main/assistant/service.ts', import.meta.url), 'utf8')
const fleetOperationSource = serviceSource.split("async runFleetOperation")[1]?.split('async getAccountOverview')[0] || ''
assert.ok(fleetOperationSource.indexOf('await this.runtime.connect') < fleetOperationSource.indexOf('await this.runtime.requestFleetOperation'), 'fleet controls attach the canonical runtime before stop/retry/resume operations')
const fleetRefreshSource = serviceSource.split('async getFleetSnapshot')[1]?.split('async runFleetOperation')[0] || ''
assert.match(fleetRefreshSource, /shouldApplyAssistantFleetSnapshot\(persisted, live\)/, 'explicit fleet refresh cannot place an equal-sequence empty snapshot into the main read model')

// Static markup checks need text metrics now that agent chat reuses the real
// collapsible prompt. This deterministic canvas is not a geometry assertion.
Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {
    getContext() { return { font: '', measureText(text: string) { return { width: text.length * 7 } } } }
} })
const now = new Date().toISOString()
const fleet: FleetSnapshot = {
    version: 1,
    fleetId: 'fleet-1',
    rootSessionId: 'root-1',
    rootThreadId: 'thread-1',
    lastAppliedSequence: 9,
    updatedAt: now,
    agents: {
        'agent-1': {
            agentRunId: 'agent-1', rootSessionId: 'root-1', parentAgentRunId: null, workflowRunId: 'workflow-1', workflowPhaseId: 'review', workflowCallId: 'call-1',
            agentId: 'code-reviewer', definitionName: 'code-reviewer', label: 'code-reviewer', goal: 'Review src/auth.ts', status: 'running', depth: 1, contextFork: false,
            attempt: 1, maxAttempts: 1, isolation: 'shared-read', requestedModel: 'terra', selectedModel: 'openai-codex/gpt-5.6-terra', modelRoute: null, effort: 'high',
            requestedTools: ['read'], grantedTools: ['read'], deniedTools: [], deniedCapabilities: [], permissionMode: 'read-only', readScope: ['.'], writeScope: [], sessionFile: null, providerSessionId: null, activity: { kind: 'tool', summary: 'Reading auth', updatedAt: now },
            worktree: null, usage: { totalTokens: 1200 }, result: null, error: null, createdAt: now, queuedAt: now, startedAt: now, completedAt: null, elapsedMs: 1200, version: 1
        }
    },
    workflows: {
        'workflow-1': {
            workflowRunId: 'workflow-1', rootSessionId: 'root-1', definitionName: 'review-changes', definitionPath: 'workflows/review-changes.mjs', definitionHash: 'hash', status: 'running', args: {},
            projected: { requests: 1, totalTokens: 25000, cost: 0 }, budget: { maxCalls: 10, maxRequests: 10, maxTokens: 100000, maxCostUsd: 2, maxConcurrency: 2 },
            usage: { totalTokens: 1200, requests: 1, cost: 0.1 }, phases: { review: { phaseId: 'review', name: 'review', status: 'running', startedAt: now, completedAt: null, error: null } },
            calls: { 'call-1': { callId: 'call-1', phaseId: 'review', agentRunId: 'agent-1', agentName: 'code-reviewer', status: 'running', cached: false, result: null, error: null, createdAt: now, startedAt: now, completedAt: null } },
            agentRunIds: ['agent-1'], cacheHits: 0, warnings: [], approvedAt: now, createdAt: now, startedAt: now, completedAt: null, error: null, version: 1
        }
    },
    relationships: [{ parentAgentRunId: null, childAgentRunId: 'agent-1', workflowRunId: 'workflow-1', workflowPhaseId: 'review' }],
    artifacts: [{ artifactId: 'artifact-1', agentRunId: 'agent-1', workflowRunId: 'workflow-1', kind: 'diff', path: 'src/auth.ts', createdAt: now }],
    eventWindow: [{ type: 'agent.activity' }],
    usage: { totalTokens: 1200, requests: 1, cost: 0.1 },
    truncated: { agents: false, workflows: false, relationships: false, artifacts: false, events: false }
}

assertAssistantIpcContract()
assert.equal(ASSISTANT_IPC.agentAction, 'devscope:assistant:agentAction')
assert.equal(ASSISTANT_IPC.workflowAction, 'devscope:assistant:workflowAction')
assert.equal(ASSISTANT_IPC.getFleetSnapshot, 'devscope:assistant:getFleetSnapshot')

const projection = new FleetProjection()
assert.equal(projection.apply('thread-1', fleet).agents['agent-1']?.label, 'code-reviewer')
assert.equal(projection.get('thread-1')?.workflows['workflow-1']?.definitionName, 'review-changes')
const staleEmptyFleet: FleetSnapshot = {
    ...fleet,
    lastAppliedSequence: 2,
    updatedAt: new Date(Date.parse(now) - 60_000).toISOString(),
    agents: {},
    workflows: {},
    relationships: [],
    artifacts: [],
    eventWindow: []
}
assert.equal(projection.apply('thread-1', staleEmptyFleet).lastAppliedSequence, 9, 'an older empty attach snapshot cannot erase projected agents')
assert.equal(Object.keys(projection.get('thread-1')?.agents || {}).length, 1)
const equalSequenceEmptyFleet = { ...staleEmptyFleet, lastAppliedSequence: 9, updatedAt: new Date(Date.parse(now) + 60_000).toISOString() }
assert.equal(Object.keys(projection.apply('thread-1', equalSequenceEmptyFleet).agents).length, 1, 'an equal-sequence empty snapshot cannot replace a fuller projection')

const domainSnapshot = applyAssistantDomainEvent(createDefaultAssistantSnapshot(), {
    sequence: 1,
    eventId: 'event-1',
    type: 'fleet.snapshot.updated',
    occurredAt: now,
    threadId: 'thread-1',
    payload: { threadId: 'thread-1', snapshot: fleet }
})
assert.equal(domainSnapshot.fleetByThreadId['thread-1']?.lastAppliedSequence, 9)

const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
db.run("INSERT INTO assistant_sessions (id, title, mode, archived, created_at, updated_at) VALUES ('session-existing', 'Existing', 'work', 0, ?, ?)", [now, now])
projectFleetSnapshot(db, 'thread-1', fleet)
assert.equal(readFleetSnapshot(db, 'thread-1')?.agents['agent-1']?.status, 'running')
projectFleetSnapshot(db, 'thread-1', staleEmptyFleet)
assert.equal(readFleetSnapshot(db, 'thread-1')?.lastAppliedSequence, 9, 'SQLite rejects a regressive empty fleet snapshot')
projectFleetSnapshot(db, 'thread-1', equalSequenceEmptyFleet)
assert.equal(Object.keys(readFleetSnapshot(db, 'thread-1')?.agents || {}).length, 1, 'SQLite rejects an equal-sequence empty fleet snapshot')
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_agent_runs WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_sessions WHERE id = 'session-existing'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_agent_runs WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_workflow_calls WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_agent_relationships WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)

globalThis.window = { devscope: { assistant: { agentAction: async () => ({ success: true, result: {} }) } } } as unknown as Window & typeof globalThis
const agentRun = fleet.agents['agent-1']
assert.ok(agentRun)
const identity = resolveAssistantAgentIdentity(agentRun)
assert.deepEqual(resolveAssistantAgentIdentity(agentRun), identity, 'agent identity remains deterministic for the stable run id')
assert.equal(identity.roleTitle, 'Code Reviewer')
assert.doesNotMatch(identity.name, /\s/, 'agent identities use one evocative name rather than a generated first and surname')

const directoryMarkup = renderToStaticMarkup(<AssistantFleetWorkspace threadId="thread-1" snapshot={fleet} selectedAgentRunId={null} selectedWorkflowRunId={null} onSelectAgent={() => {}} onSelectWorkflow={() => {}} />)
assert.doesNotMatch(directoryMarkup, /Agent directory/)
assert.match(directoryMarkup, /Delegated work/)
assert.match(directoryMarkup, new RegExp(identity.name))
assert.match(directoryMarkup, /Code Reviewer/)
assert.match(directoryMarkup, /data-dicebear-style="bottts-neutral"/)
assert.match(directoryMarkup, /aria-label="openai-codex model provider"/, 'each directory model shows its provider mark')
assert.match(directoryMarkup, /title="Reasoning effort">high/, 'effort remains next to the model')
for (const [model, provider] of [['openai-codex/gpt-test', 'openai-codex'], ['anthropic/claude-test', 'anthropic'], ['google/gemini-test', 'google']]) {
    assert.match(renderToStaticMarkup(<AssistantModelProviderIcon model={model!} />), new RegExp(`aria-label="${provider} model provider"`))
}
assert.equal(renderStatic(<AssistantModelProviderIcon model="unqualified-model" />), '', 'unknown providers are not guessed from a model nickname')
assert.match(directoryMarkup, /data-testid="assistant-agent-row"/)
assert.match(directoryMarkup, /aria-label="Search agents"/)
assert.match(directoryMarkup, /Needs attention/)
assert.match(directoryMarkup, /aria-haspopup="menu"/, 'the title opens the Agents/Workflows chooser')
assert.doesNotMatch(directoryMarkup, /<h2|Attention first, then active/, 'the toolbar does not stack a redundant heading above the list')
assert.doesNotMatch(directoryMarkup, /data-card-width|data-card-height/, 'agents use compact fluid rows, not fixed-size cards')
assert.match(directoryMarkup, /data-testid="assistant-agent-directory-footer"/)
assert.doesNotMatch(directoryMarkup, /Run details/, 'the directory does not dump selected agent details below its cards')

for (const snapshot of [fleet, { ...fleet, workflows: {} }]) {
    const workflowWorkspaceMarkup = renderToStaticMarkup(<AssistantFleetWorkspace threadId="thread-1" snapshot={snapshot}
        selectedAgentRunId={null} selectedWorkflowRunId={null} onSelectAgent={() => {}} onSelectWorkflow={() => {}}
        stateCapsule={{ version: 1, workspace: 'agents', section: 'workflows' }} />)
    const toolbars = workflowWorkspaceMarkup.match(/<header\b[^>]*>[\s\S]*?<\/header>/g) || []
    assert.equal(toolbars.length, 1, 'Workflows has one toolbar, including when empty, not a workspace heading above a second directory heading')
    assert.match(toolbars[0]!, /aria-label="Delegated work view"/, 'section picker belongs in the directory toolbar')
    assert.match(toolbars[0]!, /aria-label="Search workflows"/, 'search shares the section picker row')
    assert.match(toolbars[0]!, /aria-label="Filter workflows"/, 'filter shares the section picker row')
    const searchTrigger = toolbars[0]!.match(/<button\b[^>]*aria-label="Search workflows"[^>]*>/)
    assert.ok(searchTrigger, 'workflow search exposes its expanding trigger')
    assert.doesNotMatch(searchTrigger[0], /\bdisabled/, 'workspace wires the actual search trigger; its collapsed input is intentionally inactive')
    assert.doesNotMatch(toolbars[0]!, /aria-label="Filter workflows"[^>]*disabled/, 'workspace wires the actual filter control')
}

const markup = renderToStaticMarkup(<AssistantFleetWorkspace threadId="thread-1" snapshot={fleet} selectedAgentRunId="agent-1" selectedWorkflowRunId={null} onSelectAgent={() => {}} onSelectWorkflow={() => {}} />)
assert.match(markup, /Back to agent directory/)
assert.match(markup, /lucide-chevron-left/)
assert.match(markup, /Open run details/)
assert.match(markup, /Run details/)
assert.match(markup, /data-dicebear-style="bottts-neutral"/, 'the compact header keeps the neutral agent avatar visible')
assert.match(markup, /lucide-sliders-horizontal/)
assert.doesNotMatch(markup, /scale(?:\(|%28)9\.2(?:\)|%29)/, 'agent avatars must not be zoomed into cropped color blocks')
assert.doesNotMatch(markup, /Conversation usage/, 'agent chat has no repeated token receipt')
assert.doesNotMatch(markup, /openai-codex\/gpt-5\.6-terra/, 'model metadata belongs in run details, not the chat header')
assert.match(markup, /Sent by main agent/)
assert.doesNotMatch(markup, /<details\b/, 'run details are not an inline disclosure')
assert.doesNotMatch(markup, /data-testid="assistant-agent-directory"/, 'agent details replace the directory as a dedicated page')

const workflowTargetMarkup = renderToStaticMarkup(<AssistantFleetWorkspace threadId="thread-1" snapshot={fleet} selectedAgentRunId={null} selectedWorkflowRunId="workflow-1" onSelectAgent={() => {}} onSelectWorkflow={() => {}} stateCapsule={{ version: 1, workspace: 'agents', section: 'agents' }} />)
assert.match(workflowTargetMarkup, /data-testid="assistant-workflow-detail-page"/, 'an explicit workflow target selects its detail section on the first render, including after agent-section restoration')
assert.match(workflowTargetMarkup, /data-workflow-run-id="workflow-1"/, 'the requested workflow remains the exact selected target')

assert.equal(ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE, 30)
const manyAgents = Object.fromEntries(Array.from({ length: 68 }, (_, index) => {
    const agentRunId = `agent-${index + 1}`
    return [agentRunId, {
        ...agentRun,
        agentRunId,
        label: `agent ${index + 1}`,
        createdAt: new Date(Date.parse(now) - index * 1000).toISOString()
    }]
}))
const manyAgentsMarkup = renderToStaticMarkup(<AssistantFleetWorkspace threadId="thread-1" snapshot={{ ...fleet, agents: manyAgents }} selectedAgentRunId={null} selectedWorkflowRunId={null} onSelectAgent={() => {}} onSelectWorkflow={() => {}} />)
assert.equal((manyAgentsMarkup.match(/data-testid="assistant-agent-row"/g) || []).length, 30, 'large directories mount only one bounded page of compact rows')
assert.match(manyAgentsMarkup, /1–30 of 68/)
assert.match(manyAgentsMarkup, /1 \/ 3/)

const workflowRun = fleet.workflows['workflow-1']
assert.ok(workflowRun)
const workflowIdentity = resolveAssistantWorkflowIdentity(workflowRun)
let alternateWorkflowRun = { ...workflowRun, workflowRunId: 'workflow-alternate-1', createdAt: new Date(Date.parse(now) - 1000).toISOString() }
for (let index = 2; resolveAssistantWorkflowIdentity(alternateWorkflowRun).avatarStyle === workflowIdentity.avatarStyle; index += 1) {
    alternateWorkflowRun = { ...alternateWorkflowRun, workflowRunId: `workflow-alternate-${index}` }
}
const workflowDirectoryMarkup = renderToStaticMarkup(
    <AssistantWorkflowDirectory
        workflows={[workflowRun, alternateWorkflowRun]}
        page={0}
        onPageChange={() => {}}
        onOpenWorkflow={() => {}}
    />
)
assert.match(workflowDirectoryMarkup, /Workflow runs/)
assert.equal((workflowDirectoryMarkup.match(/data-testid="assistant-workflow-row"/g) || []).length, 2, 'workflow directory renders compact selectable rows')
assert.doesNotMatch(workflowDirectoryMarkup, /data-card-width|data-card-height/, 'workflow rows are fluid, not fixed-size cards')
assert.match(workflowDirectoryMarkup, /data-dicebear-style="loops"/)
assert.match(workflowDirectoryMarkup, /data-dicebear-style="waves"/)
assert.match(workflowDirectoryMarkup, /Phase progress|phases/)
assert.doesNotMatch(workflowDirectoryMarkup, />Pause<|>Stop</, 'a read-only workflow preview cannot expose disconnected controls')
assert.doesNotMatch(workflowDirectoryMarkup, /scale(?:\(|%28)9\.4(?:\)|%29)/, 'workflow avatars use normal framing too')

const workflowDetailMarkup = renderToStaticMarkup(
    <AssistantWorkflowDetailPage
        run={workflowRun}
        agents={fleet.agents}
        onBack={() => {}}
        onOpenAgent={() => {}}
    />
)
assert.match(workflowDetailMarkup, /Back to workflow directory/)
assert.match(workflowDetailMarkup, /aria-label="Workflow execution"/)
assert.match(workflowDetailMarkup, /workflow-execution--timeline/, 'execution uses an ordered timeline rather than a node canvas')
assert.match(workflowDetailMarkup, /class="workflow-execution__calls"/, 'agent steps remain grouped under their owning stage')
assert.doesNotMatch(workflowDetailMarkup, /data-follows-previous|--workflow-stage-count/, 'the timeline has no inter-stage arrow layout')
assert.match(workflowDetailMarkup, /aria-label="Open [^"]+agent transcript"/, 'recorded workflow agents link to their conversation')
assert.match(workflowDetailMarkup, /aria-haspopup="dialog"[^>]*>[^<]*<svg[\s\S]*Details/, 'secondary metadata has a real Details control')
assert.doesNotMatch(workflowDetailMarkup, /Usage &amp; budget|Concurrency|Cost limit|phases complete/, 'telemetry stays in Details')
assert.match(workflowDetailMarkup, /aria-label="openai-codex model provider"/, 'each step shows its model provider')
assert.match(workflowDetailMarkup, /gpt-5\.6-terra/, 'the actual model name is visible, not just a provider logo')
assert.match(workflowDetailMarkup, new RegExp(identity.name))
assert.match(workflowDetailMarkup, /Reading auth/)
assert.doesNotMatch(workflowDetailMarkup, /definitionHash|workflowCallId|stableKey/)
const executionSeed = createWorkflowReviewSeed()
const failedExecution = Object.values(executionSeed.snapshot.workflows).find(run => run.status === 'failed' && run.agentRunIds.length === 5)!
const executionMarkup = renderToStaticMarkup(<AssistantWorkflowDetailPage run={failedExecution} agents={executionSeed.snapshot.agents} onBack={() => {}} onOpenAgent={() => {}} />)
assert.equal((executionMarkup.match(/data-call-id=/g) || []).length, 5, 'every linked call is a real selectable execution row')
assert.match(executionMarkup, /agents in parallel/, 'overlapping investigations appear together instead of being flattened into sequential rows')
assert.equal(executionMarkup.split(`>${failedExecution.error!.message}</`).length - 1, 1, 'visible failure belongs at its node, not repeated in the phase and workflow footer; its full-text title is not another visible error')
assert.doesNotMatch(executionMarkup, /tokens|Usage &amp; budget|Concurrency|Phase progress/, 'model identity is visible without bringing back budget clutter')
for (const provider of ['openai-codex', 'anthropic', 'google']) assert.match(executionMarkup, new RegExp(`aria-label="${provider} model provider"`))
assert.match(executionMarkup, />Planned</, 'unstarted steps do not pretend their model has already been used')
const routedModelMarkup = renderToStaticMarkup(<AssistantWorkflowDetailPage run={{ ...workflowRun, calls: { 'call-1': { ...workflowRun.calls['call-1']!, selectedModel: 'anthropic/claude-route-test' } } }} agents={fleet.agents} onBack={() => {}} onOpenAgent={() => {}} />)
assert.match(routedModelMarkup, /claude-route-test/)
assert.match(routedModelMarkup, /aria-label="anthropic model provider"/, 'the call-selected model takes precedence over the linked agent fallback')
assert.doesNotMatch(routedModelMarkup, /openai-codex model provider|gpt-5\.6-terra/)
const unknownModelMarkup = renderToStaticMarkup(<AssistantWorkflowDetailPage run={workflowRun} agents={{}} onBack={() => {}} onOpenAgent={() => {}} />)
assert.match(unknownModelMarkup, /Model not recorded/)
assert.doesNotMatch(unknownModelMarkup, /model provider/, 'missing model records cannot invent a provider')
const requestedModelMarkup = renderToStaticMarkup(<AssistantWorkflowDetailPage run={{ ...workflowRun, calls: { 'call-1': { ...workflowRun.calls['call-1']!, requestedModel: 'google/gemini-requested', selectedModel: null } } }} agents={{}} onBack={() => {}} onOpenAgent={() => {}} />)
assert.match(requestedModelMarkup, /gemini-requested/)
assert.match(requestedModelMarkup, />Requested</, 'a requested-only model cannot be presented as the model actually used')

const transcriptPage: AgentTranscriptPage = {
    entries: [
        { index: 0, type: 'message', timestamp: now, message: { role: 'user', content: [{ type: 'text', text: 'Root instruction for the child.' }] } },
        { index: 1, type: 'message', timestamp: now, message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'private reasoning' }, { type: 'toolCall', id: 'read-auth', name: 'read', arguments: { path: 'src/auth.ts' } }] } },
        { index: 2, type: 'message', timestamp: now, message: { role: 'toolResult', toolCallId: 'read-auth', isError: false, content: [{ type: 'text', text: 'tool output should stay hidden' }] } },
        { index: 3, type: 'message', timestamp: now, message: { role: 'assistant', content: [{ type: 'text', text: 'Agent **answer**.' }] } }
    ],
    nextBefore: null,
    totalEntries: 4,
    bytes: 400,
    truncatedEntries: 0,
    hydrated: 4
}
assert.deepEqual(
    projectAssistantAgentTranscriptMessages(transcriptPage.entries).map(({ role, text }) => ({ role, text })),
    [
        { role: 'user', text: 'Root instruction for the child.' },
        { role: 'assistant', text: 'Agent **answer**.' }
    ],
    'transcript projection exposes root and agent chat messages without thoughts or tool results'
)
assert.deepEqual(
    projectAssistantAgentTranscriptActivities(transcriptPage.entries).map(({ summary, detail, status }) => ({ summary, detail, status })),
    [{ summary: 'Used read', detail: 'src/auth.ts', status: 'completed' }],
    'agent transcript projection exposes bounded tool activity without raw results or private reasoning'
)
assert.deepEqual(resolveAssistantAgentLiveActivity({ type: 'tool_execution_start', toolName: 'read', args: { path: 'src/auth.ts' }, occurredAt: now }), {
    summary: 'Using read', detail: 'src/auth.ts', status: 'running', updatedAt: now
})
const mergedTranscript = mergeAssistantAgentTranscriptPages(
    { ...transcriptPage, entries: transcriptPage.entries.slice(3), hydrated: 1 },
    { ...transcriptPage, entries: transcriptPage.entries.slice(0, 3), nextBefore: null, hydrated: 3 }
)
assert.deepEqual(mergedTranscript.entries.map((entry) => entry.index), [0, 1, 2, 3])
const refreshedTranscript = mergeAssistantAgentTranscriptRefresh(
    { ...transcriptPage, entries: transcriptPage.entries.slice(0, 3), totalEntries: 3, hydrated: 3 },
    transcriptPage
)
assert.deepEqual(refreshedTranscript.entries.map((entry) => entry.index), [0, 1, 2, 3])
assert.equal(refreshedTranscript.totalEntries, 4)

const transcriptMarkup = renderToStaticMarkup(
    <AssistantAgentDetailPage
        run={{ ...agentRun, sessionFile: 'child-session.jsonl' }}
        transcript={transcriptPage}
        loading={false}
        error={null}
        onBack={() => {}}
        onLoadOlder={() => {}}
        onRetry={() => {}}
    />
)
assert.match(transcriptMarkup, /data-agent-transcript-role="user"/)
assert.match(transcriptMarkup, /data-assistant-message-surface="minimal"/, 'child chat reuses the root chat message surface and display preference')
assert.match(transcriptMarkup, /Sent by main agent/)
assert.equal((transcriptMarkup.match(/data-dicebear-style/g) || []).length, 1, 'only the header has an avatar; child replies reuse undecorated main chat messages')
assert.match(transcriptMarkup, /Root instruction for the child/)
assert.match(transcriptMarkup, /data-agent-transcript-role="assistant"/)
assert.match(transcriptMarkup, /Agent <strong[^>]*>answer<\/strong>/)
assert.doesNotMatch(transcriptMarkup, /Tool Calls/, 'agent transcripts use the same label-free typed Action rows as the root timeline')
assert.match(transcriptMarkup, /data-assistant-typed-action="agent-tool:read-auth"/)
assert.match(transcriptMarkup, /Reading auth\.ts/)
assert.match(transcriptMarkup, /src\/auth\.ts/)
assert.doesNotMatch(transcriptMarkup, /private reasoning/)
assert.doesNotMatch(transcriptMarkup, /tool output should stay hidden/, 'captured evidence stays out of collapsed transcript markup')
assert.doesNotMatch(transcriptMarkup, /No final response was written/)
assert.doesNotMatch(transcriptMarkup, /<(?:input|textarea)\b/, 'the agent transcript page remains read-only without a composer')
assert.doesNotMatch(transcriptMarkup, /Delegated task/, 'the summary task block stays hidden when the root transcript already shows the delegated request')

const headPageMarkup = renderToStaticMarkup(<AssistantAgentDetailPage run={{ ...agentRun, status: 'completed', result: { text: 'Future final response.' } }}
    transcript={{ ...transcriptPage, entries: transcriptPage.entries.slice(0, 1), nextAfter: 0, totalEntries: 90 }} loading={false} error={null}
    onBack={() => {}} onLoadOlder={() => {}} onLoadNewer={() => {}} onRetry={() => {}} />)
assert.match(headPageMarkup, /Load next messages/)
assert.doesNotMatch(headPageMarkup, /Load older messages|No final response was written|Future final response/, 'opening at the actual beginning neither resurrects older history nor jumps across unloaded messages')
const taskFallbackMarkup = renderToStaticMarkup(
    <AssistantAgentDetailPage
        run={{ ...agentRun, sessionFile: null }}
        transcript={null}
        loading={false}
        error={null}
        onBack={() => {}}
        onLoadOlder={() => {}}
        onRetry={() => {}}
    />
)
assert.match(taskFallbackMarkup, /Delegated task/, 'the task summary remains available before a root transcript exists')

const multiBatchTranscriptEntries: AgentTranscriptPage['entries'] = [
    ...transcriptPage.entries.slice(0, 3),
    { index: 3, type: 'message', timestamp: now, message: { role: 'assistant', content: [{ type: 'toolCall', id: 'search-auth', name: 'rg', arguments: { pattern: 'authorize', path: 'src' } }] } },
    { index: 4, type: 'message', timestamp: now, message: { role: 'toolResult', toolCallId: 'search-auth', isError: false, content: [{ type: 'text', text: 'src/auth.ts:12' }] } },
    { ...transcriptPage.entries[3]!, index: 5 }
]
const multiBatchMarkup = renderToStaticMarkup(
    <AssistantAgentDetailPage
        run={{ ...agentRun, sessionFile: 'multi-batch-child-session.jsonl' }}
        transcript={{ ...transcriptPage, entries: multiBatchTranscriptEntries, totalEntries: 6, hydrated: 6 }}
        loading={false}
        error={null}
        onBack={() => {}}
        onLoadOlder={() => {}}
        onRetry={() => {}}
    />
)
assert.doesNotMatch(multiBatchMarkup, />Tool Calls(?: \(\d+\))?</, 'separate child Action batches stay label-free')
assert.equal((multiBatchMarkup.match(/data-assistant-action-batch="true"/g) || []).length, 1, 'child tools share the real collapsed Action batch')
assert.equal((multiBatchMarkup.match(/data-assistant-typed-action=/g) || []).length, 0, 'collapsed child batches defer their tool rows; the real renderer verifies both rows after expansion')
assert.doesNotMatch(multiBatchMarkup, /Conversation usage| tokens/, 'chat does not add a token footer')

const missingFinalMarkup = renderToStaticMarkup(
    <AssistantAgentDetailPage
        run={{ ...agentRun, status: 'completed', sessionFile: 'empty-final-child-session.jsonl' }}
        transcript={{ ...transcriptPage, entries: transcriptPage.entries.slice(0, 1), totalEntries: 1, hydrated: 1 }}
        loading={false}
        error={null}
        onBack={() => {}}
        onLoadOlder={() => {}}
        onRetry={() => {}}
    />
)
assert.match(missingFinalMarkup, /data-agent-transcript-state="missing-final-response"/)
assert.match(missingFinalMarkup, /No final response was written/)
assert.match(missingFinalMarkup, /saved transcript ends without assistant answer text/)

const resultFallbackMarkup = renderToStaticMarkup(
    <AssistantAgentDetailPage
        run={{ ...agentRun, status: 'completed', sessionFile: 'late-final-child-session.jsonl', result: { text: 'Immediate **agent result**.' }, completedAt: now }}
        transcript={{ ...transcriptPage, entries: transcriptPage.entries.slice(0, 1), totalEntries: 1, hydrated: 1 }}
        loading={false}
        error={null}
        onBack={() => {}}
        onLoadOlder={() => {}}
        onRetry={() => {}}
    />
)
assert.match(resultFallbackMarkup, /data-agent-result-fallback="true"/)
assert.match(resultFallbackMarkup, /Immediate <strong[^>]*>agent result<\/strong>/)
assert.doesNotMatch(resultFallbackMarkup, /No final response was written/)

const liveActivityMarkup = renderToStaticMarkup(
    <AssistantAgentDetailPage
        run={{
            ...agentRun,
            status: 'running',
            sessionFile: 'live-child-session.jsonl',
            activity: {
                type: 'tool_execution_start',
                toolCallId: 'live-read-auth',
                toolName: 'read',
                args: { path: 'src/auth.ts' },
                occurredAt: now
            } as unknown as AgentRunState['activity']
        }}
        transcript={{ ...transcriptPage, entries: transcriptPage.entries.slice(0, 1), totalEntries: 1, hydrated: 1 }}
        loading={false}
        error={null}
        onBack={() => {}}
        onLoadOlder={() => {}}
        onRetry={() => {}}
    />
)
assert.doesNotMatch(liveActivityMarkup, /Tool Calls/)
assert.match(liveActivityMarkup, /data-assistant-typed-action="agent-tool:live-read-auth"/)
assert.match(liveActivityMarkup, /assistant-title-shimmer[^>]*>Reading auth\.ts/)
assert.match(liveActivityMarkup, /src\/auth\.ts/)

const root = path.resolve(import.meta.dirname, '..', '..')
const [bridge, adapter, inspector, runDetailsModal, fleetWorkspaceSource, agentDirectorySource, agentTranscriptHookSource, desktopPackageSource] = await Promise.all([
    readFile(path.join(root, 'src', 'zyra-ui-bridge.mjs'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'preload', 'adapters', 'assistant-adapter.ts'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'renderer', 'src', 'pages', 'assistant', 'AssistantDiffPanel.tsx'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'renderer', 'src', 'pages', 'assistant', 'AssistantAgentRunDetailsModal.tsx'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'renderer', 'src', 'pages', 'assistant', 'AssistantFleetWorkspace.tsx'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'renderer', 'src', 'pages', 'assistant', 'AssistantAgentDirectory.tsx'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'renderer', 'src', 'pages', 'assistant', 'useAssistantAgentTranscript.ts'), 'utf8'),
    readFile(path.join(root, 'desktop', 'package.json'), 'utf8')
])
for (const operation of ['agents.list', 'agents.spawn', 'agents.transcript', 'workflows.run', 'workflows.restart']) assert(bridge.includes(`case "${operation}"`))
assert(adapter.includes('ASSISTANT_IPC.agentAction'))
assert(adapter.includes('ASSISTANT_IPC.workflowAction'))
assert(inspector.includes('AssistantFleetWorkspace'))
assert(runDetailsModal.includes('AnchoredMenuPopover'), 'run details use the same anchored overlay as contextual workspace tools')
assert(runDetailsModal.includes('width={280}'))
assert(runDetailsModal.includes('role="dialog"'))
assert.equal(runDetailsModal.includes('fixed inset-0'), false, 'run details do not cover the conversation with a modal backdrop')
assert.equal(runDetailsModal.includes('label="Runtime"'), false, 'runtime is intentionally absent from the compact inspector')
assert(runDetailsModal.includes('AssistantModelProviderIcon'))
for (const label of ['Status', 'Model', 'Usage']) assert(runDetailsModal.includes(`label="${label}"`))
assert.equal(runDetailsModal.includes('run.goal'), false, 'the inspector does not repeat the delegated prompt')
assert.equal(runDetailsModal.includes('run.result'), false, 'the inspector does not repeat the answer')
assert.equal(runDetailsModal.includes('OverviewMetric'), false, 'run facts are compact key/value rows, not cards')
assert.equal(runDetailsModal.includes('<pre'), false, 'run details do not expose a raw data surface')
assert.equal(runDetailsModal.includes('JSON.stringify'), false, 'run details do not dump internal objects')
assert.equal(fleetWorkspaceSource.includes('WorkflowRows'), false, 'workflows no longer use the old inline row dump')
assert.equal(fleetWorkspaceSource.includes('WorkflowDetail'), true, 'workflow selection opens the dedicated detail page')
assert.match(agentDirectorySource, /projectAssistantAgentDirectory/, 'the directory uses shared search, status and attention-order policy')
assert.match(agentDirectorySource, /rows\.slice\(pageStart, pageStart \+ ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE\)/, 'large directories do not mount every agent')
assert.match(agentTranscriptHookSource, /window\.setInterval[\s\S]{0,180}refreshLatest/, 'an open running agent refreshes its saved transcript continuously')
assert.match(agentTranscriptHookSource, /TERMINAL_TRANSCRIPT_REFRESH_DELAYS_MS/, 'terminal agents retry transcript hydration while the final JSONL record settles')
assert.equal(desktopPackageSource.includes('"@dicebear/styles"'), true, 'official DiceBear style definitions back Bottts, Loops, and Waves locally')
assert.equal(desktopPackageSource.includes('"@dicebear/bottts"'), false, 'the retired DiceBear v9 style package is removed')

console.log('Desktop assistant fleet contract tests passed.')

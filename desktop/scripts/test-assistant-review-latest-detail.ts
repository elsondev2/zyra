import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AssistantReviewIndex, AssistantReviewTurnIndexEntry } from '../src/shared/assistant/contracts'
import { mergeAssistantReviewIndex } from '../src/renderer/src/pages/assistant/assistant-review-index'
import type { AssistantDiffTurn } from '../src/renderer/src/pages/assistant/assistant-diff-types'

const turnId = 'turn-latest'
const index: AssistantReviewIndex = {
    threadId: 'thread-review',
    totalTurns: 1,
    turns: [{
        id: turnId,
        number: 1,
        state: 'completed',
        prompt: {
            id: 'prompt-latest',
            text: 'Load the complete latest turn.',
            truncated: false,
            createdAt: '2026-08-23T10:00:00.000Z',
            updatedAt: '2026-08-23T10:00:00.000Z'
        },
        response: {
            id: 'response-latest',
            text: 'Excerpt…',
            truncated: true,
            createdAt: '2026-08-23T10:01:00.000Z',
            updatedAt: '2026-08-23T10:01:00.000Z'
        },
        agentLabel: 'Agent',
        requestedAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:01:00.000Z',
        changes: []
    }]
}
const fullResponse = 'Complete latest response with the persisted ending.'
const detail: AssistantDiffTurn = {
    id: turnId,
    number: 1,
    state: 'completed',
    reviewStatus: null,
    prompt: 'Load the complete latest turn.',
    promptAvailable: true,
    promptAttachments: [],
    response: fullResponse,
    responseAvailable: true,
    agentLabel: 'Agent',
    historyUnavailable: false,
    detailLoaded: true,
    searchText: fullResponse.toLowerCase(),
    createdAt: '2026-08-23T10:00:00.000Z',
    updatedAt: '2026-08-23T10:01:00.000Z',
    files: [],
    changes: [],
    additions: 0,
    deletions: 0
}

const unhydrated = mergeAssistantReviewIndex({ index, detailedTurns: [detail], hydratedTurnIds: new Set() })
assert.equal(unhydrated[0]?.detailLoaded, false, 'an index excerpt remains explicitly unhydrated')
const hydrated = mergeAssistantReviewIndex({ index, detailedTurns: [detail], hydratedTurnIds: new Set([turnId]) })
assert.equal(hydrated[0]?.detailLoaded, true, 'the fetched latest turn becomes hydrated')
assert.equal(hydrated[0]?.response, fullResponse, 'the fetched detail replaces the truncated index excerpt')

function indexTurn(
    number: number,
    overrides: Partial<AssistantReviewTurnIndexEntry> = {}
): AssistantReviewTurnIndexEntry {
    const hour = number >= 60 ? '11' : '10'
    const minute = String(number % 60).padStart(2, '0')
    const createdAt = `2026-08-23T${hour}:${minute}:00.000Z`
    return {
        id: `canonical-${number}`,
        number,
        state: 'completed',
        prompt: { id: `prompt-${number}`, text: `Canonical prompt ${number}`, truncated: false, createdAt, updatedAt: createdAt },
        response: { id: `response-${number}`, text: `Canonical response ${number}`, truncated: false, createdAt, updatedAt: createdAt },
        agentLabel: 'Agent',
        requestedAt: createdAt,
        updatedAt: createdAt,
        changes: [],
        ...overrides
    }
}

const reconciliationIndex: AssistantReviewIndex = {
    threadId: 'thread-reconciliation',
    totalTurns: 5,
    turns: [
        indexTurn(67, { state: 'running' }),
        indexTurn(57),
        indexTurn(56, { prompt: null, response: null }),
        indexTurn(55, {
            prompt: null,
            response: null,
            changes: [{
                activityId: 'diff-only-activity',
                turnId: 'canonical-55',
                filePath: 'src/recovered.ts',
                additions: 4,
                deletions: 1,
                status: 'completed',
                authoritative: true,
                createdAt: '2026-08-23T10:55:01.000Z'
            }]
        }),
        indexTurn(54, { state: 'error', prompt: null, response: null })
    ]
}
const detailAlias67: AssistantDiffTurn = {
    ...detail,
    id: 'message:optimistic-prompt-67',
    number: 67,
    state: 'running',
    reviewStatus: null,
    prompt: 'Recovered live prompt 67',
    response: 'No final response',
    responseAvailable: false,
    historyUnavailable: true,
    createdAt: '2026-08-23T11:07:00.000Z',
    updatedAt: '2026-08-23T11:07:01.000Z'
}
const detailAlias57: AssistantDiffTurn = {
    ...detail,
    id: 'message:loaded-prompt-57',
    number: 57,
    reviewStatus: null,
    prompt: 'Recovered loaded prompt 57',
    response: 'Recovered loaded response 57',
    createdAt: '2026-08-23T10:57:00.000Z',
    updatedAt: '2026-08-23T10:57:01.000Z'
}
const reconciled = mergeAssistantReviewIndex({
    index: reconciliationIndex,
    detailedTurns: [detailAlias57, detailAlias67],
    hydratedTurnIds: new Set(),
    activeTurnId: detailAlias67.id
})
assert.deepEqual(reconciled.map((turn) => turn.number), [67, 57, 55, 54], 'Review deduplicates canonical numbers, removes empty completed shells, and sorts newest-first')
assert.equal(new Set(reconciled.map((turn) => turn.number)).size, reconciled.length, 'each canonical turn number appears once')
assert.equal(reconciled[0]?.id, 'canonical-67', 'number reconciliation retains the canonical persisted turn id')
assert.equal(reconciled[0]?.prompt, detailAlias67.prompt, 'canonical rows recover loaded prompt evidence from an unmatched detail alias')
assert.equal(reconciled.find((turn) => turn.number === 55)?.prompt, 'Changed src/recovered.ts', 'prompt-less turns with real diffs use evidence-based copy')
assert.equal(reconciled.some((turn) => turn.number === 56), false, 'completed ledger shells with no prompt, response, or diff stay out of Review')
assert.equal(reconciled.find((turn) => turn.number === 54)?.prompt, 'Failed turn', 'failed turns remain visible when message history is missing')
assert.deepEqual(reconciled.map((turn) => turn.reviewStatus), ['running', null, null, null], 'a running turn never also receives the Latest status')
const settledReconciliation = mergeAssistantReviewIndex({ index: reconciliationIndex, detailedTurns: [detailAlias57, detailAlias67], activeTurnId: null })
assert.equal(settledReconciliation[0]?.reviewStatus, 'latest', 'without a live running identity only the newest canonical turn is Latest')
assert.equal(settledReconciliation.filter((turn) => turn.reviewStatus !== null).length, 1, 'Review exposes at most one turn-status pill')

const utilitySource = readFileSync(new URL('../src/renderer/src/pages/assistant/utility/AssistantUtilityWorkspaceHost.tsx', import.meta.url), 'utf8')
const panelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
const landingSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantReviewLanding.tsx', import.meta.url), 'utf8')
const turnReviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTurnReview.tsx', import.meta.url), 'utf8')
const statusBadgeSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantReviewTurnStatusBadge.tsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')
assert.equal(
    utilitySource.includes('hydratedTurnIds: new Set(Object.keys(turnDetails))'),
    true,
    'detached Review marks only fetched turn details as hydrated'
)
assert.equal(
    landingSource.includes('previewTurn.detailLoaded !== false || previewTurn.id === activeTurnId'),
    true,
    'Review preloads the latest completed turn without changing live running-turn handling'
)
assert.equal(landingSource.includes('<AnimatedHeight'), true, 'Review disclosure reuses the existing collapse component')
assert.equal(landingSource.includes('content.scrollHeight > collapsedThreshold + RESPONSE_DISCLOSURE_OVERFLOW_EPSILON_PX'), true, 'Review shows its response disclosure only after measured Markdown exceeds the collapsed viewport')
assert.equal(landingSource.includes('glance && hasChangedFiles && responseCanExpand'), true, 'responses that fit beside the diff block do not reserve a See more row')
assert.equal(landingSource.includes('RESPONSE_DISCLOSURE_ROW_HEIGHT_PX'), true, 'overflow measurement accounts for the disclosure row without state flicker')
assert.equal(landingSource.includes('startViewTransition'), false, 'Review disclosure does not maintain a second animation system')
assert.equal(panelSource.includes('indexSurface.animate('), true, 'Review landing navigation runs explicit keyframes on its mounted surface')
assert.equal(panelSource.includes('detailSurface.animate('), true, 'Review detail navigation runs explicit forward and reverse keyframes')
assert.equal(panelSource.includes("{ opacity: 0, transform: 'translate3d(16px, 0, 0)' }"), true, 'the docked detail surface enters from and exits toward the right')
assert.equal(utilitySource.includes('assistant-review-navigation-stack relative grid'), true, 'full-screen Review keeps landing and detail mounted in the shared-axis stack')
assert.equal(utilitySource.includes('const indexAnimation = indexSurface.animate('), true, 'full-screen Review animates its mounted landing surface')
assert.equal(utilitySource.includes('const detailAnimation = detailSurface.animate('), true, 'full-screen Review animates detail in both directions')
assert.equal(utilitySource.includes('void detailAnimation.finished.then('), true, 'full-screen Back retains detail until its reverse animation completes')
assert.equal(landingSource.includes('Message history unavailable'), false, 'missing responses do not receive a redundant message-history warning')
assert.equal(landingSource.includes('Agent did not respond'), true, 'Review rows and preview use the normal missing-agent-response warning')
assert.equal(turnReviewSource.includes('Agent did not respond'), true, 'full-turn Review uses the same missing-agent-response warning')
assert.equal(turnReviewSource.includes('persisted ledger, but its stored prompt and response are unavailable'), false, 'full-turn Review omits the duplicate unavailable-history banner')
assert.match(landingSource, /No diff[\s\S]{0,220}AssistantReviewTurnStatusBadge/, 'unchanged Review rows place status directly after No diff evidence')
assert.match(turnReviewSource, /DiffStats additions=\{turn\.additions\}[\s\S]{0,280}AssistantReviewTurnStatusBadge/, 'full-turn Review places status beside diff stats')
assert.equal(statusBadgeSource.includes("status === 'running'"), true, 'the shared evidence-row badge renders one scalar Running or Latest state')
assert.equal(landingSource.includes('useLayoutEffect(() =>'), true, 'Review resolves its responsive layout before the first visible frame')
assert.equal(landingSource.includes("layoutWidth === null && 'invisible'"), true, 'Review never exposes the fallback table before its container has a valid width')
assert.equal(landingSource.includes('if (width <= 0) return'), true, 'transient hidden-surface measurements cannot reset the remembered wide layout')
assert.equal(landingSource.includes('MASTER_RAIL_DEFAULT_WIDTH = 320'), true, 'the wide Review turn list starts at the compact 320px default')
assert.equal(landingSource.includes("MASTER_RAIL_STORAGE_KEY = 'assistant-review-master-rail-width:v1'"), true, 'Review remembers the resized turn-list width')
assert.equal(landingSource.includes('aria-label="Resize Review turn list"'), true, 'the Review turn list exposes an accessible resize separator')
assert.equal(landingSource.includes('onPointerMove={handleMasterRailResizePointerMove}'), true, 'dragging the Review separator updates its bounded width')
assert.equal(landingSource.includes('w-[28rem] max-w-[38%]'), false, 'the Review turn list no longer uses the oversized fixed rail')
assert.match(
    cssSource,
    /\.assistant-review-landing ::-webkit-scrollbar-thumb,[\s\S]*?\.assistant-turn-review ::-webkit-scrollbar-thumb \{\s*border-radius: 0;/,
    'Review and full-turn Diff scrollbars have sharp corners'
)

console.log('assistant Review latest-detail and Diff-scrollbar checks passed')

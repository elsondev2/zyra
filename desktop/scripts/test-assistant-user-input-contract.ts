import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AssistantThread, AssistantUserInputQuestion } from '../src/shared/assistant/contracts'
import { toUserInputQuestions } from '../src/main/assistant/codex-runtime-session-utils'
import { buildTurnParams } from '../src/main/assistant/codex-runtime-protocol'
import { respondToAssistantUserInputWithRuntime } from '../src/main/assistant/user-input-response'
import {
    buildAssistantPendingUserInputAnswers,
    deriveAssistantPendingUserInputProgress,
    findFirstUnansweredAssistantPendingUserInputQuestionIndex,
    formatAssistantUserInputAnswer,
    reorderAssistantUserInputRanking
} from '../src/renderer/src/pages/assistant/assistant-pending-user-input'
import {
    clearAssistantPendingUserInputDraft,
    readAssistantPendingUserInputDraft,
    writeAssistantPendingUserInputDraft
} from '../src/renderer/src/pages/assistant/assistant-pending-user-input-drafts'

const asRecord = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const asString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

const rawQuestions = [
    { id: 'text', header: 'Text', question: 'What should it say?', type: 'text', placeholder: 'Write an answer' },
    { id: 'single', header: 'Single', question: 'Choose one', type: 'single_select', allowOther: true, options: [{ label: 'A', recommended: true }] },
    { id: 'multi', header: 'Multi', question: 'Choose several', type: 'multi_select', minSelections: 2, options: [{ label: 'A' }, { label: 'B' }] },
    { id: 'confirm', header: 'Confirm', question: 'Continue?', type: 'confirm' },
    { id: 'files', header: 'Files', question: 'Choose files', type: 'file_select', multiple: true, options: [{ label: 'src/a.ts' }, { label: 'src/b.ts' }] },
    { id: 'number', header: 'Number', question: 'How many?', type: 'number', min: 1, max: 5, step: 1 },
    { id: 'date', header: 'Date', question: 'Which date?', type: 'date' },
    { id: 'ranking', header: 'Ranking', question: 'Order these', type: 'ranking', options: [{ label: 'Correctness' }, { label: 'Speed' }] }
]
const questions = toUserInputQuestions(rawQuestions, asRecord, asString)
assert.equal(questions.length, rawQuestions.length, 'the schema has no arbitrary question-count cap')
assert.deepEqual(questions.map((question) => question.type), ['text', 'single_select', 'multi_select', 'confirm', 'file_select', 'number', 'date', 'ranking'])
assert.equal(questions[1].allowOther, true)
assert.equal(questions[1].options[0].recommended, true)
assert.equal(questions[0].required, true)
assert.equal(questions[2].minSelections, 2)

const legacy = toUserInputQuestions([{ id: 'legacy', header: 'Legacy', question: 'Old question', options: [{ label: 'One', description: 'First' }] }], asRecord, asString)
assert.equal(legacy[0].type, 'single_select', 'legacy option questions remain readable')
assert.equal(legacy[0].required, true)
assert.equal(legacy[0].allowOther, false)
const deduplicatedRankingQuestion = toUserInputQuestions([{
    id: 'deduplicated-ranking',
    header: 'Ranking',
    question: 'Order these',
    type: 'ranking',
    options: [{ label: 'Correctness' }, { label: 'Correctness' }, { label: 'Speed' }]
}], asRecord, asString)[0]
assert.deepEqual(deduplicatedRankingQuestion.options.map((option) => option.label), ['Correctness', 'Speed'], 'Desktop ranking identities are unique')

const answers = {
    text: 'Ship it',
    single: 'A',
    multi: ['A', 'B'],
    confirm: 'Yes',
    files: ['src/a.ts'],
    number: '3',
    date: '2026-08-19',
    ranking: ['Correctness', 'Speed']
}
assert.deepEqual(buildAssistantPendingUserInputAnswers(questions, answers), answers)
assert.equal(findFirstUnansweredAssistantPendingUserInputQuestionIndex(questions, { ...answers, multi: ['A'] }), 2)
assert.equal(formatAssistantUserInputAnswer(questions[7], answers.ranking), 'Correctness → Speed')
assert.deepEqual(
    reorderAssistantUserInputRanking(['Correctness', 'Speed', 'Polish'], 'Polish', 'Correctness'),
    ['Polish', 'Correctness', 'Speed'],
    'ranking drag-and-drop moves the dragged answer to the selected position'
)
const progress = deriveAssistantPendingUserInputProgress({
    id: 'pending', requestId: 'request', questions, status: 'pending', answers: null, turnId: null,
    createdAt: '2026-08-19T00:00:00.000Z', resolvedAt: null
}, answers, questions.length)
assert.equal(progress?.isReviewStep, true)
assert.equal(progress?.answeredQuestionCount, questions.length)

writeAssistantPendingUserInputDraft('request:cache-test', {
    answers: { text: 'Keep this', ranking: ['Speed', 'Correctness'] },
    questionIndex: 7,
    customQuestionId: null,
    returnToReview: false
})
assert.deepEqual(readAssistantPendingUserInputDraft('request:cache-test'), {
    answers: { text: 'Keep this', ranking: ['Speed', 'Correctness'] },
    questionIndex: 7,
    customQuestionId: null,
    returnToReview: false
}, 'guided-input answers and step survive panel unmounts while switching chats')
clearAssistantPendingUserInputDraft('request:cache-test')
assert.equal(readAssistantPendingUserInputDraft('request:cache-test'), null)

const optionalQuestion: AssistantUserInputQuestion = {
    id: 'optional', header: 'Optional', question: 'Anything else?', type: 'text', options: [], required: false, allowOther: false
}
assert.deepEqual(buildAssistantPendingUserInputAnswers([optionalQuestion], { optional: '' }), { optional: '' })
assert.equal(buildAssistantPendingUserInputAnswers([optionalQuestion], {}), null, 'optional questions still require an explicit Skip action')

const thread = {
    id: 'thread', providerThreadId: 'provider', source: 'root', parentThreadId: null, providerParentThreadId: null,
    subagentDepth: null, agentNickname: null, agentRole: null, model: 'openai-codex/gpt-5.6-sol', cwd: 'C:/workspace',
    messageCount: 0, activityCount: 0, proposedPlanCount: 0, lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required', interactionMode: 'plan', webSearch: true, webFetch: true, state: 'ready', lastError: null,
    createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z', latestTurn: null,
    hasPendingApprovals: false, hasPendingUserInputs: false, hasActivePlan: false, activePlan: null,
    messages: [], proposedPlans: [], activities: [], pendingApprovals: [], pendingUserInputs: []
} as AssistantThread
const responseLifecycleCalls: string[] = []
const pendingResponseThread = {
    ...thread,
    pendingUserInputs: [{
        id: 'pending-response',
        requestId: 'request:response',
        questions,
        status: 'pending',
        answers: null,
        turnId: 'turn:response',
        createdAt: '2026-08-19T00:00:00.000Z',
        resolvedAt: null
    }]
} as AssistantThread
await respondToAssistantUserInputWithRuntime({
    runtime: {
        hasSession: () => false,
        connect: async () => { responseLifecycleCalls.push('connect') },
        respondUserInput: async (threadId: string, requestId: string) => { responseLifecycleCalls.push(`respond:${threadId}:${requestId}`) }
    },
    thread: pendingResponseThread,
    cwd: 'C:/workspace',
    requestId: 'request:response',
    answers
})
assert.deepEqual(responseLifecycleCalls, [
    'connect',
    'respond:provider:request:response'
], 'Finish reattaches a chat-switched canonical runtime before returning guided answers')

const turn = buildTurnParams(thread, 'hello', undefined, undefined, 'plan')
const collaborationMode = turn.collaborationMode as { mode: string; settings: { developer_instructions: string } }
assert.equal(collaborationMode.mode, 'default', 'legacy Plan-mode turns execute in normal mode')
assert.match(collaborationMode.settings.developer_instructions, /Use request_user_input only after inspecting available context/)
assert.match(collaborationMode.settings.developer_instructions, /<proposed_plan>/)
assert.doesNotMatch(collaborationMode.settings.developer_instructions, /Do not call request_user_input in Default mode/)
const questionFieldSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPendingUserInputQuestionField.tsx', import.meta.url), 'utf8')
const questionSectionsSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPendingUserInputSections.tsx', import.meta.url), 'utf8')
const questionPanelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPendingUserInputPanel.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../src/renderer/src/pages/settings/AssistantSettings.tsx', import.meta.url), 'utf8')
const conversationSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantConversationPane.tsx', import.meta.url), 'utf8')
const planCardSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineProposedPlan.tsx', import.meta.url), 'utf8')
assert.match(questionFieldSource, /DndContext[\s\S]*SortableContext/, 'ranking answers use sortable pointer dragging')
assert.match(questionFieldSource, /CSS\.Transform\.toString\(transform\)/, 'the complete ranking row follows the pointer')
assert.match(questionFieldSource, /verticalListSortingStrategy/, 'ranking siblings animate into position during a drag')
assert.match(questionFieldSource, /group\/ranking[\s\S]*accent-primary/, 'ranking rows expose an accent affordance before and during dragging')
assert.match(questionSectionsSource, /max-h-\[286px\].*overflow-y-auto/, 'the final review limits visible answers and scrolls the rest')
assert.match(questionSectionsSource, /forceSingleRow=\{isReviewStep\}/, 'review keeps composer controls on one footer row')
assert.match(questionSectionsSource, /\[container-type:inline-size\]/, 'guided-input footers share the same width-aware control collapse')
assert.match(questionSectionsSource, /isReviewStep\s*\? 'flex-nowrap gap-2'/, 'review actions share the same non-wrapping row as permissions')
assert.match(questionSectionsSource, /isReviewStep \? 'gap-1\.5' : 'gap-2'/, 'review keeps compact separation between Back and Finish')
assert.match(questionPanelSource, /\{showAnswerComposer \? \(/, 'review does not render an empty answer-composer area')
assert.match(questionPanelSource, /readAssistantPendingUserInputDraft/, 'chat switching restores the current guided-input draft')
assert.match(questionPanelSource, /min-h-10/, 'text answers begin at a compact one-line height')
assert.match(questionSectionsSource, /activeQuestion\.type !== 'text'/, 'text questions do not render a redundant instruction box')
assert.doesNotMatch(settingsSource, /title="Interaction mode"/)
assert.match(conversationSource, /<approved_plan>/, 'the plan-card Implement handoff remains wired')
assert.match(planCardSource, /Implement/, 'normal-mode plan cards keep their approval action')

console.log('assistant user-input and retired Plan-mode contract: ok')

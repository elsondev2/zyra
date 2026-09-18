import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantQuestionResponse } from '../src/renderer/src/pages/assistant/AssistantQuestionResponse'
import { TimelineMessage } from '../src/renderer/src/pages/assistant/AssistantTimelineRows'
import { SettingsProvider } from '../src/renderer/src/lib/settings'
import type { AssistantPendingUserInput } from '../src/shared/assistant/contracts'

const input: AssistantPendingUserInput = {
    id: 'answered', requestId: 'request', status: 'resolved', responseMessageId: 'response', turnId: 'turn',
    createdAt: '2026-09-17T10:00:00.000Z', resolvedAt: '2026-09-17T10:01:00.000Z',
    questions: [{ id: 'q1', header: 'Scope', question: 'Which project should the agent update? '.repeat(12), type: 'text', options: [], required: true, allowOther: false }],
    answers: { q1: 'The mobile project, preserving the existing design. '.repeat(8) }
}
const single = renderToStaticMarkup(<AssistantQuestionResponse input={input} />)
assert.match(single, /Answered agent question/)
assert.match(single, /lucide-bot/)
assert.match(single, /data-assistant-question-response-label="true"[^>]*class="[^"]*justify-end/)
assert.match(single, /data-assistant-question-response-card="true"/)
assert.ok(single.indexOf('Answered agent question') < single.indexOf('data-assistant-question-response-card="true"'), 'label sits above the bubble')
assert.match(single, /data-assistant-question-preview="true"[^>]*class="[^"]*truncate/)
assert.doesNotMatch(single, /data-assistant-question-preview="true"[^>]*line-clamp-2/)
assert.match(single, /data-assistant-answer-preview="true"[^>]*class="[^"]*line-clamp-2/)
assert.equal((single.match(/<button\b/g) || []).length, 1, 'the whole card is the single opening control')
assert.match(single, /aria-label="View full response to agent question"/)
assert.doesNotMatch(single, /Show more|View answer/)
const multiple = renderToStaticMarkup(<AssistantQuestionResponse input={{ ...input,
    questions: [...input.questions, { id: 'q2', header: 'Testing', question: 'Run checks?', type: 'text', options: [], required: true, allowOther: false }],
    answers: { ...input.answers, q2: 'Yes' } }} />)
assert.match(multiple, /Answered 2 agent questions/)
assert.match(multiple, /aria-label="View full responses to 2 agent questions"/)
assert.doesNotMatch(multiple, /Run checks\?/, 'only the first question previews; full set remains behind the card')
assert.equal(renderToStaticMarkup(<AssistantQuestionResponse input={{ ...input, questions: [] }} />), '')
const message = { id: 'response', role: 'user' as const, text: 'Question: original transcript', turnId: 'turn',
    streaming: false, createdAt: input.createdAt, updatedAt: input.resolvedAt! }
// Ordinary message SSR calls the browser text measurer. A deterministic canvas
// stand-in checks branch/content preservation here; this is not pixel validation.
const canvasDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas')
Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {
    getContext() { return { font: '', measureText(text: string) { return { width: text.length * 7 } } } }
} })
try { for (const displayMode of ['detailed', 'minimal'] as const) {
    const linked = renderToStaticMarkup(<SettingsProvider><TimelineMessage message={message} questionResponse={input} displayMode={displayMode} /></SettingsProvider>)
    assert.match(linked, /class="min-w-0"><div data-assistant-question-response="true"/, 'question card has no surrounding ordinary bubble surface')
    assert.match(linked, /w-\[26rem\] max-w-full/, 'response keeps a consistent bounded width')
    assert.doesNotMatch(linked, /Question: original transcript/, 'linked answers use the custom card')
    const ordinary = renderToStaticMarkup(<SettingsProvider><TimelineMessage message={message} displayMode={displayMode} /></SettingsProvider>)
    assert.doesNotMatch(ordinary, /data-assistant-question-response/)
    assert.match(ordinary, /Question: original transcript/, 'ordinary message content is preserved')
}
} finally {
    if (canvasDescriptor) Object.defineProperty(globalThis, 'OffscreenCanvas', canvasDescriptor)
    else Reflect.deleteProperty(globalThis, 'OffscreenCanvas')
}
console.log('Compact answered-question card and actual timeline: passed')

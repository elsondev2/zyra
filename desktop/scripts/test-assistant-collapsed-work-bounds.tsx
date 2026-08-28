import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantActivity } from '../src/shared/assistant/contracts'
import { TimelineThoughtGroup } from '../src/renderer/src/pages/assistant/AssistantTimelineRows'

const activities: AssistantActivity[] = Array.from({ length: 200 }, (_, index) => ({
    id: `bounded-thought-${index}`,
    kind: 'assistant.internal',
    tone: 'info',
    summary: `Thought ${index}`,
    detail: `**Thought ${index}**\n\nhidden-markdown-body-${index} ${'detail '.repeat(180)}`,
    turnId: 'bounded-turn',
    timelineSequence: index + 1,
    createdAt: new Date(Date.UTC(2026, 7, 24, 10, 0, index)).toISOString(),
    payload: {
        category: 'assistant-internal',
        output: `**Thought ${index}**\n\nhidden-markdown-body-${index} ${'detail '.repeat(180)}`
    }
}))

const startedAt = performance.now()
const markup = renderToStaticMarkup(createElement(TimelineThoughtGroup, { activities }))
const elapsedMs = performance.now() - startedAt

assert.equal(markup.includes('Thoughts (200)'), true, 'the collapsed row preserves its useful summary')
assert.equal(markup.includes('data-state="closed"'), true)
assert.equal(markup.includes('hidden-markdown-body-0'), false, 'collapsed work cannot mount its first hidden Markdown body')
assert.equal(markup.includes('hidden-markdown-body-199'), false, 'collapsed work cannot mount its remaining hidden Markdown bodies')
assert.ok(markup.length < 8_000, `collapsed markup stays bounded; received ${markup.length} characters`)
assert.ok(elapsedMs < 150, `collapsed work renders within 150ms; received ${elapsedMs.toFixed(2)}ms`)

console.log(JSON.stringify({ activities: activities.length, markupCharacters: markup.length, renderMs: Number(elapsedMs.toFixed(2)) }, null, 2))
console.log('Assistant collapsed work bounds: ok')

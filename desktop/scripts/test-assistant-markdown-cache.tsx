import assert from 'node:assert/strict'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
    getMarkdownRenderCacheStats,
    prepareMarkdownRender
} from '../src/renderer/src/components/ui/MarkdownRenderer'
import { getCodeHighlightCacheStats } from '../src/renderer/src/components/ui/markdown/CodeElements'
import {
    splitStreamingMarkdownBlocks,
    StreamingAssistantMarkdown
} from '../src/renderer/src/pages/assistant/AssistantTimelineText'

const content = `# Cached heading

| Name | State |
| --- | --- |
| Timeline | Fast |

- formatted list
- [internal file](./src/example.ts)
- [unsafe link](javascript:alert(1))

<div data-cache-raw="yes">raw html retained</div>

\`\`\`ts
const ready: boolean = true
\`\`\`
`
const props = {
    content,
    cacheKey: 'assistant-message:test-cache:v1',
    filePath: 'C:/workspace/README.md'
}

const before = getMarkdownRenderCacheStats()
const first = prepareMarkdownRender(props)
const afterFirst = getMarkdownRenderCacheStats()
const second = prepareMarkdownRender(props)
const afterSecond = getMarkdownRenderCacheStats()

assert.equal(afterFirst.compilations, before.compilations + 1, 'first completed-message render compiles Markdown once')
assert.equal(afterSecond.compilations, afterFirst.compilations, 'virtual remount reuses the compiled Markdown tree')
assert.equal(second, first, 'cache returns the same immutable React tree for a stable message version')

const highlightBefore = getCodeHighlightCacheStats()
const markup = renderToStaticMarkup(createElement(Fragment, null, first))
const highlightAfterFirst = getCodeHighlightCacheStats()
const repeatedMarkup = renderToStaticMarkup(createElement(Fragment, null, second))
const highlightAfterSecond = getCodeHighlightCacheStats()
assert.equal(highlightAfterFirst.compilations, highlightBefore.compilations + 1, 'first code-block mount tokenizes immutable source once')
assert.equal(highlightAfterSecond.compilations, highlightAfterFirst.compilations, 'virtual code-block remount reuses its highlighted React tree')
assert.equal(repeatedMarkup, markup)
assert.match(markup, /Cached heading/)
assert.match(markup, /<table/)
assert.match(markup, /formatted list/)
assert.match(markup, /data-cache-raw="yes"/)
assert.doesNotMatch(markup, /javascript:alert/)
assert.match(markup, /const[\s\S]*ready/)
assert.match(markup, /Copy/)

const transientBefore = getMarkdownRenderCacheStats()
prepareMarkdownRender({ content: 'unfinished **tail', transient: true, lightweight: true })
prepareMarkdownRender({ content: 'unfinished **tail grows', transient: true, lightweight: true })
const transientAfter = getMarkdownRenderCacheStats()
assert.equal(transientAfter.entries, transientBefore.entries, 'intermediate stream tails must not pollute the completed Markdown cache')
assert.equal(transientAfter.compilations, transientBefore.compilations + 2, 'changing stream tails compile independently')

const streamingContent = `# Live heading

This is **already bold** while text arrives.

\`\`\`ts
const streaming = true`
const streamingBlocks = splitStreamingMarkdownBlocks(streamingContent)
assert.deepEqual(streamingBlocks.settled, [
    '# Live heading',
    'This is **already bold** while text arrives.'
])
assert.match(streamingBlocks.tail, /^```ts/)
const streamingMarkup = renderToStaticMarkup(createElement(StreamingAssistantMarkdown, {
    content: streamingContent,
    cacheKey: 'assistant-message:live-stream',
    filePath: 'C:/workspace/README.md'
}))
assert.match(streamingMarkup, /data-assistant-streaming-markdown="true"/)
assert.match(streamingMarkup, /<h1[^>]*>Live heading/)
assert.match(streamingMarkup, /<strong[^>]*>already bold<\/strong>/)
assert.match(streamingMarkup, /const streaming = true/)

console.log('Assistant Markdown compiled-cache contract: ok')
process.exit(0)

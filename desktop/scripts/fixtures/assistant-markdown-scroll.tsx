import { createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { LegendListRef } from '@legendapp/list/react'
import { AssistantVirtualTimeline } from '../../src/renderer/src/pages/assistant/AssistantVirtualTimeline'
import { CompletedAssistantMarkdown } from '../../src/renderer/src/pages/assistant/AssistantTimelineText'
import { getMarkdownRenderCacheStats } from '../../src/renderer/src/components/ui/MarkdownRenderer'
import { getCodeHighlightCacheStats } from '../../src/renderer/src/components/ui/markdown/CodeElements'
import { isMarkdownScrollBusy, markMarkdownScrollActivity } from '../../src/renderer/src/components/ui/markdown/markdownScrollActivity'
import type { TimelineDisplayRow } from '../../src/renderer/src/pages/assistant/assistant-timeline-helpers'

const root = createRoot(document.getElementById('root')!)
const listRef = createRef<LegendListRef>()
const scrollRef = createRef<HTMLDivElement>()
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
const date = '2026-01-01T12:00:00.000Z'
const source = (id: number) => Array.from({ length: 45 }, (_, line) => `export const item${id}_${line} = { id: ${line}, label: 'Saved chat ${id}', enabled: true };`).join('\n')
const rows: TimelineDisplayRow[] = Array.from({ length: 36 }, (_, id) => ({
    id: `markdown-${id}`, kind: 'message', createdAt: date,
    message: { id: `markdown-${id}`, role: 'assistant', text: `## Saved response ${id}\n\nCode from a completed conversation.\n\n\`\`\`ts\n${source(id)}\n\`\`\``, streaming: false, createdAt: date, updatedAt: date }
}))
const renderRow = (row: TimelineDisplayRow) => row.kind === 'message'
    ? <CompletedAssistantMarkdown content={row.message.text} cacheKey={row.id} /> : null
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))]!

;(window as any).assistantMarkdownScrollCheck = (async () => {
    if (location.hash === '#no-idle') Object.defineProperty(window, 'requestIdleCallback', { value: undefined, configurable: true })
    // A slow CI frame can create a genuine >140ms input gap. Count actual
    // busy-time work, not legitimate idle highlights between those frames.
    let highlightsWhileScrollBusy = 0
    const observeScheduledWork = <T,>(callback: () => T): T => {
        const busy = isMarkdownScrollBusy()
        const before = getCodeHighlightCacheStats().compilations
        try { return callback() } finally {
            if (busy) highlightsWhileScrollBusy += getCodeHighlightCacheStats().compilations - before
        }
    }
    const originalIdle = window.requestIdleCallback?.bind(window)
    if (originalIdle) window.requestIdleCallback = (callback, options) => originalIdle(deadline => observeScheduledWork(() => callback(deadline)), options)
    const originalTimeout = window.setTimeout.bind(window)
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => originalTimeout(
        typeof callback === 'function' ? () => observeScheduledWork(() => callback(...args)) : callback, delay
    )) as typeof window.setTimeout
    flushSync(() => root.render(<AssistantVirtualTimeline rows={rows} windowKey="markdown-scroll" listRef={listRef} scrollContainerRef={scrollRef}
        contentInsetEndAdjustment={0} isWorking={false} selectionHydrating={false} hasOlder={false} hasNewer={false}
        loadingOlder={false} loadingNewer={false} loadOlderError={null} loadNewerError={null} renderRow={renderRow} />))
    await pause(300)
    if (!scrollRef.current || !document.querySelector('code')) throw new Error('Real completed Markdown must mount')
    const samples = []
    for (let sample = 0; sample < 2; sample++) {
        const intervals: number[] = []
        const compilationBefore = getMarkdownRenderCacheStats()
        const highlightsBefore = getCodeHighlightCacheStats().compilations
        let previous = await frame()
        for (let step = 0; step < 64; step++) {
            const element = scrollRef.current!
            const upwards = step < 32
            element.dispatchEvent(new WheelEvent('wheel', { deltaY: upwards ? -250 : 250, bubbles: true }))
            const phase = upwards ? step / 31 : (63 - step) / 31
            element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight) * (1 - phase)
            const now = await frame()
            intervals.push(now - previous); previous = now
        }
        const compilationAfter = getMarkdownRenderCacheStats()
        samples.push({ medianFrameMs: percentile(intervals, .5), p95FrameMs: percentile(intervals, .95), maxFrameMs: Math.max(...intervals),
            framesOver32ms: intervals.filter(value => value > 32).length,
            compilations: compilationAfter.compilations - compilationBefore.compilations,
            compilationMs: compilationAfter.compilationMilliseconds - compilationBefore.compilationMilliseconds,
            highlightsDuringPass: getCodeHighlightCacheStats().compilations - highlightsBefore })
        await pause(300)
    }
    // After scrolling stops, the mounted code must eventually gain highlighting.
    for (let attempt = 0; attempt < 100 && !document.querySelector('code span[style]'); attempt++) await pause(50)
    if (!document.querySelector('code span[style]')) throw new Error('Code highlighting never completed after scrolling')
    if (!document.body.textContent?.includes('Saved response')) throw new Error('Saved conversation disappeared')
    if (!document.querySelector('button[aria-label="Copy code"]')) throw new Error('Code copy action disappeared')
    // A cold completed message stays selectable/copyable without blocking on
    // tokens, then gains highlighting without changing its measured height.
    markMarkdownScrollActivity()
    const beforeCold = getCodeHighlightCacheStats().compilations
    let copied = ''
    ;(window as any).devscope = { copyToClipboard: async (text: string) => { copied = text; return { success: true } } }
    const coldSource = source(100)
    flushSync(() => root.render(<CompletedAssistantMarkdown content={`\`\`\`ts\n${coldSource}\n\`\`\``} cacheKey="cold-copy-contract" />))
    const coldHighlights = getCodeHighlightCacheStats().compilations - beforeCold
    const code = document.querySelector('code')!
    const plainHeight = document.querySelector('pre')!.getBoundingClientRect().height
    const range = document.createRange(); range.selectNodeContents(code)
    getSelection()?.removeAllRanges(); getSelection()?.addRange(range)
    if (getSelection()?.toString() !== coldSource) throw new Error('Deferred code source is not selectable')
    const copy = document.querySelector<HTMLButtonElement>('button[aria-label="Copy code"]')!
    copy.click(); await pause(0)
    if (copied !== coldSource) throw new Error('Deferred code copied different source')
    for (let attempt = 0; attempt < 100 && getCodeHighlightCacheStats().compilations === beforeCold; attempt++) await pause(50)
    await pause(100)
    if (getCodeHighlightCacheStats().compilations === beforeCold) throw new Error('Cold code never highlighted at idle')
    const highlightedHeight = document.querySelector('pre')!.getBoundingClientRect().height
    return { workload: { rows: rows.length, codeLinesPerRow: 45, framesPerSample: 64, samples: 2 }, samples,
        highlightsWhileScrollBusy,
        coldMount: { synchronousHighlights: coldHighlights, plainHeight, highlightedHeight },
        correctness: ['completed messages remain readable', 'idle code highlighting completes', 'raw code selection and copy preserve source'] }
})()

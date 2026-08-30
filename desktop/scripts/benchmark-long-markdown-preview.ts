import { performance } from 'node:perf_hooks'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { prepareMarkdownRender } from '../src/renderer/src/components/ui/MarkdownRenderer'
import { buildMarkdownPreviewSections, computeMarkdownVirtualRange, markdownPreviewSectionRenderContent } from '../src/renderer/src/components/ui/file-preview/FileMarkdownPreview'
import { parseMarkdownToHast, stripMarkdownTreePositions } from '../src/renderer/src/components/ui/markdown/markdownPipeline'
import { markdownDomHeight, markdownScrollScale, MarkdownPreviewHeightIndex } from '../src/renderer/src/components/ui/file-preview/markdownPreviewHeightIndex'

const TARGET_BYTES = Math.max(64 * 1024, Number(process.env.MARKDOWN_BENCHMARK_BYTES) || (2 * 1024 * 1024))

function createFixture(targetBytes: number): string {
    let output = '# Large document\n\n'
    let index = 0
    while (output.length < targetBytes) {
        output += `## Section ${index}\n\nThis representative paragraph contains **bold text**, [a link](docs/guide-${index}.md), inline code like \`const value = ${index}\`, and enough prose to wrap naturally in the preview.\n\n- first item\n- second item\n- third item\n\n\`\`\`typescript\nexport const section${index} = { id: ${index}, ready: true }\n\`\`\`\n\n| Name | Value |\n| --- | ---: |\n| Section | ${index} |\n\n`
        index += 1
    }
    return output.slice(0, targetBytes)
}

const content = createFixture(TARGET_BYTES)
const splitSamples: number[] = []
let sections = buildMarkdownPreviewSections(content)
for (let index = 0; index < 9; index += 1) {
    const startedAt = performance.now()
    sections = buildMarkdownPreviewSections(content)
    splitSamples.push(performance.now() - startedAt)
}
splitSamples.sort((left, right) => left - right)

const offsets = [0]
for (const section of sections) offsets.push((offsets.at(-1) || 0) + section.estimatedHeight)
const logicalHeight = offsets.at(-1) || 0
const domHeight = markdownDomHeight(logicalHeight)
const domScale = markdownScrollScale(logicalHeight, domHeight, 900)
const initialRange = computeMarkdownVirtualRange(offsets, 0, 900)
const urgentRange = computeMarkdownVirtualRange(offsets, 0, 900, 0)
const warmContent = '# Preview\n\nWarm renderer.\n\n```ts\nconst ready = true\n```\n'
const warmTree = stripMarkdownTreePositions(parseMarkdownToHast(warmContent, true))
const warmNode = prepareMarkdownRender({
    content: warmContent,
    filePath: 'C:/benchmark/warm.md',
    cacheKey: 'benchmark:warm',
    preparedTree: warmTree,
    deferCodeHighlighting: true,
    visualTheme: 'dark'
})
renderToStaticMarkup(createElement('div', null, warmNode))

type RenderMetrics = {
    workerParseMs: number
    mainPreparationMs: number
    staticCommitProxyMs: number
    mountedElements: number
    urgentWorkerParseMs: number
    urgentMainPreparationMs: number
    urgentStaticCommitProxyMs: number
    urgentMountedElements: number
}
const renderSamples: RenderMetrics[] = []
for (let sample = 0; sample < 7; sample += 1) {
    const metrics: RenderMetrics = {
        workerParseMs: 0,
        mainPreparationMs: 0,
        staticCommitProxyMs: 0,
        mountedElements: 0,
        urgentWorkerParseMs: 0,
        urgentMainPreparationMs: 0,
        urgentStaticCommitProxyMs: 0,
        urgentMountedElements: 0
    }
    for (let index = initialRange.start; index < initialRange.end; index += 1) {
        const source = markdownPreviewSectionRenderContent(content, sections[index])
        let startedAt = performance.now()
        const preparedTree = stripMarkdownTreePositions(parseMarkdownToHast(source, true))
        const parseDuration = performance.now() - startedAt
        metrics.workerParseMs += parseDuration
        if (index >= urgentRange.start && index < urgentRange.end) metrics.urgentWorkerParseMs += parseDuration

        startedAt = performance.now()
        const node = prepareMarkdownRender({
            content: source,
            filePath: `C:/benchmark/large-${sample}.md`,
            cacheKey: `benchmark:${sample}:${index}`,
            preparedTree,
            deferCodeHighlighting: true,
            visualTheme: 'dark'
        })
        const preparationDuration = performance.now() - startedAt
        metrics.mainPreparationMs += preparationDuration
        if (index >= urgentRange.start && index < urgentRange.end) metrics.urgentMainPreparationMs += preparationDuration

        startedAt = performance.now()
        const markup = renderToStaticMarkup(createElement('div', null, node))
        const commitDuration = performance.now() - startedAt
        const elementCount = (markup.match(/</g) || []).length
        metrics.staticCommitProxyMs += commitDuration
        metrics.mountedElements += elementCount
        if (index >= urgentRange.start && index < urgentRange.end) {
            metrics.urgentStaticCommitProxyMs += commitDuration
            metrics.urgentMountedElements += elementCount
        }
    }
    renderSamples.push(metrics)
}
const medianMetric = (key: keyof RenderMetrics) => {
    const values = renderSamples.map((sample) => sample[key]).sort((left, right) => left - right)
    return values[Math.floor(values.length / 2)]
}
const workerParseMs = medianMetric('workerParseMs')
const mainPreparationMs = medianMetric('mainPreparationMs')
const staticCommitProxyMs = medianMetric('staticCommitProxyMs')
const mountedElements = medianMetric('mountedElements')
const urgentWorkerParseMs = medianMetric('urgentWorkerParseMs')
const urgentMainPreparationMs = medianMetric('urgentMainPreparationMs')
const urgentStaticCommitProxyMs = medianMetric('urgentStaticCommitProxyMs')
const urgentMountedElements = medianMetric('urgentMountedElements')

const measurementUpdates = Array.from({ length: Math.min(600, sections.length) }, (_, index) => ({
    index: (index * 37) % sections.length,
    height: sections[(index * 37) % sections.length].estimatedHeight + ((index % 9) - 4) * 3
}))
const flatHeights = sections.map((section) => section.estimatedHeight)
let measurementStartedAt = performance.now()
for (const update of measurementUpdates) {
    flatHeights[update.index] = update.height
    const rebuiltOffsets = new Array<number>(flatHeights.length + 1)
    rebuiltOffsets[0] = 0
    for (let index = 0; index < flatHeights.length; index += 1) rebuiltOffsets[index + 1] = rebuiltOffsets[index] + flatHeights[index]
}
const flatHeightUpdatesMs = performance.now() - measurementStartedAt
const heightIndex = new MarkdownPreviewHeightIndex(sections.map((section) => section.estimatedHeight))
measurementStartedAt = performance.now()
for (const update of measurementUpdates) heightIndex.update(update.index, update.height)
const indexedHeightUpdatesMs = performance.now() - measurementStartedAt

console.log(JSON.stringify({
    bytes: content.length,
    sections: sections.length,
    splitMedianMs: splitSamples[Math.floor(splitSamples.length / 2)],
    splitP95Ms: splitSamples.at(-1),
    initialRange,
    urgentRange,
    logicalHeight,
    domScale,
    domHeight,
    mountedSections: initialRange.end - initialRange.start,
    urgentMountedSections: urgentRange.end - urgentRange.start,
    measurementUpdates: measurementUpdates.length,
    flatHeightUpdatesMs,
    indexedHeightUpdatesMs,
    workerParseMs,
    mainPreparationMs,
    staticCommitProxyMs,
    mountedElements,
    urgentWorkerParseMs,
    urgentMainPreparationMs,
    urgentStaticCommitProxyMs,
    urgentMountedElements,
    rssMb: process.memoryUsage().rss / 1024 / 1024
}, null, 2))

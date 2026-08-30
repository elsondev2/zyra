import { createRoot } from 'react-dom/client'
import { createRef, useState } from 'react'
import FileMarkdownPreview from '../../src/renderer/src/components/ui/file-preview/FileMarkdownPreview'
import { resolveMarkdownSourceLineAtViewport } from '../../src/renderer/src/components/ui/file-preview/markdownPreviewModeLocation'
import { MARKDOWN_PREVIEW_NAVIGATE_EVENT } from '../../src/renderer/src/components/ui/markdown/markdownHeadingIds'
import agentsContent from '../../../AGENTS.md?raw'
import readmeContent from '../../../README.md?raw'
import '../../src/renderer/src/index.css'

const scrollContainerRef = createRef<HTMLDivElement>()
const alternateContent = agentsContent.replace('# Zyra CLI Instructions', '# Alternate Markdown Document')
let openAlternateDocument = () => undefined
let openReadmeDocument = () => undefined
let restoreMarkdownSourceLine = (_line: number) => undefined
let activeDocumentPath = 'C:/workspace/zyra/AGENTS.md'
let activeDocumentContent = agentsContent
const metrics = {
    getPathInfoCalls: 0,
    indexedSearchCalls: 0,
    scrollEvents: 0,
    pendingAnimationFrames: 0,
    maximumPendingAnimationFrames: 0,
    longTasks: [] as number[]
}

const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
const pendingAnimationFrames = new Set<number>()
window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    let frameId = 0
    frameId = originalRequestAnimationFrame((timestamp) => {
        pendingAnimationFrames.delete(frameId)
        metrics.pendingAnimationFrames = pendingAnimationFrames.size
        callback(timestamp)
    })
    pendingAnimationFrames.add(frameId)
    metrics.pendingAnimationFrames = pendingAnimationFrames.size
    metrics.maximumPendingAnimationFrames = Math.max(metrics.maximumPendingAnimationFrames, pendingAnimationFrames.size)
    return frameId
}
window.cancelAnimationFrame = (frameId: number): void => {
    pendingAnimationFrames.delete(frameId)
    metrics.pendingAnimationFrames = pendingAnimationFrames.size
    originalCancelAnimationFrame(frameId)
}

if (typeof PerformanceObserver !== 'undefined') {
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.duration >= 50) metrics.longTasks.push(entry.duration)
            }
        })
        observer.observe({ entryTypes: ['longtask'] })
    } catch {
        // Long-task observation is supplementary in older Chromium builds.
    }
}

Object.assign(window, {
    devscope: {
        getPathInfo: async (targetPath: string) => {
            metrics.getPathInfoCalls += 1
            return {
                success: true,
                exists: false,
                path: targetPath,
                name: targetPath.replace(/\\/g, '/').split('/').pop() || targetPath,
                type: null
            }
        },
        searchIndexedPaths: async () => {
            metrics.indexedSearchCalls += 1
            return { success: true, entries: [], ancestors: [], totalMatched: 0 }
        },
        getFileTree: async () => ({ success: true, tree: [] }),
        copyToClipboard: async () => ({ success: true }),
        openInExplorer: async () => ({ success: true })
    }
})

type MarkdownHarness = {
    ready: boolean
    read: () => Record<string, unknown>
    navigateToHeading: (headingId: string) => void
    openAlternateDocument: () => void
    openReadmeDocument: () => void
    probeLateSectionExpansion: () => number | null
    restoreMarkdownSourceLine: (line: number) => void
    resetActivity: () => void
    scrollToStart: () => void
    scrollToEnd: () => void
}

declare global {
    interface Window {
        __markdownHarness?: MarkdownHarness
    }
}

function readMetrics(): Record<string, unknown> {
    const element = scrollContainerRef.current
    const markdownRoot = element?.querySelector<HTMLElement>('[data-zyra-diagnostic-surface="markdown-preview"]')
    const preparingSections = element?.querySelectorAll('[aria-label="Preparing Markdown section"]').length || 0
    const workerFallbackSections = element?.querySelectorAll('[aria-label="Markdown worker unavailable; shown as source"]').length || 0
    return {
        ready: Boolean(element?.querySelector('[data-zyra-diagnostic-surface="markdown-preview"]')) && preparingSections === 0,
        preparingSections,
        workerFallbackSections,
        sourceCharacters: agentsContent.length,
        scrollTop: element?.scrollTop || 0,
        scrollHeight: element?.scrollHeight || 0,
        clientHeight: element?.clientHeight || 0,
        activeDocumentPath,
        sourceLineAtViewport: element && markdownRoot ? resolveMarkdownSourceLineAtViewport({
            content: activeDocumentContent,
            viewportTop: element.getBoundingClientRect().top,
            documentTop: markdownRoot.getBoundingClientRect().top,
            documentBottom: markdownRoot.getBoundingClientRect().bottom,
            headingPositions: Array.from(markdownRoot.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')).map((heading) => ({
                id: heading.id,
                top: heading.getBoundingClientRect().top
            }))
        }) : null,
        ...metrics,
        longTasks: [...metrics.longTasks]
    }
}

function Harness() {
    const [alternateDocument, setAlternateDocument] = useState(false)
    const [readmeDocument, setReadmeDocument] = useState(false)
    const [initialSourceLine, setInitialSourceLine] = useState<number | null>(null)
    const filePath = readmeDocument
        ? 'C:/workspace/zyra/README.md'
        : alternateDocument
            ? 'C:/workspace/zyra/ALTERNATE.md'
            : 'C:/workspace/zyra/AGENTS.md'
    const content = readmeDocument ? readmeContent : alternateDocument ? alternateContent : agentsContent
    activeDocumentPath = filePath
    activeDocumentContent = content
    openAlternateDocument = () => setAlternateDocument(true)
    openReadmeDocument = () => setReadmeDocument(true)
    restoreMarkdownSourceLine = (line: number) => setInitialSourceLine(line)
    return (
        <div
            ref={scrollContainerRef}
            data-markdown-wheel-harness
            style={{ width: '720px', height: '420px', overflowY: 'auto', overflowX: 'hidden', padding: '20px' }}
            onScroll={() => { metrics.scrollEvents += 1 }}
        >
            <FileMarkdownPreview
                key={filePath}
                content={content}
                filePath={filePath}
                linkSearchRoot="C:/workspace/zyra"
                scrollContainerRef={scrollContainerRef}
                initialSourceLine={initialSourceLine}
            />
        </div>
    )
}

createRoot(document.getElementById('root')!).render(<Harness />)
window.__markdownHarness = {
    ready: true,
    read: readMetrics,
    navigateToHeading: (headingId: string) => {
        window.dispatchEvent(new CustomEvent(MARKDOWN_PREVIEW_NAVIGATE_EVENT, {
            detail: {
                filePath: 'C:/workspace/zyra/AGENTS.md',
                headingId
            }
        }))
    },
    openAlternateDocument: () => openAlternateDocument(),
    openReadmeDocument: () => openReadmeDocument(),
    probeLateSectionExpansion: () => {
        const root = scrollContainerRef.current?.querySelector<HTMLElement>('[data-zyra-diagnostic-surface="markdown-preview"]')
        if (!root) return null
        const sections = Array.from(root.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
        const previousSection = sections.filter((section) => section.textContent?.includes('.zyra/profiles/<name>.md')).at(-1)
        const nextSection = sections.find((section) => section.textContent?.includes('Commands should earn their place'))
        if (!previousSection || !nextSection) return null
        const originalMinHeight = previousSection.style.minHeight
        previousSection.style.minHeight = `${previousSection.getBoundingClientRect().height + 640}px`
        const overlap = Math.max(0, previousSection.getBoundingClientRect().bottom - nextSection.getBoundingClientRect().top)
        previousSection.style.minHeight = originalMinHeight
        return overlap
    },
    restoreMarkdownSourceLine: (line: number) => restoreMarkdownSourceLine(line),
    resetActivity: () => {
        metrics.scrollEvents = 0
        metrics.maximumPendingAnimationFrames = metrics.pendingAnimationFrames
        metrics.longTasks = []
    },
    scrollToStart: () => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0 },
    scrollToEnd: () => {
        const element = scrollContainerRef.current
        if (element) element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    }
}

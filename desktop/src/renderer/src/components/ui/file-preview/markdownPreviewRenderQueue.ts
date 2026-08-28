import { isMarkdownScrollBusy } from '../markdown/markdownScrollActivity'

type QueuedRender = { run: () => void }
const urgentRenderQueue = new Map<string, QueuedRender>()
const normalRenderQueue = new Map<string, QueuedRender>()
const NORMAL_RENDER_BATCH_SIZE = 2
let renderQueueFrame: number | null = null
let renderQueueResumeTimer: number | null = null
let urgentDrainScheduled = false

function drainUrgentQueue(): void {
    const urgentJobs = [...urgentRenderQueue.values()]
    urgentRenderQueue.clear()
    // Enqueuing a worker request is cheap. Submit the complete visible window
    // together so the worker client can prioritize it without adding one frame
    // of latency per section.
    for (const job of urgentJobs) job.run()
}

function drainNormalQueue(): void {
    let remaining = NORMAL_RENDER_BATCH_SIZE
    while (remaining > 0) {
        const next = normalRenderQueue.entries().next().value as [string, QueuedRender] | undefined
        if (!next) return
        normalRenderQueue.delete(next[0])
        next[1].run()
        remaining -= 1
    }
}

function scheduleUrgentDrain(): void {
    if (urgentDrainScheduled || typeof window === 'undefined') return
    urgentDrainScheduled = true
    window.queueMicrotask(() => {
        urgentDrainScheduled = false
        if (urgentRenderQueue.size > 0) drainUrgentQueue()
        if (urgentRenderQueue.size > 0 || normalRenderQueue.size > 0) scheduleQueuedRender()
    })
}

function scheduleQueuedRender(): void {
    if (renderQueueFrame !== null || renderQueueResumeTimer !== null || typeof window === 'undefined') return
    renderQueueFrame = window.requestAnimationFrame(() => {
        renderQueueFrame = null
        if (urgentRenderQueue.size > 0) {
            drainUrgentQueue()
        } else if (normalRenderQueue.size > 0 && isMarkdownScrollBusy()) {
            renderQueueResumeTimer = window.setTimeout(() => {
                renderQueueResumeTimer = null
                scheduleQueuedRender()
            }, 100)
            return
        } else {
            drainNormalQueue()
        }
        if (urgentRenderQueue.size > 0 || normalRenderQueue.size > 0) scheduleQueuedRender()
    })
}

export function enqueueMarkdownSectionRender(key: string, run: () => void, urgent: boolean): () => void {
    const targetQueue = urgent ? urgentRenderQueue : normalRenderQueue
    const otherQueue = urgent ? normalRenderQueue : urgentRenderQueue
    const entry = { run }
    otherQueue.delete(key)
    targetQueue.set(key, entry)
    if (urgent && renderQueueResumeTimer !== null) {
        window.clearTimeout(renderQueueResumeTimer)
        renderQueueResumeTimer = null
    }
    if (urgent) scheduleUrgentDrain()
    else scheduleQueuedRender()
    return () => {
        if (urgentRenderQueue.get(key) === entry) urgentRenderQueue.delete(key)
        if (normalRenderQueue.get(key) === entry) normalRenderQueue.delete(key)
    }
}

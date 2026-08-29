import type { MarkdownPreviewSection } from './markdownPreviewVirtualModel'

type MarkdownIndexWorkerResponse =
    | { type: 'ready' }
    | { type: 'indexed'; id: number; sections: MarkdownPreviewSection[] }
    | { type: 'error'; id: number; error: string }

type PendingIndex = {
    content: string
    attempts: number
    consumers: Map<number, (sections: MarkdownPreviewSection[] | null) => void>
}

export type MarkdownPreviewIndexRequest = {
    promise: Promise<MarkdownPreviewSection[] | null>
    cancel: () => void
}

type CachedMarkdownIndex = { sections: MarkdownPreviewSection[]; estimatedBytes: number }
const MAX_INDEX_CACHE_ENTRIES = 2
const MAX_INDEX_CACHE_BYTES = 32 * 1024 * 1024
const MARKDOWN_INDEX_WORKER_IDLE_TTL_MS = 20_000
const indexCache = new Map<string, CachedMarkdownIndex>()
let indexCacheBytes = 0
let worker: Worker | null = null
let workerReady = false
let workerUnavailable = false
let requestSequence = 0
let consumerSequence = 0
const pendingByRequestId = new Map<number, PendingIndex>()
const requestIdByContent = new Map<string, number>()
const queuedRequestIds: number[] = []
let activeRequestId: number | null = null
let indexWatchdogTimer: number | null = null
let workerIdleTimer: number | null = null

function retainIndex(content: string, sections: MarkdownPreviewSection[]): void {
    const previous = indexCache.get(content)
    if (previous) indexCacheBytes -= previous.estimatedBytes
    const syntheticCharacters = sections.reduce((total, section) => (
        total
        + section.id.length
        + (section.renderPrefix?.length || 0)
        + (section.renderSuffix?.length || 0)
        + (section.headingIds?.reduce((sum, id) => sum + id.length, 0) || 0)
    ), 0)
    const estimatedBytes = content.length * 2 + syntheticCharacters * 2 + sections.length * 112
    if (estimatedBytes > MAX_INDEX_CACHE_BYTES) return
    indexCache.delete(content)
    indexCache.set(content, { sections, estimatedBytes })
    indexCacheBytes += estimatedBytes
    while (indexCache.size > MAX_INDEX_CACHE_ENTRIES || indexCacheBytes > MAX_INDEX_CACHE_BYTES) {
        const oldest = indexCache.entries().next().value as [string, CachedMarkdownIndex] | undefined
        if (!oldest) break
        indexCache.delete(oldest[0])
        indexCacheBytes -= oldest[1].estimatedBytes
    }
}

export function readCachedMarkdownPreviewIndex(content: string): MarkdownPreviewSection[] | null {
    const cached = indexCache.get(content)
    if (!cached) return null
    indexCache.delete(content)
    indexCache.set(content, cached)
    return cached.sections
}

function resolvePending(requestId: number, sections: MarkdownPreviewSection[] | null): void {
    const pending = pendingByRequestId.get(requestId)
    if (!pending) return
    pendingByRequestId.delete(requestId)
    requestIdByContent.delete(pending.content)
    for (const resolve of pending.consumers.values()) resolve(sections)
    pending.consumers.clear()
}

function pumpIndexQueue(): void {
    if (!worker || !workerReady || activeRequestId !== null) return
    while (queuedRequestIds.length > 0) {
        const requestId = queuedRequestIds.shift()!
        const pending = pendingByRequestId.get(requestId)
        if (!pending || pending.consumers.size === 0) {
            resolvePending(requestId, null)
            continue
        }
        clearWorkerIdleTimer()
        activeRequestId = requestId
        worker.postMessage({ type: 'index', id: requestId, content: pending.content })
        indexWatchdogTimer = window.setTimeout(() => {
            if (activeRequestId !== requestId) return
            clearIndexWatchdog()
            worker?.terminate()
            worker = null
            workerReady = false
            activeRequestId = null
            if (pending.consumers.size > 0 && pending.attempts < 1) {
                pending.attempts += 1
                queuedRequestIds.unshift(requestId)
            } else {
                resolvePending(requestId, null)
            }
            warmMarkdownPreviewIndexWorker()
        }, 15_000)
        return
    }
    scheduleWorkerIdleTermination()
}

function clearIndexWatchdog(): void {
    if (indexWatchdogTimer !== null && typeof window !== 'undefined') window.clearTimeout(indexWatchdogTimer)
    indexWatchdogTimer = null
}

function clearWorkerIdleTimer(): void {
    if (workerIdleTimer !== null && typeof window !== 'undefined') window.clearTimeout(workerIdleTimer)
    workerIdleTimer = null
}

function scheduleWorkerIdleTermination(): void {
    if (!worker || activeRequestId !== null || queuedRequestIds.length > 0 || workerIdleTimer !== null) return
    workerIdleTimer = window.setTimeout(() => {
        workerIdleTimer = null
        if (activeRequestId !== null || queuedRequestIds.length > 0) return
        worker?.terminate()
        worker = null
        workerReady = false
    }, MARKDOWN_INDEX_WORKER_IDLE_TTL_MS)
}

function restartIndexWorker(): void {
    clearIndexWatchdog()
    clearWorkerIdleTimer()
    worker?.terminate()
    worker = null
    workerReady = false
    activeRequestId = null
    warmMarkdownPreviewIndexWorker()
}

function disableWorker(): void {
    clearIndexWatchdog()
    clearWorkerIdleTimer()
    workerUnavailable = true
    workerReady = false
    worker?.terminate()
    worker = null
    activeRequestId = null
    queuedRequestIds.length = 0
    for (const requestId of [...pendingByRequestId.keys()]) resolvePending(requestId, null)
}

export function warmMarkdownPreviewIndexWorker(): void {
    clearWorkerIdleTimer()
    if (worker || workerUnavailable || typeof window === 'undefined' || typeof Worker === 'undefined') {
        if (worker && workerReady) scheduleWorkerIdleTermination()
        return
    }
    try {
        worker = new Worker(new URL('./markdown-preview-index.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<MarkdownIndexWorkerResponse>) => {
            const response = event.data
            if (response.type === 'ready') {
                workerReady = true
                pumpIndexQueue()
                return
            }
            if (response.id !== activeRequestId) return
            const pending = pendingByRequestId.get(response.id)
            clearIndexWatchdog()
            activeRequestId = null
            if (response.type === 'indexed' && pending) {
                if (pending.consumers.size > 0) retainIndex(pending.content, response.sections)
                resolvePending(response.id, response.sections)
            } else {
                resolvePending(response.id, null)
            }
            pumpIndexQueue()
        }
        worker.onerror = (event) => {
            console.error('Markdown index worker failed.', event.message, event.filename, event.lineno)
            disableWorker()
        }
        worker.onmessageerror = disableWorker
        worker.postMessage({ type: 'warm' })
    } catch {
        disableWorker()
    }
}

export function requestMarkdownPreviewIndex(content: string): MarkdownPreviewIndexRequest {
    const cached = readCachedMarkdownPreviewIndex(content)
    if (cached) return { promise: Promise.resolve(cached), cancel: () => undefined }
    warmMarkdownPreviewIndexWorker()
    if (!worker) return { promise: Promise.resolve(null), cancel: () => undefined }

    if (activeRequestId !== null) {
        const activePending = pendingByRequestId.get(activeRequestId)
        if (activePending && activePending.content !== content && activePending.consumers.size === 0) {
            const abandonedRequestId = activeRequestId
            resolvePending(abandonedRequestId, null)
            restartIndexWorker()
        }
    }

    let requestId = requestIdByContent.get(content)
    if (!requestId) {
        requestSequence += 1
        requestId = requestSequence
        requestIdByContent.set(content, requestId)
        pendingByRequestId.set(requestId, { content, attempts: 0, consumers: new Map() })
        queuedRequestIds.push(requestId)
    }
    const pending = pendingByRequestId.get(requestId)!
    consumerSequence += 1
    const consumerId = consumerSequence
    let settled = false
    const promise = new Promise<MarkdownPreviewSection[] | null>((resolve) => {
        pending.consumers.set(consumerId, (sections) => {
            if (settled) return
            settled = true
            resolve(sections)
        })
    })
    clearWorkerIdleTimer()
    pumpIndexQueue()
    return {
        promise,
        cancel: () => {
            if (settled) return
            pending.consumers.get(consumerId)?.(null)
            pending.consumers.delete(consumerId)
            if (pending.consumers.size > 0 || requestId === activeRequestId) return
            const queuedIndex = queuedRequestIds.indexOf(requestId!)
            if (queuedIndex >= 0) queuedRequestIds.splice(queuedIndex, 1)
            resolvePending(requestId!, null)
            scheduleWorkerIdleTermination()
        }
    }
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        clearIndexWatchdog()
        clearWorkerIdleTimer()
        worker?.terminate()
        worker = null
        workerReady = false
    })
}

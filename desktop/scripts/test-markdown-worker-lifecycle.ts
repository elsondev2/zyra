import assert from 'node:assert/strict'

type TimerRecord = { callback: () => void; delay: number }
const timers = new Map<number, TimerRecord>()
let timerSequence = 0
let workerStarts = 0
let workerTerminations = 0

class FakeWorker {
    onmessage: ((event: MessageEvent<any>) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    onmessageerror: (() => void) | null = null

    constructor(_url: URL, _options: WorkerOptions) {
        workerStarts += 1
    }

    postMessage(message: any): void {
        if (message.type === 'warm') {
            queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } } as MessageEvent))
            return
        }
        if (message.type === 'parse') {
            queueMicrotask(() => this.onmessage?.({
                data: { type: 'parsed', id: message.id, tree: { type: 'root', children: [] } }
            } as MessageEvent))
            return
        }
        if (message.type === 'index') {
            queueMicrotask(() => this.onmessage?.({
                data: { type: 'indexed', id: message.id, sections: [] }
            } as MessageEvent))
        }
    }

    terminate(): void {
        workerTerminations += 1
    }
}

const originalWindow = (globalThis as { window?: unknown }).window
const originalWorker = (globalThis as { Worker?: unknown }).Worker
;(globalThis as any).window = {
    setTimeout: (callback: () => void, delay: number) => {
        timerSequence += 1
        timers.set(timerSequence, { callback, delay })
        return timerSequence
    },
    clearTimeout: (timerId: number) => timers.delete(timerId)
}
;(globalThis as any).Worker = FakeWorker

function runIdleTimers(): void {
    const idleTimers = [...timers.entries()].filter(([, timer]) => timer.delay === 20_000)
    assert.equal(idleTimers.length > 0, true, 'completed Markdown work schedules idle process disposal')
    for (const [timerId, timer] of idleTimers) {
        timers.delete(timerId)
        timer.callback()
    }
}

try {
    const parser = await import('../src/renderer/src/components/ui/file-preview/markdownPreviewWorkerClient')
    const indexer = await import('../src/renderer/src/components/ui/file-preview/markdownPreviewIndexWorkerClient')
    assert.equal(workerStarts, 0, 'importing file-preview support does not eagerly create renderer processes')

    await parser.requestMarkdownPreviewSection('# bounded', true).promise
    assert.equal(workerStarts, 1, 'the parser worker starts only for actual Markdown demand')
    runIdleTimers()
    assert.equal(workerTerminations, 1, 'the parser worker exits after its bounded idle lifetime')

    await indexer.requestMarkdownPreviewIndex('# bounded').promise
    assert.equal(workerStarts, 2, 'the index worker starts only for actual long-document demand')
    runIdleTimers()
    assert.equal(workerTerminations, 2, 'the index worker exits after its bounded idle lifetime')
} finally {
    if (originalWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = originalWindow
    if (originalWorker === undefined) delete (globalThis as any).Worker
    else (globalThis as any).Worker = originalWorker
}

console.log('Markdown worker lifecycle: ok')

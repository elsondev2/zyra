/// <reference types="electron-vite/node" />
import createWorker from './harness-worker?nodeWorker'
import { app } from 'electron'
import { join } from 'node:path'
import type { Worker } from 'node:worker_threads'
import type { UsageSummary, UsageSummaryInput } from '../../../shared/assistant/usage-summary'

export type HarnessUsageResult = { summary:UsageSummary; coveredSessionIds:string[] }
let worker: Worker | null = null, sequence = 0
let lastRequestAt = 0, indexing = false
let idleTimer: ReturnType<typeof setTimeout> | null = null
function scheduleIdleRelease() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
        if (!worker) return
        if (indexing || pending.size || Date.now()-lastRequestAt < 120_000) { scheduleIdleRelease(); return }
        const idleWorker = worker; worker = null
        void idleWorker.terminate()
    },30_000)
    idleTimer.unref()
}
app.once('before-quit',() => { if (idleTimer) clearTimeout(idleTimer); if (worker) void worker.terminate() })
const pending = new Map<number,{ resolve:(result:HarnessUsageResult)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout> }>()
function fail() {
    worker = null; indexing = false
    if (idleTimer) clearTimeout(idleTimer)
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Local usage indexing stopped. Refresh to retry.')) }
    pending.clear()
}
export async function readHarnessUsage(input: UsageSummaryInput, ownedSessionIds: string[], projectPaths: string[] = []): Promise<HarnessUsageResult> {
    lastRequestAt = Date.now()
    if (!worker) {
        indexing = true
        const next = createWorker({ workerData:{cachePath:join(app.getPath('userData'),'assistant','harness-usage-v2.json')} })
        worker = next
        next.on('message',message => {
            if (message.type === 'indexing') { indexing = true; return }
            if (message.type === 'indexed') { indexing = false; scheduleIdleRelease(); return }
            const request = pending.get(message.id)
            if (!request) return
            pending.delete(message.id); clearTimeout(request.timer)
            if (message.summary?.sources?.some((source: {state:string}) => source.state === 'indexing')) indexing = true
            if (message.error) request.reject(new Error(message.error)); else request.resolve({summary:message.summary,coveredSessionIds:message.coveredSessionIds || []})
        })
        next.on('error',() => { if (worker === next) fail() })
        next.on('exit',() => { if (worker === next) fail() })
        next.unref()
        scheduleIdleRelease()
    }
    const id = ++sequence, current = worker
    return new Promise((resolve,reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Local history is still indexing. Try refreshing.')) },15_000)
        timer.unref()
        pending.set(id,{resolve,reject,timer})
        try { current.postMessage({id,input,ownedSessionIds,projectPaths}) } catch { clearTimeout(timer); pending.delete(id); reject(new Error('Could not request local usage.')) }
    })
}

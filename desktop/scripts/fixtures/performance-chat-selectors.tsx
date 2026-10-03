import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useAssistantStoreSelector } from '../../src/renderer/src/lib/assistant/assistant-store-hooks'
import { assistantStore } from './performance-assistant-store'

let selectorCalls = 0
let renders = 0
let selectorCpuMs = 0
let changeSelector: (suffix: string) => void
let nextSelected: unknown
function Harness() {
    const [suffix, setSuffix] = useState('')
    changeSelector = setSuffix
    const selected = useAssistantStoreSelector((input: any) => {
        const start = performance.now()
        selectorCalls++
        const sessions = input.snapshot.sessions.map((session: any) => ({ id: session.id, title: session.title, working: session.threads.some((thread: any) => thread.state === 'running') }))
        selectorCpuMs += performance.now() - start
        return { sessions, text: input.text + suffix }
    }, (left, right) => left.text === right.text && left.sessions.length === right.sessions.length && left.sessions.every((value: any, index: number) => value.id === right.sessions[index]?.id && value.title === right.sessions[index]?.title && value.working === right.sessions[index]?.working))
    nextSelected = selected
    renders++
    return <div data-result>{selected.text}</div>
}
Object.assign(window, { runPerformanceBenchmark: async ({ sessions = 1000, updates = 200, samples = 5 }: { sessions?: number; updates?: number; samples?: number }) => {
    const snapshot = { sessions: Array.from({ length: sessions }, (_, index) => ({ id: `chat-${index}`, title: `Synthetic chat ${index}`, threads: [{ state: index === 0 ? 'running' : 'ready' }] })) }
    const root = createRoot(document.getElementById('root')!)
    assistantStore.update({ snapshot, text: 'initial' })
    flushSync(() => root.render(<Harness />))
    const times: number[] = []
    const calls: number[] = []
    const cpu: number[] = []
    const renderCounts: number[] = []
    for (let sample = -1; sample < samples; sample++) {
        selectorCalls = 0; selectorCpuMs = 0; renders = 0
        const start = performance.now()
        for (let update = 0; update < updates; update++) {
            flushSync(() => assistantStore.update({ snapshot, text: `stream-${sample}-${update}` }))
        }
        if (sample >= 0) { times.push(performance.now() - start); calls.push(selectorCalls); cpu.push(selectorCpuMs); renderCounts.push(renders) }
        await new Promise(resolve => requestAnimationFrame(resolve))
    }
    const finalText = `stream-${samples - 1}-${updates - 1}`
    if (document.querySelector('[data-result]')?.textContent !== finalText) throw new Error('Streaming text lost')
    const oldSelection = nextSelected
    flushSync(() => assistantStore.update({ snapshot, text: finalText, unrelated: true }))
    if (nextSelected !== oldSelection) throw new Error('Equal selection changed identity')
    flushSync(() => changeSelector(' selector-changed'))
    if (!document.querySelector('[data-result]')?.textContent?.endsWith('selector-changed')) throw new Error('Selector closure change was ignored')
    flushSync(() => assistantStore.update({ snapshot: { sessions: [] }, text: finalText }))
    if ((nextSelected as any).sessions.length) throw new Error('Catalog deletion lost')
    let contractValue: any
    function Contract({ selector, equal = Object.is }: { selector: (state: any) => any; equal?: (a: any, b: any) => boolean }) {
        contractValue = useAssistantStoreSelector(selector, equal)
        return <div>{String(contractValue)}</div>
    }
    flushSync(() => root.render(<Contract selector={() => null} />))
    flushSync(() => assistantStore.update({ snapshot, text: 'null' }))
    if (contractValue !== null) throw Error('Null selection lost')
    flushSync(() => root.render(<Contract selector={() => undefined} />))
    flushSync(() => assistantStore.update({ snapshot, text: 'undefined' }))
    if (contractValue !== undefined) throw Error('Undefined selection lost')
    const first = { marker: 'first' }, second = { marker: 'second' }
    const select = (state: any) => state.contract
    assistantStore.update({ snapshot, contract: first })
    flushSync(() => root.render(<Contract key="comparison" selector={select} equal={() => true} />))
    flushSync(() => assistantStore.update({ snapshot, contract: second }))
    if (contractValue !== first) throw Error('Custom equality lost identity')
    flushSync(() => root.render(<Contract key="comparison" selector={select} equal={Object.is} />))
    if (contractValue !== second) throw Error('Changed comparator ignored')
    root.unmount()
    return { protocol: { sessions, updates, samples, warmups: 1, implementation: 'actual React hook, production React, synthetic store' }, timesMs: times, selectorCalls: calls, selectorCpuMs: cpu, renders: renderCounts, correctness: { finalText: true, equalityIdentity: true, closureChange: true, catalogDeletion: true, nullableSelection: true, comparatorChange: true } }
} })

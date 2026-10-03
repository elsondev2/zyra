import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from '../../src/renderer/src/components/CommandPalette'
import { CommandPaletteProvider } from '../../src/renderer/src/lib/commandPalette'
import { assistantStore } from './performance-assistant-store'

Object.assign(window, { devscope: { assistant: { searchChats: async () => ({ success: true, result: { matches: [], indexingOlderChats: false } }) } }, runPerformanceBenchmark: async ({ samples = 5, updates = 100, sessions = 1000 }) => {
    let catalogScans = 0
    let latest = ''
    const base = Array.from({ length: sessions }, (_, index) => {
        const createdAt = new Date(1700000000000 + index * 1000).toISOString()
        return { id: `palette-${index}`, title: `Saved chat ${index}`, mode: 'work', archived: false, createdAt, updatedAt: createdAt, threads: [{ id: `thread-${index}`, state: 'ready', createdAt, messages: [{ role: 'user', text: 'hello', createdAt }] }], activeThreadId: `thread-${index}` }
    })
    const catalog = () => new Proxy([...base], { get(target, key, receiver) { if (key === 'filter') catalogScans++; return Reflect.get(target, key, receiver) } })
    assistantStore.update({ snapshot: { sessions: catalog() } })
    const root = createRoot(document.getElementById('root')!)
    flushSync(() => root.render(<MemoryRouter><CommandPaletteProvider><CommandPalette /></CommandPaletteProvider></MemoryRouter>))
    await new Promise(resolve => requestAnimationFrame(resolve))
    const timesMs: number[] = [], scanCounts: number[] = []
    for (let sample = -1; sample < samples; sample++) {
        catalogScans = 0
        const start = performance.now()
        for (let update = 0; update < updates; update++) {
            latest = `Latest title ${sample}-${update}`
            base[base.length - 1] = { ...base[base.length - 1]!, title: latest }
            flushSync(() => assistantStore.update({ snapshot: { sessions: catalog() } }))
        }
        if (sample >= 0) { timesMs.push(performance.now() - start); scanCounts.push(catalogScans) }
        await new Promise(resolve => requestAnimationFrame(resolve))
    }
    if (document.querySelector('[role=combobox]')) throw Error('Closed palette was rendered')
    flushSync(() => window.dispatchEvent(new CustomEvent('zyra:palette-query', { detail: '' })))
    await new Promise(resolve => setTimeout(resolve, 50))
    if (!document.body.textContent?.includes(latest)) throw Error(`Opening palette did not read the newest title: ${JSON.stringify({ latest, body: document.body.textContent?.slice(0, 1500), catalogScans })}`)
    if (!document.querySelector('[role=combobox]')) throw Error('Palette did not open')
    base[base.length - 1] = { ...base[base.length - 1]!, title: 'Changed while open' }
    flushSync(() => assistantStore.update({ snapshot: { sessions: catalog() } }))
    if (!document.body.textContent?.includes('Changed while open')) throw Error('Open palette missed a live title change')
    const closeWithAnimation = async () => {
        const backdrop = document.querySelector('[role=dialog]')?.parentElement
        if (!backdrop) throw Error('Palette backdrop is missing')
        flushSync(() => backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        if (!document.querySelector('.animate-command-palette-out')) throw Error('Closing animation was skipped')
        if (!document.querySelector('[role=combobox]')) throw Error('Palette disappeared before its exit animation')
        await new Promise(resolve => setTimeout(resolve, 180))
        if (document.querySelector('[role=combobox]')) throw Error('Palette did not close')
    }
    await closeWithAnimation()
    base[base.length - 1] = { ...base[base.length - 1]!, title: 'Changed while closed' }
    flushSync(() => assistantStore.update({ snapshot: { sessions: catalog() } }))
    flushSync(() => window.dispatchEvent(new CustomEvent('zyra:palette-query', { detail: '' })))
    await new Promise(resolve => setTimeout(resolve, 50))
    if (!document.body.textContent?.includes('Changed while closed')) throw Error('Reopening showed stale chats')
    flushSync(() => window.dispatchEvent(new CustomEvent('zyra:palette-query', { detail: 'theme ' })))
    await new Promise(resolve => setTimeout(resolve, 50))
    if (document.querySelector('[role=combobox]')?.getAttribute('aria-label') !== 'Search themes') throw Error('Theme scope was lost')
    if (!document.querySelector('[role=option]')) throw Error('Theme results are missing')
    await closeWithAnimation()
    root.unmount()
    return { protocol: { sessions, updates, samples, warmups: 1, implementation: 'Actual CommandPalette/React/router/search hook; synthetic settings/store and generated catalog, no IPC' }, timesMs, catalogScans: scanCounts, correctness: { closedPaletteNotRendered: true, latestTitleOnOpen: true, realOpenInteraction: true, openTitleUpdates: true, reopenFreshness: true, themeScope: true, exitAnimationPreserved: true } }
} })

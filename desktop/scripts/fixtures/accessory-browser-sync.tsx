import { act, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AccessoryBrowser } from '../../src/renderer/src/pages/accessories/AccessoryBrowser'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const assert = {
    ok(value: unknown, message = 'expected a truthy value') {
        if (!value) throw new Error(message)
    },
    equal(actual: unknown, expected: unknown, message = `expected ${String(actual)} to equal ${String(expected)}`) {
        if (actual !== expected) throw new Error(message)
    },
    deepEqual(actual: unknown, expected: unknown, message = 'values are not deeply equal') {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
    }
}

class TestResizeObserver {
    observe() {}
    disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: TestResizeObserver })

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const tab = (id: string, url = '') => ({ id, sessionMode: 'normal' as const, url, title: url ? id : 'New tab', faviconUrl: null })
const state = (id: string, tabs: ReturnType<typeof tab>[], activeBrowserTabId = tabs[0]?.id || null) => ({
    id,
    kind: 'browser' as const,
    sessionMode: 'normal' as const,
    rootPath: 'C:/synthetic-accessory',
    requests: [],
    browserTabs: tabs,
    activeBrowserTabId
})
const copyState = <T extends ReturnType<typeof state>>(value: T): T => ({
    ...value,
    requests: value.requests.map((request) => ({ ...request })),
    browserTabs: value.browserTabs.map((entry) => ({ ...entry }))
})

type BrowserState = ReturnType<typeof state>
type SyncInput = { workspaceId: string; activeTabId: string | null; tabs: ReturnType<typeof tab>[] }

type SyntheticApi = ReturnType<typeof createSyntheticApi>
function createSyntheticApi(initial: BrowserState, options: { deferredGet?: boolean; echoLimit?: number } = {}) {
    let current = copyState(initial)
    let resolveGet: ((value: { success: true; state: BrowserState }) => void) | null = null
    const listeners = new Set<(value: BrowserState) => void>()
    const syncInputs: SyncInput[] = []
    const getState = options.deferredGet
        ? () => new Promise<{ success: true; state: BrowserState }>((resolve) => { resolveGet = resolve })
        : async () => ({ success: true as const, state: copyState(current) })
    const emitSnapshot = (next: BrowserState) => {
        for (const listener of listeners) listener(copyState(next))
    }
    const emit = (next: BrowserState) => {
        current = copyState(next)
        emitSnapshot(current)
    }
    return {
        syncInputs,
        get current() { return copyState(current) },
        api: {
            getState,
            onChanged(callback: (value: BrowserState) => void) { listeners.add(callback); return () => listeners.delete(callback) },
            async syncBrowserTabs(input: SyncInput) {
                syncInputs.push({ ...input, tabs: input.tabs.map((entry) => ({ ...entry })) })
                current = { ...current, browserTabs: input.tabs.map((entry) => ({ ...entry })), activeBrowserTabId: input.activeTabId }
                if (syncInputs.length <= (options.echoLimit ?? Number.POSITIVE_INFINITY)) emit(current)
                return { success: true as const, state: copyState(current) }
            },
            async registerBrowserDropZone() { return { success: true as const, registered: true as const } },
            async beginBrowserTabTearOff() { return { success: false as const, error: 'unused' } },
            async finishBrowserTabTearOff() { return { success: false as const, error: 'unused' } },
            async cancelBrowserTabTearOff() { return { success: true as const, cancelled: true as const } }
        },
        emit,
        emitStale(next: BrowserState) { emitSnapshot(next) },
        resolveGet(next = initial) {
            assert.ok(resolveGet, 'deferred getState was not started')
            const resolve = resolveGet
            resolveGet = null
            resolve({ success: true, state: copyState(next) })
        }
    }
}

type WorkspaceTab = ReturnType<typeof tab> & { status: 'idle'; error: null; canGoBack: false; canGoForward: false; audible: false; displayAddress: null }
type WorkspaceState = { version: 1; activeTabId: string; splitTabId: null; tabs: WorkspaceTab[] }
const workspaceTab = (id: string, sessionMode = 'normal' as const, url = ''): WorkspaceTab => ({
    ...tab(id, url),
    sessionMode,
    status: 'idle',
    error: null,
    canGoBack: false,
    canGoForward: false,
    audible: false,
    displayAddress: null
})

export function SyntheticAssistantBrowserWorkspace(props: any) {
    const sequence = useRef(1)
    const [controllerVersion, setControllerVersion] = useState(0)
    const [workspace, setWorkspace] = useState<WorkspaceState>(() => ({
        version: 1,
        activeTabId: props.selectedTabId || `${props.tabIdPrefix}:0`,
        splitTabId: null,
        tabs: [workspaceTab(props.selectedTabId || `${props.tabIdPrefix}:0`, props.defaultSessionMode)]
    }))
    const workspaceRef = useRef(workspace)
    workspaceRef.current = workspace
    const commit = useCallback((next: WorkspaceState) => {
        workspaceRef.current = next
        setWorkspace(next)
    }, [])
    const createTab = useCallback((url = '', options: any = {}) => {
        const existing = options.tabId && workspaceRef.current.tabs.find((entry) => entry.id === options.tabId)
        if (existing) {
            if (options.activate !== false && workspaceRef.current.activeTabId !== existing.id) {
                commit({ ...workspaceRef.current, activeTabId: existing.id })
            }
            return existing.id
        }
        const id = options.tabId || `${props.tabIdPrefix}:${sequence.current++}`
        const created = workspaceTab(id, options.sessionMode || props.defaultSessionMode, url)
        const activate = options.activate !== false
        commit({ ...workspaceRef.current, tabs: [...workspaceRef.current.tabs, created], activeTabId: activate ? id : workspaceRef.current.activeTabId })
        return id
    }, [commit, props.defaultSessionMode, props.tabIdPrefix])
    const closeTab = useCallback((id: string, options: any = {}) => {
        ;(globalThis as any).__transferredCloses.push({ id, transferred: options.transferred === true })
        const current = workspaceRef.current
        if (!current.tabs.some((entry) => entry.id === id)) return current
        let tabs = current.tabs.filter((entry) => entry.id !== id)
        if (tabs.length === 0) tabs = [workspaceTab(`${props.tabIdPrefix}:${sequence.current++}`, props.defaultSessionMode)]
        const activeTabId = current.activeTabId === id ? tabs[0].id : current.activeTabId
        const next = { ...current, tabs, activeTabId }
        commit(next)
        return next
    }, [commit, props.defaultSessionMode, props.tabIdPrefix])
    const activateTab = useCallback((id: string) => {
        if (workspaceRef.current.activeTabId === id || !workspaceRef.current.tabs.some((entry) => entry.id === id)) return
        commit({ ...workspaceRef.current, activeTabId: id })
    }, [commit])
    const reorderTabs = useCallback((ids: string[]) => {
        const current = workspaceRef.current
        if (current.tabs.every((entry, index) => entry.id === ids[index])) return
        commit({ ...current, tabs: ids.map(id => current.tabs.find(entry => entry.id === id)!) })
    }, [commit])
    const controller = useMemo(() => ({ createTab, closeTab, activateTab, reorderTabs }), [activateTab, closeTab, createTab, reorderTabs, controllerVersion])
    useEffect(() => {
        ;(globalThis as any).__workspaceController = controller
        ;(globalThis as any).__replaceWorkspaceController = () => setControllerVersion((value) => value + 1)
        props.onControllerChange(controller)
        return () => props.onControllerChange(null)
    }, [controller, props.onControllerChange])
    useEffect(() => props.onTabsChange(workspace), [props.onTabsChange, workspace])
    return <div data-synthetic-workspace={workspace.activeTabId} />
}

let root: Root | null = null
let host: HTMLDivElement | null = null
async function mount(api: SyntheticApi, workspaceId: string) {
    if (root) {
        await act(async () => { root!.unmount(); await tick() })
        host?.remove()
    }
    ;(globalThis as any).__transferredCloses = []
    ;(window as any).devscope = {
        accessories: api.api,
        browserView: { close: async () => ({ success: true }) },
        window: { setFullScreen: () => undefined }
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
        root!.render(<AccessoryBrowser
            workspaceId={workspaceId}
            sessionMode="normal"
            request={null}
            onRequestHandled={() => undefined}
            onError={(error) => { throw new Error(error) }}
        />)
        await tick()
        await tick()
    })
}
async function settle() {
    await act(async () => { await tick(); await tick(); await tick() })
}
async function emit(api: SyntheticApi, next: BrowserState) {
    await act(async () => { api.emit(next); await tick(); await tick() })
}
function renderedTabs() {
    return [...document.querySelectorAll<HTMLElement>('[data-accessory-browser-tab-id]')].map((element) => element.dataset.accessoryBrowserTabId)
}

async function run() {
    const loopId = 'browser-normal-loop'
    const loopApi = createSyntheticApi(state(loopId, [tab(`${loopId}:a`), tab(`${loopId}:b`)]), { echoLimit: 16 })
    await mount(loopApi, loopId)
    await settle()
    assert.ok(loopApi.syncInputs.length <= 2, `fresh onChanged arrays caused ${loopApi.syncInputs.length} syncBrowserTabs calls`)
    const callsAfterSettle = loopApi.syncInputs.length
    await emit(loopApi, loopApi.current)
    await emit(loopApi, loopApi.current)
    assert.equal(loopApi.syncInputs.length, callsAfterSettle, 'equivalent remote events are idempotent')
    await act(async () => { (globalThis as any).__replaceWorkspaceController(); await tick(); await tick() })
    assert.equal(loopApi.syncInputs.length, callsAfterSettle, 'controller identity changes do not republish unchanged tabs')

    const localId = 'browser-normal-local'
    const localA = `${localId}:a`
    const localB = `${localId}:b`
    const localInitial = state(localId, [tab(localA), tab(localB)])
    const localApi = createSyntheticApi(localInitial, { echoLimit: 20 })
    await mount(localApi, localId)
    await settle()
    const beforeClose = localApi.syncInputs.length
    await act(async () => { (globalThis as any).__workspaceController.closeTab(localB); await tick(); await tick() })
    await act(async () => { localApi.emitStale(localInitial); await tick(); await tick() })
    assert.ok(localApi.syncInputs.length > beforeClose, 'a local close reaches main even while the prior remote snapshot still contains the tab')
    assert.deepEqual(localApi.current.browserTabs.map((entry) => entry.id), [localA])
    assert.deepEqual(renderedTabs(), [localA], 'a stale remote echo cannot resurrect a locally closed tab')
    let createdId = ''
    await act(async () => { createdId = (globalThis as any).__workspaceController.createTab(''); await tick(); await tick() })
    assert.ok(localApi.current.browserTabs.some((entry) => entry.id === createdId), 'local create synchronizes')
    await act(async () => { (globalThis as any).__workspaceController.activateTab(localA); await tick(); await tick() })
    assert.equal(localApi.current.activeBrowserTabId, localA, 'local activation synchronizes')

    const transferId = 'browser-normal-transfer'
    const transferA = `${transferId}:a`
    const transferB = `${transferId}:incoming`
    const transferApi = createSyntheticApi(state(transferId, [tab(transferA)]), { echoLimit: 20 })
    await mount(transferApi, transferId)
    await settle()
    const incomingStart = transferApi.syncInputs.length
    await emit(transferApi, state(transferId, [tab(transferB, 'https://incoming.test/'), tab(transferA)], transferB))
    await settle()
    assert.ok(renderedTabs().includes(transferB), 'an incoming live transfer is added locally')
    assert.deepEqual(renderedTabs(), [transferB, transferA], 'cross-window drop placement reaches the rendered tab order')
    assert.ok(transferApi.syncInputs.slice(incomingStart).every((input) => input.tabs.some((entry) => entry.id === transferB)), 'no post-transfer sync drops the incoming live tab')

    const outgoingStart = transferApi.syncInputs.length
    await emit(transferApi, state(transferId, [tab(transferA)], transferA))
    await settle()
    assert.ok(!renderedTabs().includes(transferB), 'an outgoing transfer is removed locally')
    assert.ok((globalThis as any).__transferredCloses.some((entry: any) => entry.id === transferB && entry.transferred), 'outgoing transfer removal keeps native guest ownership intact')
    assert.ok(transferApi.syncInputs.slice(outgoingStart).every((input) => !input.tabs.some((entry) => entry.id === transferB)), 'outgoing transfer acknowledgement cannot reintroduce the departed tab')

    const lastSourceId = 'browser-normal-last-source'
    const departedLastTab = `${lastSourceId}:a`
    const lastSourceApi = createSyntheticApi(state(lastSourceId, [tab(departedLastTab)]), { echoLimit: 20 })
    await mount(lastSourceApi, lastSourceId)
    await settle()
    await emit(lastSourceApi, state(lastSourceId, [], null))
    await settle()
    assert.ok(!renderedTabs().includes(departedLastTab), 'removing the source window last tab cannot resurrect the transferred guest')
    assert.equal(lastSourceApi.current.browserTabs.length, 1, 'the source window synchronizes its fresh local replacement tab')
    assert.ok((globalThis as any).__transferredCloses.some((entry: any) => entry.id === departedLastTab && entry.transferred), 'last-tab source removal also preserves native guest ownership')

    const raceId = 'browser-normal-race'
    const raceA = `${raceId}:a`
    const raceIncoming = `${raceId}:incoming`
    const stale = state(raceId, [tab(raceA)], raceA)
    const newer = state(raceId, [tab(raceA), tab(raceIncoming, 'https://race.test/')], raceIncoming)
    const raceApi = createSyntheticApi(stale, { deferredGet: true, echoLimit: 20 })
    await mount(raceApi, raceId)
    await emit(raceApi, newer)
    await act(async () => { raceApi.resolveGet(stale); await tick(); await tick() })
    await settle()
    assert.ok(renderedTabs().includes(raceIncoming), 'a late initial getState result cannot overwrite a newer onChanged transfer')
    assert.ok(raceApi.syncInputs.every((input) => input.tabs.some((entry) => entry.id === raceIncoming)), 'bootstrap races never publish a state that drops the incoming tab')

    console.log('Accessory Browser React synchronization: bounded loop, idempotence, local mutations, transfers, and bootstrap race: ok')
}

run().catch((error) => {
    console.error(error)
    ;(globalThis as any).__testFailed = String(error?.stack || error)
})

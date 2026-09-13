import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantBrowserDownloadsButton, type BrowserDownloadsApi } from '../../src/renderer/src/pages/assistant/AssistantBrowserDownloadsButton'
import { usePreparedBrowserOverlay } from '../../src/renderer/src/pages/assistant/usePreparedBrowserOverlay'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const results: string[] = []
const scopes = { active: true, scopeKey: 'workspace-a:tab-a' }
type Deferred = { promise: Promise<void>; resolve: () => void; reject: () => void }
let deferred: Deferred[] = []
let openings = 0
const prepare = () => {
    let resolve!: () => void, reject!: () => void
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = () => fail(new Error('Synthetic capture failure')) })
    deferred.push({ promise, resolve, reject })
    return promise
}
const downloadsApi: BrowserDownloadsApi = {
    list: async () => ({ success: true, downloads: [{ id: 'download-a', filename: 'example.txt', status: 'completed', totalBytes: 40, receivedBytes: 40, risk: 'normal' } as never] }),
    subscribe: () => () => {},
    act: async () => ({ success: true, downloads: [] })
}
function Profile() {
    const [open, setOpen] = useState(false)
    const intent = usePreparedBrowserOverlay({ ...scopes, open, prepare, onOpen: () => { openings++; setOpen(true) }, onClose: () => setOpen(false) })
    return <><button aria-label="Profile" onClick={intent.toggle}>Profile</button>{open && <section aria-label="Profile menu" />}</>
}
async function run(kind: 'profile' | 'downloads') {
    const host = document.createElement('div'); document.body.append(host)
    let root = createRoot(host)
    const buttonLabel = kind === 'profile' ? 'Profile' : 'Downloads'
    const menuLabel = kind === 'profile' ? 'Profile menu' : 'Browser downloads'
    const render = () => root.render(kind === 'profile' ? <Profile /> : <AssistantBrowserDownloadsButton {...scopes} api={downloadsApi} onBeforeOverlayOpen={prepare} onOverlayChange={open => { if (open) openings++ }} />)
    const clicked = async () => { await act(async () => { (host.querySelector(`[aria-label="${buttonLabel}"]`) as HTMLButtonElement).click() }) }
    const shown = () => Boolean(host.querySelector(`section[aria-label="${menuLabel}"]`))
    const settle = async (request: Deferred, failed = false) => { await act(async () => { if (failed) request.reject(); else request.resolve(); await request.promise.catch(() => {}) }) }
    deferred = []; openings = 0; scopes.active = true; scopes.scopeKey = 'workspace-a:tab-a'
    await act(async () => render())

    await clicked(); const secondClick = deferred.at(-1)!
    await clicked(); await settle(secondClick)
    check(!shown(), `${kind}: second click must cancel a pending open`)

    await clicked(); const oldTab = deferred.at(-1)!
    scopes.scopeKey = 'workspace-a:tab-b'; await act(async () => render())
    await clicked(); const newTab = deferred.at(-1)!
    await settle(oldTab); check(!shown(), `${kind}: old tab preparation must not open the new tab menu`)
    await settle(newTab); check(shown(), `${kind}: current tab preparation opens normally`)
    scopes.scopeKey = 'workspace-b:tab-b'; await act(async () => render())
    check(!shown(), `${kind}: changing workspace closes an already open menu`)

    await clicked(); const hidden = deferred.at(-1)!
    scopes.active = false; await act(async () => render()); await settle(hidden)
    check(!shown(), `${kind}: hidden surfaces cannot reopen after preparation`)
    const beforeInactive = deferred.length; await clicked()
    check(deferred.length === beforeInactive, `${kind}: inactive surfaces must not start preparation`)
    scopes.active = true; await act(async () => render())

    if (kind === 'downloads') {
        await clicked(); const escape = deferred.at(-1)!
        await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
        await settle(escape); check(!shown(), 'downloads: Escape cancels pending preparation')
        await clicked(); const outside = deferred.at(-1)!
        await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
        await settle(outside); check(!shown(), 'downloads: outside click cancels pending preparation')
    }
    await clicked(); await settle(deferred.at(-1)!, true)
    check(shown(), `${kind}: current capture failure still leaves the menu reachable`)
    await clicked(); check(!shown(), `${kind}: the open menu closes normally`)
    await clicked(); const unmounted = deferred.at(-1)!, beforeUnmount = openings
    await act(async () => root.unmount()); await settle(unmounted)
    check(openings === beforeUnmount, `${kind}: unmount suppresses all late open callbacks`)
    host.remove(); results.push(`${kind}: delayed prep, second click, tab/workspace switch, hide, failure and unmount`)
}
Object.assign(window, { browserOverlayIntentCheck: (async () => { await run('profile'); await run('downloads'); return results })() })

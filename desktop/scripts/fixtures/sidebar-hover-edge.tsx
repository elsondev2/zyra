import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import { AssistantChatSessionsRail } from '../../src/renderer/src/pages/assistant/AssistantChatSessionsRail'

const root = createRoot(document.getElementById('root')!)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const check = (value: unknown, message: string) => { if (!value) throw Error(message) }
let pinned = false
function render() {
    flushSync(() => root.render(<MemoryRouter><div className="flex h-full pt-[34px]">
        <AssistantChatSessionsRail collapsed width={322} previewPinned={pinned} agentInboxEnabled
            projectIconOverrides={{}} projects={[]} sessions={[]} activeSessionId={null} activeThreadId={null}
            commandPending={false} pendingControlThreadIds={new Set()} onCreateChat={() => {}}
            onCreateProjectChat={() => {}} onSelectSession={() => {}} onSelectThread={() => {}}
            onRenameSession={() => {}} onArchiveSession={() => {}} onDeleteSession={async () => ({ success: true })}
            onPreviewPinnedChange={value => { pinned = value; render() }} onShowToast={() => {}} />
        <main className="h-full flex-1" data-chat-area />
    </div></MemoryRouter>))
}
function surface() { return document.querySelector<HTMLElement>('.zyra-sidebar-floating-surface')! }
function visible() { return surface().getAttribute('aria-hidden') === 'false' }
async function move(x: number, y: number, type = 'mouseMove') {
    const request = { x, y, type, done: false }
    ;(window as any).sidebarPointerRequest = request
    for (let count = 0; !request.done && count < 100; count++) await sleep(10)
    check(request.done, 'Hidden Electron delivered the pointer movement')
    await sleep(40)
}
async function run() {
    render(); await sleep(80)
    check(!visible(), 'Collapsed sidebar starts closed')
    await move(1, 250); await sleep(650)
    check(visible(), 'Window-edge hover opens bubble')
    await move(140, 250)
    for (const x of [16, 7, 1, 0, 1, 7, 16, 140]) {
        await move(x, 250); await sleep(250)
        check(visible(), `Preview stays open at window-side coordinate ${x}`)
    }
    for (const y of [35, innerHeight - 1, 250]) {
        await move(0, y); await sleep(250)
        check(visible(), 'Preview stays open across edge-strip gutters')
    }
    await move(0, 250, 'mouseLeave'); await sleep(250)
    check(visible(), 'Native boundary leave at the window edge must not dismiss preview')
    await move(550, 250); await sleep(250)
    check(!visible(), 'Moving directly from native edge into chat dismisses the unpinned preview')
    await move(1, 250); await sleep(650); await move(140, 250)
    await move(-12, 250, 'mouseLeave'); await sleep(250)
    check(!visible(), 'Actually leaving the window still dismisses preview')
    await move(1, 250); await sleep(650); await move(0, 250, 'mouseLeave')
    window.dispatchEvent(new Event('blur')); await sleep(250)
    check(!visible(), 'Switching away from the app dismisses an unpinned preview at the native edge')
    await move(1, 250); await sleep(650)
    pinned = true; render(); await move(550, 250); await sleep(250)
    window.dispatchEvent(new Event('blur')); await sleep(250)
    check(visible(), 'Pinning still keeps preview open away from edge')
    return ['real chat rail: edge handoff, native boundary leave, exact edge, gutters, normal dismissal, app blur and pinning']
}
;(window as any).sidebarEdgeCheck = run()

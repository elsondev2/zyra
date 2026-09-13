import { act } from 'react'
import { NativeOverlayPortal } from '../../src/renderer/src/components/ui/native-overlay-portal'
import { useFilePreviewChrome } from '../../src/renderer/src/components/ui/file-preview/useFilePreviewChrome'
import { createRoot } from 'react-dom/client'
import { AssistantBrowserDownloadsButton, type BrowserDownloadsApi } from '../../src/renderer/src/pages/assistant/AssistantBrowserDownloadsButton'
import { AssistantBrowserDeviceToolbar } from '../../src/renderer/src/pages/assistant/AssistantBrowserDeviceToolbar'
import { AssistantDatePicker } from '../../src/renderer/src/pages/assistant/AssistantDatePicker'
import { FileActionsMenu } from '../../src/renderer/src/components/ui/FileActionsMenu'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const delay = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
async function settle(predicate: () => boolean, message: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
        await act(async () => { await delay() })
        if (predicate()) return
    }
    throw new Error(message)
}
const iframe = document.createElement('iframe')
iframe.style.cssText = 'position:absolute;left:0;top:0;width:840px;height:640px;border:0'
document.body.append(iframe)
const child = iframe.contentWindow!
const childDocument = iframe.contentDocument!
let prepared!: () => void
const preparation = new Promise<void>(resolve => { prepared = resolve })
const visibility: boolean[] = []
const focusRequests: Array<boolean | undefined> = []
Object.assign(window, { devscope: {
    prepareNativeOverlay: async () => { await preparation; return { success: true, frameName: 'synthetic-native-caller' } },
    setNativeOverlayVisible: async ({ visible, focus }: { visible: boolean; focus?: boolean }) => { visibility.push(visible); if (visible) focusRequests.push(focus); return { success: true } },
    onNativeOverlayDismiss: () => () => {}
} })
// The real native host/portal is exercised across documents; window ownership and IPC
// are covered by test-native-overlay, so this fixture controls only window.open.
window.open = () => child
const host = document.createElement('div')
host.style.cssText = 'position:relative;width:840px;height:640px'
document.body.append(host)
const ownerInput = document.createElement('input')
ownerInput.setAttribute('aria-label', 'Owner address input')
document.body.append(ownerInput)
const root = createRoot(host)
const results: string[] = []
const click = async (element: Element | null) => {
    check(element, 'expected an interactive control')
    await act(async () => {
        const owner = element!.ownerDocument.defaultView!
        element!.dispatchEvent(new owner.PointerEvent('pointerdown', { bubbles: true }))
        ;(element as HTMLElement).click()
    })
}
const key = async (element: Element, value: string, shiftKey = false) => {
    await act(async () => element.dispatchEvent(new element.ownerDocument.defaultView!.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })))
}
const download = { id: 'fixture-download', filename: 'fixture.txt', status: 'completed', totalBytes: 40, receivedBytes: 40, risk: 'normal', exists: true } as const
const actions: string[] = []
const api: BrowserDownloadsApi = {
    list: async () => ({ success: true, downloads: [download as never] }),
    subscribe: () => () => {},
    act: async action => { actions.push(action.type); return { success: true, downloads: [download as never] } }
}
const resizeCommits: number[] = []
const commitResize = (_side: 'left' | 'right', width: number) => resizeCommits.push(width)
function PreviewChromeFixture() {
    const chrome = useFilePreviewChrome({ defaultStartExpanded: false, defaultLeftPanelOpen: true, defaultRightPanelOpen: false,
        defaultCsvDistinctColorsEnabled: false, defaultEditorWordWrap: 'off', defaultEditorMinimapEnabled: false, defaultEditorFontSize: 12,
        onPanelWidthCommit: commitResize })
    return <div ref={chrome.previewSurfaceRef}><button data-preview-resize-side="left">Resize preview</button><output data-preview-width>{chrome.leftPanelWidth}</output></div>
}
Object.assign(window, { nativeOverlayCallerCheck: (async () => {
    let active = true, scopeKey = 'workspace:tab-a'
    const renderDownloads = async () => act(async () => root.render(<AssistantBrowserDownloadsButton api={api} active={active} scopeKey={scopeKey} />))
    const trigger = () => host.querySelector('[aria-label="Downloads"]')
    const panel = () => childDocument.querySelector('[aria-label="Browser downloads"]')
    await renderDownloads()
    ownerInput.focus()
    await click(trigger())
    check(!panel(), 'cold native document remains unmounted until ready')
    await click(trigger())
    prepared()
    await act(async () => { await preparation; await delay(80) })
    check(!panel(), 'second click cancels a cold portal without stale reopening')
    await click(trigger())
    await settle(() => Boolean(panel()), 'Downloads should open in the native document')
    check(!host.querySelector('[aria-label="Browser downloads"]'), 'Downloads is absent from the original DOM')
    check(panel()!.ownerDocument !== document, 'Downloads owns a separate DOM realm')
    check(document.activeElement === ownerInput, 'native popup presentation preserves an address-like owner input focus')
    check(focusRequests.every(focus => focus === false), 'native presentation explicitly requests no focus theft')
    const optionTrigger = () => childDocument.querySelector('button[aria-label="Options for fixture.txt"]')
    const options = () => childDocument.querySelector('[role="menu"][aria-label="Options for fixture.txt"]')
    await click(optionTrigger())
    await settle(() => Boolean(options()), 'nested options should mount in the native document').catch(error => { throw new Error(`${error.message}; panel=${Boolean(panel())}; expanded=${optionTrigger()?.getAttribute('aria-expanded')}; menus=${childDocument.querySelectorAll('[role=menu]').length}; originalMenus=${document.querySelectorAll('[role=menu]').length}; text=${childDocument.body.textContent?.slice(-600)}`) })
    check(Boolean(panel()), 'cross-realm pointer inside the Downloads panel must not dismiss it')
    await key(options()!, 'Escape')
    await settle(() => !options(), 'Escape closes nested options')
    check(Boolean(panel()), 'nested Escape preserves Downloads')
    await click(optionTrigger())
    await settle(() => Boolean(options()), 'options reopen')
    await click([...options()!.querySelectorAll('button')].find(button => button.textContent?.includes('Show in folder'))!)
    check(actions.includes('reveal'), 'a real nested options click reaches the download API')
    await click(trigger())
    await settle(() => Boolean(panel()), 'Downloads reopens after action')
    scopeKey = 'workspace:tab-b'; await renderDownloads()
    await settle(() => !panel(), 'tab/scope switch closes the open native menu')
    await click(trigger()); await settle(() => Boolean(panel()), 'new scope opens')
    active = false; await renderDownloads(); await settle(() => !panel(), 'inactive browser closes menu')
    await click(trigger()); await act(async () => { await delay(40) }); check(!panel(), 'inactive browser cannot open menu')
    active = true; await renderDownloads(); await click(trigger()); await settle(() => Boolean(panel()), 'active menu opens')
    await act(async () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await settle(() => !panel(), 'outside pointer in original document dismisses native menu')
    results.push('actual Downloads: cold cancellation, cross-document nested clicks/Escape, quick toggle, tab/active changes and outside dismissal')

    let presetChanges = 0
    await act(async () => root.render(<AssistantBrowserDeviceToolbar viewport={{ mode: 'freeform', width: 390, height: 844, presetId: null, aspectRatio: null }} onViewportChange={() => presetChanges++} onClose={() => {}} />))
    await click(host.querySelector('[aria-label="Browser device preset"]'))
    await settle(() => Boolean(childDocument.querySelector('[aria-label="Standard Browser devices"]')), 'device listbox mounts')
    await click(childDocument.querySelector('[aria-label="Standard Browser devices"] button'))
    check(presetChanges === 1, 'device selection survives the cross-document outside-click boundary')
    results.push('actual device menu: anchored native listbox selection reaches viewport callback')

    await act(async () => root.render(<AssistantDatePicker value="2026-09-13" max="2026-09-13" onChange={() => {}} />))
    await click(host.querySelector('button'))
    await settle(() => Boolean(childDocument.querySelector('[aria-label="Choose import start date"]')), 'date picker mounts')
    const dialog = childDocument.querySelector('[aria-label="Choose import start date"]')!
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    buttons.at(-1)!.focus()
    await key(buttons.at(-1)!, 'Tab')
    check(childDocument.activeElement === buttons[0], 'date picker Tab trap reads its own document')
    await key(buttons[0], 'Escape')
    await settle(() => !childDocument.querySelector('[aria-label="Choose import start date"]'), 'date picker Escape closes')
    results.push('actual date picker: child-document Tab wrap and Escape')

    let selected = 0
    await act(async () => root.render(<FileActionsMenu title="Add fixture tab" items={[{ id: 'first', label: 'First action', onSelect: () => { selected++ } }]} />))
    await key(host.querySelector('button')!, 'ArrowDown')
    await settle(() => Boolean(childDocument.querySelector('[role="menu"]')), 'shared FileActions menu opens by keyboard')
    const firstAction = [...childDocument.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(button => button.textContent === 'First action')!
    await settle(() => childDocument.activeElement === firstAction, 'keyboard focus waits for actual native portal mount')
    await click(firstAction)
    check(selected === 1, 'shared FileActions action fires once')
    await act(async () => root.render(<NativeOverlayPortal><PreviewChromeFixture /></NativeOverlayPortal>))
    await settle(() => Boolean(childDocument.querySelector('[data-preview-resize-side]')), 'preview resize handle mounts')
    const separator = childDocument.querySelector('[data-preview-resize-side]')!
    await key(separator, 'ArrowRight')
    check(childDocument.querySelector('[data-preview-width]')?.textContent === '264', 'native preview separator keyboard changes width')
    await act(async () => separator.dispatchEvent(new child.PointerEvent('pointerdown', { bubbles: true, clientX: 100 })))
    check(childDocument.body.style.cursor === 'col-resize', 'drag cursor belongs to the preview document')
    await act(async () => {
        childDocument.dispatchEvent(new child.PointerEvent('pointermove', { bubbles: true, clientX: 140 }))
        childDocument.dispatchEvent(new child.PointerEvent('pointerup', { bubbles: true, clientX: 140 }))
    })
    check(childDocument.querySelector('[data-preview-width]')?.textContent === '304', 'native preview pointer drag flushes its final width')
    check(resizeCommits.join(',') === '264,304', 'preview keyboard and pointer commits each fire once')
    check(childDocument.body.style.cursor === '', 'preview drag releases its cursor')
    results.push('actual preview chrome hook: child-document separator keyboard, drag, width commits and cursor cleanup')
    await act(async () => root.unmount())
    await act(async () => { await delay(50) })
    check(!childDocument.querySelector('[role="menu"]'), 'unmount leaves no stale menu')
    check(visibility.includes(true), 'real portal host presented committed content')
    results.push('actual shared FileActions: ArrowDown focus after mount, one action and clean unmount')
    return results
})().finally(() => { host.remove(); ownerInput.remove(); iframe.remove() }) })

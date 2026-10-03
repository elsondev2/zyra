import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantTerminalViewport } from '../../src/renderer/src/pages/assistant/AssistantTerminalViewport'
import type { DevScopePreviewTerminalSessionSummary } from '../../src/shared/contracts/devscope-api'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const writes: Array<{ sessionId: string; data: string }> = []
const listeners = new Set<(event: any) => void>()
const errors: string[] = []
const onError = (message: string) => errors.push(message)
Object.assign(window, { devscope: {
    writePreviewTerminal: async (input: { sessionId: string; data: string }) => { writes.push(input); return { success: true } },
    resizePreviewTerminal: async () => ({ success: true }),
    setPreviewTerminalTitle: async () => ({ success: true }),
    onPreviewTerminalEvent: (listener: (event: any) => void) => { listeners.add(listener); return () => listeners.delete(listener) }
} })
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const rootHost = document.createElement('div')
document.body.append(rootHost)
const root = createRoot(rootHost)
const noop = () => {}
function Fixture({ activeId, focusRequestId, visible = true }: { activeId: string; focusRequestId: number; visible?: boolean }) {
    return <><input id="composer" /><div style={{ display: 'flex' }}>{['a', 'b'].map(id => <div id={id} key={id} style={{ width: 380, height: 200 }}>
        <AssistantTerminalViewport session={{ sessionId: id } as DevScopePreviewTerminalSessionSummary} initialOutput="" theme={{}} fontFamily="monospace" fontSize={12} cursorBlink={false} scrollback={100} active={activeId === id} visible={visible} focusRequestId={focusRequestId} onActivate={noop} onNewTerminal={noop} onSplitHorizontal={noop} onSplitVertical={noop} onCloseTerminal={noop} onClearTerminal={noop} onRestartTerminal={noop} onError={onError} />
    </div>)}</div></>
}
const delay = () => new Promise(resolve => setTimeout(resolve, 25))
async function settle(predicate: () => boolean, message: string) {
    for (let attempt = 0; attempt < 100; attempt++) { await act(async () => { await delay() }); if (predicate()) return }
    throw new Error(message)
}
function paste(id: string, data: string) {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', data)
    document.querySelector(`#${id} textarea`)!.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
}
function typeKey(id: string, key: string) {
    const textarea = document.querySelector(`#${id} textarea`)!
    for (const type of ['keydown', 'keypress', 'keyup']) textarea.dispatchEvent(new KeyboardEvent(type, { key, code: 'KeyX', charCode: type === 'keypress' ? key.charCodeAt(0) : 0, keyCode: key.toUpperCase().charCodeAt(0), bubbles: true, cancelable: true }))
}
Object.assign(window, { terminalInputCheck: (async () => {
    await act(async () => root.render(<Fixture activeId="a" focusRequestId={1} />))
    const composer = document.querySelector<HTMLInputElement>('#composer')!
    composer.focus()
    ;(window as any).releaseTerminalRuntime()
    await settle(() => document.querySelectorAll('.xterm textarea').length === 2, 'both real xterm surfaces load')
    check(document.activeElement === composer, 'late runtime startup must retain composer focus')

    await act(async () => root.render(<Fixture activeId="a" focusRequestId={2} />))
    check(document.querySelector('#a')!.contains(document.activeElement), 'explicit request focuses session A')
    typeKey('a', 'x')
    await settle(() => writes.some(write => write.sessionId === 'a' && write.data === 'x'), 'keyboard input reaches session A')
    paste('a', 'alpha')
    await settle(() => writes.some(write => write.sessionId === 'a' && write.data === 'alpha'), 'paste reaches session A')
    await act(async () => root.render(<Fixture activeId="b" focusRequestId={3} />))
    check(document.querySelector('#b')!.contains(document.activeElement), 'switch focuses session B')
    paste('b', 'beta')
    await settle(() => writes.some(write => write.sessionId === 'b' && write.data === 'beta'), 'paste reaches session B')
    const count = writes.length
    typeKey('a', 'z')
    paste('a', 'stale-input')
    await act(async () => { await delay() })
    check(writes.length === count, 'stale paste into an inactive pane is blocked')
    for (const listener of listeners) listener({ type: 'output', sessionId: 'a', data: '\x1b[6n' })
    await settle(() => writes.some(write => write.sessionId === 'a' && /^\x1b\[\d+;\d+R$/.test(write.data)), 'unfocused pane still replies to cursor-position query')
    check(document.querySelector('#b')!.contains(document.activeElement), 'background output retains session B focus')
    await act(async () => root.render(<Fixture activeId="b" focusRequestId={3} visible={false} />))
    const hiddenCount = writes.length
    paste('b', 'hidden-input')
    await act(async () => { await delay() })
    check(writes.length === hiddenCount, 'hidden terminal rejects stale paste')
    check(errors.length === 0, `terminal errors: ${errors.join(', ')}`)
    await act(async () => root.unmount())
    check(listeners.size === 0, 'unmount releases session event subscriptions')
    return ['late startup preserves focus', 'typing and paste stay in their selected session', 'inactive and hidden input blocked', 'unfocused terminal protocol replies preserved', 'background output preserves focus', 'subscriptions cleaned up']
})() })

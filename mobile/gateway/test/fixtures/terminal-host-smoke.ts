import assert from 'node:assert/strict'
import { TerminalScreen } from '../../src/terminal-screen.mjs'
import { randomUUID } from 'node:crypto'
import { bindRemotePreviewTerminal, listRemotePreviewTerminals } from '../../../../desktop/src/main/ipc/handlers/preview-terminal-handlers'
import { MobileTerminalAccess } from '../../../../desktop/src/main/mobile-terminal-access'
const runtimeId = 'mobile-smoke:' + randomUUID(), sessionId = randomUUID()
const firstEvents: any[] = [], secondEvents: any[] = []
const first = bindRemotePreviewTerminal(runtimeId, event => firstEvents.push(event))
const second = bindRemotePreviewTerminal(runtimeId, event => secondEvents.push(event))
async function waitFor(test: () => boolean) {
    const deadline = Date.now() + 10000
    while (!test()) { if (Date.now() > deadline) throw new Error('Timed out waiting for the synthetic terminal: ' + JSON.stringify(secondEvents)); await new Promise(resolve => setTimeout(resolve, 50)) }
}
async function main() {
    try {
        const created = await first.invoke('create', { sessionId, targetPath: process.cwd(), preferredShell: 'cmd', cols: 80, rows: 24 })
        assert.equal(created.success, true)
        assert.equal(listRemotePreviewTerminals(id => id === runtimeId).length, 1)
        await first.invoke('write', { sessionId, data: 'set ZYRA_SMOKE_RESULT=42\r\necho ZYRA_MOBILE_%ZYRA_SMOKE_RESULT%\r\n' })
        await waitFor(() => secondEvents.map(event => event.data || '').join('').includes('ZYRA_MOBILE_42'))
        const snapshot = await second.invoke('snapshot', { sessionId }) as any
        const restored = new TerminalScreen(snapshot.screen.cols, snapshot.screen.rows)
        restored.write(snapshot.screen.data); await restored.snapshot()
        const buffer = restored.terminal.buffer.active
        const rendered = Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) || '').join('\n')
        restored.dispose()
        assert.ok(rendered.includes('ZYRA_MOBILE_42'), rendered)
        assert.ok(snapshot.screen.sequence > 0)
        first.close()
        assert.equal(listRemotePreviewTerminals(id => id === runtimeId).length, 1, 'detaching a viewer must preserve the PC process')
        await second.invoke('write', { sessionId, data: 'echo ZYRA_SECOND_%ZYRA_SMOKE_RESULT%\r\n' })
        await waitFor(() => secondEvents.map(event => event.data || '').join('').includes('ZYRA_SECOND_42'))
        await second.invoke('resize', { sessionId, cols: 100, rows: 28 })
        const resized = await second.invoke('snapshot', { sessionId }) as any
        assert.equal(resized.screen.cols, 100); assert.equal(resized.screen.rows, 28)
        await second.invoke('write', { sessionId, data: 'exit\r\n' })
        await waitFor(() => secondEvents.some(event => event.type === 'exit'))
        console.log('Shared native PTY, remote input, screen snapshots, resize and detach: passed')
    } finally {
        await second.invoke('close', { sessionId }); first.close(); second.close()
        assert.equal(listRemotePreviewTerminals(id => id === runtimeId).length, 0)
    }
}
async function splitMain() {
    const chat = { canonicalChatId: 'split-smoke:' + randomUUID() }
    const runtimes = ['a', 'b'].map(key => 'utility:' + chat.canonicalChatId + ':terminal:' + key)
    const sessions = [randomUUID(), randomUUID()]
    const exited = new Set<number>()
    const bindings = runtimes.map((runtime, i) => bindRemotePreviewTerminal(runtime, event => { if (event.type === 'exit') exited.add(i) }))
    const events: any[] = []
    const access = new MobileTerminalAccess(() => ({ getMobileTerminalIdentity: async () => ({ runtimeId: runtimes[0] }) }) as any, event => events.push(event))
    const roots = [{ id: 'fixture', path: process.cwd(), readOnly: false }]
    try {
        for (let i = 0; i < 2; i++) assert.equal((await bindings[i].invoke('create', { sessionId: sessions[i], targetPath: process.cwd(), preferredShell: 'cmd', cols: 80, rows: 24 })).success, true)
        const listed = await access.dispatch('terminal.list', {}, chat, roots) as any
        const ids = sessions.map(session => listed.terminals.find((terminal: any) => terminal.sessionId === session).id)
        for (let i = 0; i < 2; i++) {
            await access.dispatch('terminal.attach', { terminalId: ids[i], keepExisting: true, subscriptionId: 'pane:' + i }, chat, roots)
            await access.dispatch('terminal.input', { terminalId: ids[i], data: `set ZYRA_SPLIT_RESULT=${i + 1}\r\necho ZYRA_SPLIT_%ZYRA_SPLIT_RESULT%\r\n` }, chat, roots)
        }
        await waitFor(() => ids.every((id: string, i: number) => events.filter(value => value.terminalId === id).map(value => value.event.data || '').join('').includes('ZYRA_SPLIT_' + (i + 1))))
        for (let i = 0; i < 2; i++) await access.dispatch('terminal.detach', { terminalId: ids[i], subscriptionId: 'pane:' + i }, chat, roots)
        assert.equal(listRemotePreviewTerminals(runtime => runtimes.includes(runtime)).length, 2, 'returning to the list preserves both actual PC processes')
        await access.dispatch('terminal.attach', { terminalId: ids[0], keepExisting: true, subscriptionId: 'reopened' }, chat, roots)
        await access.dispatch('terminal.detach', { terminalId: ids[0], subscriptionId: 'pane:0' }, chat, roots)
        await access.dispatch('terminal.input', { terminalId: ids[0], data: 'echo ZYRA_REOPENED_%ZYRA_SPLIT_RESULT%\r\n' }, chat, roots)
        await waitFor(() => events.filter(value => value.terminalId === ids[0]).map(value => value.event.data || '').join('').includes('ZYRA_REOPENED_1'))
        for (let i = 0; i < 2; i++) await bindings[i].invoke('write', { sessionId: sessions[i], data: 'exit\r\n' })
        await waitFor(() => exited.size === 2)
        console.log('Two actual PC shells: independent mobile streams, back-to-list persistence and stale detach isolation passed')
    } finally {
        access.close()
        for (let i = 0; i < 2; i++) { await bindings[i].invoke('close', { sessionId: sessions[i] }); bindings[i].close() }
        assert.equal(listRemotePreviewTerminals(runtime => runtimes.includes(runtime)).length, 0)
    }
}
// Electron test host owns native ConPTY pipe workers; exit after owned shells and registry are closed.
main().then(splitMain).then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })

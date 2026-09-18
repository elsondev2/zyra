import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TimelineTurnWorkSummary } from '../../src/renderer/src/pages/assistant/AssistantTimelineWorkSummary'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const wait = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms))
const rootElement = document.createElement('div'); document.body.append(rootElement)
const root = createRoot(rootElement)
const marker = () => document.querySelector('[data-assistant-turn-interruption]')
const render = async (mode: 'minimal' | 'detailed', running: boolean, outcome: 'interrupted' | 'failed' | 'completed' | null, hasWork = true) => {
    await act(async () => { root.render(<TimelineTurnWorkSummary key={`${mode}:${hasWork}`} displayMode={mode} startedAt="2026-01-01T00:00:00Z" completedAt={running ? null : '2026-01-01T00:00:05Z'} running={running} outcome={outcome} hasWork={hasWork} renderChildren={() => <div data-final-action="true">Last action evidence</div>} />); await wait() })
}
async function run() {
    for (const mode of ['minimal', 'detailed'] as const) {
        await render(mode, true, null)
        assert(!marker(), 'running work cannot be marked interrupted')
        await render(mode, false, 'interrupted')
        const last = document.querySelector('[data-final-action]')
        assert(last && marker(), 'settling work preserves action content during collapse and adds the marker')
        assert(Boolean(last!.compareDocumentPosition(marker()!) & Node.DOCUMENT_POSITION_FOLLOWING), 'Interrupted must follow the last action, not precede it')
        assert(document.querySelectorAll('[data-assistant-turn-interruption]').length === 1, 'one interruption boundary per turn')
        await act(async () => { await wait(350) })
        assert(marker(), 'the interrupted marker survives collapsed work')
        const show = document.querySelector<HTMLButtonElement>('button[title="Show work"]')
        await act(async () => { show?.click(); await wait(60) })
        const reopened = document.querySelector('[data-final-action]')
        assert(reopened && Boolean(reopened.compareDocumentPosition(marker()!) & Node.DOCUMENT_POSITION_FOLLOWING), 'expanded work still ends at its interruption marker')
        await render(mode, false, 'completed')
        assert(!marker(), 'completed turns have no interruption marker')
        await render(mode, false, 'failed')
        assert(!marker(), 'failed turns are not mislabeled as user interruptions')
        await render(mode, false, 'interrupted', false)
        assert(marker() && !document.querySelector('button'), 'an interrupted turn with no work still has its boundary')
    }
    await act(async () => root.unmount())
    console.log('Timeline interruption marker: terminal placement, collapse/reopen, both modes and authoritative outcomes: ok')
}
void run().catch(error => { (globalThis as any).__testFailed = String(error); console.error(error) })

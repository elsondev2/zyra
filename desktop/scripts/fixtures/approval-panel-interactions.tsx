import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantPendingApprovalPanel } from '../../src/renderer/src/pages/assistant/AssistantPendingApprovalPanel'
import type { AssistantApprovalDecision, AssistantPendingApproval } from '../../src/shared/assistant/contracts'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
;(window as any).devscope = {}
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const tick = () => new Promise(resolve => setTimeout(resolve, 35))
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const calls: Array<{ id: string; decision: AssistantApprovalDecision }> = []
const request: AssistantPendingApproval = {
    id: 'fixture', requestId: 'request-one', requestType: 'file-change', title: 'Edit needs approval',
    paths: ['C:/fixture/release/runtime-contract.mjs'], detail: 'C:/fixture/release/runtime-contract.mjs',
    grantLabel: 'Allow file changes for this chat', status: 'pending', decision: null,
    createdAt: '2026-09-17T00:00:00Z', resolvedAt: null, turnId: 'turn-fixture'
}
const onRespond = async (id: string, decision: AssistantApprovalDecision) => { calls.push({ id, decision }) }
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === text)
const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Other approval options"]')!
const item = () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')
const render = async (requests: AssistantPendingApproval[] = [request], responding = false) => {
    await act(async () => { root.render(<AssistantPendingApprovalPanel pendingApprovals={requests} responding={responding} onRespond={onRespond} />); await tick() })
}
const click = async (element: HTMLElement | undefined | null) => {
    assert(element, 'expected an actionable control')
    await act(async () => { element!.click(); await tick(); await tick() })
}
const resetCalls = () => { calls.length = 0 }

async function run() {
    const longDetail = 'C:/fixture/repository\nRun the requested operation in this folder.\nThe next lines explain the exact permission scope.\nAllow once covers only the next matching call.\nFolder access lasts until this chat reconnects.\nExisting read-only restrictions still apply.'
    await render([{ ...request, requestId: 'long-request', detail: longDetail }])
    const expand = button('Show details')
    assert(expand, 'long approval detail has an explicit expansion control')
    assert(expand?.getAttribute('aria-expanded') === 'false', 'long detail starts collapsed')
    await click(expand)
    assert(button('Hide details')?.getAttribute('aria-expanded') === 'true', 'expansion state is explicit')
    const full = document.getElementById(button('Hide details')!.getAttribute('aria-controls')!)
    assert(full?.textContent === longDetail, 'expansion retains the entire original detail')
    assert(full?.closest('[data-state]')?.getAttribute('data-state') === 'open', 'full detail uses the shared animated expansion')
    await click(button('Hide details'))
    assert(button('Show details')?.getAttribute('aria-expanded') === 'false', 'detail can collapse again')
    assert(full?.closest('[data-state]')?.getAttribute('data-state') === 'closed', 'collapsing retains animation while hiding full content')
    assert(calls.length === 0, 'inspection cannot make a permission decision')
    await click(button('Show details'))
    await render([{ ...request, requestId: 'next-long-request', detail: longDetail }])
    assert(button('Show details')?.getAttribute('aria-expanded') === 'false', 'the next request starts collapsed')
    await render()
    assert(!button('Show details'), 'short requests do not add a redundant disclosure')
    assert(calls.length === 0, 'mounting cannot approve an action')
    await click(button('Allow once'))
    assert(calls.length === 1 && calls[0].id === request.requestId && calls[0].decision === 'acceptOnce', 'Allow once resolves the exact request once')
    resetCalls()
    await click(button('Deny'))
    assert(calls.length === 1 && calls[0].decision === 'decline', 'Deny retains decline semantics')
    resetCalls()
    const split = document.querySelector<HTMLElement>('[data-approval-actions]')!
    split.style.width = '176px'
    trigger().style.width = '24px'
    await click(trigger())
    assert(calls.length === 0, 'opening scope options cannot approve')
    assert(item()?.textContent?.trim() === 'For this chat', 'the visible scope choice is concise')
    assert(item()?.getAttribute('aria-label') === request.grantLabel, 'the complete backend scope remains accessible')
    assert(item()?.getAttribute('title') === request.grantLabel, 'hover exposes the exact permission scope')
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!
    assert(Math.abs(menu.getBoundingClientRect().width - split.getBoundingClientRect().width) < 1, 'menu width follows the full split button, not the arrow')
    await click(item())
    assert(calls.length === 1 && calls[0].id === request.requestId && calls[0].decision === 'acceptForSession', 'chat allowance requires explicit selection')
    resetCalls()
    const reconnect = { ...request, requestId: 'folder-request', grantLabel: 'Allow folder until chat reconnects' }
    await render([reconnect])
    await click(trigger())
    assert(item()?.textContent?.trim() === 'Until reconnect', 'folder allowance uses the shorter duration label')
    assert(item()?.getAttribute('aria-label') === reconnect.grantLabel, 'folder scope is retained in the accessible name')
    await click(item())
    assert(calls.length === 1 && calls[0].id === reconnect.requestId && calls[0].decision === 'acceptForSession', 'shortening labels cannot change grant semantics')
    resetCalls()
    await render()

    await act(async () => { trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await tick(); await tick() })
    assert(document.activeElement === item(), 'keyboard opening focuses the scope choice')
    await act(async () => { item()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await tick() })
    assert(!item() && calls.length === 0, 'Escape closes the menu without a decision')
    assert(document.activeElement === trigger(), 'Escape restores focus to the menu trigger')

    await click(trigger())
    await render([request], true)
    assert(!item(), 'responding closes the broader-allowance menu')
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    assert(buttons.every(entry => entry.disabled), 'all response controls disable while saving')
    await click(button('Allow once'))
    assert(calls.length === 0, 'disabled response cannot duplicate approval')
    assert(document.querySelector('[role="status"]')?.textContent?.includes('Saving your choice'), 'saving state is announced')

    await render()
    await click(trigger())
    const next = { ...request, id: 'next', requestId: 'request-two', title: 'Next edit needs approval' }
    await render([{ ...request, status: 'resolved' }, next])
    assert(!item(), 'advancing the pending queue resets the scope menu')
    await click(button('Allow once'))
    assert(calls.length === 1 && calls[0].id === next.requestId, 'the next response cannot target the stale request')
    resetCalls()

    const command = 'Write-Output "<exact>"\nGet-ChildItem "C:/fixture path"'
    await render([{ ...request, requestId: 'command-request', requestType: 'command', command, detail: command }])
    assert(document.querySelector('pre code')?.textContent === command, 'command text is exact and escaped, not executed')
    await render([{ ...request, status: 'resolved' }])
    assert(host.textContent === '', 'resolved requests remove the panel')
    assert(calls.length === 0, 'rendering and queue changes never approve')
    await act(async () => { root.unmount(); await tick() })
    console.log('Approval panel interactions: exact decisions, explicit chat scope, keyboard, busy lock and queue lifecycle: ok')
}
void run().catch(error => { (globalThis as any).__testFailed = String(error); console.error(error) })

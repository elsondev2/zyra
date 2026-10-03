import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useAssistantQueuedComposer } from '../../src/renderer/src/pages/assistant/useAssistantQueuedComposer'

let actions: ReturnType<typeof useAssistantQueuedComposer>
let rerender: () => void
let completeInterrupt: (success: boolean) => void
let interrupts = 0
const dispatched: string[] = []
function Harness() {
    const [busy, setBusy] = useState(true)
    const [pending, setPending] = useState(false)
    const [, setRevision] = useState(0)
    rerender = () => setRevision(value => value + 1)
    actions = useAssistantQueuedComposer({
        selectedSessionId: 'session', isAssistantBusy: busy, isThreadWorking: busy,
        commandPending: pending, activeTurnId: 'turn-1', busyMessageMode: 'force',
        sessionStates: [{ sessionId: 'session', threadState: busy ? 'running' : 'ready', latestTurnState: busy ? 'running' : 'interrupted', pendingApprovalCount: 0, pendingUserInputCount: 0 }],
        dispatchPrompt: async (_id, prompt) => { dispatched.push(prompt); return true },
        interruptTurn: async () => {
            interrupts++
            setPending(true)
            const success = await new Promise<boolean>(resolve => { completeInterrupt = resolve })
            setPending(false)
            if (!success) throw new Error('Unknown Zyra runtime session')
            setBusy(false)
        }
    })
    return <div>{actions.queuedComposerMessageItems.map(item => <div key={item.id}>{item.prompt}: {item.status}</div>)}</div>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness />)
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
async function until(predicate: () => boolean, label: string) {
    const deadline = performance.now() + 3000
    while (!predicate()) {
        if (performance.now() > deadline) throw new Error(`Timed out: ${label} (interrupts=${interrupts})`)
        await new Promise(resolve => setTimeout(resolve, 10))
    }
}
Object.assign(window, { runForceSendSmoke: async () => {
    await until(() => Boolean(actions), 'hook ready')
    await actions.handleSendPrompt('Preserve my forced message', [], { dispatchMode: 'force' })
    await until(() => interrupts > 0, 'first interruption')
    for (let i = 0; i < 5; i++) { rerender(); await new Promise(resolve => setTimeout(resolve, 15)) }
    check(interrupts === 1, 'command-pending and unrelated rerenders must not duplicate an in-flight abort')
    completeInterrupt(false)
    await until(() => actions.queuedComposerMessageItems[0]?.status === 'paused', 'failed force message paused')
    for (let i = 0; i < 10; i++) { rerender(); await new Promise(resolve => setTimeout(resolve, 10)) }
    check(interrupts === 1, 'a failed interruption must not produce a retry storm')
    check(dispatched.length === 0, 'a failed interruption must not send the message')
    const item = actions.queuedComposerMessageItems[0]
    check(item.prompt === 'Preserve my forced message', 'failure preserves the queued prompt')
    await actions.handleForceQueuedMessage(item.id)
    await until(() => interrupts === 2, 'explicit force retry')
    completeInterrupt(true)
    await until(() => dispatched.length === 1 && actions.queuedComposerMessageCount === 0, 'queued message sent after successful abort')
    check(dispatched[0] === item.prompt, 'forced message sent exactly once')
    root.unmount()
    return { inFlightDeduplicated: true, failurePaused: true, retryStormStopped: true, explicitRetry: true, sentOnce: true }
} })

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useAssistantBrowserSurfaceRequests } from '../../src/renderer/src/pages/assistant/useAssistantBrowserSurfaceRequests'
import { BrowserSurfaceInbox } from '../../src/preload/adapters/browser-surface-inbox'
import { useAssistantConnectionRecovery } from '../../src/renderer/src/pages/assistant/useAssistantConnectionRecovery'
import type { AssistantActivity } from '../../src/shared/assistant/contracts'
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message)}
const pause=()=>new Promise(resolve=>setTimeout(resolve,20))
const inbox=new BrowserSurfaceInbox<any>()
const failed:any[]=[]
const cancelListeners=new Set<(id:string)=>void>()
let accepted=true, revealCount=0, releaseAck:(()=>void)|null=null, delayed=false
;(window as any).devscope={agentControl:{
    onBrowserSurfaceRequest:(callback:any)=>inbox.subscribe(callback),
    onBrowserSurfaceCancel:(callback:any)=>{cancelListeners.add(callback);return()=>cancelListeners.delete(callback)},
    acknowledgeBrowserSurfaceRequest:async()=>{if(delayed)await new Promise<void>(resolve=>{releaseAck=resolve});return {success:true,accepted}},
    completeBrowserSurfaceRequest:async(value:any)=>{failed.push(value);return {success:true}}
}}
const request=(id:string)=>({requestId:id,threadId:'thread:a',tabId:'tab:'+id,reveal:true,mode:'open'})
function BrowserHarness({thread='thread:a'}:{thread?:string}) {
    const state=useAssistantBrowserSurfaceRequests({threadId:thread,revealInspector:()=>{revealCount++},resizeInspector:()=>{}})
    return <div id="request">{state.request?.requestId||''}</div>
}
const pausedActivity: AssistantActivity = { id: 'fixture-paused', turnId: 'failed-turn', kind: 'connection.recovery', tone: 'warning', summary: 'Paused · Network issue', createdAt: '2026-10-01T10:00:00Z', payload: { category: 'connection-recovery', status: 'paused', attempt: 10, maxAttempts: 10 } }
let recovery: ReturnType<typeof useAssistantConnectionRecovery>
let disconnects = 0, connects = 0
let releaseConnect: ((value: { success: boolean; error?: string }) => void) | undefined
let deferConnect = false, deferDisconnect = false
let releaseDisconnect: (() => void) | undefined
const disconnect = async () => { disconnects++; if (deferDisconnect) await new Promise<void>(resolve => { releaseDisconnect = resolve }) }
const connectResult = async () => { connects++; return deferConnect ? new Promise<{ success: boolean; error?: string }>(resolve => { releaseConnect = resolve }) : { success: true } }
function NetworkHarness({ working = false, connected = false, turnId = 'failed-turn', error = 'WebSocket closed 1006', session = 'fixture-session', completedAt }: { working?: boolean; connected?: boolean; turnId?: string; error?: string; session?: string; completedAt?: string }) {
    recovery = useAssistantConnectionRecovery({ selectedSessionId: session, activeThreadId: 'fixture-thread', threadState: 'error', threadWorking: working, latestTurnId: turnId, latestTurnCompletedAt: completedAt, loading: false, connected, commandPending: false, deferUntilFirstPrompt: true, threadLastError: error, activities: [pausedActivity], connectResult, disconnect })
    return <div id="network-banner">{recovery.showBanner ? 'paused' : 'hidden'}</div>
}
const root=createRoot(document.getElementById('root')!)
const mount=(element:any)=>{flushSync(()=>root.render(element))}
;(window as any).issueRecoveryCheck=(async()=>{
    const results:string[]=[]
    inbox.receive(request('before-mount'))
    mount(<BrowserHarness/>);await pause()
    assert(document.getElementById('request')?.textContent==='before-mount'&&revealCount===1,'closed inspector reveals a buffered request')
    mount(null);await pause()
    assert(failed.some(entry=>entry.requestId==='before-mount'&&!entry.success),'unmount settles pending browser request')
    accepted=false;inbox.receive(request('expired'));mount(<BrowserHarness/>);await pause()
    assert(!document.getElementById('request')?.textContent&&revealCount===1,'expired acknowledgement must not open a late tab')
    accepted=true;delayed=true;inbox.receive(request('unmount-in-flight'));await pause();mount(null);releaseAck?.();await pause()
    assert(revealCount===1,'late ack after unmount must not reveal or insert')
    delayed=false;mount(<BrowserHarness thread="thread:b"/>);await pause();inbox.receive(request('wrong-thread'));await pause()
    assert(failed.some(entry=>entry.requestId==='wrong-thread')&&revealCount===1,'request cannot enter another chat')
    mount(<BrowserHarness/>);await pause();inbox.receive(request('retry'));await pause()
    assert(document.getElementById('request')?.textContent==='retry','retry recovers after remount')
    results.push('Browser hook: buffered reveal, remount, stale ack, unmount race, wrong thread and retry')
    mount(<NetworkHarness/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'paused', 'a genuinely exhausted current turn still shows its manual recovery banner')
    const staleReconnect = recovery!.reconnect
    mount(<NetworkHarness working turnId="resumed-turn"/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'an old paused banner must disappear while this thread is actively working even before connected catches up')
    staleReconnect();await pause()
    assert(disconnects === 0 && connects === 0, 'a stale Try again callback cannot disconnect active work')
    mount(<NetworkHarness completedAt="2026-10-01T10:01:00Z"/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'successful completion of the same turn retires its older paused activity')
    mount(<NetworkHarness completedAt="2026-10-01T09:59:00Z"/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'paused', 'a genuine connection failure after a completed turn still permits recovery')
    mount(<NetworkHarness turnId="resumed-turn"/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'a later idle render must not resurrect the previous turn pause')
    mount(<NetworkHarness error="No ChatGPT account is available for this model. Check accounts and usage rules in Providers > Limits."/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'account and usage-rule failures are not labelled as paused network failures')
    mount(<NetworkHarness connected/>);await pause()
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'a connected thread does not show a historical recovery warning')
    mount(<NetworkHarness/>);await pause();deferConnect = true
    recovery!.reconnect();await pause()
    assert(disconnects === 1 && connects === 1, 'manual recovery remains available for a genuinely paused current turn')
    mount(<NetworkHarness working turnId="new-live-turn"/>);await pause()
    releaseConnect?.({ success: false, error: 'WebSocket closed 1006' });await pause()
    assert(disconnects === 1 && connects === 1, 'resumed work cancels the old reconnect loop before another disconnect')
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'late reconnect failure cannot restore Paused over active work')
    const oldThreadReconnect = recovery!.reconnect
    mount(<NetworkHarness session="different-session" turnId="different-turn"/>);await pause()
    oldThreadReconnect();await pause()
    assert(disconnects === 1 && connects === 1, 'an old thread callback cannot reconnect after the selection changes')
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'another thread cannot inherit the old turn pause or exhausted cycle')
    deferConnect = false;deferDisconnect = true
    mount(<NetworkHarness/>);await pause()
    recovery!.reconnect();await pause()
    assert(disconnects === 2 && connects === 1, 'the controlled disconnect remains pending')
    mount(<NetworkHarness working turnId="live-after-disconnect"/>);await pause()
    releaseDisconnect?.();await pause()
    assert(connects === 1, 'a late disconnect cannot begin a new attachment over resumed work')
    assert(document.getElementById('network-banner')?.textContent === 'hidden', 'late disconnect completion cannot restore stale pause UI')
    results.push('Network recovery hook: current-turn pause, resumed/completed work, stale callbacks, non-network errors, late disconnect/connect cancellation and thread isolation')
    root.unmount()
    return results
})()

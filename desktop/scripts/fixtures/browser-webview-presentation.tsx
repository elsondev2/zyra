import { createRef, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { AssistantBrowserWebview, type AssistantBrowserWebviewHandle } from '../../src/renderer/src/pages/assistant/AssistantBrowserWebview'
import type { AssistantBrowserTabState } from '../../src/renderer/src/pages/assistant/assistant-browser-workspace-state'
import type { BrowserViewCommand, BrowserViewEvent, BrowserViewSlotInput, BrowserViewState } from '../../src/shared/browser-view'

const results: string[] = []
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
const pause = () => new Promise(resolve => setTimeout(resolve, 20))
async function waitFor(predicate: () => boolean, message: string) { for (let index=0;index<100&&!predicate();index++) await pause();check(predicate(),message) }
const commands: Array<BrowserViewCommand & { activeAtCall: boolean }> = []
const slots: BrowserViewSlotInput[] = []
const subscriptions = new Set<(event: BrowserViewEvent) => void>()
const states = new Map<string, BrowserViewState>()
const releases: string[] = []
let currentActive = false
let deferCapture = false
let finishCapture: ((result: unknown) => void) | null = null
const snapshot = 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>')
function stateFor(tabId: string): BrowserViewState {
    let state = states.get(tabId)
    if (!state) { state={version:1,revision:1,tabId,sessionMode:'normal',guestWebContentsId:7,url:'https://fixture.invalid/',displayAddress:null,title:'Synthetic page',status:'loading',error:null,canGoBack:false,canGoForward:false,faviconUrl:null,audible:false,fullscreen:false};states.set(tabId,state) }
    return state
}
;(window as any).devscope={
    browserView:{
        ensure:async(input:{tabId:string})=>({success:true,created:true,state:stateFor(input.tabId)}),
        command:(input:BrowserViewCommand)=>{
            commands.push({...input,activeAtCall:currentActive})
            const result={success:true,accepted:true,state:stateFor(input.tabId),...(input.type==='capture'?{snapshotDataUrl:snapshot}:{})}
            return input.type==='capture'&&deferCapture ? new Promise(resolve=>{finishCapture=resolve}) : Promise.resolve(result)
        },
        release:(tabId:string)=>releases.push(tabId),
        reportSlot:(input:BrowserViewSlotInput)=>slots.push(input),
        onEvent:(listener:(event:BrowserViewEvent)=>void)=>{subscriptions.add(listener);return()=>subscriptions.delete(listener)}
    },
    agentControl:{bindBrowserTab:async()=>({success:true,target:{targetId:'fixture-control'}})}
}

type ControllerOptions = { onReady: (ready:boolean)=>void; release:()=>void }
const controllers: Array<{ starts:number; started:boolean; pending:Promise<boolean>|null; finish:(ready:boolean)=>void; stop:()=>void }> = []
// Only the media controller's async seam is controlled. The actual Webview,
// occlusion observer, geometry, visibility and browser-command effects all run.
;(globalThis as any).__webviewPresentationController=(options:ControllerOptions)=>{
    let settle:((ready:boolean)=>void)|null=null
    let ready=false
    const control={starts:0,started:false,pending:null as Promise<boolean>|null,
        finish(value:boolean){
            if(!control.started)return
            if(!value){control.stop();return}
            ready=true;options.onReady(true)
            const resolve=settle;settle=null;control.pending=null;resolve?.(true)
        },
        stop(){
            if(!control.started)return
            control.started=false;ready=false;options.onReady(false)
            const resolve=settle;settle=null;control.pending=null;resolve?.(false);options.release()
        }
    }
    controllers.push(control)
    return {stop:control.stop,start:()=>{
        if(ready)return Promise.resolve(true)
        if(control.pending)return control.pending
        control.starts++;control.started=true
        control.pending=new Promise(resolve=>{settle=resolve});return control.pending
    }}
}
const container=document.getElementById('root')!
// Supply only the slot dimensions that the full app normally gets from Tailwind.
// Actual DOM rectangles still drive the real occlusion and geometry observers.
const layout=document.createElement('style')
layout.textContent='html,body{margin:0}#root{position:relative;width:480px;height:300px}[data-assistant-browser-view-slot]{position:absolute;inset:0;width:100%;height:100%}'
document.head.append(layout)
const root=createRoot(container)
const handle=createRef<AssistantBrowserWebviewHandle>()
const noop=()=>{}
let tabId=''
function render(active:boolean,visible=true){
    currentActive=active
    const tab={id:tabId,url:'https://fixture.invalid/',sessionMode:'normal',status:'loading',title:'Fixture'} as AssistantBrowserTabState
    flushSync(()=>root.render(<StrictMode><AssistantBrowserWebview key={tabId} ref={handle} tab={tab} threadId="fixture-thread" config={{} as any} active={active} visible={visible} placement="full" controlled={false} cursor={null} onStateChange={noop} onControlTargetChange={noop} onFullscreenChange={noop} onViewportRectChange={noop}/></StrictMode>))
}
function overlay(){
    const element=document.createElement('div')
    element.dataset.zyraNativeViewOccluder='true'
    element.style.cssText='position:fixed;left:20px;top:20px;width:160px;height:70px;z-index:100'
    document.body.append(element);return element
}
const captures=()=>commands.filter(command=>command.tabId===tabId&&(command.type==='capture'||command.type==='presentation-start'))
const controller=()=>controllers.at(-1)!
const liveVideo=()=>container.querySelector<HTMLVideoElement>('[data-assistant-browser-view-live]')!
const staleImage=()=>container.querySelector('[data-assistant-browser-view-snapshot]')
async function mount(id:string){tabId=id;render(true);await waitFor(()=>Boolean(handle.current)&&subscriptions.size===1,'real Webview mounted and browser subscription attached');await pause()}
function unmount(){currentActive=false;flushSync(()=>root.render(null))}

;(window as any).browserWebviewPresentationCheck=(async()=>{
    await mount('tab:automatic-cancel')
    const auto=overlay()
    await waitFor(()=>Boolean(controller().pending),'actual occluder opens automatic live presentation')
    const cancelled=controller()
    check(captures().length===0,'pending automatic live start has no fallback yet')
    render(false)
    await pause()
    cancelled.finish(false)
    await pause()
    check(captures().length===0,'cancelled automatic start must issue zero capture commands after inactive')
    check(!staleImage()&&liveVideo().style.opacity==='0','inactive tab exposes neither live nor stale image preview')
    auto.remove();render(true);await pause()
    check(!staleImage()&&captures().length===0,'reactivation cannot revive a late cancelled snapshot')
    unmount()
    results.push('automatic overlay cancellation issues zero post-hide capture commands and cannot revive stale snapshots')

    await mount('tab:prepare-cancel')
    check(controller().starts===0,'normal visible tab keeps live media cold')
    check(!commands.some(command=>command.tabId===tabId&&command.type==='presentation-stop'),'idle stop is a no-op at the browser IPC boundary')
    const prepared=handle.current!.preparePresentation()
    check(handle.current!.preparePresentation()===prepared,'concurrent menu preparation shares its pending result')
    await waitFor(()=>Boolean(controller().pending),'pre-open preparation begins at the real imperative handle')
    render(false,false)
    check(await prepared===false,'hidden pre-open preparation resolves false')
    check(await handle.current!.preparePresentation()===false,'inactive preparation remains a no-op')
    await pause()
    check(captures().length===0&&!staleImage(),'cancelled pre-open preparation performs no fallback capture')
    unmount()
    results.push('pre-open preparation cancellation resolves false, stays cold after hide and never falls back')

    await mount('tab:ready-live')
    const opened=overlay()
    await waitFor(()=>Boolean(controller().pending),'ready case begins automatic presentation')
    controller().finish(true)
    await waitFor(()=>liveVideo().style.opacity==='1','decoded live readiness makes the actual video layer visible')
    check(slots.filter(slot=>slot.tabId===tabId).at(-1)?.visible===false,'actual occlusion observer hides the native view slot')
    check(!staleImage()&&captures().length===0,'ready live overlay does not substitute a snapshot')
    opened.remove()
    await waitFor(()=>liveVideo().style.opacity==='0','closing overlay hides live presentation')
    const stopped=commands.filter(command=>command.tabId===tabId&&command.type==='presentation-stop').length
    check(stopped===1,'one started presentation releases once')
    unmount();await pause()
    check(commands.filter(command=>command.tabId===tabId&&command.type==='presentation-stop').length===stopped,'unmount does not release an already stopped feed again')
    check(subscriptions.size===0,'unmount unsubscribes the real BrowserView event hook')
    results.push('ready live video appears over the native slot, closes cleanly and releases exactly once')

    await mount('tab:late-fallback')
    deferCapture=true
    const fallback=overlay()
    await waitFor(()=>Boolean(controller().pending),'fallback case begins live presentation')
    controller().finish(false)
    await waitFor(()=>Boolean(finishCapture),'failed live start reaches the real snapshot command boundary')
    check(captures().length===1&&captures()[0].activeAtCall,'fallback starts only while its tab is active')
    render(false)
    finishCapture!({success:true,accepted:true,state:stateFor(tabId),snapshotDataUrl:snapshot})
    await pause()
    fallback.remove();deferCapture=false;render(true);await pause()
    check(!staleImage(),'late fallback bytes cannot reappear when the hidden tab becomes active again')
    check(captures().length===1,'late fallback cannot trigger another capture')
    unmount()
    check(subscriptions.size===0&&releases.includes(tabId),'all cases release their browser lease/subscription')
    results.push('an already pending snapshot response is discarded across hide and reactivation')
    root.unmount()
    return results
})()

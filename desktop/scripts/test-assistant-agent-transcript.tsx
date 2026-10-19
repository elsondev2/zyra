// Hidden disposable Electron document. Real transcript hook, controlled API replies/timers.
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
const directory = await mkdtemp(join(tmpdir(), 'zyra-agent-transcript-'))
const hook = resolve(import.meta.dir, '../src/renderer/src/pages/assistant/useAssistantAgentTranscript.ts')
const harness = `
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {useAssistantAgentTranscript} from ${JSON.stringify(hook)}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const requests = [], timers = new Map(); let timerId = 1
window.devscope = {assistant:{agentAction: args => new Promise(resolve => requests.push({args,resolve}))}}
const timeout = window.setTimeout, clearTimeout = window.clearTimeout, interval = window.setInterval, clearInterval = window.clearInterval
window.setInterval = fn => { const id=timerId++; timers.set(id,fn); return id }
window.clearInterval = id => timers.delete(id)
window.setTimeout = (fn, delay, ...args) => { if (![250,1000].includes(delay)) return timeout(fn,delay,...args); const id=timerId++; timers.set(id,fn); return id }
window.clearTimeout = id => { if (!timers.delete(id)) clearTimeout(id) }
let state
const root = createRoot(document.getElementById('root'))
const run = {agentRunId:'a',sessionFile:'a.jsonl',status:'running',completedAt:null}
function View({run, thread='thread'}) { state=useAssistantAgentTranscript(thread,run); return <div>{state.page?.entries[0]?.index ?? 'loading'}{state.page?.nextBefore != null ? <button>Load older messages</button> : null}</div> }
const render = async (value=run, thread='thread') => act(async()=>root.render(<View run={value} thread={thread}/>))
const page = (first,last,total) => ({entries:Array.from({length:last-first+1},(_,i)=>({index:first+i,message:{role:'assistant',content:'record '+(first+i)}})),nextBefore:first>0?first:null,nextAfter:last<total-1?last:null,totalEntries:total,hydrated:last-first+1,bytes:100,truncatedEntries:0})
const settle = async (request, value) => act(async()=>request.resolve({success:true,result:value}))
const poll = async () => act(async()=>{ for (const fn of [...timers.values()]) fn() })
try {
 await render()
 // Reproduces the old overlapping startup reads: a late initial tail replaces a
 // fresher complete page, resurrecting Load older after the beginning was shown.
 if (requests.length > 1) {
  await settle(requests[1],page(0,29,30))
  assert(state.page.nextBefore===null,'the transcript initially reached its beginning')
  await settle(requests[0],page(30,59,60))
  assert(state.page.entries[0].index===0 && state.page.nextBefore===null,'late initial read must not discard the beginning or resurrect Load older messages')
 }
 assert(requests.length===1,'opening uses one initial read, not a racing immediate poll')
 assert(requests[0].args.payload.after===-1,'initial paging requests the actual beginning rather than the latest 30 records')
 await poll()
 assert(requests.length===1,'poll cannot overlap an unresolved initial read')
 await settle(requests[0],page(0,29,90))
 assert(state.page.entries[0].index===0 && state.page.nextBefore===null,'opening is the true beginning')
 await poll()
 const refresh=requests.at(-1)
 assert(refresh.args.payload.before===30,'refresh stays inside the loaded window while newer history is unloaded')
 const beforePaging=requests.length
 await act(async()=>{ void state.loadNewer(); void state.loadNewer() })
 assert(requests.length===beforePaging+1,'synchronous duplicate pagination is locked even before React rerenders')
 const next=requests.at(-1)
 assert(next.args.payload.after===29,'forward pagination starts after the loaded boundary')
 await settle(refresh,page(0,29,90))
 assert(state.loading===true,'background refresh cannot clear a pending pagination spinner/lock')
 await settle(next,page(30,59,90))
 assert(state.page.entries.length===60 && state.page.nextBefore===null && state.page.nextAfter===59,'forward pages stay contiguous and retain the beginning')
 await act(async()=>{ void state.loadNewer() })
 await settle(requests.at(-1),page(60,89,90))
 assert(state.page.entries.length===90 && state.page.nextAfter===null,'end of history is authoritative')
 await poll()
 await settle(requests.at(-1),page(60,89,90))
 assert(state.page.entries.length===90 && state.page.nextBefore===null,'refresh cannot forget loaded pages or revive the older button')
 await poll()
 const stale=requests.at(-1)
 await render({...run,agentRunId:'b',sessionFile:'b.jsonl'})
 const selected=requests.at(-1)
 await settle(stale,page(90,99,100))
 assert(state.agentRunId==='b' && state.page===null,'late old-agent refresh cannot hydrate the selected conversation')
 await settle(selected,page(0,9,10))
 await poll()
 const pending=requests.at(-1)
 await act(async()=>state.retry())
 const retry=requests.at(-1)
 await settle(pending,page(10,39,40))
 assert(state.page===null && state.loading,'retry rejects prior-generation refresh responses')
 await settle(retry,page(0,9,10))
 const beforeTerminal=requests.length
 await render({...run,agentRunId:'b',sessionFile:'b.jsonl',status:'completed',completedAt:'2026-10-19T10:00:00Z'})
 assert(requests.length===beforeTerminal && state.page.entries[0].index===0,'terminal transition retains loaded history without another initial read')
 await poll()
 await settle(requests.at(-1),page(9,10,11))
 assert(state.page.entries.length===11 && state.page.nextBefore===null,'terminal settling still hydrates a late final record without losing the beginning')
 await act(async()=>root.unmount())
 assert(timers.size===0,'unmount clears all transcript refresh timers')
 console.log('AGENT_TRANSCRIPT_TEST_PASS')
} catch(error) {console.error('AGENT_TRANSCRIPT_TEST_FAIL',error.stack||String(error))}
finally {window.setTimeout=timeout;window.clearTimeout=clearTimeout;window.setInterval=interval;window.clearInterval=clearInterval}
`
try {
    const build = await Bun.build({ entrypoints: ['agent-transcript-harness'], target: 'browser', plugins: [{ name: 'fixture', setup(builder) {
        builder.onResolve({ filter: /^agent-transcript-harness$/ }, () => ({ path: 'harness', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: harness, loader: 'tsx', resolveDir: resolve(import.meta.dir, '..') }))
    } }] })
    if (!build.success) throw new Error(build.logs.map(String).join('\n'))
    await writeFile(join(directory, 'test.js'), await build.outputs[0].text())
    await writeFile(join(directory, 'test.html'), '<div id="root"></div><script type="module" src="test.js"></script>')
    await writeFile(join(directory, 'main.cjs'), `
const {app,BrowserWindow}=require('electron')
app.setPath('userData',${JSON.stringify(join(directory, 'profile'))})
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}})
 window.webContents.on('console-message',(event,_level,legacy)=>{const message=typeof legacy==='string'?legacy:event.message;console.log(message);if(message.includes('AGENT_TRANSCRIPT_TEST_PASS'))app.exit(0);if(message.includes('AGENT_TRANSCRIPT_TEST_FAIL'))app.exit(1)})
 await window.loadFile(${JSON.stringify(join(directory, 'test.html'))})
})
setTimeout(()=>{console.error('Agent transcript test timed out');app.exit(1)},30000)
`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(createRequire(import.meta.url)('electron') as string, [join(directory, 'main.cjs')], { stdio: 'inherit', env })
    const code = await new Promise<number>((done, reject) => { child.on('error', reject); child.on('exit', value => done(value ?? 1)) })
    if (code !== 0) throw new Error(`Agent transcript fixture exited ${code}`)
    console.log('Agent transcript: head-first paging, refresh isolation, pagination locks and stale-response rejection passed')
} finally { await rm(directory, { recursive: true, force: true }) }

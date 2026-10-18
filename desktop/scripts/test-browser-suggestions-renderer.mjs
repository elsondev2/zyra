import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-browser-suggestions-'))
try {
    const renderer = `
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {useAssistantBrowserOmniboxSuggestions} from './src/renderer/src/pages/assistant/useAssistantBrowserOmniboxSuggestions'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const check=(ok,message)=>{if(!ok)throw Error(message)}
const same=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message+' '+JSON.stringify(a))
const requests=[]
const deferred=(query,type)=>new Promise((resolve,reject)=>requests.push({query,type,resolve,reject}))
window.devscope={getBrowserHistory:({query})=>deferred(query,'history'),getBrowserSearchSuggestions:({query})=>deferred(query,'google')}
const entry=(id,title)=>({id,url:'https://'+id+'.invalid/',title,lastVisitedAt:new Date().toISOString(),visitCount:1,faviconUrl:null})
const local=[entry('cached','Cached local stable')]
let setQuery,setEnabled,state
function Fixture(){const [query,q]=useState(''),[enabled,e]=useState(true);setQuery=q;setEnabled=e;state=useAssistantBrowserOmniboxSuggestions(query,local,enabled);return <ul>{state.suggestions.map(s=><li key={s.id} data-kind={s.kind}>{s.label}</li>)}</ul>}
const root=createRoot(document.getElementById('root'))
const labels=()=>[...document.querySelectorAll('li')].map(e=>e.textContent)
const wait=ms=>act(async()=>{await new Promise(r=>setTimeout(r,ms))})
const start=async query=>{await act(async()=>setQuery(query));await wait(150)}
const request=(query,type)=>requests.findLast(r=>r.query===query&&r.type===type)
const settle=async(query,entries,google)=>act(async()=>{request(query,'history').resolve({success:true,entries});request(query,'google')?.resolve({success:true,suggestions:google})})
try{
 await act(async()=>root.render(<Fixture/>))
 await act(async()=>setQuery('stable'));same(labels(),['Cached local stable'],'cached history can appear before the first network reply')
 const initialLocal=labels();await act(async()=>setQuery('stable extra'));same(labels(),initialLocal,'already-visible cached rows survive typing before the first remote snapshot')
 await act(async()=>setQuery(''))
 await start('base');await settle('base',[entry('base','Base history')],['base search'])
 same(labels(),['Base history','base search'],'initial history and Google results render')
 const previous=labels()
 await act(async()=>setQuery('next'))
 same(labels(),previous,'address results survive the keystroke and debounce')
 await wait(150);check(state.loading,'replacement request is pending')
 same(labels(),previous,'address results survive a network wait')
 await act(async()=>request('next','google').resolve({success:true,suggestions:['next search']}))
 same(labels(),previous,'a partial Google response cannot replace only half of the menu')
 await act(async()=>request('next','history').resolve({success:true,entries:[entry('next','Next history')]}))
 same(labels(),['Next history','next search'],'history and Google replace the menu atomically');check(!state.loading,'completed requests clear loading')
 await start('older');await start('newer');await settle('newer',[],['newest result']);await settle('older',[entry('old','Old history')],['old result'])
 same(labels(),['newest result'],'older completed requests cannot replace newer results')
 await start('closing');await act(async()=>setQuery(''));same(labels(),[],'blur, Escape and clear hide the menu immediately');await settle('closing',[],['late result']);same(labels(),[],'late replies cannot resurrect a closed menu')
 await start('cleared-history');await act(async()=>state.clear());same(labels(),[],'history clearing immediately drops retained suggestions');await settle('cleared-history',[entry('deleted','Deleted history')],['late suggestion']);same(labels(),[],'a pre-clear reply cannot restore deleted history')
 await act(async()=>setQuery('clear-before-debounce'));await act(async()=>state.clear());await wait(150);check(!requests.some(r=>r.query==='clear-before-debounce'),'history clearing cancels a pending debounce before it dispatches')
 await start('empty');await settle('empty',[],[]);same(labels(),[],'a successful empty result replaces old rows')
 await start('before-off');await settle('before-off',[entry('private','Retained history')],['remote private']);await start('disable-pending')
 const pendingHistory=request('disable-pending','history'),pendingGoogle=request('disable-pending','google')
 await act(async()=>setEnabled(false));same(labels(),['Retained history'],'turning Google off immediately removes remote rows while preserving history')
 const remoteReads=requests.filter(r=>r.type==='google').length;await wait(150)
 check(requests.filter(r=>r.type==='google').length===remoteReads,'disabled suggestions never send a new remote request')
 await act(async()=>request('disable-pending','history').resolve({success:true,entries:[]}))
 await act(async()=>{pendingHistory.resolve({success:true,entries:[]});pendingGoogle.resolve({success:true,suggestions:['late private']})})
 same(labels(),[],'an old Google reply cannot leak back after disabling suggestions')
 await start('stable');await act(async()=>request('stable','history').reject(Error('synthetic history failure')))
 same(labels(),['Cached local stable'],'history failures settle on matching cached local history, not the old menu')
 await act(async()=>setEnabled(true));await wait(150)
 await act(async()=>{request('stable','history').reject(Error('synthetic history failure'));request('stable','google').reject(Error('synthetic Google failure'))})
 same(labels(),['Cached local stable'],'remote failure does not preserve unrelated stale search rows');check(!state.loading,'failed reads release the loading state')
 await act(async()=>root.unmount())
 console.log('BROWSER_SUGGESTIONS_PASS')
}catch(error){console.error('BROWSER_SUGGESTIONS_FAIL',error.stack||String(error))}
`
    const bundle = await build({ stdin: { contents: renderer, resolveDir: desktop, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, logLevel: 'silent' })
    const html = join(directory, 'index.html')
    await writeFile(html, '<div id="root"></div><script type="module">' + bundle.outputFiles[0].text + '</script>')
    const harness = join(directory, 'main.cjs')
    await writeFile(harness, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});app.disableHardwareAcceleration();const timer=setTimeout(()=>app.exit(1),20000);app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true}});win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,callback)=>callback({cancel:true}));win.webContents.on('console-message',event=>{console.log(event.message);if(event.message.includes('BROWSER_SUGGESTIONS_PASS')){clearTimeout(timer);app.exit(0)}if(event.message.includes('BROWSER_SUGGESTIONS_FAIL'))app.exit(1)});await win.loadFile(${JSON.stringify(html)})}).catch(error=>{console.error(error);app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const linuxCI = process.platform === 'linux' && Boolean(process.env.CI)
    const virtual = linuxCI && !process.env.DISPLAY
    const args = [...(linuxCI ? ['--no-sandbox'] : []), harness]
    const code = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electron, virtual ? ['--auto-servernum', electron, ...args] : args, { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
    assert.equal(code, 0, 'real address-bar suggestion hook with synthetic, delayed APIs')
} finally {
    await rm(directory, { recursive: true, force: true })
}

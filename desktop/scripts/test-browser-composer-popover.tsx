import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config.js'

// Chromium renderer, real composer/portal/CSS, deliberately no native overlay bridge.
// Everything else is synthetic; this never opens the user's browser or saved profile.
const directory = await mkdtemp(join(tmpdir(), 'zyra-browser-composer-'))
const evidence = resolve(import.meta.dir, '../../docs.local/reviews/browser-composer-popover')
const source = (path: string) => JSON.stringify(resolve(import.meta.dir, '../src/renderer/src', path))
const harness = `
import React,{act,useState,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {AssistantComposerView} from ${source('pages/assistant/AssistantComposerView.tsx')}
import {supportsNativeOverlay} from ${source('components/ui/native-overlay-host.ts')}
globalThis.IS_REACT_ACT_ENVIRONMENT=true
window.addEventListener('error',event=>console.error('BROWSER_COMPOSER_PAGEERROR '+(event.error?.stack||event.message)))
window.addEventListener('unhandledrejection',event=>console.error('BROWSER_COMPOSER_PAGEERROR '+(event.reason?.stack||event.reason)))
const check=(value,message)=>{if(!value)throw Error(message)}
const noop=()=>{}
window.devscope={assistant:{listPromptResources:async()=>({success:true,commands:[],skills:[],diagnostics:[]})}}
function Fixture({placement}){
 const [showTraitsDropdown,setShowTraitsDropdown]=useState(false)
 const [selectedEffort,setSelectedEffort]=useState('medium')
 const [selectedModel,setSelectedModel]=useState('openai-codex/gpt-5.4')
 const [selectedRuntimeMode,setSelectedRuntimeMode]=useState('approval-required')
 const [fastModeEnabled,setFastModeEnabled]=useState(false)
 const composerRootRef=useRef(null),textareaRef=useRef(null),filePickerRef=useRef(null),mentionListRef=useRef(null),mentionMenuRef=useRef(null),modelDropdownRef=useRef(null),modelListRef=useRef(null),traitsDropdownRef=useRef(null)
 const refs={composerRootRef,textareaRef,filePickerRef,mentionListRef,mentionMenuRef,modelDropdownRef,modelListRef,traitsDropdownRef}
 const controller={...refs,placement,contextFiles:[],text:'',composerCursor:0,projectRoots:[],queuedMessages:[],removingAttachmentIds:[],inlineMentionTags:[],mentionCandidates:[],projectChoices:[],
  capabilities:{canSend:true,composerAvailable:true,canStop:false,showBusySendActions:false},voiceInput:{isStarting:false,isRecording:false,isTranscribing:false,isSupported:false,stopBrowserOnInput:noop},
  submitLabel:'Send',isConnected:true,selectedModel,selectedModelLabel:selectedModel.endsWith('5.4')?'GPT-5.4':'GPT-5.3',selectedEffort,selectedInteractionMode:'default',selectedRuntimeMode,displayedProfile:'fixture',zyraProfile:'concise',EFFORT_OPTIONS:['low','medium','high'],EFFORT_LABELS:{low:'Low',medium:'Medium',high:'High'},
  modelQuery:'',activeModelIndex:0,modelsLoading:false,modelsError:null,latestModelId:null,filteredModelOptions:[{id:'openai-codex/gpt-5.4',label:'GPT-5.4'},{id:'openai-codex/gpt-5.3',label:'GPT-5.3'}],showTraitsDropdown,setShowTraitsDropdown,setSelectedEffort,setSelectedModel,setSelectedRuntimeMode,fastModeEnabled,setFastModeEnabled,
  setPreviewAttachment:noop,removeAttachment:noop,setText:noop,setShowMentionMenu:noop,setComposerCursor:noop,setInlineMentionTags:noop,syncScrollAffordance:noop,handlePaste:noop,handleKeyDown:noop,handleSend:noop,attachFile:noop,setShowModelDropdown:noop,setModelQuery:noop,setActiveModelIndex:noop,onZyraProfileChange:noop}
 return <div className="assistant-conversation-pane" style={{width:'min(760px,calc(100% - 32px))',margin:'280px auto 100px'}}><div className="relative z-40 will-change-transform" data-composer-pane-fixture><AssistantComposerView controller={controller}/></div><output id="choices">{selectedEffort+'|'+selectedModel+'|'+selectedRuntimeMode}</output><button id="outside">Outside fixture action</button></div>
}
const root=createRoot(document.getElementById('root'))
const flush=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,60))})
const click=async node=>{check(node,'click target exists');await act(async()=>node.click());await flush()}
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text)
const trigger=()=>document.querySelector('button[title^="Model"]')
function unobscured(node,label){
 check(node,label+' exists');const r=node.getBoundingClientRect()
 check(r.width>0&&r.height>0,label+' has layout')
 check(r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,label+' stays within viewport '+JSON.stringify(r.toJSON()))
 for(const y of [r.top+2,r.top+r.height/2,r.bottom-2]){
  const hit=document.elementFromPoint(r.left+r.width/2,y)
  check(node===hit||node.contains(hit),label+' is fully hit-testable at y='+y+'; hit '+hit?.outerHTML.slice(0,220))
 }
 return r
}
window.fixtureMount=async placement=>{window.fixturePlacement=placement;await act(async()=>root.render(<MemoryRouter><Fixture key={placement} placement={placement}/></MemoryRouter>));await flush();check(!supportsNativeOverlay(),'ordinary browser fallback is active')}
window.fixtureOpen=async()=>{await click(trigger());await flush();window.fixtureCheck()}
window.fixtureCheck=()=>{
 const slider=document.querySelector('[aria-label="Reasoning effort"]')
 unobscured(slider,'reasoning slider');const model=unobscured(button('ModelGPT-5.4')||[...document.querySelectorAll('button')].find(node=>node.textContent.startsWith('Model')&&node.textContent.includes('GPT-')),'bottom model route')
 const popup=slider.closest('[data-native-overlay-content]')
 check(popup&&popup.parentElement===document.body,'fallback popup portals to body outside composer clipping')
 check(!popup.closest('[data-assistant-composer-frame]'),'popup escapes composer frame')
 const anchor=trigger().getBoundingClientRect(),panel=slider.parentElement.parentElement.parentElement.getBoundingClientRect()
 check(window.fixturePlacement==='center'?Math.abs(panel.top-anchor.top-36)<2:Math.abs(panel.bottom-anchor.top+8)<2,'popup follows real trigger geometry through scroll/resize')
 return {viewport:innerWidth,model:model.toJSON(),anchor:anchor.toJSON(),panel:panel.toJSON()}
}
window.fixtureInteractions=async()=>{
 const slider=document.querySelector('[aria-label="Reasoning effort"]')
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'2');slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}))});await flush()
 check(document.getElementById('choices').textContent.startsWith('high|'),'reasoning selection updates synthetic state')
 const route=[...document.querySelectorAll('button')].find(node=>node.textContent.startsWith('Model')&&node.textContent.includes('GPT-'))
 await act(async()=>{route.focus();route.dispatchEvent(new FocusEvent('focusin',{bubbles:true}))});await flush()
 const model=[...document.querySelectorAll('button[data-model-index]')].find(node=>node.textContent.includes('GPT-5.3'))
 unobscured(model,'model submenu choice');await click(model)
 check(document.getElementById('choices').textContent.includes('gpt-5.3'),'model submenu selection updates synthetic state')
 await click(trigger());check(!document.querySelector('[aria-label="Reasoning effort"]'),'trigger closes model/reasoning menu')
 await click(document.querySelector('[aria-label="Supervised permission mode"]'))
 const menu=document.querySelector('[aria-label="Permission mode"]');unobscured(menu.querySelector('[role="menuitemradio"]'),'permission choice')
 await click([...menu.querySelectorAll('button')].find(node=>node.textContent.includes('Auto review')))
 check(document.getElementById('choices').textContent.endsWith('auto-review')&&!document.querySelector('[aria-label="Permission mode"]'),'permission selection closes menu')
 const access=document.querySelector('[aria-label="Auto review permission mode"]')
 await click(access);await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await flush()
 check(!document.querySelector('[aria-label="Permission mode"]'),'Escape closes permission menu')
 await click(access);await act(async()=>document.getElementById('outside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));await flush()
 check(!document.querySelector('[aria-label="Permission mode"]'),'outside pointer closes permission menu')
}
console.log('BROWSER_COMPOSER_READY')
`
try {
    console.log('Browser composer fixture: bundling')
    const build = await Bun.build({ entrypoints: ['browser-composer-harness'], target: 'browser', plugins: [{ name: 'browser-composer-fixture', setup(builder) {
        builder.onResolve({ filter: /^browser-composer-harness$/ }, () => ({ path: 'harness', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: harness, loader: 'tsx', resolveDir: resolve(import.meta.dir, '..') }))
        builder.onLoad({ filter: /\.(svg|png)$/ }, async args => ({ contents: `export default ${JSON.stringify(`data:${args.path.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${(await readFile(args.path)).toString('base64')}`)}`, loader: 'js' }))
        builder.onResolve({ filter: /^@\/lib\/settings$/ }, () => ({ path: 'settings', namespace: 'mock' }))
        builder.onResolve({ filter: /^@\/lib\/product-analytics$/ }, () => ({ path: 'analytics', namespace: 'mock' }))
        builder.onResolve({ filter: /^@\/components\/ui\/file-preview\/SyntaxPreview$/ }, () => ({ path: 'syntax', namespace: 'mock' }))
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'settings' ? 'export const useSettings=()=>({settings:{theme:"dark",appearanceResolvedMode:"dark",assistantTranscriptionEngine:"browser",assistantTranscriptionEnabled:false,accentColor:{primary:"#4385ff"}},updateSettings:()=>{}});export const getThemeAppearance=()=>"dark";' : args.path === 'syntax' ? 'export default ()=>null;' : 'export const captureProductEvent=()=>{};', loader: 'tsx' }))
    } }] })
    if (!build.success) throw new Error(build.logs.join('\n'))
    await writeFile(join(directory, 'harness.js'), await build.outputs[0].text())
    console.log('Browser composer fixture: rendering CSS')
    const appCss = postcss.parse(await readFile(resolve(import.meta.dir, '../src/renderer/src/index.css'), 'utf8'))
    appCss.walkAtRules('import', rule => { rule.remove() })
    const styles = await postcss([tailwindcss({ ...config, content: ['./src/renderer/src/pages/assistant/AssistantComposer*.tsx', './src/renderer/src/pages/assistant/AssistantAttachment*.tsx', './src/renderer/src/components/ui/*.{ts,tsx}'] })]).process(appCss.toString(), { from: undefined })
    const tokens = await readFile(resolve(import.meta.dir, '../src/renderer/src/styles/theme-tokens.css'), 'utf8')
    await writeFile(join(directory, 'test.css'), tokens + '\n' + styles.css)
    await writeFile(join(directory, 'test.html'), '<link rel="stylesheet" href="test.css"><style>body{background:var(--color-bg);color:var(--color-text);font-family:system-ui;min-height:1200px} :root{--accent-primary:#4385ff}</style><div id="root"></div><script type="module" src="harness.js"></script>')
    await mkdir(evidence, { recursive: true })
    await writeFile(join(directory, 'main.cjs'), `
const {app,BrowserWindow}=require('electron'),fs=require('node:fs');
app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{backgroundThrottling:false,offscreen:true}});
 win.webContents.on('paint',()=>{});win.webContents.setFrameRate(60);
 let running=false;win.webContents.on('console-message',async event=>{
  console.log(event.message);
  if(!event.message.includes('BROWSER_COMPOSER_READY')||running)return;running=true;
  const run=code=>win.webContents.executeJavaScript(code);
  try{
   for(const placement of ['bottom','center']){
    await run('fixtureMount('+JSON.stringify(placement)+')');await run('fixtureOpen()');
    console.log(placement+' '+await run('JSON.stringify(fixtureCheck())'));
    fs.writeFileSync(${JSON.stringify(evidence)}+'/'+placement+'-wide.png',(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    const before=await run('fixtureCheck().anchor.top');await run('scrollTo(0,70);new Promise(r=>setTimeout(r,120))');
    const after=await run('fixtureCheck().anchor.top');if(Math.abs(before-after-70)>1)throw Error('scroll fixture did not move actual anchor');
    console.log('scroll '+await run('JSON.stringify(fixtureCheck())'));
    win.setContentSize(390,900);await run('new Promise(r=>setTimeout(r,180))');
    console.log('narrow '+await run('JSON.stringify(fixtureCheck())'));
    fs.writeFileSync(${JSON.stringify(evidence)}+'/'+placement+'-narrow.png',(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    await run('fixtureInteractions()');win.setContentSize(1100,900);await run('scrollTo(0,0);new Promise(r=>setTimeout(r,120))');
   }
   console.log('BROWSER_COMPOSER_POPOVER_PASS');app.exit(0);
  }catch(error){
   console.error('BROWSER_COMPOSER_POPOVER_FAIL '+error.stack);
   try{fs.writeFileSync(${JSON.stringify(evidence)}+'/failure.png',(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG())}catch(captureError){console.error('Failure capture unavailable: '+captureError.message)}finally{app.exit(1)}
  }
 });await win.loadFile(${JSON.stringify(join(directory, 'test.html'))});
});setTimeout(()=>{console.error('Browser composer fixture timed out');app.exit(1)},45000);
`)
    console.log('Browser composer fixture: launching isolated renderer')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const electron = createRequire(import.meta.url)('electron') as string
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(directory, 'main.cjs')]
    const virtualDisplay = process.platform === 'linux' && process.env.CI && !process.env.DISPLAY
    const child = spawn(virtualDisplay ? 'xvfb-run' : electron, virtualDisplay ? ['--auto-servernum', electron, ...args] : args, { env, stdio: 'inherit', windowsHide: true })
    const code = await new Promise<number>((accept, reject) => { child.once('error', reject); child.once('exit', code => accept(code ?? 1)) })
    if (code !== 0) throw new Error(`Browser composer fixture exited ${code}`)
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-browser-composer-')) throw new Error('Unexpected fixture cleanup path')
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

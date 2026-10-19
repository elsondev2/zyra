import assert from 'node:assert/strict'
import { build } from 'esbuild'
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Real FleetWorkspace, React event handlers, selection effects and persistence.
// Presentation leaves/transcript transport are isolated so every navigation
// commit is observable without mounting Markdown, providers or native overlays.
const leaves = {
    AssistantAgentDetailPage: `export const AssistantAgentDetailPage = p => <section data-view="agent-detail"><button data-back onClick={p.onBack}>Back</button></section>`,
    AssistantAgentDirectory: `export const AssistantAgentDirectory = p => <section data-view="agent-list">{p.navigation}<button data-open-agent onClick={()=>p.onOpenAgent('agent-1')}>Agent</button></section>`,
    AssistantWorkflowDetailPage: `export const AssistantWorkflowDetailPage = p => <section data-view="workflow-detail" data-id={p.run.workflowRunId}><button data-back onClick={p.onBack}>Back</button><button data-open-agent onClick={()=>p.onOpenAgent('agent-1')}>Agent</button></section>`,
    AssistantWorkflowDirectory: `export const AssistantWorkflowDirectory = p => <section data-view="workflow-list" data-page={p.page} data-query={p.query} data-filter={p.filter}>{p.navigation}<button data-open-workflow onClick={()=>p.onOpenWorkflow('workflow-1')}>Workflow</button><button data-search onClick={()=>{p.onQueryChange('notification');p.onFilterChange('attention');p.onPageChange(2)}}>Search</button></section>`,
    useAssistantAgentTranscript: `export const useAssistantAgentTranscript = () => ({page:null,loading:false,error:null})`,
    AnchoredMenuPopover: `export const AnchoredMenuPopover = p => <div>{p.children}</div>`
}
const directory = await mkdtemp(join(tmpdir(), 'zyra-fleet-navigation-'))
try {
    const bundle = await build({
        stdin: { contents: `
import React,{act,Profiler,useState,useCallback}from'react';import{createRoot}from'react-dom/client';
import{AssistantFleetWorkspace}from'./src/renderer/src/pages/assistant/AssistantFleetWorkspace';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const root=createRoot(document.getElementById('root')),check=(ok,message)=>{if(!ok)throw Error(message)};
const snapshot={agents:{'agent-1':{agentRunId:'agent-1',createdAt:'2026-01-01',workflowRunId:'workflow-1'}},workflows:{'workflow-1':{workflowRunId:'workflow-1',createdAt:'2026-01-01'}}};
const initialCapsule={version:1,workspace:'agents',section:'workflows',workflowPage:2,selectedWorkflowRunId:'workflow-1'};
let controls,commits=[],capsules=[];
const view=()=>document.querySelector('[data-view]')?.getAttribute('data-view');
function Host({initial=initialCapsule}){
 const[agent,setAgent]=useState(initial.selectedAgentRunId??null),[workflow,setWorkflow]=useState(initial.selectedWorkflowRunId??null),[capsule,setCapsule]=useState(initial);
 controls={setAgent,setWorkflow,setCapsule};
 const persist=useCallback(c=>capsules.push(c),[]);
 return <AssistantFleetWorkspace threadId="test-thread" snapshot={snapshot} selectedAgentRunId={agent} selectedWorkflowRunId={workflow} onSelectAgent={setAgent} onSelectWorkflow={setWorkflow} stateCapsule={capsule} onStateCapsuleChange={persist}/>;
}
const click=async selector=>{const button=document.querySelector(selector);check(button,'missing control '+selector);await act(async()=>button.click())};
const reset=()=>{commits=[];capsules=[]};
const only=expected=>{check(commits.length>0,'navigation must produce an observable commit');check(commits.every(v=>v===expected),'navigation must commit only '+expected+', got '+commits.join(', '))};
window.runRegression=async()=>{
 await act(async()=>root.render(<Profiler id="fleet" onRender={()=>commits.push(view())}><Host/></Profiler>));
 check(view()==='workflow-detail','start at workflow');
 for(let i=0;i<5;i++){
  await click('[data-open-agent]');check(view()==='agent-detail','open linked agent');reset();
  await click('[data-back]');
  check(view()==='workflow-detail','Back returns to the same workflow');
  check(!commits.includes('agent-list'),'Back must never commit the agent directory before its workflow: '+commits.join(', '));
  only('workflow-detail');
  check(capsules.length>0&&capsules.every(c=>c.section==='workflows'&&!c.selectedAgentRunId&&c.selectedWorkflowRunId==='workflow-1'),'persistence cannot publish an intermediate directory selection');
 }
 reset();await act(async()=>controls.setAgent('agent-1'));only('agent-detail');
 reset();await act(async()=>controls.setCapsule({...initialCapsule}));only('agent-detail');
 await click('[data-back]');await click('[data-back]');check(view()==='workflow-list','workflow Back reaches its directory');
 await click('[data-search]');
 await click('[data-open-workflow]');await click('[data-open-agent]');await click('[data-back]');await click('[data-back]');
 const list=document.querySelector('[data-view]');check(list.dataset.page==='2'&&list.dataset.query==='notification'&&list.dataset.filter==='attention','workflow directory position and filters survive the round trip');
 const saved=capsules.at(-1);
 check(saved?.workflowQuery==='notification'&&saved?.workflowFilter==='attention'&&saved?.workflowPage===2,'workflow capsule must persist the query/filter that owns its page');
 reset();await act(async()=>root.render(<Profiler id="fleet" onRender={()=>commits.push(view())}><Host key="restored" initial={saved}/></Profiler>));
 const restored=document.querySelector('[data-view]');
 check(view()==='workflow-list'&&restored.dataset.page==='2'&&restored.dataset.query==='notification'&&restored.dataset.filter==='attention','a remounted workflow directory restores its complete saved search state');
 check(capsules.length>0&&capsules.every(c=>c.workflowQuery==='notification'&&c.workflowFilter==='attention'),'remount persistence cannot overwrite a saved search with empty defaults');
 reset();await act(async()=>controls.setCapsule({version:1,workspace:'agents',section:'workflows',workflowPage:1,workflowQuery:'auth',workflowFilter:'finished'}));
 const hydrated=document.querySelector('[data-view]');
 check(hydrated.dataset.page==='1'&&hydrated.dataset.query==='auth'&&hydrated.dataset.filter==='finished','incoming transferred capsule hydrates workflow page, query and filter together');
 check(capsules.length>0&&capsules.every(c=>c.workflowQuery==='auth'&&c.workflowFilter==='finished'&&c.workflowPage===1),'hydration cannot emit stale search state over the incoming capsule');
 reset();await act(async()=>{controls.setWorkflow(null);controls.setAgent('agent-1')});only('agent-detail');
 reset();await click('[data-back]');only('agent-list');
 await click('[aria-label="Delegated work view"]');await click('[role="menuitemradio"][aria-checked="false"]');check(view()==='workflow-list','directory view chooser still works without a selected detail');
 await act(async()=>controls.setWorkflow('missing-workflow'));
 await click('[aria-label="Delegated work view"]');await click('[role="menuitemradio"][aria-checked="false"]');check(view()==='agent-list','a removed target cannot lock the directory view chooser');
 await act(async()=>root.unmount());
};`, resolveDir: resolve(import.meta.dirname, '..'), loader: 'tsx' },
        bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'isolate-presentation', setup(builder) {
            builder.onResolve({ filter: /(?:AssistantAgentDetailPage|AssistantAgentDirectory|AssistantWorkflowDetailPage|AssistantWorkflowDirectory|useAssistantAgentTranscript|AnchoredMenuPopover)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'navigation-leaf' }))
            builder.onLoad({ filter: /.*/, namespace: 'navigation-leaf' }, args => ({ contents: `import React from 'react';${leaves[args.path]}`, loader: 'tsx', resolveDir: resolve(import.meta.dirname, '..') }))
        } }]
    })
    await writeFile(join(directory, 'index.html'), '<div id="root"></div><script>' + bundle.outputFiles[0].text + '</script>')
    await writeFile(join(directory, 'main.cjs'), `
const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});app.disableHardwareAcceleration();
const timeout=setTimeout(()=>{console.error('Fleet navigation timed out');app.exit(1)},15000);
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});
 win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,callback)=>callback({cancel:true}));
 await win.loadFile(${JSON.stringify(join(directory, 'index.html'))});await win.webContents.executeJavaScript('window.runRegression()');
 console.log('FLEET_NAVIGATION_PASS');clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electronPath, [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(directory, 'main.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk) })
    const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept) })
    assert.equal(code, 0, output)
    assert.match(output, /FLEET_NAVIGATION_PASS/)
} finally { await rm(directory, { recursive: true, force: true }) }

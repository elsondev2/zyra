import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, open, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, freemem } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-full-app-perf-'))
const rendererIndex = process.argv.indexOf('--renderer-url')
const rendererUrl = rendererIndex >= 0 ? process.argv[rendererIndex + 1] : 'http://localhost:5187'
const outputIndex = process.argv.indexOf('--output')
const profileMemory = process.argv.includes('--profile-memory')
const profileAllocations = process.argv.includes('--profile-allocations')
const verifyColdNavigation = process.argv.includes('--verify-cold-navigation')
const verifyInspector = process.argv.includes('--verify-inspector')
try {
    const profile = join(directory, 'appdata/Zyra-dev-perf-app')
    const home = join(directory, 'home')
    await mkdir(join(profile, 'setup'), { recursive: true })
    for (const folder of ['Downloads', 'Documents', 'Desktop', 'Music', 'Pictures', 'Videos']) await mkdir(join(home, folder), { recursive: true })
    const now = '2026-01-01T00:00:00.000Z'
    await writeFile(join(profile, 'setup/onboarding.json'), JSON.stringify({ schemaVersion: 1, flowVersion: 2, revision: 0, status: 'completed', currentStep: 'review', completedSteps: ['welcome', 'connect-openai', 'appearance', 'projects', 'review'], reviewActive: false, startedAt: now, updatedAt: now, completedAt: now, data: { auth: { method: 'api-key', verifiedAt: now }, appearance: { appearanceThemeMode: 'dark', appearanceDarkTheme: 'vercel', appearanceUiFont: 'Inter', appearanceCodeFont: 'JetBrains Mono', accessibilityReduceMotion: false }, projects: { projectsFolder: home } } }))
    const harness = join(directory, 'main.mjs')
    await writeFile(harness, `
import { app, BrowserWindow, dialog, session, ipcMain } from 'electron';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Server as HttpServer } from 'node:http';
import { Session as InspectorSession } from 'node:inspector';
const start=performance.now(); const elapsed=()=>performance.now()-start;
const stages={}; const errors=[]; const requests=[]; const metrics=[];const resourceDetails=new Map();const memoryPhases=[];let state;let completedMeasurements;
const ipcTimings=[];
const registerHandler=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,handler)=>registerHandler(channel,async(...args)=>{const timing={channel,startMs:elapsed(),pending:true};ipcTimings.push(timing);try{return await handler(...args)}catch(error){timing.failed=true;throw error}finally{timing.endMs=elapsed();timing.pending=false}});
let mainAllocationProfile;let mainAllocationError;
const inspector=${JSON.stringify(profileAllocations)}?new InspectorSession():null;
const inspect=(method,params={})=>new Promise((resolve,reject)=>inspector.post(method,params,(error,result)=>error?reject(error):resolve(result)));
if(inspector){inspector.connect();await inspect('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true}).catch(error=>{mainAllocationError=String(error)})}
const memoryProfile=${JSON.stringify(profileMemory)};
let collectMainGarbage;
if(memoryProfile){setFlagsFromString('--expose-gc');collectMainGarbage=runInNewContext('gc');setFlagsFromString('--no-expose-gc')}
const captureMemory=phase=>{const before=process.memoryUsage();if(collectMainGarbage)collectMainGarbage();memoryPhases.push({phase,atMs:elapsed(),before,after:process.memoryUsage(),gcRequested:!!collectMainGarbage})};
const resourceTotals=()=>({count:requests.length,encodedBytes:requests.reduce((sum,r)=>sum+r.bytes,0)});
// Keep generated instances out of the browser extension's ordinary discovery ports.
const listen=HttpServer.prototype.listen;
HttpServer.prototype.listen=function(...args){if([47821,47822].includes(args[0]))args[0]=0;else if(args[0]&&typeof args[0]==='object'&&[47821,47822].includes(args[0].port))args[0]={...args[0],port:0};return listen.apply(this,args)};
const checkpoint=name=>console.log('benchmark checkpoint '+name+' '+Math.round(elapsed()));
app.setPath('appData',${JSON.stringify(join(directory, 'appdata'))});
app.setPath('userData',${JSON.stringify(profile)});
for(const [key,folder] of Object.entries({downloads:'Downloads',documents:'Documents',desktop:'Desktop',music:'Music',pictures:'Pictures',videos:'Videos'}))app.setPath(key,${JSON.stringify(home)}+'/'+folder);
// Test presentation only. The actual app creates its real windows/preload/services.
BrowserWindow.prototype.show=function(){}; BrowserWindow.prototype.showInactive=function(){}; BrowserWindow.prototype.focus=function(){};
dialog.showErrorBox=(title,content)=>{errors.push('Native error dialog: '+title);console.error(title,content)};
for(const method of ['showMessageBox','showMessageBoxSync','showOpenDialog','showOpenDialogSync','showSaveDialog','showSaveDialogSync'])dialog[method]=()=>{throw Error('Hidden benchmark unexpectedly requested native dialog '+method)};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=setTimeout(async()=>{console.error('Full app benchmark timed out '+JSON.stringify({stages,errors,state}));await writeFile(${JSON.stringify(join(directory,'partial.json'))},JSON.stringify({stages,errors,state,requests:resourceTotals(),resourceDetails:requests,memoryPhases}));app.exit(1)},150000);
app.on('browser-window-created',(_event,win)=>{
 if(stages.windowCreatedMs!==undefined)return;
 stages.windowCreatedMs=elapsed();
 win.webContents.setBackgroundThrottling(false);
 win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message.slice(0,300))});
 win.webContents.on('did-fail-load',(_e,code,description)=>errors.push('load '+code+' '+description));
 win.webContents.once('dom-ready',()=>{stages.domReadyMs=elapsed()});
 win.webContents.once('did-finish-load',()=>{stages.loadFinishedMs=elapsed()});
 win.webContents.debugger.attach('1.3');
 win.webContents.debugger.on('message',(_e,method,params)=>{
  if(method==='Network.requestWillBeSent'){
   let path='<external>';try{const url=new URL(params.request.url);if(['localhost','127.0.0.1'].includes(url.hostname))path=url.pathname;else if(url.protocol==='file:')path='<local-file>';else if(url.protocol==='data:'||url.protocol==='blob:')path='<inline>'}catch{}
   resourceDetails.set(params.requestId,{path,type:params.type,startMs:elapsed()});
  }
  if(method==='Network.loadingFinished')requests.push({...resourceDetails.get(params.requestId),bytes:params.encodedDataLength,endMs:elapsed()});
 });
 void win.webContents.debugger.sendCommand('Network.enable');
 void win.webContents.debugger.sendCommand('Performance.enable');
 void (async()=>{
 try {
  while(!stages.loadFinishedMs)await wait(25);
  const evaluate=source=>{try{new Function(source)}catch(error){throw Error('Invalid benchmark probe: '+source+' '+error.message)}return win.webContents.executeJavaScript(source,true)};
  const bridge=JSON.parse(await readFile(${JSON.stringify(join(profile, 'browser-assistant-bridge.json'))},'utf8'));
  const invoke=async(method,args=[])=>{
   const response=await fetch('http://'+bridge.host+':'+bridge.port+'/v1/assistant/invoke',{method:'POST',headers:{'content-type':'application/json',origin:${JSON.stringify(new URL(rendererUrl).origin)},'x-zyra-browser-client':'assistant-v1','x-zyra-browser-capability':bridge.capability},body:JSON.stringify({method,args})});
   const result=await response.json(); if(!result.ok||result.value?.success===false)throw Error(result.error||result.value?.error||'IPC failed');return result.value;
  };
  state=await evaluate('({text:document.body.innerText.slice(0,2000),buttons:[...document.querySelectorAll("button")].map(b=>b.textContent||b.getAttribute("aria-label")),composer:!!document.querySelector("textarea,[contenteditable=true]"),visibility:document.visibilityState})');
  stages.initialShellObservedMs=elapsed();
  const startupResources=resourceTotals();
  if(inspector){if(!mainAllocationError)mainAllocationProfile=(await inspect('HeapProfiler.stopSampling')).profile;inspector.disconnect()}
  captureMemory('shell');
  checkpoint('shell');
  const composerDeadline=performance.now()+30000;
  do{state=await evaluate('({ready:[...document.querySelectorAll("textarea,[contenteditable=true][role=textbox]")].some(input=>getComputedStyle(input).visibility==="visible"&&input.getClientRects().length>0),route:location.hash,composerDisabled:document.querySelector("textarea")?.disabled,body:document.body.innerText.slice(0,400)})');if(!state.ready)await wait(25);if(performance.now()>composerDeadline)throw Error('Chat composer did not mount '+JSON.stringify(state))}while(!state.ready);
  stages.chatComposerMountedMs=elapsed();checkpoint('composer');
  const seedStart=performance.now();const fixtures=await invoke('seedDevelopmentChatFixtures'); stages.fixtureSeedMs=performance.now()-seedStart;
  captureMemory('seeded');
  checkpoint('seed');
  const readyDeadline=performance.now()+30000;
  do {state=await evaluate('({text:document.body.innerText.slice(0,300),ready:[...document.querySelectorAll("[role=button][title]")].some(row=>row.title.includes("LIGHT CHAT")),rows:document.querySelectorAll("[data-assistant-timeline-row-id]").length})'); if(!state.ready||!state.rows)await wait(50);if(performance.now()>readyDeadline)throw Error('Initial seeded UI did not settle '+JSON.stringify(state))}while(!state.ready||!state.rows);
  const switches=[];
  for(let i=0;i<6;i++){
   const fixture=fixtures.fixtures[i%2]; const begin=performance.now();
   const clicked=await evaluate('(()=>{const row=[...document.querySelectorAll("[role=button][title]")].find(row=>row.title==='+JSON.stringify(fixture.title)+');if(!row)return false;row.click();return true})()');if(!clicked)throw Error('Fixture sidebar row was not found');
   let visible;
   const kind=fixture.threadId.includes('heavy')?'heavy':'light'; const marker=':'+kind+':';
   const switchDeadline=performance.now()+15000;
   do {visible=await evaluate('({rows:[...document.querySelectorAll("[data-assistant-timeline-row-id]")].filter(row=>row.getAttribute("data-assistant-timeline-row-id").includes('+JSON.stringify(marker)+')&&getComputedStyle(row).visibility==="visible"&&row.getClientRects().length>0).length,selected:location.href,ids:[...document.querySelectorAll("[data-assistant-timeline-row-id]")].slice(0,4).map(row=>row.getAttribute("data-assistant-timeline-row-id"))})');state=visible;if(!visible.rows)await wait(20);if(performance.now()>switchDeadline)throw Error('Fixture switch did not settle '+JSON.stringify(visible))}while(!visible.rows);
   switches.push({session:kind,wallMs:performance.now()-begin,rows:visible.rows,selected:visible.selected,firstRowIds:visible.ids});
   checkpoint('switch-'+i);
   if(i===0)stages.firstFixtureRowsObservedMs=elapsed();
  }
  const perf=await win.webContents.debugger.sendCommand('Performance.getMetrics');
  const navigation=await evaluate('({paint:performance.getEntriesByType("paint").map(p=>({name:p.name,startTime:p.startTime})),navigation:performance.getEntriesByType("navigation").map(n=>({domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd})),visibility:document.visibilityState})');
  const processesBeforeIdle=new Map(app.getAppMetrics().map(p=>[p.pid,p.cpu.cumulativeCPUUsage]));
  const beforeCpu=process.cpuUsage(); await wait(3000);const idleCpu=process.cpuUsage(beforeCpu);
  metrics.push(...app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu,memory:p.memory,idleCpuMs:processesBeforeIdle.has(p.pid)?(p.cpu.cumulativeCPUUsage-processesBeforeIdle.get(p.pid))*1000:null})));
  if(BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused()))throw Error('App unexpectedly foregrounded');
  captureMemory('finished');
  const report={stages:{...stages},switches,fixtures:fixtures.fixtures,navigation,requests:resourceTotals(),startupResources,resourceDetails:requests.slice(),ipcTimings:ipcTimings.slice(),memoryPhases:memoryPhases.slice(),mainAllocationProfile,mainAllocationError,rendererMetrics:perf.metrics,processes:metrics,mainIdleCpuMs:(idleCpu.user+idleCpu.system)/1000,idleSampleMs:3000,errors};
  completedMeasurements=report;
  if (${JSON.stringify(verifyColdNavigation)}) {
   const heavy=fixtures.fixtures.find(fixture=>fixture.threadId.includes('heavy'));
   const route=${JSON.stringify(rendererUrl)}+'/#/assistant/chat/'+encodeURIComponent(heavy.sessionId)+'/thread/'+encodeURIComponent(heavy.threadId);
   const checks=[];
   for (const [name,target] of [['resume',null],['message-deep-link','development-fixture:heavy:user-80']]) {
    const began=performance.now();
    await win.loadURL(route+(target?'?message='+encodeURIComponent(target):''));
    const deadline=performance.now()+30000;
    let observed;
    do {
     observed=await evaluate('(()=>{const target='+JSON.stringify(target)+';const rows=[...document.querySelectorAll("[data-assistant-timeline-row-id]")];const candidates=target?rows.filter(row=>row.getAttribute("data-assistant-timeline-row-id")===target):rows.filter(row=>/development-fixture:heavy:user-(219|220)$/.test(row.getAttribute("data-assistant-timeline-row-id")));const positions=candidates.map(row=>{let viewport=row.parentElement;while(viewport&&!/auto|scroll/.test(getComputedStyle(viewport).overflowY))viewport=viewport.parentElement;const rect=row.getBoundingClientRect();const bounds=viewport?.getBoundingClientRect();const top=Math.max(0,bounds?.top??0);const bottom=Math.min(innerHeight,bounds?.bottom??innerHeight);return {id:row.getAttribute("data-assistant-timeline-row-id"),top:rect.top,bottom:rect.bottom,viewportTop:top,viewportBottom:bottom,scrollTop:viewport?.scrollTop,scrollHeight:viewport?.scrollHeight,visible:rect.height>0&&Math.min(rect.bottom,bottom)>Math.max(rect.top,top)}});return {ready:positions.some(row=>row.visible),positions,ids:rows.map(row=>row.getAttribute("data-assistant-timeline-row-id")),route:location.hash}})()');
     if(!observed.ready)await wait(25);
     if(performance.now()>deadline){state={...observed,store:await evaluate('(async()=>{const {assistantStore}=await import("/src/lib/assistant/assistant-store-core.ts");const state=assistantStore.getState();const session=state.snapshot.sessions.find(session=>session.id===state.snapshot.selectedSessionId);const thread=session?.threads.find(thread=>thread.id===session.activeThreadId);return {selectedSessionId:session?.id,latestTurn:thread?.latestTurn?.id,messageIds:thread?.messages.slice(-6).map(message=>message.id),history:state.history,error:state.error}})()')};throw Error('Cold '+name+' did not reveal the requested message '+JSON.stringify(state));}
    }while(!observed.ready);
    checks.push({name,wallMs:performance.now()-began,observed});
   }
   report.coldNavigationChecks=checks;
  }
  if (${JSON.stringify(verifyInspector)}) {
   const click=async label=>{const clicked=await evaluate('(()=>{const button=[...document.querySelectorAll("button")].find(button=>button.getAttribute("aria-label")==='+JSON.stringify(label)+');if(!button)return false;button.click();return true})()');if(!clicked)throw Error('Missing inspector action '+label)};
   const observe=async condition=>{const deadline=performance.now()+20000;let result;do{result=await evaluate(condition);if(!result.ready)await wait(25);if(performance.now()>deadline)throw Error('Inspector state did not settle '+JSON.stringify(result))}while(!result.ready);return result};
   await click('Open inspector');
   const fresh=await observe('(()=>{const pane=[...document.querySelectorAll("[aria-label]")].find(element=>element.getAttribute("aria-label")==="Assistant inspector workspace");const text=pane?.textContent||"";return {ready:["Thread Details","Browser","Terminal","Files","Diff","Resources","Agents"].every(label=>text.includes(label)),text}})()');
   const selected=await evaluate('(()=>{const pane=[...document.querySelectorAll("[aria-label]")].find(element=>element.getAttribute("aria-label")==="Assistant inspector workspace");const button=[...pane.querySelectorAll("button")].find(button=>button.textContent.includes("Thread Details"));if(!button)return false;button.click();return true})()');
   if(!selected)throw Error('Missing Thread Details shortcut');
   await observe('({ready:!!document.querySelector("[role=tab][aria-selected=true]")})');
   await click('Close inspector');await wait(100);await click('Open inspector');
   const restored=await observe('(()=>{const tabs=[...document.querySelectorAll("[role=tab]")].map(tab=>({label:tab.textContent,selected:tab.getAttribute("aria-selected")}));return {ready:tabs.some(tab=>tab.selected==="true"&&tab.label.includes("Thread Details")),tabs}})()');
   report.inspectorChecks={fresh,restored};
  }
  if(BrowserWindow.getAllWindows().some(w=>w.isVisible()||w.isFocused()))throw Error('App unexpectedly foregrounded during navigation');
  await writeFile(${JSON.stringify(join(directory,'result.json'))},JSON.stringify(report,null,2));
  checkpoint('written');
  clearTimeout(timeout);app.quit();
 }catch(error){console.error(error);await writeFile(${JSON.stringify(join(directory,'partial.json'))},JSON.stringify({stages,errors,state,completedMeasurements,requests:resourceTotals(),resourceDetails:requests,ipcTimings}));clearTimeout(timeout);app.exit(1)}
 })();
});
app.once('ready',()=>{
 stages.electronReadyMs=elapsed();
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{let allowed=false;try{const url=new URL(details.url);allowed=url.protocol==='file:'||url.protocol==='data:'||['localhost','127.0.0.1'].includes(url.hostname)}catch{}callback({cancel:!allowed})});
});
await import(${JSON.stringify(new URL('../out/main/index.js', import.meta.url).href)});
stages.mainModuleEvaluatedMs=elapsed();
`)
    await mkdir(join(directory, 'local'), { recursive: true })
    const env = { ...process.env, NODE_ENV: 'development', ELECTRON_RENDERER_URL: rendererUrl, APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'local'), USERPROFILE: home, HOME: home, ZYRA_ROOT: resolve(desktop, '..'), ZYRA_DATA_ROOT: home, ZYRA_DEV_INSTANCE_SUFFIX: 'perf-app', ZYRA_STATE_DIR: join(profile, 'assistant/agent-server'), ZYRA_AGENT_SERVER_CHANNEL: 'desktop', ZYRA_ANALYTICS_ENABLED: '0', ZYRA_OFFLINE: '1', PI_CODING_AGENT_DIR: join(home, 'pi'), CODEX_HOME: join(home, 'codex') }
    for (const key of Object.keys(env)) if (/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|ELECTRON_RUN_AS_NODE/.test(key)) delete env[key]
    // Detached app services can inherit stdout. File handles avoid waiting for their pipes
    // after Electron exits; the isolated descriptor below owns their cleanup.
    const stdout = await open(join(directory, 'stdout.log'), 'w')
    const stderr = await open(join(directory, 'stderr.log'), 'w')
    let termination = 'graceful'
    try {
        await new Promise((resolveRun, rejectRun) => {
            const child = spawn(electronPath, [harness], { cwd: desktop, env, windowsHide: true, stdio: ['ignore', stdout.fd, stderr.fd] })
            let completedAt = 0
            const poll = setInterval(async () => {
                if (!completedAt) {
                    const result = await readFile(join(directory, 'result.json'), 'utf8').then(value => { try { return JSON.parse(value) } catch { return null } }, () => null)
                    if (result?.switches?.length === 6 && Array.isArray(result.errors)) completedAt = Date.now()
                } else if (Date.now() - completedAt > 5000) {
                    termination = 'host stopped its own test process after completed measurements and five-second quit grace'
                    child.kill()
                }
            }, 500)
            const clear = () => { clearInterval(poll); clearTimeout(timer) }
            const timer = setTimeout(() => { clear(); child.kill(); rejectRun(new Error('Hidden app process exceeded 165 seconds')) }, 165000)
            child.once('error', error => { clear(); rejectRun(error) })
            child.once('exit', (code, signal) => { clear(); code === 0 || termination !== 'graceful' ? resolveRun() : rejectRun(new Error(`Hidden app exited ${code ?? signal}`)) })
        })
    } finally { await stdout.close(); await stderr.close() }
    const report = { environment: { node: process.version, cpu: cpus()[0]?.model, freeMemoryBytes: freemem(), rendererUrl }, termination, protocol: 'Actual compiled Electron main/preload and entire dev renderer. Generated setup, empty credential namespace, generated light/heavy histories. Window presentation suppressed; background throttling disabled. No live provider turn.', ...JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')) }
    if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ ...report, resourceDetails: undefined, ipcTimings: undefined, mainAllocationProfile: undefined }, null, 2))
    const diagnostics = await readFile(join(directory, 'stderr.log'), 'utf8')
    if (diagnostics) console.error(diagnostics.slice(-1000))
} catch (error) {
    if (error.stderr) console.error(error.stderr)
    const diagnostics = await Promise.all(['stdout.log', 'stderr.log', 'appdata/Zyra-dev-perf-app/logs/main.log'].map(name => readFile(join(directory, name), 'utf8').then(value => value.slice(-8000), () => '')))
    const partial = await readFile(join(directory, 'partial.json'), 'utf8').then(value => { try { return JSON.parse(value) } catch { return null } }, () => null)
    if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]) + '.failure.json', JSON.stringify({ error: String(error), stdout: diagnostics[0], stderr: diagnostics[1], mainLog: diagnostics[2], partial }, null, 2))
    console.error(diagnostics[1] || diagnostics[0])
    throw error
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-full-app-perf-')) throw Error('Unexpected cleanup path')
    const stateDirectory = join(directory, 'appdata/Zyra-dev-perf-app/assistant/agent-server')
    const descriptor = await readFile(join(stateDirectory, 'agent-server-v5-desktop.json'), 'utf8').then(JSON.parse, () => null)
    if (descriptor) {
        const namespaceId = createHash('sha256').update(`${process.platform === 'win32' ? stateDirectory.toLowerCase() : stateDirectory}\0desktop`).digest('hex').slice(0, 20)
        if (descriptor.namespaceId !== namespaceId || !Number.isInteger(descriptor.pid)) throw Error('Generated server namespace mismatch')
        if (process.platform === 'win32') {
            const command = `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${descriptor.pid}'; if ($p -and $p.CommandLine -like '*src*agent-server*main.mjs*--channel*desktop*') { Stop-Process -Id ${descriptor.pid}; Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${descriptor.pid}' | Where-Object { $_.Name -eq 'node.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } }`
            await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 60000 })
        } else {
            try { process.kill(descriptor.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
        }
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

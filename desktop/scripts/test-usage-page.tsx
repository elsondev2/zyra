import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config.js'

const directory = await mkdtemp(join(tmpdir(), 'zyra-usage-ui-'))
const output = resolve(import.meta.dir, '../../docs.local/ui-review/usage-page')
const source = resolve(import.meta.dir, '../src/renderer/src')
const harness = `
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {createSettingsSectionTargetId} from ${JSON.stringify(join(source,'pages/settings/settings-search.ts'))}
import ProvidersSettings from ${JSON.stringify(join(source,'pages/settings/ProvidersSettings.tsx'))}
import {buildUsageSummary} from ${JSON.stringify(resolve(import.meta.dir,'../src/shared/assistant/usage-summary.ts'))}
globalThis.IS_REACT_ACT_ENVIRONMENT=true
window.localStorage.clear()
const check=(value,message)=>{if(!value)throw Error(message)}
const requests=[];let fail=false,hold=null,indexing=false
const turns=[
 {id:'a',harness:'codex',model:'openai/gpt-fixture',requestedAt:'2026-10-11T12:00:00Z',usage:{inputTokens:200000,outputTokens:10000,cachedInputTokens:100000,costUsd:12,costSource:'reported'}},
 {id:'b',harness:'zyra',model:'openai/gpt-fixture',requestedAt:'2026-10-12T12:00:00Z',usage:{inputTokens:30000,outputTokens:5000,costUsd:3,costSource:'reported'}},
 {id:'c',harness:'codex',model:'openai-codex/gpt-fixture',requestedAt:'2026-10-13T12:00:00Z',usage:null},
 ...['claude','pi','opencode','devscope'].map((harness,index)=>({id:'other-'+harness,harness,model:'openai/gpt-fixture',requestedAt:'2026-10-12T12:00:00Z',usage:{inputTokens:1000,outputTokens:100,costUsd:0,costSource:'reported'}}))
]
const summary=input=>({...buildUsageSummary(turns.filter(row=>input.harness==='all'||row.harness===input.harness),input,new Date('2026-10-13T13:00:00Z')),sources:[{id:'codex',state:indexing?'indexing':'ready',files:2,records:2},{id:'zyra',state:'ready',files:1,records:1},{id:'pi',state:'missing',files:0,records:0}]})
window.fixtureOverviewRequests=[]
window.devscope={assistant:{getUsageSummary:async input=>{requests.push(input);if(hold)await hold;if(fail)return {success:false,error:'Synthetic history failure'};return {success:true,summary:summary(input)}}},onboarding:{getChatGptAccounts:async input=>{window.fixturePoolRequests.push(input);return {success:true,pool:{accounts:[],policy:{strategy:'balanced',accountMode:'all',accountIds:[],preferredAccountId:null},checkedAt:'2026-10-13T13:00:00Z'}}}}}
window.fixturePoolRequests=[]
const root=createRoot(document.getElementById('root'))
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))})
const find=(selector,text)=>[...document.querySelectorAll(selector)].find(node=>node.textContent.trim()===text)
const click=async node=>{check(node,'control exists');await act(async()=>node.click());await flush()}
const select=async(label,value)=>{
 const labels={cost:'Cost',tokens:'Tokens',model:'Model',harness:'Tool',provider:'Provider',daily:'Daily',weekly:'Weekly',cumulative:'Cumulative',activity:'Activity',all:'All time',7:'7 days',30:'30 days',90:'90 days',365:'1 year'}
 const trigger=document.querySelector('button[aria-label="'+label+'"]');check(trigger,label+' themed chooser exists');await click(trigger)
 const menu=document.querySelector('[role="menu"][aria-label="'+label+'"]');check(menu,label+' themed menu opens')
 if(label==='Usage metric')check(!menu.textContent.includes('Limits'),'Limits remains a sibling page')
 if(label==='Group usage by')check(![...menu.querySelectorAll('button')].some(row=>row.textContent.trim()==='Day'),'marked Day option is removed')
 await click([...menu.querySelectorAll('[role="menuitemradio"]')].find(row=>row.textContent.trim()===labels[value]))
 check(!document.querySelector('[role="menu"][aria-label="'+label+'"]'),'selection closes its menu')
 check(trigger.textContent.trim()===labels[value],'selected option updates its trigger')
 await click(trigger)
 const reopened=document.querySelector('[role="menu"][aria-label="'+label+'"]')
 check(reopened.querySelector('[aria-checked="true"]').textContent.trim()===labels[value],'themed menu reflects the selected option')
 check(getComputedStyle(reopened).backgroundColor!=='rgba(0, 0, 0, 0)','menu has an opaque themed background')
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await flush()
 check(!document.querySelector('[role="menu"][aria-label="'+label+'"]'),'Escape closes the themed menu')
}
window.fixtureResize=async()=>{await flush();window.dispatchEvent(new Event('resize'));await flush()}
window.fixtureGeometry=()=>{
 const page=document.querySelector('.usage-page-content').getBoundingClientRect(),overview=document.querySelector('.usage-overview').getBoundingClientRect(),headline=document.querySelector('.usage-headline-column').getBoundingClientRect(),chart=document.querySelector('.usage-trend').getBoundingClientRect()
 check(document.documentElement.scrollWidth<=innerWidth+1,'page has no horizontal overflow')
 check(document.querySelectorAll('.zyra-settings-page-column').length===1,'usage has exactly one shared settings frame')
 check(page.width<=760,'usage matches the normal settings width')
 check(parseFloat(getComputedStyle(document.querySelector('[data-usage-headline]')).fontSize)<=26,'usage total stays within settings typography')
 if(overview.width>=680)check(chart.left>headline.right-1&&Math.abs(chart.top-headline.top)<2,'wide overview has summary beside chart');else check(chart.top>headline.bottom,'narrow overview stacks chart')
 const tooltip=document.querySelector('[data-usage-tooltip]');if(tooltip){const rect=tooltip.getBoundingClientRect();check(rect.left>=0&&rect.right<=innerWidth+1,'tooltip stays in viewport')}
 return {width:innerWidth,page:page.width,chart:chart.width,overview:overview.height}
}
window.fixtureScreenshotReady=false
async function run(){
 let releaseInitial;hold=new Promise(resolve=>{releaseInitial=resolve})
 await act(async()=>root.render(<MemoryRouter initialEntries={['/settings/providers/usage']}><ProvidersSettings view="usage"/></MemoryRouter>));await flush()
 check(document.querySelector('h1')?.textContent==='Providers','Usage keeps the Providers heading')
 const tabs=document.querySelector('[aria-label="providers settings views"]')
 check(tabs&&['Connections','Models','Limits','Usage'].every(label=>[...tabs.querySelectorAll('a')].some(link=>link.textContent===label)),'Usage retains its sibling provider tabs')
 check(tabs.querySelector('[aria-current="page"]')?.textContent==='Usage','Usage tab is active')
 check(!document.querySelector('[aria-label="Back to providers"]'),'no duplicate back-navigation toolbar')
 check(document.body.textContent.includes('Loading usage...')&&document.querySelector('[aria-label="Refresh usage"]').disabled,'initial loading keeps the page shell and prevents duplicate refresh')
 releaseInitial();hold=null;await flush()
 check(requests.length===1&&requests[0].harness==='all'&&requests[0].days===30,'default scope follows real usage hook contract')
 check(![...document.querySelectorAll('h2')].some(node=>node.textContent==='Usage overview'),'marked redundant overview heading is removed')
 check(!document.querySelector('.usage-tool-summary p,.usage-tool-summary small'),'tool summaries contain only source and selected value')
 check(!document.querySelector('.usage-distribution-track,.usage-distribution-legend'),'token totals do not duplicate values in bars and legends')
 check(document.querySelector('[aria-label="Measurement coverage"]'),'coverage has a separate readable measurement summary')
 check(!document.querySelector('select'),'Usage uses themed settings menus instead of OS-native dropdowns')
 check(document.querySelectorAll('.usage-tool-summary').length===6,'six tools remain visible as compact rows')
 check(document.querySelector('.usage-tool-list').getBoundingClientRect().height<=200,'tool list is compact rather than repeated metadata blocks')
 check(document.querySelectorAll('.usage-totals dt').length===4&&document.querySelectorAll('.usage-token-total').length===1,'one processed total and four named components form the token hierarchy')
 check(document.querySelector('[aria-label="Measurement coverage"]').textContent.includes('6 of 7 records'),'coverage distinguishes missing token counts and prices without duplicating totals')
 check(document.querySelector('[data-usage-headline]').textContent.includes('15')&&document.querySelector('[data-usage-headline]').textContent.includes('*'),'partial costs marked in headline')
 check(document.body.textContent.includes('Unmetered'),'missing token counts remain unknown')
 check(document.querySelector('.usage-tool-summary:nth-child(2) img'),'Zyra tool uses its logo');
 check(document.body.textContent.includes('ChatGPT')&&document.body.textContent.includes('OpenAI'),'same model distinguishes providers')
 await select('Usage metric','tokens')
 check(requests.length===1,'metric switch reuses same source data')
 const plot=document.querySelector('.usage-trend-plot')
 await act(async()=>{plot.focus();plot.dispatchEvent(new FocusEvent('focusin',{bubbles:true}))});await flush()
 check(document.querySelector('[data-usage-tooltip]')?.textContent.includes('Unmetered'),'keyboard inspect preserves missing measurement')
 await act(async()=>plot.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));await flush()
 window.fixtureGeometry()
 await click(document.querySelector('[aria-label^="Usage source:"]'))
 check(!document.querySelector('.usage-source-details')&&!document.querySelector('[role="menu"][aria-label="Usage sources"]').textContent.includes('Source coverage'),'marked source coverage section is removed')
 const rows=[...document.querySelectorAll('[role="menuitemradio"]')]
 check(document.activeElement===rows[0],'source menu gets keyboard focus')
 await act(async()=>rows[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})))
 check(document.activeElement===rows[1],'source choices support arrow navigation')
 await click(rows.find(row=>row.textContent.includes('Codex')))
 check(requests.at(-1).harness==='codex'&&document.querySelector('[data-usage-headline]').textContent.includes('310'),'source selection updates real hook data')
 await select('Usage period','7')
 check(requests.at(-1).days===7,'period changes request scope')
 await select('Group usage by','harness')
 const names=[...document.querySelectorAll('.usage-table-name strong')].map(node=>node.textContent)
 check(names.length===1&&names[0]==='Codex','tool breakdown follows the selected source')
 await select('Chart view','weekly')
 check(document.querySelector('.usage-trend').textContent.includes('Weekly processed tokens'),'weekly chart view is functional')
 await select('Chart view','cumulative')
 check(document.querySelector('.usage-trend').textContent.includes('Cumulative processed tokens'),'cumulative chart view is functional')
 await select('Chart view','daily')
 fail=true;await click(document.querySelector('[aria-label="Refresh usage"]'))
 check(document.body.textContent.includes('Showing the last successful refresh.')&&document.querySelector('[data-usage-headline]'),'refresh error retains last valid summary')
 fail=false;await click(document.querySelector('[aria-label="Refresh usage"]'))
 indexing=true;await click(document.querySelector('[aria-label="Refresh usage"]'))
 check(document.querySelector('.usage-toolbar .usage-indexing')?.textContent==='Indexing history...'&&document.querySelector('[data-usage-headline]'),'incomplete history is labeled beside source controls while retaining known totals')
 indexing=false;await click(document.querySelector('[aria-label="Refresh usage"]'))
 check(!document.querySelector('.usage-indexing'),'completed indexing clears its pending label')
 check(window.fixturePoolRequests.length===0&&window.fixtureOverviewRequests.length===0,'Usage does not mount or refresh the separate account limits surface')
 await select('Usage metric','cost')
 await click(document.querySelector('[aria-label^="Usage source:"]'))
 await click(find('[role="menuitemradio"]','All local tools'))
 await select('Usage period','30')
 window.fixtureGeometry();
 await act(async()=>root.unmount());
 localStorage.setItem('zyra:usage-page:v1',JSON.stringify({metric:'limits',days:7,harness:'codex',breakdown:'day',chartView:'weekly'}));
 const restored=createRoot(document.getElementById('root'));
 await act(async()=>restored.render(<MemoryRouter initialEntries={['/settings/providers/usage?setting='+createSettingsSectionTargetId('Breakdown')]}><ProvidersSettings view="usage"/></MemoryRouter>));await flush();
 check(document.querySelector('[data-settings-search-target="'+createSettingsSectionTargetId('Breakdown')+'"]'),'usage search retains its Breakdown target');
 check(document.querySelector('button[aria-label="Usage metric"]').textContent==='Cost','saved Limits mode falls back to usage cost');
 check(document.querySelector('button[aria-label="Usage period"]').textContent==='7 days'&&document.querySelector('[aria-label="Usage source: Codex"]'),'legacy Limits preference preserves source and period');
 check(document.querySelectorAll('.usage-tool-summary').length===1&&document.querySelector('.usage-tool-summary').textContent.includes('Codex'),'restored source displays only its matching cached summary');
 check(document.querySelector('button[aria-label="Group usage by"]').textContent==='Model'&&document.querySelector('button[aria-label="Chart view"]').textContent==='Weekly','removed Day preference migrates to Model while preserving the chart choice');
 await click(document.querySelector('[aria-label^="Usage source:"]'))
 await click(find('[role="menuitemradio"]','All local tools'))
 await select('Usage period','30')
 window.fixtureScreenshotReady=true
 console.log('USAGE_UI_READY')
}
run().catch(error=>console.error('USAGE_UI_FAIL',error.stack||String(error)))
`
try {
 const build=await Bun.build({entrypoints:['usage-ui-harness'],target:'browser',loader:{'.svg':'dataurl','.png':'dataurl'},plugins:[{name:'usage-ui-fixture',setup(builder){
  builder.onLoad({filter:/\.(png|svg)$/},async args=>({contents:'export default '+JSON.stringify('data:'+(args.path.endsWith('.svg')?'image/svg+xml':'image/png')+';base64,'+(await readFile(args.path)).toString('base64')),loader:'js'}))
  builder.onResolve({filter:/^usage-ui-harness$/},()=>({path:'harness',namespace:'fixture'}))
  builder.onResolve({filter:/(ProviderConnections|ProviderModelsPage|AccountSettings)$/},()=>({path:'unused',namespace:'fixture'}))
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='harness'?harness:'export default function UnusedProviderPage(){throw Error("Usage must not mount another provider page")}',loader:'tsx',resolveDir:resolve(import.meta.dir,'..')}))
  builder.onResolve({filter:/^(@\/|@shared\/)/},args=>{const base=args.path.startsWith('@shared/')?resolve(import.meta.dir,'../src/shared',args.path.slice(8)):join(source,args.path.slice(2));return {path:['','.ts','.tsx','.js','/index.ts','/index.tsx'].map(ext=>base+ext).find(path=>existsSync(path)&&statSync(path).isFile())||base}})
 }}]})
 if(!build.success)throw Error(build.logs.map(String).join('\n'))
 const bundled=await build.outputs.find(row=>row.path.endsWith('.js'))!.text();

 await writeFile(join(directory,'test.js'),bundled)
 const css=await postcss([tailwindcss({...config,content:['./src/renderer/src/pages/settings/**/*.{ts,tsx}','./src/renderer/src/components/ui/*.{ts,tsx}']})]).process('@tailwind base;@tailwind utilities;',{from:undefined})
 const pageCss=await readFile(join(source,'pages/settings/usage/UsagePage.css'),'utf8')
 await writeFile(join(directory,'test.html'),`<style>:root{--settings-bg:#0e151a;--settings-text:#d9ddd8;--settings-text-secondary:#a0aaa7;--settings-text-muted:#717e83;--settings-text-faint:#59676d;--settings-divider:#293138;--settings-control:#1d262d;--settings-nav-active:#33404a;--settings-row-hover:#1d262d;--settings-track:#293138;--settings-surface:#172027;--settings-section:#10181e;--settings-border:#293138;--settings-border-strong:#3b464e;--settings-control-hover:#26323a;--surface-floating:#172027;--surface-divider:#293138;--accent-primary:#ffad40;--accent-secondary:#8095d0;--status-success:#6bce96;--status-warning:#ffad40;--status-error:#ec7581;--color-bg:#0e151a;--color-text:#d9ddd8;--color-text-muted:#717e83;--color-text-secondary:#a0aaa7}body{background:var(--settings-bg);color:var(--settings-text);font:13px Arial}${css.css}\n${pageCss}</style><div id="root"></div><script type="module" src="test.js"></script>`)
 await mkdir(output,{recursive:true})
 await writeFile(join(directory,'main.cjs'),`
 const {app,BrowserWindow}=require('electron'),fs=require('node:fs');app.setPath('userData',${JSON.stringify(join(directory,'profile'))});
 app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1180,height:1020,webPreferences:{backgroundThrottling:false}});let capturing=false;win.webContents.on('console-message',async(event,_level,legacy)=>{const message=typeof legacy==='string'?legacy:event.message;console.log(message);if(message.includes('USAGE_UI_FAIL'))app.exit(1);if(message.includes('USAGE_UI_READY')&&!capturing){capturing=true;try{for(const size of [1180,760,390]){win.setContentSize(size,1020);await win.webContents.executeJavaScript('fixtureResize()');console.log(await win.webContents.executeJavaScript('JSON.stringify(fixtureGeometry())'));fs.writeFileSync(${JSON.stringify(output)}+'/usage-'+size+'.png',(await win.webContents.capturePage()).toPNG())}console.log('USAGE_UI_PASS');app.exit(0)}catch(error){console.error(error);app.exit(1)}}});await win.loadFile(${JSON.stringify(join(directory,'test.html'))})});setTimeout(()=>app.exit(1),45000)
 `)
 const electron=createRequire(import.meta.url)('electron') as string
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const child=spawn(electron,[join(directory,'main.cjs')],{env,stdio:'inherit',windowsHide:true})
 const code=await new Promise<number>((accept,reject)=>{child.on('error',reject);child.on('exit',code=>accept(code??1))})
 if(code!==0)throw Error('Usage renderer fixture exited '+code)
}finally{
 if(dirname(resolve(directory))!==resolve(tmpdir())||!basename(directory).startsWith('zyra-usage-ui-'))throw Error('Unexpected fixture path')
 await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}

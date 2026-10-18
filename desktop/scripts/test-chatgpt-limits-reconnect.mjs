import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'zyra-limits-reconnect-'))
try {
    await writeFile(join(temporary, 'settings.ts'), `import {useState} from 'react';export function useSettings(){const [settings,setSettings]=useState({assistantUsageDisplayMode:'remaining',assistantDefaultModel:'openai-codex/fixture'});return {settings,updateSettings:async patch=>setSettings(current=>({...current,...patch}))}}`)
    const entry = join(temporary, 'fixture.tsx')
    await writeFile(entry, `
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter,useLocation} from 'react-router-dom'
import AccountSettings from ${JSON.stringify(join(desktop, 'src/renderer/src/pages/settings/AccountSettings.tsx'))}
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const check=(v,m)=>{if(!v)throw Error(m)}
const tick=()=>act(async()=>{await new Promise(r=>setTimeout(r,30))})
const wait=async(fn,m)=>{for(let i=0;i<80&&!fn();i++)await tick();check(fn(),m)}
const usage={usedPercent:44,resetAt:'2026-12-01T00:00:00Z',windowSeconds:604800}
let dual=false,multi=false,reads=0,cancelCalls=0,pending,holdPool=false,releasePool,holdOverview=false,releaseOverview,failPool=false,primaryCount=3,otherCount=7,omitUsage=false,holdUsage=false,releaseUsage
const calls=[],resetReads=[],redemptions=[]
let holdResets=false,releaseResets,resetFailure=false,badScope=false
const overviewFor=id=>({rateLimitsByLimitId:{},resetCredits:id==='expired'?[{id:'expired-credit',title:'Expired fixture reset',available:true,status:'available',expiresAt:'2030-01-01T00:00:00Z'}]:[],availableResetCount:id==='expired'?7:0,fetchedAt:'2026-10-01T00:00:00Z'})
const accounts=()=>[
 {id:'primary',alias:'Primary fixture',primary:true,enabled:true,plan:'plus',state:'ready',usage:omitUsage?null:{secondary:usage,availableResetCount:primaryCount,...(multi?{primary:{...usage,windowSeconds:3600}}:{})}},
 {id:'expired',alias:'Expired fixture',primary:false,enabled:true,plan:'plus',state:'needs-sign-in',usage:omitUsage?null:{secondary:usage,availableResetCount:otherCount,...(dual?{primary:{...usage,windowSeconds:18000}}:{})}}
]
const status={chatgpt:{configured:true,verified:true},apiKey:{configured:false,verified:false},defaultMethod:'chatgpt'}
window.devscope={onboarding:{
 getChatGptAccounts:async input=>{reads++;if(holdUsage&&input?.refreshUsage)await new Promise(resolve=>{releaseUsage=resolve});if(holdPool)await new Promise(resolve=>{releasePool=resolve});if(failPool)return {success:false,error:'Synthetic refresh failure'};return {success:true,pool:{accounts:accounts(),policy:{strategy:'balanced',accountMode:'all',accountIds:[]}}}},
 connectChatGpt:input=>{calls.push(input);return new Promise(resolve=>{pending=resolve})},
 cancelChatGpt:async()=>{cancelCalls++;pending({success:false,code:'ZYRA_OAUTH_CANCELLED',error:'Cancelled'});return {success:true,cancelled:true}},
 getConnectionsStatus:async()=>({success:true,status})
},assistant:{getAccountOverview:async(_force,id)=>{if(id){resetReads.push(id);if(holdResets)await new Promise(resolve=>{releaseResets=resolve});if(resetFailure===true)return {success:false,error:'Synthetic reset read failed'}}else if(holdOverview)await new Promise(resolve=>{releaseOverview=resolve});return {success:true,resetAccountId:badScope?undefined:id,overview:{...overviewFor(id),...(resetFailure==='inventory'?{resetCreditsError:'Synthetic reset read failed'}:{})}}},redeemAccountReset:async input=>{redemptions.push(input);return {success:true,overview:overviewFor('primary'),redemption:{windowsReset:1},refreshError:null}}}}
function Route(){return <output data-location>{useLocation().pathname}</output>}
const root=createRoot(document.getElementById('root'))
const button=()=>document.querySelector('[aria-label="Sign in again to Expired fixture"]')
async function render(key,ready=true){await act(async()=>root.render(<MemoryRouter key={key} initialEntries={['/settings/providers/limits']}><AccountSettings/><Route/></MemoryRouter>));if(ready)await wait(button,'expired account renders')}
try{
 holdPool=true
 await render('single',false)
 await wait(()=>releasePool,'initial metadata request is held')
 check(document.querySelector('[data-chatgpt-limits-loading][aria-busy="true"]'),'initial load uses the Limits loading layout')
 check(!document.body.textContent.includes('View resets')&&!document.body.textContent.includes('Usage limits')&&!document.body.textContent.includes('Connect a ChatGPT account')&&!document.querySelector('[role=switch]'),'loading must not flash legacy, empty, zero or actionable account states')
 await act(async()=>{holdPool=false;releasePool()})
 await wait(button,'real Limits follows loading')
 check(!document.querySelector('[data-chatgpt-limits-loading]'),'loading is removed when account data arrives')
 const usageHeader=()=>document.querySelector('[data-chatgpt-usage-header]')
 const checkHeader=()=>{const header=usageHeader();check(header?.nextElementSibling?.matches('[data-chatgpt-usage-group]')&&/^(Weekly limits|Account limits)$/.test(header.querySelector('h3')?.textContent)&&[...header.querySelectorAll('button')].some(b=>b.textContent.trim()==='Refresh'),'a simple period heading and refresh sit above the actual account list');check(!header.querySelector('[data-chatgpt-mode-toggle], [role=meter], [aria-expanded]')&&!document.querySelector('[data-chatgpt-summary-value], [data-chatgpt-summary-collapse]'),'the heading cannot resemble a third account or pooled quota');check([...document.querySelectorAll('[data-chatgpt-usage-window]')].every(w=>w.textContent.includes('Unavailable')?!w.querySelector('[data-chatgpt-usage-donut]'):!!w.querySelector('[data-chatgpt-usage-donut][role=meter]')&&w.querySelector('[data-chatgpt-reset-time]')?.textContent.startsWith('Resets in ')),'each account owns its usage donut and reset time; unavailable usage does not pretend to be zero')}
 checkHeader()
 const accountMenu=document.querySelector('[data-chatgpt-usage-account="primary"] button[title^="Usage options"]')
 check(accountMenu?.textContent.trim()===''&&accountMenu.querySelector('svg.lucide-ellipsis'),'account controls use a small accessible overflow menu rather than a boxed Options label')
 check(!usageHeader().querySelector('[data-chatgpt-reset-time]'),'independent account reset times are not presented as a shared reset')
 check(!document.querySelector('[data-chatgpt-usage-account="primary"]').textContent.includes('Ready'),'healthy account rows do not show a redundant Ready pill')
 check(document.querySelector('[data-chatgpt-usage-account="expired"]').textContent.includes('Sign in again'),'actionable sign-in warnings remain visible')
 check(button().tagName==='BUTTON','Sign in again must start an action here, not navigate to Connections')
 const primaryResets=document.querySelector('[data-chatgpt-usage-account="primary"] [data-chatgpt-reset-owner]')
 const otherResets=document.querySelector('[data-chatgpt-usage-account="expired"] [data-chatgpt-reset-owner]')
 check(primaryResets?.textContent==='3 resets left'&&!primaryResets.querySelector('svg'),'primary reset text uses its own count, not the global overview zero, without an icon')
 check(otherResets?.textContent==='7 resets left'&&!otherResets.querySelector('svg'),'every account displays its own reset count')
 await act(async()=>primaryResets.querySelector('button').click())
 await wait(()=>document.querySelector('[role=dialog]'),'clicking reset text opens the real dialog')
 await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('No reset credits'),'the empty reset list must render without crashing')
 check(resetReads[0]==='primary','the primary dialog still pins its explicit account identity')
 await act(async()=>document.querySelector('[role=dialog] [aria-label="Close dialog"]').click())
 check(!document.querySelector('[role=dialog]'),'the real reset dialog closes without leaving a broken page')
 badScope=true
 await act(async()=>otherResets.querySelector('button').click())
 await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('Reload Zyra'),'older bridges fail closed instead of showing the primary inventory')
 check(!document.querySelector('[role=dialog]').textContent.includes('Expired fixture reset')&&redemptions.length===0,'unverified account data cannot be shown or consumed')
 await act(async()=>document.querySelector('[role=dialog] [aria-label="Close dialog"]').click())
 badScope=false;holdResets=true
 await act(async()=>otherResets.querySelector('button').click())
 await wait(()=>releaseResets,'non-primary inventory can be delayed')
 check(resetReads.at(-1)==='expired'&&document.querySelector('[role=dialog]').textContent.includes('Expired fixture'),'non-primary text opens a dialog for that exact account')
 check(document.querySelector('[role=dialog]').textContent.includes('Checking reset credits')&&!document.querySelector('[role=dialog]').textContent.includes('No reset credits'),'pending modal data cannot flash the empty list')
 await act(async()=>document.querySelector('[role=dialog] [aria-label="Close dialog"]').click())
 await act(async()=>{holdResets=false;releaseResets()})
 check(!document.querySelector('[role=dialog]'),'a late reset read cannot reopen a closed dialog')
 resetFailure='inventory'
 await act(async()=>otherResets.querySelector('button').click())
 await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('Synthetic reset read failed'),'inventory errors remain inside the dialog')
 check(!document.querySelector('[role=dialog]').textContent.includes('No reset credits'),'failed inventory is not an empty inventory')
 resetFailure=false
 await act(async()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Retry').click())
 await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('Expired fixture reset'),'inventory retry recovers')
 check(redemptions.length===0,'opening and retrying the dialog never consumes a reset')
 await act(async()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Review').click())
 check(document.querySelector('[role=dialog]').textContent.includes('Approve and use reset')&&redemptions.length===0,'review is a separate explicit approval step')
 await act(async()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Approve and use reset').click())
 await wait(()=>redemptions.length===1,'synthetic approved reset dispatches once')
 check(redemptions[0].accountId==='expired'&&redemptions[0].creditId==='expired-credit'&&redemptions[0].confirmed===true,'approval pins the selected credit and non-primary account')
 await act(async()=>document.querySelector('[role=dialog] [aria-label="Close dialog"]').click())
 await act(async()=>{button().click();button().click()})
 check(calls.length===1,'rapid repeated clicks start only one sign-in')
 check(calls[0].accountId==='expired'&&calls[0].signInMethod==='browser'&&calls[0].analyticsAction==='replace','existing OAuth bridge receives the exact expired account, not the primary')
 check(button().disabled&&document.body.textContent.includes('Waiting for ChatGPT sign-in'),'waiting state disables reconnect and shows sign-in status')
 check(document.querySelector('[data-location]').textContent==='/settings/providers/limits','Limits route is preserved')
 const before=reads;holdPool=true;holdOverview=true
 await act(async()=>pending({success:true,status:{verified:true}}))
 await wait(()=>releaseOverview,'post-sign-in usage request starts')
 check(!document.body.textContent.includes('Waiting for ChatGPT sign-in'),'successful authentication does not wait on usage requests')
 await wait(()=>releasePool,'post-sign-in pool refresh starts')
 check(button().disabled,'reconnect stays disabled until the refreshed account data arrives')
 await act(async()=>{holdPool=false;releasePool()})
 await wait(()=>!button().disabled,'reconnect completes')
 check(reads>before,'successful reconnect refreshes the pool')
 check(!document.querySelector('[role=dialog]'),'Limits completes sign-in without a blocking success dialog')
 await act(async()=>{holdOverview=false;releaseOverview()})
 const toggle=document.querySelector('[data-chatgpt-usage-account="primary"] [data-chatgpt-mode-toggle]')
 check(toggle.textContent.includes('remaining')&&!toggle.querySelector('svg'),'the usage text itself is the toggle, without swap arrows')
 await act(async()=>toggle.click())
 check(document.querySelector('[role=meter]').getAttribute('aria-label').includes(' used for '),'account text switches the meter to used')
 check(document.querySelector('[data-chatgpt-usage-donut][role=meter]').getAttribute('aria-valuenow')==='44'&&document.querySelector('[data-chatgpt-usage-window] [data-chatgpt-usage-donut]').getAttribute('data-value')==='44','account donuts follow the used text')
 const rowToggle=document.querySelector('[data-chatgpt-usage-account="expired"] [data-chatgpt-mode-toggle]')
 check(rowToggle?.textContent.includes('used'),'account usage text is also clickable')
 await act(async()=>rowToggle.click())
 check(document.querySelector('[role=meter]').getAttribute('aria-label').includes(' remaining for '),'account text switches the shared display back')
 check(document.querySelector('[data-chatgpt-usage-window] [data-chatgpt-usage-donut]').getAttribute('data-value')==='56','the account donut switches back to remaining with the shared mode')
 const refresh=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh'||b.textContent.trim()==='Refreshing…')
 holdPool=true;releasePool=null
 await act(async()=>refresh().click())
 await wait(()=>releasePool,'background usage request is held')
 check(refresh().disabled,'refresh cannot be submitted repeatedly while loading')
 check(!document.querySelector('[data-chatgpt-limits-loading]')&&document.querySelector('[data-chatgpt-usage-account="primary"]').textContent.includes('3 resets left'),'background loading keeps the last good Limits layout and values')
 await act(async()=>{holdPool=false;failPool=true;releasePool()})
 await wait(()=>document.body.textContent.includes('Synthetic refresh failure'),'refresh failure is visible')
 check(document.querySelectorAll('[data-chatgpt-usage-account]').length===2&&!document.body.textContent.includes('View resets'),'refresh errors must not replace existing accounts with the legacy layout')
 failPool=false
 await act(async()=>refresh().click())
 await wait(()=>!document.body.textContent.includes('Synthetic refresh failure'),'retry recovers in place')
 primaryCount=1;otherCount=null
 dual=true;await render('comparison')
 check(document.querySelector('[data-chatgpt-usage-account="primary"] [data-chatgpt-reset-owner]').textContent==='1 reset left','singular reset wording is correct')
 check(document.querySelector('[data-chatgpt-usage-account="expired"] [data-chatgpt-reset-owner]').textContent==='— resets left','unknown reset data is not shown as zero')
 check(document.querySelectorAll('[data-chatgpt-reset-owner]').length===2,'dual windows do not duplicate account reset counts')
 check(document.querySelector('[data-chatgpt-usage-comparison]'),'test also covers the dual-window layout')
 checkHeader()
 check(document.querySelectorAll('[data-chatgpt-usage-header]').length===1,'dual windows keep one account-list heading without an overall average')
 await act(async()=>button().click())
 check(calls.length===2,'dual-window account action starts reconnect')
 await act(async()=>pending({success:false,error:'Synthetic sign-in failure'}))
 await wait(()=>!button().disabled,'failed sign-in releases busy state')
 check(document.body.textContent.includes('Synthetic sign-in failure'),'failure is shown in place')
 await act(async()=>button().click())
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel sign-in').click())
 await wait(()=>!button().disabled,'cancelled sign-in releases busy state')
 check(cancelCalls===1&&!document.body.textContent.includes('Cancelled'),'existing cancellation flow is used without an error notice')
 check(document.querySelector('[data-location]').textContent==='/settings/providers/limits','retry/cancel never redirects')
 omitUsage=true;holdUsage=true
 await render('usage-pending',false)
 await wait(()=>releaseUsage,'metadata arrives before network usage')
 check(document.querySelector('[data-chatgpt-limits-loading]')&&!document.body.textContent.includes('Unavailable'),'metadata without usage keeps the loading state until the first usage check settles')
 await act(async()=>{omitUsage=false;holdUsage=false;releaseUsage()})
 await wait(button,'first usage check resolves into Limits')
 failPool=true
 await render('cold-error',false)
 await wait(()=>document.body.textContent.includes('Synthetic refresh failure')&&!document.querySelector('[data-chatgpt-limits-loading]'),'cold load reports a real error')
 check(!document.body.textContent.includes('View resets')&&!document.body.textContent.includes('Usage limits')&&!document.body.textContent.includes('Connect a ChatGPT account'),'cold errors must not masquerade as legacy or empty account states')
 failPool=false
 await act(async()=>refresh().click())
 await wait(button,'cold-load retry recovers into Limits')
 holdPool=true;releasePool=null
 await render('leaving',false)
 await wait(()=>releasePool,'navigation starts with a held request')
 const abandoned=releasePool
 holdPool=false
 await render('returned')
 const afterNavigation=reads
 await act(async()=>abandoned())
 await tick()
 check(reads===afterNavigation,'an unmounted page cannot start a follow-up usage request')
 check(!document.querySelector('[data-chatgpt-limits-loading]')&&document.querySelectorAll('[data-chatgpt-usage-account]').length===2,'late completion cannot replace the current Limits screen')
 primaryCount=0;await render('zero')
 check(document.querySelector('[data-chatgpt-usage-account="primary"] [data-chatgpt-reset-owner]').textContent==='0 resets left','a reported zero remains a real zero')
 usage.usedPercent=0;await render('usage-zero')
 check(document.querySelector('[role=meter]').getAttribute('aria-valuenow')==='100','reported zero usage displays a full remaining donut')
 await act(async()=>document.querySelector('[data-chatgpt-usage-account="primary"] [data-chatgpt-mode-toggle]').click())
 check(document.querySelector('[role=meter]').getAttribute('aria-valuenow')==='0'&&document.querySelector('[role=meter] .chatgpt-usage-ring').getAttribute('stroke-dasharray')==='0 100','zero used draws an empty ring rather than a false sliver')
 usage.usedPercent=100;await render('usage-full')
 check(document.querySelector('[role=meter]').getAttribute('aria-valuenow')==='0','fully used quota displays zero remaining')
 usage.usedPercent=null;await render('usage-unknown')
 check(!document.querySelector('[data-chatgpt-usage-donut]')&&[...document.querySelectorAll('[data-chatgpt-usage-window]')].every(window=>window.textContent.includes('Unavailable')),'missing usage stays unavailable instead of becoming a zero or full donut')
 multi=true;dual=true;await render('three-groups')
 check(document.querySelectorAll('[data-chatgpt-usage-group]').length===3,'fixture exercises three distinct quota periods')
 for(const id of ['primary','expired'])check(document.querySelectorAll('[data-chatgpt-reset-owner="'+id+'"]').length===1,'each account owns exactly one reset count and dialog across all period groups')
 const readsBeforeMulti=resetReads.length,redemptionsBeforeMulti=redemptions.length
 await act(async()=>document.querySelector('[data-chatgpt-reset-owner="expired"] button').click())
 await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('Expired fixture reset'),'the single multi-group reset control opens its exact account')
 check(resetReads.length===readsBeforeMulti+1&&resetReads.at(-1)==='expired'&&redemptions.length===redemptionsBeforeMulti,'multi-group modal reads once without consuming a reset')
 await act(async()=>document.querySelector('[role=dialog] [aria-label="Close dialog"]').click())
 await act(async()=>root.unmount())
 console.log('LIMITS_RECONNECT_PASS')
}catch(e){console.error('LIMITS_RECONNECT_FAIL',e.stack||String(e))}
`)
    await build({ entryPoints: [entry], bundle: true, outfile: join(temporary, 'fixture.js'), platform: 'browser', format: 'esm', jsx: 'automatic',
        nodePaths: [join(desktop, 'node_modules')], loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.ogg': 'dataurl', '.css': 'empty' },
        alias: { '@/lib/settings': join(temporary, 'settings.ts'), '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') },
        define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.DEV': 'false' },
        // Hover-preloading unrelated Settings routes is outside this action test.
        plugins: [{ name: 'limits-only', setup(builder) {
            builder.onResolve({ filter: /settings-route-loaders$/ }, () => ({ path: 'routes', namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function preloadSettingsRoute(){}', loader: 'js' }))
        } }], logLevel: 'silent' })
    await writeFile(join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="fixture.js"></script>')
    await writeFile(join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(temporary, 'profile'))});const timer=setTimeout(()=>app.exit(1),20000);app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true}});win.webContents.on('console-message',(event,_level,legacy)=>{const message=typeof legacy==='string'?legacy:event.message;console.log(message);if(message.includes('LIMITS_RECONNECT_PASS')){clearTimeout(timer);app.exit(0)}if(message.includes('LIMITS_RECONNECT_FAIL'))app.exit(1)});await win.loadFile(${JSON.stringify(join(temporary, 'index.html'))})}).catch(error=>{console.error(error);app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const ciLinux = process.platform === 'linux' && Boolean(process.env.CI)
    const virtual = ciLinux && !process.env.DISPLAY
    const args = [...(ciLinux ? ['--no-sandbox'] : []), join(temporary, 'main.cjs')]
    const code = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electron, virtual ? ['--auto-servernum', electron, ...args] : args, { env, stdio: 'inherit', windowsHide: true })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
    if (code) throw Error(`Limits reconnect fixture exited ${code}`)
} finally { await rm(temporary, { recursive: true, force: true }) }

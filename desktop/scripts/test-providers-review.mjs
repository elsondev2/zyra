import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

const output = resolve(import.meta.dirname, '../../docs.local/reviews/providers-ui-review')
const base = process.env.ZYRA_REVIEW_URL || 'http://127.0.0.1:5184/providers-review.html'
const limitsOnly = process.argv.includes('--limits-only')
if (!process.versions.electron) {
    const executable = createRequire(import.meta.url)('electron')
    const profile = await mkdtemp(join(tmpdir(), 'zyra-providers-review-'))
    try {
        const env = { ...process.env, ZYRA_PROVIDERS_REVIEW_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE
        const child = spawn(executable, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true })
        process.exitCode = await new Promise((accept, reject) => { child.on('error', reject); child.on('exit', code => accept(code ?? 1)) })
    } finally {
        if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('zyra-providers-review-')) throw Error('Unexpected fixture path')
        await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
} else {
    void runElectronTest().catch(error => { console.error(error); process.exit(1) })
}
async function runElectronTest() {
    const { app, BrowserWindow } = await import('electron')
    // Preserve the intended result while asynchronous fixture cleanup runs.
    app.on('window-all-closed', () => {})
    const timeout = setTimeout(() => { console.error('UI review test timed out'); app.exit(1) }, 90000)
    const profile = process.env.ZYRA_PROVIDERS_REVIEW_PROFILE
    if (!profile || dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('zyra-providers-review-')) throw Error('Unexpected fixture path')
    app.setPath('userData', profile)
    await app.whenReady()
    const window = new BrowserWindow({ show: false, width: 1535, height: 900, webPreferences: { backgroundThrottling: false } })
    window.setContentSize(1535, 855)
    const errors = []
    let exitCode = 0
    window.webContents.on('console-message', event => { if (event.level === 3) errors.push(event.message) })
    const read = expression => window.webContents.executeJavaScript(expression)
    const assert = (condition, message) => { if (!condition) throw Error(message) }
    const wait = async (expression, label) => {
        const deadline = Date.now() + 20000
        while (Date.now() < deadline) { if (await read(expression)) return; await new Promise(accept => setTimeout(accept, 150)) }
        throw Error('Timed out: ' + label)
    }
    const click = text => read(`(()=>{const button=[...document.querySelectorAll('button,[role^="menuitem"]')].find(element=>element.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button '+${JSON.stringify(text)});button.click()})()`)
    const load = async (scenario = 'weekly', route = '/settings/providers/limits') => {
        await window.loadURL(base + '?scenario=' + scenario + '#' + route)
        await wait('document.querySelector("[data-review-product]") && document.querySelector("main").textContent.length > 20', 'preview route')
    }
    const painted = () => read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const screenshot = async name => { await painted(); await read(`Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})))`); await writeFile(join(output, name + '.png'), (await window.webContents.capturePage()).toPNG()) }
    try {
        await mkdir(output, { recursive: true })
        await load()
        await wait('document.querySelectorAll("[role=meter]").length===2', 'individual weekly account meters')
        assert(await read(`[...document.querySelectorAll('[role=meter]')].map(m=>m.getAttribute('aria-valuenow')).join() === '85,65' && !document.querySelector('[data-chatgpt-usage-header] [role=meter]')`), 'each account reports its own quota without a misleading overall average')
        assert(await read(`!document.querySelector('button[title="Usage display"]') && document.querySelector('[data-chatgpt-usage-window] [data-chatgpt-mode-toggle]').textContent.includes('remaining') && getComputedStyle(document.querySelector('[data-chatgpt-usage-window] [data-chatgpt-mode-toggle]')).textDecorationLine.includes('underline')`), 'the underlined account percentage toggles usage without swap arrows or a dropdown')
        await read(`document.querySelector('[data-chatgpt-usage-window] [data-chatgpt-mode-toggle]').click()`)
        await wait('document.querySelector("[role=meter]").getAttribute("aria-valuenow")==="15"', 'switch to used usage')
        assert(await read(`[...document.querySelectorAll('[role=meter]')].map(m=>m.getAttribute('aria-valuenow')).join() === '15,35'`), 'the shared display mode changes each actual account value')
        assert(await read(`getComputedStyle(document.querySelector('.chatgpt-usage-ring')).transitionDuration==='0.22s'`), 'usage donut transitions without moving or fading the clickable labels')
        await read(`document.querySelector('[data-chatgpt-usage-window] [data-chatgpt-mode-toggle]').click()`)
        await wait('document.querySelector("[role=meter]").getAttribute("aria-valuenow")==="85"', 'switch back to remaining usage')
        assert(await read(`[...document.querySelectorAll('[data-chatgpt-usage-account]')].every(row=>row.querySelectorAll('[role=meter]').length===1)`), 'each account has exactly one accessible meter for its one reported window')
        const geometry = await read(`[...document.querySelectorAll('[data-chatgpt-usage-account]')].map(row=>({height:row.getBoundingClientRect().height,menuX:row.querySelector('button[title^="Usage options"]').getBoundingClientRect().x,menuWidth:row.querySelector('button[title^="Usage options"]').getBoundingClientRect().width,usageRight:row.querySelector('[data-chatgpt-usage-window]').getBoundingClientRect().right,toggleX:row.querySelector('[role=switch]').getBoundingClientRect().x}))`)
        assert(geometry.every(row => row.height <= 90 && row.menuX < row.toggleX && row.menuWidth <= 34 && row.menuX-row.usageRight <= 28), 'compact rows keep the icon menu close to usage, before the aligned toggle')
        assert(await read(`document.querySelector('[data-chatgpt-reset-time]').closest('[data-chatgpt-usage-account]') && !document.querySelector('[data-chatgpt-usage-header] [data-chatgpt-reset-time]') && [...document.querySelectorAll('button[title^="Usage options"]')].every(button=>button.textContent.trim()==='' && button.querySelector('.lucide-ellipsis'))`), 'each reset time belongs to its account while controls use unobtrusive overflow icons')
        assert(await read('document.querySelectorAll("[data-chatgpt-reset-owner]").length===2'), 'each account shows its reset count once')
        assert(await read(`(()=>{const credit=document.querySelector('[data-chatgpt-reset-owner] button');return credit.textContent.trim()==='1 reset left' && credit.getAttribute('aria-label')==='1 reset left' && !credit.querySelector('svg') && !credit.closest('.chatgpt-usage-controls') && credit.getBoundingClientRect().height <= 20})()`), 'reset credits are plain remaining-count text within the account metadata')
        await read(`document.querySelector('[data-chatgpt-reset-owner] button').click()`)
        await wait(`document.querySelector('[role=dialog]')?.textContent.includes('Banked resets')`, 'inline reset control opens the existing manager')
        await read(`document.querySelector('[role=dialog] button[aria-label="Close dialog"]').click()`)
        await wait(`!document.querySelector('[role=dialog]')`, 'reset manager closes')
        window.webContents.debugger.attach('1.3')
        await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
        assert(await read(`getComputedStyle(document.querySelector('.chatgpt-usage-ring')).transitionDuration==='0s' && !document.querySelector('.chatgpt-usage-number')`), 'reduced motion disables usage transitions')
        await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
        window.webContents.debugger.detach()
        assert(await read(`!document.querySelector('main').textContent.includes('Short window') && !document.querySelector('main').textContent.includes('Add account') && !document.querySelector('main').textContent.includes('Banked resets')`), 'weekly labels and no duplicate sections')
        await screenshot('limits')
        assert(await read(`!document.querySelector('[data-chatgpt-summary-collapse]') && !document.querySelector('[data-chatgpt-usage-header] [aria-expanded]') && document.querySelectorAll('[data-chatgpt-usage-window] [data-chatgpt-usage-donut]').length===2`), 'the compact header has no disclosure and every account percentage has a donut')
        await read(`document.querySelector('button[title="Usage options for Silver Otter 456"]').click()`)
        await wait('document.querySelector("[role=menu]")', 'usage options menu')
        assert(await read(`[...document.querySelectorAll('[role^=menuitem]')].every(item=>item.querySelector('svg'))`), 'usage menu options have icons')
        await click('Use only this account')
        await wait(`document.querySelector('[aria-label="Allowed ChatGPT accounts"]').value==='selected'`, 'selected account controls')
        assert(await read(`window.__providersReview.readPool().policy.accountIds.join() === 'review-1'`), 'use-only action updates routing')
        assert(await read(`!document.querySelector('input[type=checkbox]') && document.querySelector('[data-chatgpt-usage-account="review-0"]').textContent.includes('Excluded')`), 'selected accounts use existing rows without a duplicated checkbox list')
        await screenshot('limits-selected')
        await read(`document.querySelector('button[title="Usage options for Quiet Comet 123"]').click()`)
        await wait('document.querySelector("[role=menu]")', 'excluded account options')
        await click('Include this account')
        await wait(`window.__providersReview.readPool().policy.accountIds.length===2 && !document.querySelector('[data-chatgpt-usage-account="review-0"]').textContent.includes('Excluded')`, 'include account through its existing menu')
        assert(await read(`document.querySelector('[role=meter]').getAttribute('aria-valuenow')==='85'`), 'routing inclusion never changes an individual account quota')
        await read(`document.querySelector('button[title="Usage options for Quiet Comet 123"]').click()`)
        await wait('document.querySelector("[role=menu]")', 'included account options')
        await click('Exclude this account')
        await wait(`window.__providersReview.readPool().policy.accountIds.join()==='review-1' && document.querySelector('[data-chatgpt-usage-account="review-0"]').textContent.includes('Excluded')`, 'exclude account through its existing menu')
        assert(await read(`document.querySelector('[role=meter]').getAttribute('aria-valuenow')==='85' && window.__providersReview.readPool().accounts[0].enabled`), 'exclusion changes routing without changing the account quota or pausing it')
        await read(`document.querySelector('[aria-label="Enable Silver Otter 456"]').click()`)
        await wait(`window.__providersReview.readPool().accounts[1].state === 'paused'`, 'paused account')
        let connections = []
        if (!limitsOnly) {
        await load('weekly', '/settings/providers')
        await wait('document.querySelectorAll("[data-chatgpt-connection-account]").length===2', 'unified connections')
        await painted()
        assert(await read(`[...document.querySelectorAll('main h2')].map(h=>h.textContent).join('|')==='Connections|Other uses'`), 'one connections section for every provider/account')
        assert(await read(`[...document.querySelectorAll('main button')].filter(b=>b.textContent.trim()==='Add provider').length===1 && !document.querySelector('main').textContent.includes('Add account')`), 'one add-provider flow')
        assert(await read('document.querySelectorAll("[role=meter]").length===0'), 'connections does not duplicate limits')
        connections = await read(`[...document.querySelectorAll('main .zyra-settings-row')].map(row=>({title:row.querySelector('h3')?.textContent,height:row.getBoundingClientRect().height,detail:row.querySelector('p')?.textContent}))`)
        assert(connections.length===4 && connections.every(row=>Math.abs(row.height-64)<1) && connections[0].title.startsWith('ChatGPT') && connections[1].title.startsWith('ChatGPT'), 'ChatGPT first and all connection rows equal height: ' + JSON.stringify(connections))
        assert(connections.every(row=>row.detail && !row.detail.startsWith('Connect ')), 'connection rows use short details, without blank lines or setup instructions')
        assert(await read(`!document.querySelector('[data-provider-connected]') && !document.querySelector('main .lucide-check') && ![...document.querySelectorAll('main span')].some(span=>span.textContent.trim()==='Connected')`), 'healthy connections have no checks or Connected pills')
        await screenshot('connections')
        await click('Add provider')
        await wait('document.querySelector("[role=dialog]")', 'provider picker')
        await read(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('ChatGPT subscription')).click()`)
        await wait(`document.querySelector('[role=dialog]').textContent.includes('Continue with browser')`, 'ChatGPT sign-in choice')
        await screenshot('add-chatgpt')
        await click('Continue with browser')
        await wait('document.querySelectorAll("[data-chatgpt-connection-account]").length===3', 'added test account in unified list')
        }
        await load('dual')
        await wait('document.querySelectorAll("[role=meter]").length===4 && document.querySelector("[data-chatgpt-usage-comparison]")', 'two individual account usage columns')
        assert(await read(`!document.querySelector('[data-chatgpt-usage-header] [role=meter]') && [...document.querySelectorAll('[role=meter]')].every(m=>m.closest('[data-chatgpt-usage-account]') && m.getBoundingClientRect().width<=24)`), 'all compact donuts belong to actual accounts, with no competing overall quota')
        assert(await read(`document.querySelectorAll('[data-chatgpt-usage-account]').length===2 && document.querySelectorAll('[data-chatgpt-reset-owner]').length===2 && [...document.querySelectorAll('[data-chatgpt-usage-account]')].every(row=>{const windows=[...row.querySelectorAll('[data-chatgpt-usage-window]')];return windows.length===2 && windows[0].getAttribute('data-chatgpt-usage-window')==='18000' && windows[1].getAttribute('data-chatgpt-usage-window')==='604800' && windows[0].getBoundingClientRect().x<windows[1].getBoundingClientRect().x && Math.abs(windows[0].getBoundingClientRect().y-windows[1].getBoundingClientRect().y)<1 && row.querySelectorAll('[role=switch]').length===1})`), 'dual windows share one account row: 5-hour left, Weekly right, one control set and one reset credit')
        assert(await read(`document.querySelector('[data-chatgpt-usage-account="review-0"] [data-chatgpt-usage-window="18000"]').textContent.includes('85% remaining') && document.querySelector('[data-chatgpt-usage-account="review-0"] [data-chatgpt-usage-window="604800"]').textContent.includes('55% remaining')`), 'each usage percentage stays attached to its actual period')
        await screenshot('limits-two-windows')
        assert(await read(`!document.querySelector('[data-chatgpt-summary-collapse]') && document.querySelectorAll('[data-chatgpt-usage-header]').length===1 && [...document.querySelectorAll('[data-chatgpt-usage-window]')].every(window=>window.getBoundingClientRect().height>0)`), 'one permanently visible summary keeps both individual periods visible')
        window.setContentSize(420, 855)
        await new Promise(accept => setTimeout(accept, 300))
        assert(await read('document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth + 1'), 'narrow layout has no horizontal overflow')
        await screenshot('limits-narrow')
        window.setContentSize(1535, 855)
        await load('dual-missing')
        await wait(`document.querySelectorAll('[data-chatgpt-usage-account]').length===2`, 'account with a missing weekly window')
        assert(await read(`document.querySelector('[data-chatgpt-usage-account="review-1"] [data-chatgpt-usage-window="604800"]').textContent.includes('Unavailable') && document.querySelector('[data-chatgpt-usage-account="review-0"] [data-chatgpt-usage-window="604800"] [role=meter]').getAttribute('aria-valuenow')==='55'`), 'missing weekly quota remains unavailable without changing the other account')
        await load('empty')
        await wait(`document.querySelector('main').textContent.includes('Connect a ChatGPT account')`, 'empty state')
        assert(await read('document.querySelectorAll("[role=meter]").length===0'), 'empty accounts have no fake usage')
        await load('error')
        await wait(`document.querySelector('main').textContent.includes('Test: account usage unavailable')`, 'error state')
        assert(await read(`!document.querySelector('main').textContent.includes('Checking usage')`), 'error is not stuck loading')
        await load('signin')
        await wait(`document.querySelector('[aria-label="Sign in again to Silver Otter 456"]')`, 'account inline reconnect action')
        const signInGeometry = await read(`[...document.querySelectorAll('[data-chatgpt-usage-account]')].map(row=>row.getBoundingClientRect().height)`)
        assert(signInGeometry.every(height=>Math.abs(height-72)<1), 'sign-in-needed account keeps the same row height: '+JSON.stringify(signInGeometry))
        assert(await read(`(()=>{const row=document.querySelector('[data-chatgpt-usage-account="review-1"]');return row.children.length===3 && row.querySelector('.chatgpt-usage-controls button[aria-label^="Sign in again to"]') && !row.querySelector('button[title^="Usage options"]') && row.querySelector('[role=switch]') && !row.textContent.includes('Reconnect this account in Connections.')})()`), 'sign in replaces account Options in the existing controls, without an extra row')
        await screenshot('limits-signin')
        await read(`document.querySelector('[aria-label="Sign in again to Silver Otter 456"]').click()`)
        await wait(`window.__providersReview.readPool().accounts[1].state === 'ready' && !document.querySelector('[aria-label="Sign in again to Silver Otter 456"]')`, 'inline action reconnects the affected account')
        assert(await read(`location.hash === '#/settings/providers/limits' && !document.querySelector('[role=dialog]')`), 'sign-in completes on Limits without navigating or blocking with a success dialog')
        if (!limitsOnly) {
        await load('signin', '/settings/providers')
        await wait(`document.querySelector('[data-chatgpt-connection-account="review-1"]')`, 'Connections keeps its own reconnect control')
        assert(await read(`document.querySelector('[data-chatgpt-connection-account="review-1"]').textContent.includes('Sign in again') && !document.querySelector('[data-chatgpt-connection-account="review-1"] [data-provider-connected]')`), 'account requiring sign-in retains its explicit warning instead of a checkmark')
        await read(`document.querySelector('button[title="Manage Silver Otter 456"]').click()`)
        await wait('document.querySelector("[role=menu]")', 'account reconnect menu')
        await click('Sign in again')
        await wait(`window.__providersReview.readPool().accounts[1].state === 'ready'`, 'reconnect targets the affected account')
        assert(await read(`window.__providersReview.readPool().accounts.length===2 && window.__providersReview.readPool().accounts[0].email==='Quiet Comet 123'`), 'reconnect preserves the other account and does not add a duplicate')
        await load('weekly', '/review/thread')
        await wait(`document.querySelector('main').textContent.includes('No running background processes')`, 'thread details empty state')
        assert(await read(`!document.body.textContent.includes('App-owned processes') && !document.body.textContent.includes('Stop turn leaves')`), 'background description removed')
        await screenshot('thread-details')
        await load('running', '/review/thread')
        await wait(`document.querySelector('main').textContent.includes('npm run dev')`, 'thread details running process')
        await click('Stop all processes'); await click('Confirm stop all')
        await wait(`document.querySelector('main').textContent.includes('No running background processes')`, 'stop controls')
        }
        assert(errors.length === 0, 'renderer errors: ' + errors.join('; '))
        await writeFile(join(output, 'checks.json'), JSON.stringify({ status: 'passed', scope: limitsOnly ? 'limits-only' : 'full-providers-review', fixtureData: true, geometry, connections, checks: [...(limitsOnly ? [] : ['unified connections with ChatGPT first', 'equal connection row heights and short details', 'one add-provider flow including another ChatGPT account']), 'account-first usage and per-account reset times, no overall average or expand control', 'compact rows', 'menu before toggle', 'menu icons', 'routing and pause', 'per-account text-only reset counts', 'weekly and dual windows', 'narrow layout', 'empty and error states', ...(limitsOnly ? [] : ['background controls without description'])], capturedAt: new Date().toISOString() }, null, 2))
        console.log((limitsOnly ? 'Limits-only UI review' : 'Providers UI review') + ': all scoped checks passed; screenshots in ' + output)
    } catch (error) {
        console.error(error.stack)
        await screenshot('failure')
        exitCode = 1
    } finally {
        clearTimeout(timeout)
        window.destroy()
        app.exit(exitCode)
    }
}

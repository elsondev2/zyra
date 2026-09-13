const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const root = process.env.ZYRA_NATIVE_OVERLAY_USER_DATA
const { NativeOverlayManager, addNativeWindowView, registerTrustedIpcSender, assertTrustedIpcEvent, NATIVE_OVERLAY_IPC: IPC, NATIVE_OVERLAY_FRAME_PREFIX: PREFIX } = require(join(root, 'manager.cjs'))
app.setPath('userData', root)
const windows = [], pages = []
let manager, recoveryResolve, recoveryCalls = 0, callbackOwner = null
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let timer = setTimeout(() => { console.error('Native overlay fixture timed out'); cleanup(1) }, 35000)
function cleanup(code) {
    clearTimeout(timer)
    manager?.dispose()
    for (const page of pages) if (!page.isDestroyed()) page.close()
    for (const window of windows) if (!window.isDestroyed()) window.destroy()
    app.exit(code)
}
async function waitFor(check, label) {
    for (let i = 0; i < 150; i++) { if (await check()) return; await delay(20) }
    throw new Error(label)
}
function slot(owner, kind) { return manager.owners.get(owner.webContents.id).slots[kind] }
async function prepare(owner, kind) {
    return owner.webContents.executeJavaScript(`window.fixture.prepareNativeOverlay({kind:${JSON.stringify(kind)}})`)
}
async function visibility(owner, kind, visible, revision) {
    return owner.webContents.executeJavaScript(`window.fixture.setNativeOverlayVisible(${JSON.stringify({kind,frameName:slot(owner,kind).frameName,visible,revision,focus:false})})`)
}
async function open(owner, kind) {
    const arm = await prepare(owner, kind)
    assert.equal(arm.success, true)
    const result = await owner.webContents.executeJavaScript(`(() => {
        window.childrenByKind ||= {};
        const child = window.open('about:blank', ${JSON.stringify(arm.frameName)});
        if (!child) return false;
        window.childrenByKind[${JSON.stringify(kind)}] = child;
        child.document.open(); child.document.write('<!doctype html><style>html,body{margin:0;background:transparent;font:16px system-ui}button{position:absolute;left:30px;top:110px;width:230px;height:65px;border:2px solid #ffdf80;border-radius:10px;background:#a74300aa;color:white}</style><button id="action">Native ${kind} layer</button>'); child.document.close();
        child.document.getElementById('action').onclick = () => window.fixture.callback();
        return child.opener === window;
    })()`)
    assert.equal(result, true, 'window.open must retain same-origin opener')
    await waitFor(() => Boolean(slot(owner, kind).contents), 'adoption was not registered')
    return slot(owner, kind)
}
async function ownerWindow(title) {
    const window = new BrowserWindow({ title, show: true, width: 860, height: 620, useContentSize: true, webPreferences: { preload: join(root, 'preload.cjs'), sandbox:true, contextIsolation:true, nodeIntegration:false, backgroundThrottling:false } })
    windows.push(window)
    registerTrustedIpcSender(window.webContents, url => url.startsWith('file:'))
    manager.registerOwner(window)
    window.webContents.setWindowOpenHandler(details => manager.handleWindowOpen(window, details) || {action:'deny'})
    await window.loadFile(join(root, 'owner.html'))
    window.show(); window.focus()
    await waitFor(() => window.isFocused(), 'fixture owner did not focus')
    return window
}
app.whenReady().then(async () => {
    manager = new NativeOverlayManager({ showRecoveryDialog: () => { recoveryCalls++; return new Promise(resolve => { recoveryResolve = resolve }) } })
    manager.registerIpc()
    ipcMain.handle('fixture:callback', event => { assertTrustedIpcEvent(event); callbackOwner = event.sender.id; return callbackOwner })
    const owner = await ownerWindow('Zyra native overlay pass-through fixture')
    const guest = new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
    pages.push(guest.webContents)
    addNativeWindowView(owner, guest, 'browser')
    guest.setBounds({x:0,y:70,width:860,height:550})
    await guest.webContents.loadURL('data:text/html,' + encodeURIComponent('<!doctype html><style>body{margin:0;background:#eff5ff;color:#16253a;font:16px system-ui}button{position:absolute;left:30px;top:40px;width:230px;height:65px;font:inherit;background:#9adaeb;border:2px solid #164260;border-radius:10px}p{margin:140px 30px}.ball{background:#1687f8;width:38px;height:38px;border-radius:50%;margin:30px}</style><button onclick="document.querySelector(\'#clicks\').textContent=++window.clicks">Page button — clicks <span id="clicks">0</span></button><p>Original native page, frame <span id="frame">0</span></p><div class="ball"></div><script>window.clicks=0;window.framesRendered=0;window.visibilityEvents=[];document.addEventListener("visibilitychange",()=>visibilityEvents.push(document.visibilityState));function frame(t){document.querySelector("#frame").textContent=++window.framesRendered;document.querySelector(".ball").style.transform="translateX("+(100+Math.sin(t/500)*100)+"px)";requestAnimationFrame(frame)}requestAnimationFrame(frame)</script>'))
    guest.setVisible(true)
    const original = { id:guest.webContents.id, bounds:guest.getBounds() }
    assert.equal(owner.contentView.children.length, 1, 'overlay remains cold before intent')
    const malformed = await owner.webContents.executeJavaScript('window.fixture.prepareNativeOverlay({kind:"bad"})')
    assert.equal(malformed.success,false)
    const fakeDetails = {url:'about:blank',frameName:PREFIX+'forged'}
    assert.equal(manager.handleWindowOpen(owner,fakeDetails).action,'deny')
    assert.throws(() => assertTrustedIpcEvent({sender:owner.webContents,senderFrame:{url:owner.webContents.getURL()}}),/untrusted renderer/, 'subframe cannot arm a native host')

    owner.webContents.focus()
    assert.equal(owner.webContents.isFocused(),true,'fixture starts with owner input focus')
    const interactive = await open(owner,'interactive')
    assert.equal(interactive.contents.getOSProcessId(),owner.webContents.getOSProcessId())
    assert.equal((await visibility(owner,'interactive',true,1)).success,true)
    assert.equal(interactive.view.getVisible(),true)
    assert.equal(owner.webContents.isFocused(),true,'non-focusing overlay preserves owner text input')
    const firstFrame = await guest.webContents.executeJavaScript('window.framesRendered')
    await waitFor(async()=> await guest.webContents.executeJavaScript('window.framesRendered') > firstFrame+2, 'guest stopped behind overlay')
    interactive.contents.sendInputEvent({type:'mouseDown',x:80,y:140,button:'left',clickCount:1})
    interactive.contents.sendInputEvent({type:'mouseUp',x:80,y:140,button:'left',clickCount:1})
    await waitFor(()=>callbackOwner===owner.webContents.id,'portal callback lost opener IPC identity')
    assert.equal((await visibility(owner,'interactive',false,3)).success,true)
    assert.equal((await visibility(owner,'interactive',true,2)).success,false,'old show cannot revive hidden overlay')
    assert.equal(interactive.view.getVisible(),false)

    const passive = await open(owner,'passive')
    assert.equal(passive.contents.getOSProcessId(),owner.webContents.getOSProcessId(),'passive child retains shared renderer')
    const childSecurity=[]
    for (const child of [interactive,passive]) {
        const globals=await child.contents.executeJavaScript('({fixture:typeof window.fixture,devscope:typeof window.devscope,require:typeof window.require,process:typeof window.process})')
        assert.deepEqual(globals,{fixture:'undefined',devscope:'undefined',require:'undefined',process:'undefined'},'blank child must not execute the owner preload or expose Node globals')
        const prefs=child.contents.getLastWebPreferences()
        assert.equal(prefs.sandbox,true)
        assert.equal(prefs.contextIsolation,true)
        assert.equal(prefs.nodeIntegration,false)
        assert.throws(()=>assertTrustedIpcEvent({sender:child.contents,senderFrame:child.contents.mainFrame}),/untrusted renderer/,'child cannot use original-owner IPC')
        childSecurity.push({kind:child.kind,globals,sandbox:prefs.sandbox,contextIsolation:prefs.contextIsolation,nodeIntegration:prefs.nodeIntegration,preloadPreferenceInherited:prefs.preload===owner.webContents.getLastWebPreferences().preload})
    }
    console.log('native child security',JSON.stringify(childSecurity))
    assert.equal(passive.companion.getParentWindow(),owner)
    assert.equal(passive.companion.isFocusable(),false)
    assert.equal((await visibility(owner,'passive',true,1)).success,true)
    assert.equal(passive.companion.isVisible(),true)
    assert.equal(owner.isFocused(),true,'passive presentation must not steal focus')
    for (const key of ['x','y','width','height']) assert(Math.abs(passive.companion.getBounds()[key]-owner.getContentBounds()[key])<=1,'native DPI rounding must stay within one DIP: '+key)
    const oldBounds=owner.getContentBounds()
    owner.setContentBounds({...oldBounds,width:900,height:650})
    await waitFor(()=>Math.abs(passive.companion.getBounds().width-owner.getContentBounds().width)<=1,'passive host did not follow resize')
    assert.equal(interactive.view.getBounds().width,owner.getContentBounds().width)
    await visibility(owner,'interactive',true,4)
    const recorder = new WebContentsView()
    pages.push(recorder.webContents)
    addNativeWindowView(owner,recorder,'recording')
    assert.equal(owner.contentView.children.at(-1),interactive.view,'recorder cannot obscure an app dialog')
    const laterGuest = new WebContentsView()
    pages.push(laterGuest.webContents)
    addNativeWindowView(owner,laterGuest,'browser')
    assert.equal(owner.contentView.children.at(-1),interactive.view,'later guest cannot obscure app dialog')
    assert(owner.contentView.children.indexOf(recorder)>owner.contentView.children.indexOf(laterGuest))

    const utility=await ownerWindow('Zyra detached overlay fixture')
    await waitFor(()=>!passive.companion.isVisible(),'owner blur did not hide passive companion')
    assert.equal(interactive.view.getVisible(),true,'owned interactive view stays composited with background parent')
    console.log('phase: background owner covered')
    owner.focus()
    await waitFor(()=>interactive.view.getVisible()&&passive.companion.isVisible(),'mounted dialog did not restore on focus')
    console.log('phase: focused owner restored')
    await visibility(owner,'interactive',false,5)
    await visibility(owner,'passive',false,2)
    utility.focus()
    console.log('phase: utility opening')
    const utilityLayer=await open(utility,'interactive')
    await visibility(utility,'interactive',true,1)
    console.log('phase: utility opened')
    owner.contentView.removeChildView(guest)
    addNativeWindowView(utility,guest,'browser')
    assert.equal(utility.contentView.children.at(-1),utilityLayer.view)
    assert.equal(guest.webContents.id,original.id)
    assert.deepEqual(guest.getBounds(),original.bounds)
    assert.equal(guest.getVisible(),true)
    assert.deepEqual(await guest.webContents.executeJavaScript('window.visibilityEvents'),[])
    assert.equal(await guest.webContents.executeJavaScript('window.fixture?.prepareNativeOverlay ? window.fixture.prepareNativeOverlay({kind:"interactive"}).then(()=>false,()=>true) : true'),true,'guest has no native overlay authority')

    console.log('phase: transferred guest and owner isolation')
    const lost=utilityLayer.contents
    const formerName=utilityLayer.frameName
    lost.close()
    await waitFor(()=>utilityLayer.contents===null,'closed native child not released')
    assert((await utility.webContents.executeJavaScript('window.fixture.notices()')).some(item=>item.reason==='closed'))
    const replacement=await open(utility,'interactive')
    assert.notEqual(replacement.contents,lost)
    assert.equal((await utility.webContents.executeJavaScript('window.fixture.setNativeOverlayVisible('+JSON.stringify({kind:'interactive',frameName:formerName,visible:true,revision:500,focus:false})+')')).success,false,'former child cannot show its replacement')
    console.log('phase: native child replacement')
    const recover1=utility.webContents.executeJavaScript('window.fixture.recoverNativeOverlay({kind:"interactive"})')
    const recover2=utility.webContents.executeJavaScript('window.fixture.recoverNativeOverlay({kind:"interactive"})')
    await waitFor(()=>recoveryCalls===1,'owner recovery was not deduplicated')
    console.log('phase: deduplicated recovery')
    recoveryResolve(false)
    assert.equal((await recover1).retry,false)
    assert.equal((await recover2).retry,false)
    console.log('phase: recovery close cancellation')
    const pending=utility.webContents.executeJavaScript('window.fixture.recoverNativeOverlay({kind:"interactive"})').catch(()=>null)
    await waitFor(()=>recoveryCalls===2,'recovery did not reopen after settlement')
    utility.contentView.removeChildView(guest)
    addNativeWindowView(owner,guest,'browser')
    const recoveryPending=manager.owners.get(utility.webContents.id).recovery
    const utilityContentsId=utility.webContents.id
    utility.destroy()
    assert.equal(await Promise.race([recoveryPending,delay(1000).then(()=>{throw new Error('closed owner recovery did not cancel')})]),false)
    void pending
    assert.equal(replacement.contents,null,'detached close did not release native overlay')
    assert.equal(manager.owners.has(utilityContentsId),false)
    owner.focus()
    await waitFor(()=>owner.isFocused(),'main owner did not restore focus')
    guest.webContents.focus()
    await visibility(owner,'interactive',false,90)
    assert.equal(guest.webContents.isFocused(),true,'idle retained host must not steal native page input')
    console.log(JSON.stringify({status:'passed',interactiveAdopted:true,passiveAdopted:true,sameOriginCallbacks:true,guestIdentityAndVisibilityPreserved:true,revisionIsolation:true,layerOrder:true,detachedCleanup:true,passiveNativeInput:'requires exact-window OS click; Chromium input injection is not hit-testing proof'}))
    if (process.argv.includes('--hold')) {
        clearTimeout(timer)
        await visibility(owner,'interactive',false,100)
        await visibility(owner,'passive',true,100)
        owner.setTitle('Zyra native overlay pass-through fixture')
        owner.show(); owner.focus()
        timer=setTimeout(()=>cleanup(0),300000)
        owner.once('closed',()=>cleanup(0))
        console.log('NATIVE_OVERLAY_HOLD '+JSON.stringify({title:owner.getTitle(),pid:process.pid,expiresAfterMs:300000,button:'Native passive layer covers Page button; click should increment underlying page count'}))
    } else cleanup(0)
}).catch(error=>{console.error(error);cleanup(1)})

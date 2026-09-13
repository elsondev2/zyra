const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const directory = process.env.ZYRA_LIVE_PRESENTATION_SMOKE
app.setPath('userData', join(directory, 'profile'))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
let owner
const guests = new Map()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => finish(new Error('Live presentation smoke timed out')), 35_000)
function finish(error) {
    clearTimeout(timeout)
    for (const guest of guests.values()) if (!guest.webContents.isDestroyed()) guest.webContents.close()
    if (owner && !owner.isDestroyed()) owner.destroy()
    if (error) { console.error(error); app.exit(1) } else app.quit()
}
app.whenReady().then(async () => {
    const { browserRecordingCapture: broker } = require(join(directory, 'capture.cjs'))
    owner = new BrowserWindow({ show: false, width: 640, height: 480, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } })
    for (const [id, colors] of [['a', ['red', 'blue']], ['b', ['lime', 'magenta']]]) {
        const guest = new WebContentsView({ webPreferences: { partition: 'live-presentation-' + id, backgroundThrottling: false } })
        guests.set(id, guest)
        owner.contentView.addChildView(guest)
        guest.setBounds({ x: 0, y: 0, width: 620, height: 420 })
        await guest.webContents.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:${colors[0]}"><input id="draft" value="draft-${id}"><div id="tick"></div><script>let n=0;window.tick=0;setInterval(()=>{document.body.style.background=${JSON.stringify(colors)}[++n%2]},180);function frame(){document.querySelector('#tick').textContent=String(++tick);requestAnimationFrame(frame)}frame();</script>`))
        guest.setVisible(id === 'a')
    }
    const permitted = (wc, permission) => wc === owner.webContents && broker.hasGrant(wc) && (permission === 'display-capture' || permission === 'media')
    owner.webContents.session.setPermissionCheckHandler(permitted)
    owner.webContents.session.setPermissionRequestHandler((wc, permission, callback) => callback(permitted(wc, permission)))
    ipcMain.handle('presentation-test', async (event, operation, id) => {
        assert.equal(event.sender, owner.webContents)
        assert.equal(event.senderFrame, owner.webContents.mainFrame)
        const guest = guests.get(id)
        if (operation === 'arm') { assert(guest); broker.armPresentation(owner.webContents, guest.webContents); return }
        if (operation === 'release') { broker.cancelPresentation(owner.webContents.id, guest.webContents.id); return }
        if (operation === 'recording') { broker.arm(owner.webContents, guest.webContents, 'off'); return }
        if (operation === 'visibility') { for (const [key, view] of guests) view.setVisible(key === id); return }
        throw new Error('Unexpected presentation fixture operation: ' + operation)
    })
    writeFileSync(join(directory, 'owner.html'), `<!doctype html><style>body{margin:0;background:#181818}video{width:620px;height:420px;object-fit:fill;opacity:0}#menu{position:absolute;top:20px;right:20px;padding:20px;background:#333;color:white;z-index:50}</style><video autoplay muted playsinline></video><script src="presentation.js"></script><script>
      const {ipcRenderer}=require('electron');const api=BrowserLivePresentation;
      const video=document.querySelector('video');const call=(op,id)=>ipcRenderer.invoke('presentation-test',op,id);
      let selected='a', controller;window.streams=[];window.readyEvents=[];window.acquisitions=0;window.releases=0;window.decoded=0;
      const frames=()=>video.requestVideoFrameCallback(()=>{window.decoded++;frames()});frames();
      const configure=(id,waitMs=0,timeoutMs)=>{
        controller?.stop();selected=id;
        controller=api.createAssistantBrowserLivePresentation({video,timeoutMs,
          acquire:isCurrent=>api.requestAssistantBrowserDisplayCapture(async()=>{
            if(waitMs)await new Promise(resolve=>setTimeout(resolve,waitMs));
            if(!isCurrent())throw new DOMException('Cancelled','AbortError');
            window.acquisitions++;await call('arm',id);
          },{video:{frameRate:30},audio:false}).then(stream=>{window.streams.push(stream);return stream}),
          release:()=>{window.releases++;void call('release',id)},
          onReady:ready=>{window.readyEvents.push(ready);video.style.opacity=ready?'1':'0'}
        });
      };
      configure('a');
      window.openMenu=async(label='Browser profile')=>{
        if(!document.querySelector('#menu')){const menu=document.createElement('div');menu.id='menu';menu.setAttribute('data-zyra-native-view-occluder','true');document.body.append(menu)}
        document.querySelector('#menu').textContent=label;
        void call('visibility',null);const started=performance.now();
        const gesture=navigator.userActivation.isActive,focused=document.hasFocus();
        const pending=controller.start();const shared=pending===controller.start();
        const ready=await pending;return {ready,shared,firstFrameMs:performance.now()-started,gesture,focused};
      };
      window.closeMenu=async()=>{document.querySelector('#menu')?.remove();controller.stop();await call('visibility',selected)};
      const canvas=document.createElement('canvas');canvas.width=62;canvas.height=42;const context=canvas.getContext('2d',{willReadFrequently:true});
      window.sample=()=>{context.drawImage(video,0,0,62,42);return {decoded,color:[...context.getImageData(50,30,1,1).data].slice(0,3)}};
      window.cleanupState=()=>({liveTracks:streams.flatMap(stream=>stream.getTracks()).filter(track=>track.readyState!=='ended').length,attached:video.srcObject!==null,menus:document.querySelectorAll('#menu').length});
      window.switchDuringStart=async()=>{configure('a',120);const old=openMenu();await new Promise(resolve=>setTimeout(resolve,10));configure('b');const next=await openMenu();return {old:await old,next}};
      window.closeDuringStart=async()=>{configure('a',120);const pending=openMenu();await new Promise(resolve=>setTimeout(resolve,10));await closeMenu();return pending};
      window.parallelRecorder=async()=>{configure('a');const presentation=openMenu();const recording=api.requestAssistantBrowserDisplayCapture(()=>call('recording','b'),{video:true,audio:false});window.recordingStream=await recording;return presentation};
      window.stopRecorder=()=>recordingStream.getTracks().forEach(track=>track.stop());
      window.failAcquire=async()=>{controller.stop();controller=api.createAssistantBrowserLivePresentation({video,acquire:()=>Promise.reject(new Error('Synthetic capture failure')),release:()=>{},onReady:ready=>video.style.opacity=ready?'1':'0'});return controller.start()};
      window.lateResult=async()=>{
        controller.stop();const stream=await api.requestAssistantBrowserDisplayCapture(()=>call('arm','a'),{video:true,audio:false});streams.push(stream);
        controller=api.createAssistantBrowserLivePresentation({video,timeoutMs:30,acquire:()=>new Promise(resolve=>setTimeout(()=>resolve(stream),100)),release:()=>call('release','a'),onReady:ready=>video.style.opacity=ready?'1':'0'});
        const ready=await controller.start();await new Promise(resolve=>setTimeout(resolve,150));return {ready,tracks:stream.getTracks().map(track=>track.readyState),attached:video.srcObject!==null};
      };
    </script>`)
    await owner.loadFile(join(directory, 'owner.html'))
    owner.show(); guests.get('a').webContents.focus()
    await delay(200)
    const identity = guests.get('a').webContents.id
    const startup = await owner.webContents.executeJavaScript('openMenu()', false)
    assert.equal(startup.gesture, false, 'automatic overlays must work without transient activation')
    assert.equal(startup.ready, true)
    assert.equal(startup.shared, true, 'repeated start while acquiring must share the same stream request')
    assert.equal(broker.hasRecording(owner.webContents), false, 'presentation must not claim recorder ownership')
    const samples = []
    for (let index = 0; index < 6; index++) { await delay(170); samples.push(await owner.webContents.executeJavaScript('sample()')) }
    assert(samples.at(-1).decoded - samples[0].decoded > 8, 'hidden guest must deliver decoded frames behind the menu')
    assert(samples.some(sample => sample.color[0] > 180) && samples.some(sample => sample.color[2] > 180), 'hidden guest must keep changing')
    await owner.webContents.executeJavaScript('closeMenu()')
    assert.deepEqual(await owner.webContents.executeJavaScript('cleanupState()'), { liveTracks: 0, attached: false, menus: 0 })
    assert.equal(guests.get('a').getVisible(), true)
    const secondMenu = await owner.webContents.executeJavaScript("openMenu('Downloads')")
    assert.equal(secondMenu.ready, true)
    await owner.webContents.executeJavaScript('closeMenu()')
    const closed = await owner.webContents.executeJavaScript('closeDuringStart()')
    assert.equal(closed.ready, false)
    assert.equal(broker.hasGrant(owner.webContents), false, 'cancelled start cannot leave a grant')
    const switched = await owner.webContents.executeJavaScript('switchDuringStart()')
    assert.equal(switched.old.ready, false); assert.equal(switched.next.ready, true)
    const nextColor = (await owner.webContents.executeJavaScript('sample()')).color
    assert(nextColor[1] > 180 || (nextColor[0] > 180 && nextColor[2] > 180), 'rapid switch must display only the new guest')
    await owner.webContents.executeJavaScript('closeMenu()')
    const concurrent = await owner.webContents.executeJavaScript('parallelRecorder()')
    assert.equal(concurrent.ready, true)
    assert.equal(broker.hasRecording(owner.webContents), true)
    await owner.webContents.executeJavaScript('closeMenu()')
    assert.equal(broker.hasRecording(owner.webContents), true, 'closing a menu must preserve active recording ownership')
    await owner.webContents.executeJavaScript('stopRecorder()'); broker.cancel(owner.webContents.id)
    assert.equal(await owner.webContents.executeJavaScript('failAcquire()'), false)
    const late = await owner.webContents.executeJavaScript('lateResult()')
    assert.equal(late.ready, false); assert(late.tracks.every(state => state === 'ended')); assert.equal(late.attached, false)
    const cleanup = await owner.webContents.executeJavaScript('cleanupState()')
    assert.deepEqual(cleanup, { liveTracks: 0, attached: false, menus: 0 })
    assert.equal(guests.get('a').webContents.id, identity)
    assert.equal(await guests.get('a').webContents.executeJavaScript('document.querySelector("#draft").value'), 'draft-a')
    console.log(JSON.stringify({ test: 'browser-live-presentation', startup, secondMenu, decodedFrames: samples.at(-1).decoded - samples[0].decoded, rapidSwitch: true, recordingCoexistence: true, lateResultCleanup: true, cleanup }))
    finish()
}).catch(finish)

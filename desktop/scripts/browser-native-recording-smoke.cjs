const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const directory = process.env.ZYRA_RECORDING_SMOKE
app.setPath('userData', join(directory, 'profile'))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
let owner, view
const timeout = setTimeout(() => { console.error('Native recording smoke timed out'); app.exit(1) }, 45_000)
app.whenReady().then(async () => {
    const { browserRecordingCapture: broker } = require(join(directory, 'capture.cjs'))
    owner = new BrowserWindow({ show: false, width: 640, height: 480, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } })
    view = new WebContentsView({ webPreferences: { partition: 'recording-test-guest', backgroundThrottling: false } })
    owner.contentView.addChildView(view); view.setBounds({ x: 0, y: 0, width: 640, height: 480 })
    owner.webContents.session.setPermissionCheckHandler((wc, permission) => (permission === 'display-capture' || permission === 'media') && broker.hasGrant(wc))
    owner.webContents.session.setPermissionRequestHandler((wc, permission, callback) => callback((permission === 'display-capture' || permission === 'media') && broker.hasGrant(wc)))
    let saved
    ipcMain.handle('recording-test', async (_event, method, input) => {
        if (method === 'start') { broker.arm(owner.webContents, view.webContents, 'off'); return { success: true, startedAt: new Date().toISOString(), tabAudioSupported: true, systemAudioSupported: process.platform === 'win32' } }
        if (method === 'audio') { broker.arm(owner.webContents, view.webContents, input.source); return { success: true } }
        if (method === 'stop') { broker.cancel(owner.webContents.id); return { success: true } }
        if (method === 'save') { saved = Buffer.from(input.data); return { success: true, artifact: { artifactId: 'synthetic-recording', kind: 'recording' } } }
        throw new Error('Unexpected test call')
    })
    writeFileSync(join(directory, 'owner.html'), `<script>const {ipcRenderer}=require('electron');window.devscope={onBrowserPreviewRecordingFrame:()=>()=>{},startBrowserPreviewRecording:input=>ipcRenderer.invoke('recording-test','start',input),prepareBrowserPreviewRecordingAudio:input=>ipcRenderer.invoke('recording-test','audio',input),stopBrowserPreviewRecording:input=>ipcRenderer.invoke('recording-test','stop',input),saveBrowserPreviewRecording:input=>{window.savedVideo=input.data;return ipcRenderer.invoke('recording-test','save',input)}};</script><script src="recorder.js"></script>`)
    await owner.loadFile(join(directory, 'owner.html'))
    await owner.webContents.executeJavaScript(`window.MediaRecorder=class extends MediaRecorder { constructor(...args){super(...args);const chunks=window.originalRecordingChunks=[];this.addEventListener('dataavailable',event=>chunks.push(event.data))} };void 0`)
    await view.webContents.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:red"><script>let n=0;setInterval(()=>{document.body.style.background=++n%2?'blue':'red';document.body.textContent=String(n)},250);const audio=new AudioContext();const tone=audio.createOscillator();const gain=audio.createGain();gain.gain.value=.001;tone.connect(gain).connect(audio.destination);tone.start();window.audio=audio;</script>`))
    owner.showInactive()
    await new Promise(resolve=>setTimeout(resolve,500))
    await owner.webContents.executeJavaScript(`BrowserRecording.prepareAssistantBrowserRecording({tabId:'tab:synthetic',guestWebContentsId:${view.webContents.id}},{width:640,height:480});void 0`)
    const prepared=await owner.webContents.executeJavaScript('BrowserRecording.readAssistantBrowserRecording()')
    assert.equal(prepared.status,'ready')
    assert.equal(prepared.elapsedMs,0)
    assert.equal(broker.hasGrant(owner.webContents),false,'setup must not arm a native capture grant')
    await owner.webContents.executeJavaScript(`BrowserRecording.startPreparedAssistantBrowserRecording().catch(e=>{throw new Error(e.name+': '+e.message)})`, true)
    await new Promise(resolve=>setTimeout(resolve,1200))
    await owner.webContents.executeJavaScript('BrowserRecording.stopActiveAssistantBrowserRecording()')
    assert(saved && saved.byteLength > 1000, 'video-only recording must encode while microphone and tab audio are off')
    console.log('video-only bytes',saved.byteLength)
    await owner.webContents.executeJavaScript(`BrowserRecording.startAssistantBrowserRecording({tabId:'tab:synthetic',guestWebContentsId:${view.webContents.id}},{width:640,height:480})`, true)
    await new Promise(resolve=>setTimeout(resolve,5500))
    await owner.webContents.executeJavaScript(`BrowserRecording.setAssistantBrowserRecordingAudioSource('tab')`, false)
    const audioState = await owner.webContents.executeJavaScript('BrowserRecording.readAssistantBrowserRecording()')
    assert.equal(audioState.audioSource, 'tab', audioState.error || 'tab audio must open')
    await new Promise(resolve => setTimeout(resolve, 2300))
    await owner.webContents.executeJavaScript('BrowserRecording.stopActiveAssistantBrowserRecording()')
    assert(saved && saved.byteLength > 1000, 'native encoder must produce video bytes')
    const result = await owner.webContents.executeJavaScript(`(async()=>{
        const audio=new AudioContext();const decoded=await audio.decodeAudioData(window.savedVideo.buffer.slice(0));
        const samples=decoded.getChannelData(0);let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));await audio.close();
        const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(new Blob([window.savedVideo],{type:'video/webm'}));
        await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject});
        if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Saved WebM needs a finite duration before playback');
        const metadataDuration=video.duration;
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;const context=canvas.getContext('2d',{willReadFrequently:true});
        const colors=[];for(const time of [.2,.45,.7,1,1.3]){video.currentTime=time;await new Promise(resolve=>video.onseeked=resolve);context.drawImage(video,0,0,64,48);colors.push([...context.getImageData(50,30,1,1).data].slice(0,3))}
        video.currentTime=metadataDuration*.85;await new Promise(resolve=>video.onseeked=resolve);
        context.drawImage(video,0,0,64,48);const seekColor=[...context.getImageData(50,30,1,1).data].slice(0,3);
        URL.revokeObjectURL(video.src);return {peak,duration:decoded.duration,metadataDuration,seekColor,colors};
    })()`)
    assert(result.duration > 7, 'enabling audio late must preserve the preceding silent timeline')
    assert(result.peak > 0.0001, `synthetic tab audio must be present (${result.peak})`)
    assert(Math.abs(result.metadataDuration-result.duration)<.5, 'metadata duration must match the encoded timeline')
    assert(result.seekColor[0]>180 || result.seekColor[2]>180, 'seeking near the end must decode a real video frame')
    assert(result.colors.some(c=>c[0]>180&&c[2]<60) && result.colors.some(c=>c[2]>180&&c[0]<60), `native video must keep moving: ${JSON.stringify(result.colors)}`)
    console.log(JSON.stringify({ test: 'native-tab-recording', bytes: saved.byteLength, ...result }))
    writeFileSync(join(directory,'synthetic-finalized.webm'),saved)
    const original=await owner.webContents.executeJavaScript('(async()=>new Uint8Array(await new Blob(window.originalRecordingChunks).arrayBuffer()))()')
    writeFileSync(join(directory,'synthetic-original.webm'),Buffer.from(original))
    clearTimeout(timeout);owner.destroy();app.quit()
}).catch(error=>{console.error(error);clearTimeout(timeout);if(owner&&!owner.isDestroyed())owner.destroy();app.exit(1)})

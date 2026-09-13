const assert = require('node:assert/strict')
const { join } = require('node:path')
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
const directory = process.env.ZYRA_RECORDING_OVERLAY_USER_DATA
app.setPath('userData', directory)
let phase = 'starting'
const deadline = setTimeout(() => { console.error('Native recording overlay fixture timed out: ' + phase); app.exit(1) }, 25_000)
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const waitFor = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await delay(20) } throw new Error('Fixture condition did not become ready') }
app.whenReady().then(async () => {
    const { BrowserRecordingOverlayManager, registerTrustedIpcSender, trustedBrowserGuests, BROWSER_RECORDING_OVERLAY_IPC: IPC } = require(join(directory, 'manager.cjs'))
    const preferences = { preload: join(directory, 'test-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    const source = new BrowserWindow({ width: 900, height: 650, useContentSize: true, show: false, webPreferences: preferences })
    const destination = new BrowserWindow({ width: 900, height: 650, useContentSize: true, show: false, webPreferences: preferences })
    const shellUrl = 'data:text/html,<html><body>Owned fixture shell</body></html>'
    phase = "loading fixture shells"
    await source.loadURL(shellUrl); await destination.loadURL(shellUrl)
    registerTrustedIpcSender(source.webContents, url => url === shellUrl)
    registerTrustedIpcSender(destination.webContents, url => url === shellUrl)
    const guest = new WebContentsView({ webPreferences: preferences })
    source.contentView.addChildView(guest)
    const bounds = { x: 0, y: 40, width: 900, height: 550 }
    guest.setBounds(bounds)
    phase = "loading synthetic guest"
    await guest.webContents.loadURL(`data:text/html,${encodeURIComponent('<html><body style="margin:0;background:#376b55"><input id="draft" value="unsaved drawing"><script>window.tick=0;function frame(){window.tick++;requestAnimationFrame(frame)}frame()</script></body></html>')}`)
    source.showInactive()
    const tabId = 'browser:overlay-fixture'
    trustedBrowserGuests.register(source.webContents.id, guest.webContents)
    trustedBrowserGuests.bind(source.webContents.id, guest.webContents.id, tabId, 'thread:fixture', 'normal')
    let presentation = { tabId, guestWebContents: guest.webContents, ownerWindow: source, bounds, visible: true, disposed: false }
    let observer, unsubscribed = false
    const manager = new BrowserRecordingOverlayManager({ preloadPath: join(directory, 'overlay-preload.cjs'), browserViews: { observePresentation: callback => { observer = callback; callback(presentation); return () => { unsubscribed = true } } } })
    manager.registerIpc()
    const publish = patch => { presentation = { ...presentation, ...patch }; observer(presentation) }
    const state = {
        target: { guestWebContentsId: guest.webContents.id, tabId }, status: 'ready', title: 'Native recording fixture', elapsedMs: 1500,
        microphone: 'off', microphonePending: false, microphones: [{ id: 'fixture-mic', label: 'Fixture microphone' }], audioSource: 'off', audioPending: false,
        tabAudioSupported: true, systemAudioSupported: false, error: null, unsaved: false, hasArtifact: false,
        theme: { background: '#252525', foreground: '#eeeeee', muted: '#aaaaaa', accent: '#f5a044', border: '#ffffff1a', dark: true }
    }
    const update = (contents, value) => contents.executeJavaScript(`fixture.invoke(${JSON.stringify(IPC.update)},${JSON.stringify(value)})`)
    phase = "opening ready controls"
    assert.equal((await update(source.webContents, state)).success, true)
    await waitFor(() => source.contentView.children.length === 2)
    const overlay = source.contentView.children.find(view => view !== guest)
    const overlayContents = overlay.webContents
    if (overlayContents.isLoadingMainFrame()) await new Promise((resolve, reject) => {
        overlayContents.once('did-finish-load', resolve)
        overlayContents.once('did-fail-load', (_event, code, description) => reject(new Error(`Overlay load failed: ${code} ${description}`)))
    })
    assert.equal(overlay.getVisible(), true)
    assert.equal(await overlayContents.executeJavaScript('Boolean(window.zyraRecordingOverlay)'), true)
    await waitFor(async () => await overlay.webContents.executeJavaScript('!document.getElementById("start").disabled'))
    assert.deepEqual(await overlay.webContents.executeJavaScript('Object.keys(window.zyraRecordingOverlay).sort()'), ['command', 'getState', 'onState', 'resize'])
    assert.equal(await overlay.webContents.executeJavaScript('typeof window.devscope'), 'undefined')
    await delay(320)
    phase = "bounded resize ownership"
    const compactBounds = overlay.getBounds()
    assert.ok(compactBounds.width < 300 && compactBounds.height <= 64, 'native ready overlay fits the setup toolbar')
    const beforeInvalidResize = overlay.getBounds()
    await guest.webContents.executeJavaScript(`fixture.send(${JSON.stringify(IPC.resize)},{width:440,height:340})`)
    await source.webContents.executeJavaScript(`fixture.send(${JSON.stringify(IPC.resize)},{width:440,height:340})`)
    ipcMain.emit(IPC.resize, { sender: overlayContents, senderFrame: guest.webContents.mainFrame }, { width: 440, height: 340 })
    ipcMain.emit(IPC.action, { sender: overlayContents, senderFrame: guest.webContents.mainFrame }, { kind: 'start' })
    await overlay.webContents.executeJavaScript('window.zyraRecordingOverlay.resize({width:NaN,height:340})')
    await delay(30)
    assert.deepEqual(overlay.getBounds(), beforeInvalidResize, 'guest, owner-shell, foreign-frame and invalid resize requests are rejected')
    assert.deepEqual(await source.webContents.executeJavaScript('fixture.commands()'), [], 'a foreign frame cannot issue Start')
    await overlay.webContents.executeJavaScript('window.zyraRecordingOverlay.resize({width:9999,height:9999})')
    await delay(30)
    assert.equal(overlay.getBounds().width, 440)
    assert.equal(overlay.getBounds().height, 340)
    await overlay.webContents.executeJavaScript(`window.zyraRecordingOverlay.resize(${JSON.stringify({ width: compactBounds.width, height: compactBounds.height })})`)
    await delay(30)
    phase = "setup transfer"
    source.contentView.removeChildView(guest)
    destination.contentView.addChildView(guest)
    trustedBrowserGuests.transferOwner(guest.webContents.id, source.webContents.id, destination.webContents.id)
    publish({ ownerWindow: destination })
    await delay(30)
    assert.equal(overlay.getVisible(), false, 'unstarted setup cannot follow a tab transferred to another owner')
    assert.equal((await source.webContents.executeJavaScript('fixture.presentations()')).at(-1).targetGone, true)
    phase = "stale setup Start"
    // Detached native views may suspend renderer evaluation; deliver the queued
    // main-frame IPC directly to exercise this intentional hidden-view race.
    ipcMain.emit(IPC.action, { sender: overlayContents, senderFrame: overlayContents.mainFrame }, { kind: 'start' })
    await delay(30)
    assert.deepEqual(await source.webContents.executeJavaScript('fixture.commands()'), [], 'stale setup cannot start capture after transfer')
    phase = "restoring setup owner"
    destination.contentView.removeChildView(guest)
    source.contentView.addChildView(guest)
    trustedBrowserGuests.transferOwner(guest.webContents.id, destination.webContents.id, source.webContents.id)
    publish({ ownerWindow: source })
    await overlay.webContents.executeJavaScript('document.getElementById("start").click()')
    await delay(30)
    assert.equal((await source.webContents.executeJavaScript('fixture.commands()')).at(-1).kind, 'start')
    phase = "recording controls"
    state.status = 'recording'
    await update(source.webContents, state)
    await delay(320)
    assert.equal(await overlay.webContents.executeJavaScript('document.getElementById("start").hidden'), true)
    await overlay.webContents.executeJavaScript('window.zyraRecordingOverlay.command({kind:"start"})')
    await delay(30)
    assert.equal((await source.webContents.executeJavaScript('fixture.commands()')).filter(command => command.kind === 'start').length, 1, 'recording state rejects another Start')
    assert.equal(source.contentView.children.at(-1), overlay, 'toolbar is layered above the existing native guest')
    assert.deepEqual(guest.getBounds(), bounds, 'toolbar does not shrink the recorded page')
    assert.equal(guest.getVisible(), true)
    phase = "live guest frames"
    await waitFor(async () => await guest.webContents.executeJavaScript('window.tick') > 1)
    const tick = await guest.webContents.executeJavaScript('window.tick')
    await overlay.webContents.executeJavaScript('document.getElementById("microphone").click()')
    await delay(320)
    await waitFor(async () => await guest.webContents.executeJavaScript('window.tick') > tick)
    assert.deepEqual(guest.getBounds(), bounds)
    assert.equal(guest.getVisible(), true)
    assert.ok(overlay.getBounds().height <= 340)
    assert.equal((await update(destination.webContents, state)).success, false, 'another trusted window cannot bind controls to a foreign guest')
    await assert.rejects(() => update(guest.webContents, state), /untrusted renderer/)
    assert.equal(await guest.webContents.executeJavaScript(`fixture.invoke(${JSON.stringify(IPC.read)})`), null)
    phase = "recording command ownership"
    const beforeGuestCommand = (await source.webContents.executeJavaScript('fixture.commands()')).length
    await guest.webContents.executeJavaScript(`fixture.send(${JSON.stringify(IPC.action)},{kind:'stop'})`)
    await delay(30)
    assert.equal((await source.webContents.executeJavaScript('fixture.commands()')).length, beforeGuestCommand, 'guest-origin stop commands are rejected')
    await overlay.webContents.executeJavaScript(`window.zyraRecordingOverlay.command({kind:'audio',source:'system'})`)
    await delay(30)
    assert.equal((await source.webContents.executeJavaScript('fixture.commands()')).length, beforeGuestCommand, 'unavailable audio commands are rejected in main too')
    await overlay.webContents.executeJavaScript('document.getElementById("pause").click()')
    await delay(30)
    assert.equal((await source.webContents.executeJavaScript('fixture.commands()')).at(-1).kind, 'pause')
    assert.deepEqual(await destination.webContents.executeJavaScript('fixture.commands()'), [])
    phase = "idle native work"
    let boundWrites = 0, visibilityWrites = 0, reorderWrites = 0
    const originalBounds = overlay.setBounds.bind(overlay), originalVisibility = overlay.setVisible.bind(overlay), originalAdd = source.contentView.addChildView.bind(source.contentView)
    overlay.setBounds = value => { boundWrites++; originalBounds(value) }
    overlay.setVisible = value => { visibilityWrites++; originalVisibility(value) }
    source.contentView.addChildView = value => { reorderWrites++; originalAdd(value) }
    for (let i = 0; i < 5; i++) await update(source.webContents, { ...state, elapsedMs: 2000 + i * 200 })
    assert.deepEqual({ boundWrites, visibilityWrites, reorderWrites }, { boundWrites: 0, visibilityWrites: 0, reorderWrites: 0 }, 'duration updates do no redundant native view work')
    overlay.setBounds = originalBounds; overlay.setVisible = originalVisibility; source.contentView.addChildView = originalAdd
    phase = "recording transfer"
    const guestId = guest.webContents.id
    source.contentView.removeChildView(guest)
    destination.contentView.addChildView(guest)
    destination.showInactive()
    trustedBrowserGuests.transferOwner(guestId, source.webContents.id, destination.webContents.id)
    publish({ ownerWindow: destination })
    assert.equal(destination.contentView.children.at(-1), overlay)
    assert.equal(source.contentView.children.includes(overlay), false)
    assert.equal(guest.webContents.id, guestId)
    assert.equal(await guest.webContents.executeJavaScript('document.getElementById("draft").value'), 'unsaved drawing')
    await overlay.webContents.executeJavaScript('window.zyraRecordingOverlay.command({kind:"stop"})')
    await delay(30)
    assert.equal((await source.webContents.executeJavaScript('fixture.commands()')).at(-1).kind, 'stop', 'transferred controls still command the original recorder owner')
    publish({ visible: false })
    assert.equal(overlay.getVisible(), false)
    publish({ visible: true })
    assert.equal(overlay.getVisible(), true)
    phase = "renderer crash recovery"
    overlayContents.forcefullyCrashRenderer()
    await waitFor(async () => Boolean((await source.webContents.executeJavaScript('fixture.presentations()')).at(-1)?.error))
    assert.equal(overlay.getVisible(), false, 'a crashed controls renderer reveals recovery instead of leaving dead controls')
    assert.equal(guest.getVisible(), true, 'controls failure does not hide the captured page')
    await update(source.webContents, { ...state, elapsedMs: 9000 })
    assert.equal(destination.contentView.children.filter(view => view !== guest).length, 1, 'failed controls are not recreated on every timer tick')
    publish({ disposed: true, bounds: null, visible: false })
    await delay(30)
    assert.equal(overlay.getVisible(), false)
    assert.equal(destination.contentView.children.includes(overlay), false)
    assert.equal((await source.webContents.executeJavaScript('fixture.presentations()')).at(-1).targetGone, true)
    await update(source.webContents, null)
    assert.equal(overlayContents.isDestroyed(), true)
    phase = "cleanup"
    manager.dispose()
    assert.equal(unsubscribed, true)
    destination.contentView.removeChildView(guest)
    guest.webContents.close(); source.destroy(); destination.destroy()
    console.log('Browser native recording overlay: ok (layering, live guest, trusted ownership, commands, transfer, visibility, cleanup, idle native work)')
    clearTimeout(deadline); app.quit()
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1) })

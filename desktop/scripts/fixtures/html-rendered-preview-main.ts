import { app, BrowserWindow, protocol, session, type WebContents } from 'electron'
import { registerFileProtocol } from '../../src/main/file-protocol'
import { NativeOverlayManager } from '../../src/main/native-overlay-manager'
import { registerTrustedIpcSender } from '../../src/main/ipc/trusted-ipc'

protocol.registerSchemesAsPrivileged([{
    scheme: 'zyra',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}])
app.setPath('userData', process.env.ZYRA_HTML_PREVIEW_USER_DATA || '')

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor<T>(read: () => T | Promise<T>, timeout = 8_000): Promise<T | null> {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        const value = await read()
        if (value) return value
        await delay(50)
    }
    return null
}

function countPaintedPixels(contents: WebContents, bounds: Electron.Rectangle) {
    return contents.capturePage(bounds).then((image) => {
        const bitmap = image.toBitmap()
        let opaque = 0
        let nonWhite = 0
        let checksum = 2166136261
        for (let index = 0; index < bitmap.length; index += 16) {
            const blue = bitmap[index] || 0
            const green = bitmap[index + 1] || 0
            const red = bitmap[index + 2] || 0
            const alpha = bitmap[index + 3] || 0
            if (alpha > 0) opaque++
            if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) nonWhite++
            checksum = Math.imul(checksum ^ red ^ (green << 8) ^ (blue << 16) ^ (alpha << 24), 16777619) >>> 0
        }
        return { width: image.getSize().width, height: image.getSize().height, opaque, nonWhite, checksum }
    })
}

app.whenReady().then(async () => {
    const ownerUrl = process.env.ZYRA_HTML_PREVIEW_URL || ''
    registerFileProtocol('zyra', ownerUrl)
    const manager = new NativeOverlayManager({ showRecoveryDialog: async () => false })
    manager.registerIpc()
    const protocolResponses: Array<{ url: string; statusCode: number; contentSecurityPolicy: string }> = []
    const remoteRequests: string[] = []
    session.defaultSession.webRequest.onHeadersReceived({ urls: ['zyra://*/*'] }, (details, callback) => {
        const headers = details.responseHeaders || {}
        const policyHeader = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-security-policy')?.[1]
        protocolResponses.push({ url: details.url, statusCode: details.statusCode, contentSecurityPolicy: policyHeader?.[0] || '' })
        callback({ responseHeaders: headers })
    })
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        if (/^https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/u.test(details.url)) remoteRequests.push(details.url)
        callback({})
    })
    const consoleMessages: string[] = []
    const window = new BrowserWindow({
        width: process.env.ZYRA_HTML_PREVIEW_FOLLOW !== '[]' ? 1400 : 900,
        height: 650,
        show: true,
        webPreferences: {
            preload: process.env.ZYRA_HTML_PREVIEW_PRELOAD,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    })
    registerTrustedIpcSender(window.webContents, url => {
        try { return new URL(url).origin === new URL(ownerUrl).origin } catch { return false }
    })
    manager.registerOwner(window)
    window.webContents.setWindowOpenHandler(details => manager.handleWindowOpen(window, details) || { action: 'deny' })
    window.webContents.on('console-message', (_event, _level, message) => consoleMessages.push(message))
    const loadResult = await Promise.race([
        window.loadURL(ownerUrl).then(() => 'loaded' as const),
        delay(5_000).then(() => 'pending' as const)
    ])
    window.show()
    window.focus()

    const owner = (manager as unknown as { owners: Map<number, { slots: { interactive: { contents: WebContents | null } } }> }).owners.get(window.webContents.id)
    const overlayContents = await waitFor(() => owner?.slots.interactive.contents)
    const parent = overlayContents && await waitFor(() => overlayContents.executeJavaScript(`(() => {
        const iframe = document.querySelector('iframe');
        const rect = iframe?.getBoundingClientRect();
        return iframe && rect && rect.width > 0 && rect.height > 0 ? {
            sourceCharacters: Number(window.opener?.document.body.dataset.sourceCharacters || 0),
            fixtureError: window.opener?.document.body.dataset.fixtureError || '',
            iframeSrc: iframe.src,
            width: Math.round(rect?.width || 0),
            height: Math.round(rect?.height || 0),
            x: Math.round(rect?.x || 0),
            y: Math.round(rect?.y || 0),
            sandbox: iframe.getAttribute('sandbox'),
            allow: iframe.getAttribute('allow'),
            referrerPolicy: iframe.referrerPolicy
        } : null;
    })()`))
    const followTargets: string[] = JSON.parse(process.env.ZYRA_HTML_PREVIEW_FOLLOW || '[]')
    if (followTargets.length && overlayContents) {
        const original = await window.webContents.executeJavaScript(`document.body.dataset.currentFile || ''`)
        const steps: string[] = []
        const current = () => window.webContents.executeJavaScript(`document.body.dataset.currentFile || ''`)
        for (const target of followTargets) {
            const frame = await waitFor(() => overlayContents.mainFrame.frames.find(f => f.url.startsWith('zyra:')))
            if (!frame) throw new Error('The original site preview frame is unavailable')
            await delay(500)
            const rect = await frame.executeJavaScript(`(() => {const a=[...document.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===${JSON.stringify(target)}); if(!a)return null; a.scrollIntoView({block:'center'});const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`) as {x:number;y:number;w:number;h:number} | null
            if (!rect || rect.w < 1 || rect.h < 1) throw new Error('The requested site link is not visible')
            const box = await overlayContents.executeJavaScript(`(() => {const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.x,y:r.y}})()`)
            const point = {x:Math.round(box.x+rect.x),y:Math.round(box.y+rect.y),button:'left' as const,clickCount:1}
            overlayContents.focus();overlayContents.sendInputEvent({type:'mouseDown',...point});await delay(100);overlayContents.sendInputEvent({type:'mouseUp',...point})
            const changed = await waitFor(async () => String(await current()).replaceAll(String.fromCharCode(92),'/').endsWith('/'+target), 3000)
            if (!changed) throw new Error('The clicked local page did not reach the owning preview')
            const loaded = await waitFor(() => overlayContents.mainFrame.frames.find(f=>f.url.startsWith('zyra:') && new URL(f.url).pathname.endsWith('/'+target)), 3000)
            if (!loaded) throw new Error('The destination iframe did not load')
            steps.push(target)
            await window.webContents.executeJavaScript('window.__previewBack(); true')
            if (!await waitFor(async () => await current() === original, 3000)) throw new Error('Back did not restore the original file')
            steps.push('Back')
            await delay(200)
        }
        await window.webContents.executeJavaScript('window.__previewForward(); true')
        if (!await waitFor(async () => String(await current()).replaceAll(String.fromCharCode(92),'/').endsWith('/'+followTargets.at(-1)), 3000)) throw new Error('Forward did not restore the linked page')
        steps.push('Forward')
        console.log(JSON.stringify({flow:{passed:true,steps}}))
        manager.dispose();window.destroy();setTimeout(()=>app.exit(0),25);return
    }
    const previewFrame = overlayContents && await waitFor(() => overlayContents.mainFrame.frames.find(frame => frame.url.startsWith('zyra:')))
    let frameSessionId = ''
    if (overlayContents && previewFrame) {
        overlayContents.debugger.attach('1.3')
        const target = await waitFor(async () => {
            const targets = await overlayContents.debugger.sendCommand('Target.getTargets') as { targetInfos?: Array<{ targetId: string; url: string }> }
            return targets.targetInfos?.find(candidate => candidate.url === previewFrame.url)
        })
        if (target) {
            const attachment = await overlayContents.debugger.sendCommand('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as { sessionId: string }
            frameSessionId = attachment.sessionId
        }
    }
    const evaluateFrame = async <T>(expression: string): Promise<T | null> => {
        if (!overlayContents || !frameSessionId) return null
        const evaluation = await overlayContents.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, frameSessionId) as {
            result?: { value?: T }
            exceptionDetails?: { text?: string }
        }
        if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text || 'Preview frame evaluation failed')
        return evaluation.result?.value ?? null
    }
    await waitFor(async () => await evaluateFrame<boolean>("document.readyState === 'complete'"))
    await delay(750)
    const revealSelector = process.env.ZYRA_HTML_PREVIEW_HIDDEN_SELECTOR || ''
    const scriptSections = revealSelector ? await evaluateFrame<Array<{ opacity: string; width: number; height: number }>>(`(async () => {
        const result = [];
        for (const element of document.querySelectorAll(${JSON.stringify(revealSelector)})) {
            element.scrollIntoView({ block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 750));
            const rect = element.getBoundingClientRect();
            result.push({ opacity: getComputedStyle(element).opacity, width: Math.round(rect.width), height: Math.round(rect.height) });
        }
        window.scrollTo(0, 0);
        return result;
    })()`) : []
    const child = await evaluateFrame<{
        url: string
        headerElements: number
        footerElements: number
        bodyElements: number
        scriptsDeclared: number
        scriptMarker: string
        appAccess: boolean
        nodeAccess: boolean
        webRtcBlocked: boolean
        hidden: Array<{ display: string; visibility: string; opacity: string; width: number; height: number }>
        header: { display: string; visibility: string; opacity: string; width: number; height: number } | null
        footer: { display: string; visibility: string; opacity: string; width: number; height: number } | null
        relativeStyleApplied: boolean
    }>(`(() => {
        const hiddenSelector = ${JSON.stringify(process.env.ZYRA_HTML_PREVIEW_HIDDEN_SELECTOR || '')};
        const hidden = hiddenSelector ? [...document.querySelectorAll(hiddenSelector)].map(element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return { display: style.display, visibility: style.visibility, opacity: style.opacity, width: Math.round(rect.width), height: Math.round(rect.height) };
        }) : [];
        const region = selector => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return { display: style.display, visibility: style.visibility, opacity: style.opacity, width: Math.round(rect.width), height: Math.round(rect.height) };
        };
        let appAccess = false;
        try { appAccess = Boolean(window.parent.document || window.parent.devscope); } catch {}
        let webRtcBlocked = false;
        try { const peer = new RTCPeerConnection(); peer.close(); } catch { webRtcBlocked = true; }
        return {
            appAccess,
            nodeAccess: typeof require !== 'undefined' || typeof process !== 'undefined' || typeof window.devscope !== 'undefined',
            webRtcBlocked,
            url: location.href,
            headerElements: document.querySelectorAll('header').length,
            footerElements: document.querySelectorAll('footer').length,
            header: region('header'),
            footer: region('footer'),
            bodyElements: document.body?.querySelectorAll('*').length || 0,
            scriptsDeclared: document.scripts.length,
            scriptMarker: document.body?.dataset.fixtureScriptRan || '',
            hidden,
            relativeStyleApplied: getComputedStyle(document.querySelector('[data-preview-paint]') || document.body).color === 'rgb(12, 34, 56)'
        };
    })()`)
    const painted = overlayContents && parent && parent.width > 0 && parent.height > 0
        ? await countPaintedPixels(overlayContents, { x: parent.x, y: parent.y, width: parent.width, height: parent.height })
        : null
    await evaluateFrame("document.querySelector('footer')?.scrollIntoView({ block: 'start' }); true")
    await delay(100)
    const footerPainted = overlayContents && parent && parent.width > 0 && parent.height > 0
        ? await countPaintedPixels(overlayContents, { x: parent.x, y: parent.y, width: parent.width, height: parent.height })
        : null

    const readActivatedLinks = async (): Promise<string[]> => {
        const value = await window.webContents.executeJavaScript(`JSON.parse(document.body.dataset.activatedLinks || '[]')`).catch(() => [])
        return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
    }
    const clickPreviewLink = async (selector: string, hold = 60, routeToFrame = false) => {
        if (!overlayContents || !previewFrame || !parent) throw new Error('Preview link fixture is unavailable')
        const rect = await previewFrame.executeJavaScript(`(() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            element?.scrollIntoView({ block: 'center' });
            const bounds = element?.getBoundingClientRect();
            return bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        })()`) as Electron.Rectangle | null
        if (!rect) throw new Error(`Preview link is missing: ${selector}`)
        const x = Math.round(parent.x + rect.x + rect.width / 2)
        const y = Math.round(parent.y + rect.y + rect.height / 2)
        overlayContents.focus()
        if (routeToFrame) {
            await overlayContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
            await overlayContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
            await delay(hold)
            await overlayContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
        } else {
            overlayContents.sendInputEvent({ type: 'mouseMove', x, y })
            await delay(20)
            overlayContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
            await delay(hold)
            overlayContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
        }
    }
    const initialActivatedLinks = await readActivatedLinks()
    let fragmentScrolled = false
    let dangerousRan = ''
    let ordinaryClicked = ''
    let ownerControlClicked = ''
    if (process.env.ZYRA_HTML_PREVIEW_LINK_FIXTURE === 'true') {
    const controlRect = await overlayContents?.executeJavaScript(`(() => { const r=document.querySelector('#owner-control').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
    if (overlayContents && controlRect) {
        const point = { x: Math.round(controlRect.x), y: Math.round(controlRect.y), button: 'left' as const, clickCount: 1 }
        overlayContents.sendInputEvent({ type: 'mouseDown', ...point }); await delay(100)
        overlayContents.sendInputEvent({ type: 'mouseUp', ...point }); await delay(100)
    }
    ownerControlClicked = await window.webContents.executeJavaScript(`document.body.dataset.ownerControlClicked || ''`)
    // Chromium dispatch routes real DOM input into the out-of-process iframe.
    await clickPreviewLink('#ordinary-button', 60, true); await delay(100)
    ordinaryClicked = String(await previewFrame?.executeJavaScript(`document.body.dataset.buttonClicked || ''`) || '')
    await clickPreviewLink('#local-link')
    await waitFor(async () => (await readActivatedLinks()).length === 1)
    overlayContents?.focus()
    await previewFrame?.executeJavaScript(`window.focus(); document.querySelector('#keyboard-link')?.focus(); true`)
    overlayContents?.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    await delay(60)
    overlayContents?.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    await waitFor(async () => (await readActivatedLinks()).length === 2)
    await clickPreviewLink('#external-link')
    await waitFor(async () => (await readActivatedLinks()).length === 3)
    await clickPreviewLink('#fragment-link', 60, true)
    await delay(100)
    fragmentScrolled = Boolean(await previewFrame?.executeJavaScript(`location.hash === '#target' && scrollY > 0`))
    await clickPreviewLink('#local-link')
    await waitFor(async () => (await readActivatedLinks()).length === 4, 1500)
    const originalCapture = (manager as any).captureMouseLink.bind(manager)
    ;(manager as any).captureMouseLink = async (...args: any[]) => { await delay(120); return originalCapture(...args) }
    await clickPreviewLink('#fast-link', 0)
    await waitFor(async () => (await readActivatedLinks()).length === 5, 1500)
    ;(manager as any).captureMouseLink = originalCapture
    await clickPreviewLink('#dangerous-link', 60, true)
    await delay(100)
    dangerousRan = String(await previewFrame?.executeJavaScript(`document.body.dataset.dangerousRan || ''`) || '')
    }
    const targets = await readActivatedLinks()
    const linksBeforeClose = targets.length

    let popupCreated = false
    overlayContents?.once('did-create-window', () => { popupCreated = true })
    const initialFrameUrl = previewFrame?.url || ''
    const initialOverlayUrl = overlayContents?.getURL() || ''
    if (previewFrame) {
        await evaluateFrame(`window.open('https://preview-popup.invalid/', '_blank')`).catch(() => undefined)
        await evaluateFrame(`location.href = 'https://preview-frame.invalid/'`).catch(() => undefined)
        await delay(200)
        await evaluateFrame(`location.href = ${JSON.stringify(initialFrameUrl + '&navigation-attempt=1')}`).catch(() => undefined)
        await delay(200)
        await evaluateFrame(`(() => { const form = document.createElement('form'); form.action = 'https://preview-form.invalid/'; form.method = 'post'; document.body.append(form); form.submit(); })()`).catch(() => undefined)
        await delay(200)
    }
    await overlayContents?.executeJavaScript(`location.href = 'https://preview-main.invalid/'`).catch(() => undefined)
    await delay(100)
    const frameUrlAfterRemoteAttempt = previewFrame?.url || ''
    const preferences = overlayContents?.getLastWebPreferences()
    const initialFrameDocumentUrl = initialFrameUrl ? new URL(initialFrameUrl) : null
    const frameDocumentUrlAfterRemoteAttempt = frameUrlAfterRemoteAttempt ? new URL(frameUrlAfterRemoteAttempt) : null
    if (initialFrameDocumentUrl) initialFrameDocumentUrl.hash = ''
    if (frameDocumentUrlAfterRemoteAttempt) frameDocumentUrlAfterRemoteAttempt.hash = ''
    const security = {
        popupCreated,
        frameUrlUnchanged: Boolean(initialFrameDocumentUrl) && frameDocumentUrlAfterRemoteAttempt?.href === initialFrameDocumentUrl?.href,
        mainFrameUrlUnchanged: Boolean(initialOverlayUrl) && overlayContents?.getURL() === initialOverlayUrl,
        remoteRequests,
        sandbox: preferences?.sandbox,
        contextIsolation: preferences?.contextIsolation,
        nodeIntegration: preferences?.nodeIntegration,
        webviewTag: preferences?.webviewTag === true,
        previewPolicy: protocolResponses.find(entry => {
            const responseUrl = new URL(entry.url)
            responseUrl.hash = ''
            return responseUrl.href === initialFrameDocumentUrl?.href
        })?.contentSecurityPolicy || ''
    }

    if (overlayContents?.debugger.isAttached()) overlayContents.debugger.detach()
    const staleRect = await previewFrame?.executeJavaScript(`(() => {
        const element = document.querySelector('#local-link');
        element?.scrollIntoView({ block: 'center' });
        const bounds = element?.getBoundingClientRect();
        return bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    })()`) as Electron.Rectangle | null
    if (overlayContents && parent && staleRect) {
        const x = Math.round(parent.x + staleRect.x + staleRect.width / 2)
        const y = Math.round(parent.y + staleRect.y + staleRect.height / 2)
        overlayContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
        await delay(60)
    }
    // A file-preview close guard may cancel beforeunload. Its native dialog must survive.
    await window.webContents.executeJavaScript(`window.__blockFixtureClose = true;
        window.addEventListener('beforeunload', event => {
            if (window.__blockFixtureClose) { event.preventDefault(); event.returnValue = 'blocked'; }
        }); true`, true)
    let preventedClose = false
    window.webContents.on('will-prevent-unload', () => { preventedClose = true })
    window.close()
    await delay(200)
    const overlayPreserved = !window.isDestroyed() && owner?.slots.interactive.contents === overlayContents && !overlayContents?.isDestroyed()
    let finalClosed = window.isDestroyed()
    if (!window.isDestroyed()) {
        await window.webContents.executeJavaScript('window.__blockFixtureClose = false; true')
        const closed = new Promise<boolean>(resolve => window.once('closed', () => resolve(true)))
        window.close()
        finalClosed = await Promise.race([closed, delay(2_000).then(() => false)])
    }
    const closeLifecycle = { preventedClose, overlayPreserved, finalClosed }
    const linksAfterClose = await readActivatedLinks().catch(() => targets)
    const links = {
        targets,
        ordinaryClicked,
        ownerControlClicked,
        fragmentScrolled,
        dangerousDelivered: targets.some(target => target.startsWith('javascript:') || target.startsWith('data:')),
        dangerousRan,
        syntheticDelivered: initialActivatedLinks.length > 0 || targets.some(target => /scripted\.html$/u.test(target)),
        staleActivationQueued: Boolean(staleRect),
        afterCloseDelivered: linksAfterClose.length > linksBeforeClose
    }
    console.log(JSON.stringify({ loadResult, parent, child, scriptSections, painted, footerPainted, protocolResponses, consoleMessages, security, links, closeLifecycle }))
    manager.dispose()
    if (!window.isDestroyed()) window.destroy()
    setTimeout(() => app.exit(0), 25)
}).catch((error) => {
    console.error(error)
    app.exit(1)
})

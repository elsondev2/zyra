const { app, BrowserWindow } = require('electron')
process.stderr.write('markdown-child:boot\n')

const testUrl = process.env.ZYRA_MARKDOWN_TEST_URL
if (!testUrl) throw new Error('ZYRA_MARKDOWN_TEST_URL is required')

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))

async function waitForHarness(contents) {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
        const result = await contents.executeJavaScript(`Boolean(window.__markdownHarness?.read().ready)`, true).catch(() => false)
        if (result) return
        await wait(50)
    }
    throw new Error('Markdown preview harness did not become ready.')
}

async function readMetrics(contents) {
    return await contents.executeJavaScript(`window.__markdownHarness.read()`, true)
}

async function waitForQuiescence(contents) {
    const deadline = Date.now() + 5_000
    let previousHeight = -1
    let stableSamples = 0
    while (Date.now() < deadline) {
        const metrics = await readMetrics(contents)
        const stable = metrics.pendingAnimationFrames === 0 && metrics.scrollHeight === previousHeight
        stableSamples = stable ? stableSamples + 1 : 0
        if (stableSamples >= 3) return
        previousHeight = metrics.scrollHeight
        await wait(60)
    }
    throw new Error('Markdown preview did not become quiescent before wheel input.')
}

async function dispatchWheel(contents, deltaY) {
    const bounds = await contents.executeJavaScript(`(() => {
        const rect = document.querySelector('[data-markdown-wheel-harness]').getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`, true)
    await contents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: bounds.x,
        y: bounds.y
    })
    await contents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: bounds.x,
        y: bounds.y,
        deltaX: 0,
        deltaY
    })
}

app.whenReady().then(async () => {
    process.stderr.write('markdown-child:ready\n')
    const window = new BrowserWindow({
        width: 820,
        height: 560,
        show: false,
        webPreferences: {
            backgroundThrottling: false,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })
    const contents = window.webContents
    contents.on('did-fail-load', (_event, code, description) => process.stderr.write(`markdown-child:load-failed:${code}:${description}\n`))
    contents.on('console-message', (_event, level, message) => process.stderr.write(`markdown-child:console:${level}:${message}\n`))
    let exitCode = 0
    try {
        const domReady = new Promise((resolve) => window.webContents.once('dom-ready', resolve))
        void window.loadURL(testUrl).then(() => process.stderr.write('markdown-child:loaded\n')).catch((error) => {
            process.stderr.write(`markdown-child:load-error:${error?.message || error}\n`)
        })
        await domReady
        process.stderr.write('markdown-child:dom-ready\n')
        await waitForHarness(window.webContents)
        process.stderr.write('markdown-child:harness\n')
        window.setOpacity(0)
        window.showInactive()
        window.webContents.debugger.attach('1.3')

        await wait(700)
        await waitForQuiescence(contents)
        await window.webContents.executeJavaScript(`window.__markdownHarness.resetActivity(); window.__markdownHarness.scrollToStart()`, true)
        await wait(100)
        const initial = await readMetrics(window.webContents)

        await dispatchWheel(window.webContents, 180)
        await wait(90)
        const immediate = await readMetrics(window.webContents)

        for (let index = 0; index < 8; index += 1) {
            await dispatchWheel(window.webContents, 180)
            await wait(35)
        }
        const burst = await readMetrics(window.webContents)
        await wait(750)
        const settled = await readMetrics(window.webContents)

        await window.webContents.executeJavaScript(`window.__markdownHarness.scrollToStart(); window.__markdownHarness.navigateToHeading('validation')`, true)
        await wait(350)
        const outlineNavigation = await window.webContents.executeJavaScript(`(() => {
            const container = document.querySelector('[data-markdown-wheel-harness]')
            const target = document.getElementById('validation') || document.getElementById('user-content-validation')
            if (!container || !target) return null
            return {
                scrollTop: container.scrollTop,
                targetOffset: target.getBoundingClientRect().top - container.getBoundingClientRect().top
            }
        })()`, true)

        await window.webContents.executeJavaScript(`window.__markdownHarness.scrollToEnd()`, true)
        await wait(100)
        const endBefore = await readMetrics(window.webContents)
        for (let index = 0; index < 5; index += 1) await dispatchWheel(window.webContents, 180)
        await wait(650)
        const endSettled = await readMetrics(window.webContents)

        await window.webContents.executeJavaScript(`window.__markdownHarness.openAlternateDocument()`, true)
        await wait(350)
        const alternateDocument = await readMetrics(window.webContents)

        await window.webContents.executeJavaScript(`window.__markdownHarness.restoreMarkdownSourceLine(50)`, true)
        await wait(350)
        const restoredSourceLine = await readMetrics(window.webContents)

        await window.webContents.executeJavaScript(`window.__markdownHarness.openReadmeDocument()`, true)
        await wait(700)
        await waitForQuiescence(contents)
        const readmeDocument = await readMetrics(window.webContents)
        const lateSectionOverlap = await window.webContents.executeJavaScript(`window.__markdownHarness.probeLateSectionExpansion()`, true)

        process.stdout.write(`${JSON.stringify({ initial, immediate, burst, settled, outlineNavigation, endBefore, endSettled, alternateDocument, restoredSourceLine, readmeDocument, lateSectionOverlap })}\n`)
    } catch (error) {
        exitCode = 1
        process.stderr.write(`${error?.stack || error}\n`)
    } finally {
        if (!contents.isDestroyed() && contents.debugger.isAttached()) {
            try { contents.debugger.detach() } catch {}
        }
        app.exit(exitCode)
    }
})

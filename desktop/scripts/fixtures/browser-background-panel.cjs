const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const directory = process.env.ZYRA_BACKGROUND_FIXTURE
const screenshots = process.env.ZYRA_BACKGROUND_SCREENSHOTS
app.setPath('userData', path.join(directory, 'profile'))
app.commandLine.appendSwitch('force-prefers-reduced-motion', 'reduce')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let window
const timeout = setTimeout(() => { console.error('Background panel fixture timed out'); app.exit(1) }, 25000)
app.whenReady().then(async () => {
    window = new BrowserWindow({ show: false, width: 1240, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } })
    await window.loadFile(path.join(directory, 'index.html'))
    const js = code => window.webContents.executeJavaScript(code)
    for (let i = 0; i < 100; i++) {
        if (await js(`Boolean(document.querySelector('[role="dialog"]'))`)) break
        await wait(20)
    }
    await js(`Promise.all([...document.images].map(image => { image.loading='eager'; return image.decode() }))`)
    await wait(250)
    const measure = () => js(`(() => {
        const panel = document.querySelector('[role="dialog"]');
        const browser = document.querySelector('#browser');
        const gallery = panel.querySelector('.overflow-y-auto');
        const image = panel.querySelector('img');
        const caption = image.closest('button').lastElementChild;
        const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height } };
        return {panel:rect(panel),browser:rect(browser),image:rect(image),caption:rect(caption),header:rect(panel.querySelector('header')),footer:rect(panel.querySelector('footer')),galleryOverflow:gallery.scrollWidth>gallery.clientWidth,panelOverflow:panel.scrollWidth>panel.clientWidth,background:getComputedStyle(panel.parentElement).backgroundColor};
    })()`)
    for (const mode of ['light', 'dark']) {
        await js('document.documentElement.className=' + JSON.stringify(mode))
        await window.webContents.capturePage()
        await wait(200)
        const layout = await measure()
        const colors = await js(`({source:getComputedStyle(document.querySelector('[role="tab"][aria-selected="true"]')).color,panel:getComputedStyle(document.querySelector('[role="dialog"]')).color})`)
        assert.equal(colors.source, colors.panel, 'selected source retains primary text contrast')
        assert.equal(layout.panel.width, 440)
        assert.equal(layout.panel.right, layout.browser.right - 12)
        assert.equal(layout.panel.y, layout.browser.y + 12)
        assert(layout.image.width >= 190, 'gallery photos use the available width')
        assert(layout.caption.y >= layout.image.bottom, 'captions are below images')
        assert.equal(layout.background, 'rgba(0, 0, 0, 0)', 'no dimmed backdrop')
        assert(!layout.galleryOverflow && !layout.panelOverflow)
        assert(layout.footer.bottom <= layout.panel.bottom)
        if (screenshots) {
            await wait(100)
            const image = await window.webContents.capturePage({ x: 740, y: 60, width: 460, height: 700 })
            await fs.writeFile(path.join(screenshots, mode + '.png'), image.toPNG())
        }
    }
    await js(`document.querySelectorAll('button[aria-pressed]')[1].click()`)
    await wait(30)
    assert.equal(await js(`document.querySelectorAll('button[aria-pressed]')[1].getAttribute('aria-pressed')`), 'true')
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Lock image').click()`)
    await wait(30)
    assert.equal(await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Lock image').getAttribute('aria-pressed')`), 'true')
    await js(`document.querySelector('#browser').style.width='300px';document.querySelector('#browser').style.height='420px'`)
    await wait(80)
    const narrow = await measure()
    assert.equal(narrow.panel.width, 276)
    assert(narrow.image.width > 230, 'narrow panel uses one image column')
    assert(!narrow.galleryOverflow && !narrow.panelOverflow)
    assert(narrow.footer.bottom <= narrow.panel.bottom && narrow.header.y >= narrow.panel.y)
    await js(`const activeTab=document.querySelector('[role="tab"][aria-selected="true"]');activeTab.focus();activeTab.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))`)
    await wait(30)
    assert(await js(`document.querySelector('[role="dialog"]').textContent.includes('No background image')`))
    assert.equal(await js(`document.querySelector('[role="dialog"] footer')===null`), true)
    await js(`[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent==='Unsplash').click()`)
    await wait(30)
    await js(`const input=document.querySelector('[aria-label="Search Unsplash backgrounds"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'forest');input.dispatchEvent(new Event('input',{bubbles:true}));`)
    await wait(30)
    await js(`document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`)
    await wait(30)
    assert.equal(await js('window.lastSearch'), 'forest')
    assert.equal(await js('window.closedCount'), 0)
    console.log('PASS: Backgrounds light/dark layout, browser alignment, large previews, captions, narrow layout, selection, rotation, None and Unsplash search')
    clearTimeout(timeout)
    window.destroy()
    app.quit()
}).catch(error => {
    console.error(error)
    clearTimeout(timeout)
    if (window && !window.isDestroyed()) window.destroy()
    app.exit(1)
})

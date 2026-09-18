const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { app, BrowserWindow } = require('electron')

app.setPath('userData', process.env.ZYRA_GEOMETRY_USER_DATA)
const deadline = setTimeout(() => app.exit(1), 20_000)
app.whenReady().then(async () => {
    const window = new BrowserWindow({ width: 900, height: 650, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    await window.loadURL('data:text/html,<html><body style="margin:0"></body></html>')
    // Native Windows Chromium does not paint CSS transitions in a never-shown window.
    window.showInactive()
    const module = readFileSync(process.env.ZYRA_GEOMETRY_MODULE, 'utf8')
    const result = await window.webContents.executeJavaScript(`${module}; (async () => {
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        document.body.innerHTML = '<div id="frame" style="position:absolute;right:0;top:40px;width:0;height:400px;transition:width 160ms ease-out"><div id="surface" style="position:absolute;right:0;width:400px;height:100%;transform:translateX(8px);transition:transform 160ms ease-out"><div id="slot" style="position:absolute;inset:0"></div></div></div>';
        const frame = document.getElementById('frame');
        const surface = document.getElementById('surface');
        const slot = document.getElementById('slot');
        const read = () => ({ x: slot.getBoundingClientRect().x, width: slot.getBoundingClientRect().width });
        let legacy = read(), firstResize;
        const firstObservation = new Promise(resolve => { firstResize = resolve; });
        const oldObserver = new ResizeObserver(() => { legacy = read(); firstResize(); });
        oldObserver.observe(slot);
        let latest, measurements = 0;
        const dispose = BrowserSlotGeometry.observeAssistantBrowserSlotGeometry(slot, () => { latest = read(); measurements++; });
        await firstObservation;
        await delay(80);
        frame.style.width = '400px';
        surface.style.transform = 'none';
        await delay(280);
        const entrance = { actual: read(), tracked: latest, legacy };
        surface.style.transform = 'translateX(-75px)';
        await delay(280);
        const transform = { actual: read(), tracked: latest };
        const settled = measurements;
        await delay(120);
        const idleMeasurements = measurements - settled;
        frame.style.width = '160px';
        await delay(40);
        frame.style.width = '400px';
        await delay(280);
        const interrupted = { actual: read(), tracked: latest };
        dispose(); oldObserver.disconnect();
        const disposed = measurements;
        surface.style.transform = 'none';
        await delay(240);
        return { entrance, transform, interrupted, idleMeasurements, disposalMeasurements: measurements - disposed };
    })()`)
    assert.notEqual(result.entrance.legacy.x, result.entrance.actual.x, 'the previous slot-only observer reproduces the stale entrance coordinates')
    for (const stage of ['entrance', 'transform', 'interrupted']) {
        assert.deepEqual(result[stage].tracked, result[stage].actual, `${stage} must finish with native bounds matching the rendered slot`)
    }
    assert.equal(result.idleMeasurements, 0, 'settled browser pages must not poll geometry')
    assert.equal(result.disposalMeasurements, 0, 'unmounted slots must not send stale reports')
    console.log('Browser native slot geometry: ok', JSON.stringify(result))
    window.destroy()
    clearTimeout(deadline)
    app.quit()
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1) })

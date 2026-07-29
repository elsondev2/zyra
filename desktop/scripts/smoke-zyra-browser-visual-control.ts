import { app, BrowserWindow } from 'electron'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { ZyraBrowserDriver } from '../src/main/agent-control/drivers/zyra-browser-driver'

const token = randomBytes(32).toString('base64url')
const runId = randomUUID()
const runDirectory = join(tmpdir(), `zyra-browser-visual-smoke-${runId}`)
const descriptorFile = join(tmpdir(), 'zyra-browser-visual-smoke.json')
mkdirSync(runDirectory, { recursive: true })

const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Zyra Word Grid</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:Inter,Segoe UI,sans-serif;background:#08111f;color:#edf8ff}
body{display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 30% 10%,#17334b 0,#0b1728 35%,#060c16 100%)}
main{width:min(760px,92vw);text-align:center}.eyebrow{color:#67e8f9;font-size:12px;letter-spacing:.18em;text-transform:uppercase}
h1{font-size:32px;margin:8px 0 4px}.sub{color:#91a8ba;font-size:14px;margin-bottom:26px}
#tiles{display:flex;justify-content:center;gap:10px;margin-bottom:28px}.tile{width:64px;height:64px;border:2px solid #38546a;border-radius:9px;display:grid;place-items:center;font-size:30px;font-weight:800;background:#0d1c2d;transition:.2s}
.tile.filled{border-color:#67e8f9}.tile.correct{background:#15803d;border-color:#4ade80}.tile.wrong{background:#92400e;border-color:#f59e0b}
#keyboard{display:grid;grid-template-columns:repeat(10,48px);gap:8px;justify-content:center}.key{height:46px;border:1px solid #345269;border-radius:8px;background:#14283a;color:#e8f7ff;font-weight:700;cursor:pointer}.key:hover{background:#1e3a50}.key:active{transform:scale(.94)}
#enter{grid-column:4 / span 4;background:#0e7490;border-color:#22d3ee}.result{height:30px;margin-top:20px;color:#a7f3d0;font-weight:700}.hint{margin-top:18px;color:#647f91;font-size:12px}.drag{position:absolute;left:28px;bottom:26px;width:118px;padding:10px;border:1px solid #35566d;border-radius:8px;background:#102438;color:#8fdcf0;font-size:11px;user-select:none}
</style></head><body><main><div class="eyebrow">Background Browser Lab</div><h1>Zyra Word Grid</h1><div class="sub">Use the agent cursor to enter the five-letter word <strong>AGENT</strong>.</div><div id="tiles">${Array.from({length:5},(_,i)=>`<div class="tile" data-index="${i}"></div>`).join('')}</div><div id="keyboard">${'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map(letter=>`<button class="key" data-letter="${letter}">${letter}</button>`).join('')}<button class="key" id="enter">ENTER</button></div><div id="result" class="result"></div><div class="hint">The system pointer remains yours. The cyan cursor belongs to the agent.</div></main><div class="drag">Drag test card</div><script>
let guess='';const tiles=[...document.querySelectorAll('.tile')];function draw(){tiles.forEach((tile,index)=>{tile.textContent=guess[index]||'';tile.classList.toggle('filled',index<guess.length)})}
document.querySelectorAll('[data-letter]').forEach(button=>button.addEventListener('click',()=>{if(guess.length<5){guess+=button.dataset.letter;draw()}}));
document.querySelector('#enter').addEventListener('click',()=>{if(guess.length!==5)return;tiles.forEach((tile,index)=>tile.classList.add(guess[index]==='AGENT'[index]?'correct':'wrong'));document.querySelector('#result').textContent=guess==='AGENT'?'Solved — visual Browser control works.':'Try again';});
</script></body></html>`

const overlayHtml = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden;pointer-events:none}.cursor{position:absolute;left:0;top:0;opacity:0;transition:transform 180ms cubic-bezier(.22,1,.36,1);will-change:transform}.cursor.show{opacity:1}.ring{position:absolute;left:-10px;top:-10px;width:22px;height:22px;border-radius:50%;border:1px solid rgba(103,232,249,.75);background:rgba(34,211,238,.16)}.pointer{position:absolute;left:-2px;top:-2px;width:0;height:0;border-top:19px solid #67e8f9;border-right:12px solid transparent;filter:drop-shadow(0 2px 2px #000)}.label{position:absolute;left:13px;top:14px;white-space:nowrap;padding:3px 5px;border-radius:3px;background:rgba(2,8,23,.92);border:1px solid rgba(103,232,249,.35);color:#cffafe;font:700 9px Segoe UI,sans-serif;letter-spacing:.08em;text-transform:uppercase}</style></head><body><div id="cursor" class="cursor"><i class="ring"></i><i class="pointer"></i><span id="label" class="label">Zyra</span></div><script>globalThis.updateCursor=(value)=>{const cursor=document.querySelector('#cursor');cursor.style.transitionDuration=Math.max(0,Math.min(2000,value.durationMs||0))+'ms';cursor.style.transform='translate3d('+value.x+'px,'+value.y+'px,0)';cursor.classList.toggle('show',value.visible!==false);document.querySelector('#label').textContent='Zyra · '+(value.phase||'idle')}</script></body></html>`

console.log('[visual-smoke] module loaded')
void runVisualSmoke().catch((error) => {
    console.error('[visual-smoke] failed', error)
    app.exit(1)
})

async function runVisualSmoke(): Promise<void> {
await app.whenReady()
console.log('[visual-smoke] Electron ready')
const pageServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(pageHtml)
})
await new Promise<void>((resolve) => pageServer.listen(0, '127.0.0.1', resolve))
console.log('[visual-smoke] page server ready')
const pageAddress = pageServer.address()
if (!pageAddress || typeof pageAddress === 'string') throw new Error('Word Grid server did not start.')
const pageUrl = `http://127.0.0.1:${pageAddress.port}/`

const targetWindow = new BrowserWindow({
    width: 900,
    height: 680,
    show: false,
    title: 'Zyra Visual Browser Smoke — Word Grid',
    backgroundColor: '#08111f',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
})
await targetWindow.loadURL(pageUrl)
console.log('[visual-smoke] target page loaded')
targetWindow.showInactive()

const overlayWindow = new BrowserWindow({
    parent: targetWindow,
    frame: false,
    transparent: true,
    show: false,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
})
overlayWindow.setIgnoreMouseEvents(true)
await overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`)
console.log('[visual-smoke] cursor overlay loaded')
const syncOverlayBounds = () => {
    if (!overlayWindow.isDestroyed() && !targetWindow.isDestroyed()) overlayWindow.setBounds(targetWindow.getContentBounds())
}
syncOverlayBounds()
targetWindow.on('move', syncOverlayBounds)
targetWindow.on('resize', syncOverlayBounds)
overlayWindow.showInactive()

const driver = new ZyraBrowserDriver(join(runDirectory, 'screenshots'))
const broker = new AgentControlBroker({ drivers: [driver] })
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId, tabId: 'browser:word-grid', ownerThreadId: principal.threadId, guestIdentity: 'smoke:word-grid', origin: new URL(pageUrl).origin },
    driver,
    trustedIdentity: targetWindow.webContents
})
const principal = { type: 'root' as const, threadId: 'thread:visual-smoke', turnId: 'turn:visual-smoke' }
const pending = broker.requestGrant({
    principal,
    targetId,
    capabilities: ['observe.structure', 'observe.screenshot', 'pointer.move', 'pointer.click', 'pointer.drag', 'scroll', 'keyboard.type', 'keyboard.key'],
    durationMs: 5 * 60_000,
    maxActions: 100
})
const grant = broker.approvePendingGrant({
    pendingRequestId: pending.requestId,
    targetId,
    capabilities: pending.capabilities,
    durationMs: 5 * 60_000,
    maxActions: 100,
    allowedOrigins: pending.allowedOrigins
})
let latestRevision = 0
broker.on('changed', (state) => {
    const cursor = state.cursors.find((entry: { targetId: string }) => entry.targetId === targetId)
    if (cursor && !overlayWindow.isDestroyed()) void overlayWindow.webContents.executeJavaScript(`globalThis.updateCursor(${JSON.stringify(cursor)})`, true).catch(() => undefined)
})

const controlServer = createServer(async (request, response) => {
    try {
        if (!authenticate(request)) return reply(response, 401, { error: 'unauthorized' })
        if (request.method !== 'POST') return reply(response, 405, { error: 'post-required' })
        const body = await readBody(request)
        if (request.url === '/observe') {
            const result = await broker.handleToolOperation(principal, { operation: 'observe', grantId: grant.grantId, targetId, includeScreenshot: true })
            latestRevision = Number((result.observation as { revision?: number })?.revision || latestRevision)
            return reply(response, 200, result)
        }
        if (request.url === '/act') {
            const result = await broker.handleToolOperation(principal, {
                operation: 'act', version: 1, requestId: `smoke:${randomUUID()}`, grantId: grant.grantId, targetId,
                observationRevision: Number(body.observationRevision || latestRevision), action: body.action
            })
            latestRevision = Number((result.observation as { revision?: number })?.revision || latestRevision)
            return reply(response, 200, result)
        }
        if (request.url === '/stop') {
            reply(response, 200, { stopped: true })
            setTimeout(() => app.quit(), 80)
            return
        }
        return reply(response, 404, { error: 'unknown-route' })
    } catch (error) {
        return reply(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
})
await new Promise<void>((resolve) => controlServer.listen(0, '127.0.0.1', resolve))
const controlAddress = controlServer.address()
if (!controlAddress || typeof controlAddress === 'string') throw new Error('Visual Browser control server did not start.')
writeFileSync(descriptorFile, JSON.stringify({ version: 1, pid: process.pid, port: controlAddress.port, token, targetId, grantId: grant.grantId, runDirectory, pageUrl }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ ready: true, descriptorFile, page: 'Zyra Word Grid', background: true }))

const timeout = setTimeout(() => app.quit(), 3 * 60_000)
timeout.unref()
targetWindow.on('closed', () => app.quit())
app.on('before-quit', () => {
    clearTimeout(timeout)
    controlServer.close()
    pageServer.close()
    void broker.dispose()
    try { rmSync(descriptorFile, { force: true }) } catch {}
})
}

function authenticate(request: IncomingMessage): boolean {
    const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const left = Buffer.from(supplied)
    const right = Buffer.from(token)
    return left.length === right.length && timingSafeEqual(left, right)
}

async function readBody(request: IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > 64 * 1024) throw new Error('request-too-large')
        chunks.push(buffer)
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object-required')
    return parsed
}

function reply(response: ServerResponse, status: number, body: unknown): void {
    const data = JSON.stringify(body)
    response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'cache-control': 'no-store' })
    response.end(data)
}

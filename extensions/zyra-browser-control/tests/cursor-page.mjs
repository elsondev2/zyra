import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../../../desktop/package.json', import.meta.url))
const directory = await mkdtemp(path.join(tmpdir(), 'zyra-cursor-presence-'))
const screenshot = process.argv[2] ? path.resolve(process.argv[2]) : null
try {
  await build({ absWorkingDir: root, entryPoints: ['tests/fixtures/cursor-page.ts'], outfile: path.join(directory, 'fixture.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome125' })
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Cursor presence fixture</title></head><body style="background:#071326;color:#fff;font:16px system-ui;padding:32px"><h1>Controlled-tab favicon</h1><p>The original site icon with the Zyra cursor overlay.</p><script src="fixture.js"></script></body></html>')
  await writeFile(path.join(directory, 'main.cjs'), `
const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
app.setPath('userData',${JSON.stringify(path.join(directory, 'profile'))});
let window;const timer=setTimeout(()=>{console.error('Cursor fixture timed out');app.exit(1)},20000);
app.whenReady().then(async()=>{
  window=new BrowserWindow({show:false,width:640,height:420,webPreferences:{backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await window.loadFile(${JSON.stringify(path.join(directory, 'index.html'))});
  const results=await window.webContents.executeJavaScript('window.cursorChecks');
  for(const result of results)console.log('PASS: '+result);
  if(${JSON.stringify(screenshot)})writeFileSync(${JSON.stringify(screenshot)},(await window.webContents.capturePage()).toPNG());
  clearTimeout(timer);window.destroy();app.quit();
}).catch(error=>{console.error(error);clearTimeout(timer);if(window&&!window.isDestroyed())window.destroy();app.exit(1)});
`)
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await promisify(execFile)(require('electron'), [path.join(directory, 'main.cjs')], { env, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
  console.log(result.stdout.trim())
} finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }

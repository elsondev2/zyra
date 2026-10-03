import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

if (process.platform !== 'win32') {
    console.log('Native edge fixture is Windows-only; use test-window-state-events.ts for portable lifecycle checks.')
    process.exit(0)
}
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-window-edge-'))
try {
    await build({ entryPoints: [join(desktop, 'src/main/window-state-events.ts')], outfile: join(directory, 'state.cjs'),
        bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
    await copyFile(join(desktop, 'scripts/fixtures/window-edge-hit-test.py'), join(directory, 'hit.py'))
    await writeFile(join(directory, 'run.cjs'), `
const assert=require('node:assert/strict');const {app,BrowserWindow}=require('electron');
const {execFile}=require('node:child_process');const {join}=require('node:path');
const {attachWindowStateEvents}=require('./state.cjs');
app.setPath('userData',join(__dirname,'profile'));
const timeout=setTimeout(()=>{console.error('Native resize guard timed out');app.exit(1)},30000);
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,frame:false,width:600,height:400,skipTaskbar:true,
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const handle=window.getNativeWindowHandle();const hwnd=(handle.length===8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE())).toString();
 const probe=()=>new Promise((resolve,reject)=>execFile('python',[join(__dirname,'hit.py'),hwnd],{windowsHide:true,timeout:8000},(error,stdout)=>error?reject(error):resolve(JSON.parse(stdout))));
 let maximized=false,fullscreen=false;
 // Exercise real native resizing APIs without calling maximize(), which would
 // show a hidden window. State-notification/getter timing is simulated here.
 window.isMaximized=()=>maximized;window.isFullScreen=()=>fullscreen;
 const before=await probe();assert.equal(before.visible,false);assert.equal(before.thickFrame,true);
 assert.equal(before.hits.left,10,'Baseline left edge is a native resize target');
 attachWindowStateEvents(window,'win32');
 const normal=window.getBounds();const min=window.getMinimumSize();const max=window.getMaximumSize();const canMaximize=window.isMaximizable();
 for(const state of ['maximized','fullscreen']){
  if(state==='maximized'){maximized=true;window.emit('maximize')}else{window.emit('enter-full-screen');fullscreen=true}
  assert.equal(window.isResizable(),false);assert.equal(window.isVisible(),false);
  const locked=await probe();assert.equal(locked.thickFrame,false,'Native thick resize frame is removed');
  assert.deepEqual(window.getMinimumSize(),min,'Locking preserves the normal minimum size');
  assert.deepEqual(window.getMaximumSize(),max,'Locking preserves the normal maximum size');
  for(const [edge,hit] of Object.entries(locked.hits))assert.ok(hit<10||hit>17,edge+' is not an edge-resize hit target');
  assert.deepEqual(window.getBounds(),normal,'Locking the border does not change current geometry');
  if(state==='maximized'){maximized=false;window.emit('unmaximize')}else{window.emit('leave-full-screen');fullscreen=false}
  assert.equal(window.isResizable(),true);assert.equal(window.isVisible(),false);
  const restored=await probe();assert.equal(restored.thickFrame,true);assert.equal(restored.hits.left,10);
  assert.deepEqual(window.getMinimumSize(),min);assert.deepEqual(window.getMaximumSize(),max);
  assert.equal(window.isMaximizable(),canMaximize,'Restore/maximize control remains available');
  console.log('PASS: '+state+' notifications remove actual Windows edge resize targets and restore them when windowed');
 }
 assert.equal(window.isVisible(),false);window.destroy();clearTimeout(timeout);app.quit();
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1)});
`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    process.exitCode = await new Promise((resolveExit, reject) => {
        const child = spawn(electronPath, [join(directory, 'run.cjs')], { cwd: desktop, env, windowsHide: true, shell: false, stdio: 'inherit' })
        child.once('error', reject); child.once('exit', code => resolveExit(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-window-edge-')) throw new Error('Unexpected fixture cleanup path')
    await rm(directory, { recursive: true, force: true })
}

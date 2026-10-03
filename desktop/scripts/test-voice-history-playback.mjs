import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import electronPath from 'electron'

const execute = promisify(execFile)
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-voice-playback-'))
function wav(seconds) {
    const samples = Math.round(seconds * 24000)
    const bytes = Buffer.alloc(44 + samples * 2)
    bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
    bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28)
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
    bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 24000) * 1000), 44 + i * 2)
    return bytes.toString('base64')
}
try {
    const index = await readFile(join(desktop, 'src/renderer/index.html'), 'utf8')
    const csp = index.match(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/)?.[0]
    if (!csp) throw new Error('Could not read the actual renderer CSP')
    await build({
        absWorkingDir: desktop, entryPoints: ['scripts/fixtures/voice-history-playback.tsx'],
        outfile: join(directory, 'renderer.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
        alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') },
        define: { 'process.env.NODE_ENV': '"development"', 'import.meta.hot': 'undefined', VOICE_TEST_AUDIO: JSON.stringify([wav(2), wav(0.01), wav(2)]) }
    })
    await writeFile(join(directory, 'index.html'), `<!doctype html><html><head>${csp}</head><body><div id="root"></div><script src="./renderer.js"></script></body></html>`)
    await writeFile(join(directory, 'main.cjs'), `
const {app,BrowserWindow}=require('electron');const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));app.setPath('sessionData',path.join(__dirname,'session'));
const watchdog=setTimeout(()=>{console.error('Playback test timed out');app.exit(1)},20000);
app.whenReady().then(async()=>{let win;try{
win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}});
await win.loadFile(path.join(__dirname,'index.html'));
const result=await win.webContents.executeJavaScript('window.runVoicePlaybackSmoke()',true);
console.log(JSON.stringify({test:'voice-history-playback',...result}));clearTimeout(watchdog);win.destroy();app.exit(0);
}catch(error){console.error(error);clearTimeout(watchdog);win?.destroy();app.exit(1)}});
`)
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const result = await execute(electronPath, [join(directory, 'main.cjs')], { cwd: desktop, env, windowsHide: true, timeout: 25000 })
    process.stdout.write(result.stdout)
} catch (error) {
    if (error.stdout) process.stderr.write(error.stdout)
    if (error.stderr) process.stderr.write(error.stderr)
    throw error
} finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

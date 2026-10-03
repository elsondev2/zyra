import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, totalmem, freemem, release } from 'node:os'
import { dirname, join, resolve, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import electronPath from 'electron'

export const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export async function hiddenRendererBenchmark({ name, entry, plugins = [], overrides = {}, args = {} }) {
    const directory = await mkdtemp(join(tmpdir(), 'zyra-perf-isolated-'))
    try {
        await mkdir(join(directory, 'profile'))
        await mkdir(join(directory, 'session'))
        const sourceOverrides = new Map(Object.entries(overrides).map(([path, snapshot]) => [resolve(desktopRoot, path), resolve(snapshot)]))
        const bundle = await build({
            absWorkingDir: desktopRoot, entryPoints: [entry], outfile: join(directory, 'renderer.js'),
            bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', metafile: true, minify: true,
            alias: { '@': join(desktopRoot, 'src/renderer/src'), '@shared': join(desktopRoot, 'src/shared') },
            define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'undefined', 'import.meta.env.DEV': 'false' },
            plugins: [{ name: 'benchmark-source-snapshots', setup(api) {
                api.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async input => {
                    const snapshot = sourceOverrides.get(input.path)
                    if (!snapshot) return
                    return { contents: await readFile(snapshot, 'utf8'), resolveDir: dirname(input.path), loader: extname(input.path).slice(1) }
                })
            } }, ...plugins]
        })
        const renderer = await readFile(join(directory, 'renderer.js'))
        await writeFile(join(directory, 'index.html'), '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' blob:; connect-src \'none\'"><div id="root"></div><script src="./renderer.js"></script>')
        await writeFile(join(directory, 'main.cjs'), `
const{app,BrowserWindow,session}=require('electron');const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));app.setPath('sessionData',path.join(__dirname,'session'));
const watchdog=setTimeout(()=>{console.error('Hidden benchmark timed out');app.exit(1)},30000);
app.whenReady().then(async()=>{let win;try{
session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')}));
win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1100,height:800,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}});
win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message)});
await win.loadFile(path.join(__dirname,'index.html'));win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Performance.enable');
await win.webContents.debugger.sendCommand('HeapProfiler.collectGarbage');
await win.webContents.debugger.sendCommand('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
const metrics=async()=>Object.fromEntries((await win.webContents.debugger.sendCommand('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
const before=await metrics();const memoryBefore=app.getAppMetrics().map(p=>({type:p.type,workingSetKiB:p.memory?.workingSetSize,peakWorkingSetKiB:p.memory?.peakWorkingSetSize}));
const result=await win.webContents.executeJavaScript('window.runPerformanceBenchmark('+${JSON.stringify(JSON.stringify(args))}+')',true);
const allocationProfile=await win.webContents.debugger.sendCommand('HeapProfiler.stopSampling');
const allocationBytes=node=>(node.selfSize||0)+(node.children||[]).reduce((sum,child)=>sum+allocationBytes(child),0);
await win.webContents.debugger.sendCommand('HeapProfiler.collectGarbage');
const after=await metrics();const memoryAfter=app.getAppMetrics().map(p=>({type:p.type,workingSetKiB:p.memory?.workingSetSize,peakWorkingSetKiB:p.memory?.peakWorkingSetSize}));
if(win.isVisible()||win.isFocused())throw Error('Benchmark unexpectedly shown');
console.log(JSON.stringify({result,rendererMetrics:{taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,heapBeforeBytes:before.JSHeapUsedSize,heapAfterBytes:after.JSHeapUsedSize,sampledAllocationBytes:allocationBytes(allocationProfile.profile.head)},memoryBefore,memoryAfter}));
clearTimeout(watchdog);win.destroy();app.exit(0);
}catch(error){console.error(error);clearTimeout(watchdog);win?.destroy();app.exit(1)}});
`)
        const env = { ...process.env }
        delete env.ELECTRON_RUN_AS_NODE
        const run = await promisify(execFile)(electronPath, [join(directory, 'main.cjs')], { cwd: desktopRoot, env, windowsHide: true, timeout: 35000 })
        const last = run.stdout.trim().split(/\r?\n/).findLast(line => line.startsWith('{'))
        if (!last) throw new Error('Benchmark returned no measurements')
        return {
            name, environment: { os: `${process.platform} ${release()}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(), node: process.version },
            bundle: { bytes: renderer.length, gzipBytes: gzipSync(renderer).length, modules: Object.keys(bundle.metafile.inputs).length },
            ...JSON.parse(last)
        }
    } catch (error) {
        if (error.stderr) process.stderr.write(error.stderr)
        throw error
    } finally {
        if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-perf-isolated-')) throw new Error('Unexpected benchmark cleanup path')
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
}

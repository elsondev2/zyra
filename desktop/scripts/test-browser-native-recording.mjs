import { build } from 'esbuild'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
const here = dirname(fileURLToPath(import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'zyra-native-recording-'))
try {
    await build({ entryPoints: [join(here, '../src/main/browser-recording-capture.ts')], outfile: join(directory, 'capture.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    await build({ entryPoints: [join(here, '../src/renderer/src/pages/assistant/assistant-browser-recording.ts')], outfile: join(directory, 'recorder.js'), bundle: true, platform: 'browser', format: 'iife', globalName: 'BrowserRecording' })
    const code = await new Promise((done, reject) => {
        const useVirtualDisplay = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
        const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(here, 'browser-native-recording-smoke.cjs')]
        const child = spawn(useVirtualDisplay ? 'xvfb-run' : electronPath, useVirtualDisplay ? ['--auto-servernum', electronPath, ...args] : args, {
            cwd: join(here, '..'), env: { ...process.env, ZYRA_RECORDING_SMOKE: directory }, stdio: 'inherit', windowsHide: true
        })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
    if (code !== 0) process.exitCode = code
    else if (process.argv.includes('--verify-container')) {
        const probe = name => {
            const result = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration:packet=stream_index,pts,data_hash','-show_packets','-show_data_hash','sha256','-of','json',join(directory,name)], { encoding:'utf8', windowsHide:true })
            assert.equal(result.status,0,result.error?.message || result.stderr)
            return JSON.parse(result.stdout)
        }
        const original=probe('synthetic-original.webm'),finalized=probe('synthetic-finalized.webm')
        assert.equal(original.format.duration,undefined,'fixture must reproduce live WebM missing duration')
        assert(Number(finalized.format.duration)>7,'ffprobe must read finalized duration')
        const encoded=recording=>recording.packets.map(({stream_index,pts,data_hash})=>({stream_index,pts,data_hash}))
        assert.deepEqual(encoded(finalized),encoded(original),'every encoded packet/timestamp remains unchanged')
        const decoded=spawnSync('ffmpeg',['-v','error','-i',join(directory,'synthetic-finalized.webm'),'-f','null','-'],{encoding:'utf8',windowsHide:true})
        assert.equal(decoded.status,0,decoded.error?.message || decoded.stderr)
        console.log(JSON.stringify({test:'webm-container-finalization',duration:finalized.format.duration,identicalEncodedPackets:finalized.packets.length,fullDecode:true}))
    }
} finally { await rm(directory, { recursive: true, force: true }).catch(() => {}) }

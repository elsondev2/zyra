import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const execute = promisify(execFile)
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(join(tmpdir(), 'zyra-response-media-'))
try {
    await mkdir(join(root, 'profile'))
    await mkdir(join(root, 'session'))
    // Optional real media stays read-only and is never copied into the repository.
    let mediaPath = process.env.ZYRA_MEDIA_TEST_FILE
    if (!mediaPath) {
        mediaPath = join(root, 'chat debug (100%).mp4')
        await execute(process.env.FFMPEG_PATH || 'ffmpeg', [
            '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
            '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mediaPath
        ], { timeout: 30_000, windowsHide: true })
    }
    const audioPath = join(root, 'sample sound.wav')
    const imagePath = join(root, 'graded frame.png')
    const sampleRate = 16000, samples = sampleRate * 2
    const wave = Buffer.alloc(44 + samples * 2)
    wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8)
    wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22)
    wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28)
    wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 2000), 44 + i * 2)
    await writeFile(audioPath, wave)
    await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kS8AAAAASUVORK5CYII=', 'base64'))
    const env = { ...process.env, ZYRA_MEDIA_TEST_AUDIO: audioPath, ZYRA_MEDIA_TEST_IMAGE: imagePath, ZYRA_MEDIA_TEST_FILE: mediaPath, ZYRA_MEDIA_TEST_HTML: join(root, 'response.html'), ZYRA_MEDIA_TEST_ROOT: root }
    delete env.ELECTRON_RUN_AS_NODE
    const rendered = await execute(process.execPath, ['scripts/test-assistant-response-media.tsx'], { cwd: desktop, env, timeout: 60_000, windowsHide: true })
    process.stdout.write(rendered.stdout)
    const child = join(root, 'media-test.cjs')
    await build({
        absWorkingDir: desktop,
        entryPoints: ['scripts/fixtures/assistant-response-media-electron.ts'],
        outfile: child,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        external: ['electron']
    })
    const electron = (await import('electron')).default as unknown as string
    const played = await execute(electron, [child], { cwd: desktop, env, timeout: 50_000, windowsHide: true })
    process.stdout.write(played.stdout)
} catch (error) {
    const details = error as { stdout?: string; stderr?: string }
    if (details.stdout) process.stderr.write(details.stdout)
    if (details.stderr) process.stderr.write(details.stderr)
    throw error
} finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

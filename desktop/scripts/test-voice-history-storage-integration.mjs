import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-voice-history-storage-'))
globalThis.fixtureVoiceDatabases = []
try {
    const outfile = join(directory, 'voice-history.mjs')
    await build({
        entryPoints: [join(desktop, 'src/main/assistant/voice-history.ts')], outfile,
        bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
        plugins: [{name: 'isolated-voice-input', setup(builder) {
            builder.onResolve({filter: /^electron$/}, () => ({path: 'electron', namespace: 'fixture'}))
            builder.onLoad({filter: /^electron$/, namespace: 'fixture'}, () => ({contents: `export const app={getPath:()=>${JSON.stringify(directory)}}`, loader: 'js'}))
            builder.onResolve({filter: /codex-voice-transcription$/}, () => ({path: 'voice', namespace: 'fixture'}))
            builder.onLoad({filter: /^voice$/, namespace: 'fixture'}, () => ({contents: `export const decodeCodexVoiceInput=input=>Buffer.from(input.audioBase64,'base64');export async function transcribeVoiceWithCodex(input,signal){if(signal?.aborted)throw signal.reason;throw new Error('Fixture offline')}`, loader: 'js'}))
            builder.onResolve({filter: /native-sqlite-adapter\.ts$/}, () => ({path: join(desktop,'src/main/assistant/native-sqlite-adapter.ts'), namespace: 'file'}))
            builder.onResolve({filter: /native-sqlite-adapter$/}, () => ({path: 'sqlite', namespace: 'fixture'}))
            builder.onLoad({filter: /^sqlite$/, namespace: 'fixture'}, () => ({contents: `import{openNativeSqliteDatabase as open}from ${JSON.stringify(join(desktop,'src/main/assistant/native-sqlite-adapter.ts').replace(/\\/g,'/'))};export async function openNativeSqliteDatabase(p){const db=await open(p);globalThis.fixtureVoiceDatabases.push(db);return db}`, loader: 'js'}))
        }}]
    })
    const history = await import(pathToFileURL(outfile).href)
    const wav = Buffer.alloc(480 * 24_000 * 2 + 44)
    wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8)
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22)
    wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34)
    wav.write('data',36); wav.writeUInt32LE(wav.length-44,40)
    const input = {audioBase64: wav.toString('base64'), mimeType: 'audio/wav', durationMs: 480_000}
    for (let i=0;i<3;i++) await assert.rejects(history.transcribeVoiceAndSave(input), /Fixture offline/)
    const db = new DatabaseSync(join(directory,'assistant/voice-history.sqlite'))
    try {
        const usage = db.prepare('SELECT COUNT(*) AS count, SUM(length(failed_audio)) AS bytes FROM voice_history WHERE failed_audio IS NOT NULL').get()
        console.log('Actual production failed-audio usage:', usage)
        assert.ok(usage.bytes <= 64*1024*1024, 'Production transcription failures must not exceed the retained audio budget')
        assert.equal(usage.count,2)
        const rows = await history.listVoiceHistory()
        assert.equal(rows.length,3)
        const full = rows.find(row=>row.hasRecording)
        assert.equal(await history.getFailedVoiceRecording(full.id),input.audioBase64, 'Retained WAV is complete')
        assert.match(rows.find(row=>!row.hasRecording).error,/storage is full/)
        const controller = new AbortController();controller.abort(new Error('Fixture cancelled'))
        await assert.rejects(history.transcribeVoiceAndSave(input,controller.signal),/Fixture cancelled/)
        assert.equal((await history.listVoiceHistory()).length,3,'Cancellation still saves no failed recording')
        await history.deleteVoiceHistory(full.id)
        await assert.rejects(history.transcribeVoiceAndSave(input),/Fixture offline/)
        assert.equal((await history.listVoiceHistory()).filter(row=>row.hasRecording).length,2,'User deletion frees budget through the actual storage owner')
        const newer = db.prepare('INSERT INTO voice_history VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
        for (let i=0;i<205;i++) newer.run(`success-${i}`,'2099-01-01','codex','success',0,'Newer transcript',null)
        const older = await history.listVoiceHistory()
        assert.equal(older.length,202,'History remains bounded to 200 recent entries plus retained recordings')
        assert.equal(older.filter(row=>row.hasRecording).length,2,'Older retained audio remains reachable to free storage')
    } finally {db.close()}
    console.log('Production voice-history storage/cancellation/delete through real native SQLite: passed')
} finally {
    for (const db of globalThis.fixtureVoiceDatabases) db.close()
    delete globalThis.fixtureVoiceDatabases
    await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}

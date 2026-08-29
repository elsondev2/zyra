import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

const tempDirectory = await mkdtemp(join(tmpdir(), 'zyra-browser-threat-feed-'))
const outputPath = join(tempDirectory, 'browser-threats.sqlite')
try {
    const workerUrl = pathToFileURL(join(import.meta.dirname, '..', '..', 'src', 'browser-threat-feed-worker.mjs'))
    const result = await new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { workerData: { outputPath, userAgent: 'Zyra browser phishing protection smoke test' } })
        const timeout = setTimeout(() => {
            void worker.terminate()
            reject(new Error('Live phishing feed smoke test timed out.'))
        }, 120_000)
        worker.once('message', (message) => {
            clearTimeout(timeout)
            void worker.terminate()
            if (message?.type === 'result') resolve(message.result)
            else reject(new Error(message?.error || 'Live phishing feed smoke test failed.'))
        })
        worker.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
        })
    })
    assert.equal(result.notModified, false)
    assert.ok(result.entryCount > 0)
    const database = new DatabaseSync(outputPath, { readOnly: true })
    const metadata = database.prepare('SELECT value FROM metadata WHERE key = ?')
    assert.equal(metadata.get('source')?.value, 'phishtank')
    assert.equal(Number(metadata.get('entry_count')?.value), result.entryCount)
    database.close()
    console.log(JSON.stringify(result, null, 2))
} finally {
    await rm(tempDirectory, { recursive: true, force: true })
}

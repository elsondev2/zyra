import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { BrowserThreatProtectionService } from '../src/main/browser-threat-protection-service'

const STARTUP_BUDGET_MS = 10
const samples: number[] = []
const tempDirectory = await mkdtemp(join(tmpdir(), 'zyra-browser-threat-startup-'))
try {
    for (let index = 0; index < 30; index += 1) {
        const service = new BrowserThreatProtectionService({
            userDataPath: join(tempDirectory, String(index)),
            autoUpdate: false,
            notify: () => undefined
        })
        const started = performance.now()
        service.start()
        samples.push(performance.now() - started)
        await service.ready()
        await service.dispose()
    }
    samples.sort((left, right) => left - right)
    const startupP95Ms = samples[Math.floor(samples.length * 0.95)] || 0
    assert.ok(startupP95Ms < STARTUP_BUDGET_MS, `service start p95 ${startupP95Ms.toFixed(3)}ms exceeds ${STARTUP_BUDGET_MS}ms`)
    console.log(JSON.stringify({ startupP95Ms: Number(startupP95Ms.toFixed(4)) }, null, 2))
} finally {
    await rm(tempDirectory, { recursive: true, force: true })
}

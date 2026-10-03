import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createProductAnalytics } from '../../src/analytics/client.mjs'
import { DevicePreferencesService } from '../src/main/setup/device-preferences-service'
import { OnboardingService } from '../src/main/setup/onboarding-service'
import { initializeDesktopStartup } from '../src/main/setup/startup-initialization'
import { ONBOARDING_STEPS } from '../src/shared/onboarding/contracts'

const directory = await mkdtemp(join(tmpdir(), 'zyra-perf-startup-'))
const samples: Record<string, Array<{ wallMs: number; cpuMs: number }>> = { before: [], after: [] }
try {
    const now = '2026-01-01T00:00:00.000Z'
    await mkdir(join(directory, 'setup'))
    await writeFile(join(directory, 'setup/onboarding.json'), JSON.stringify({ schemaVersion: 1, flowVersion: 2, revision: 0, status: 'completed', currentStep: 'review', completedSteps: ONBOARDING_STEPS, reviewActive: false, startedAt: now, updatedAt: now, completedAt: now, data: { auth: { method: 'api-key', verifiedAt: now }, appearance: { appearanceThemeMode: 'dark', appearanceDarkTheme: 'vercel', appearanceUiFont: 'Inter', appearanceCodeFont: 'JetBrains Mono', accessibilityReduceMotion: false }, projects: { projectsFolder: directory } } }))
    // Every run creates cold service instances over the same synthetic files.
    for (let sample = -3; sample < 15; sample++) {
        for (const mode of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
            const preferences = new DevicePreferencesService(join(directory, 'setup/preferences.json'))
            const onboarding = new OnboardingService(join(directory, 'setup/onboarding.json'), preferences, {} as never)
            const analytics = createProductAnalytics({ storageDirectory: join(directory, 'analytics'), preferencePath: join(directory, 'consent.json'), requireExplicitPreference: true, source: 'desktop_main', appVersion: 'test', platform: process.platform, architecture: process.arch, env: { ZYRA_ANALYTICS_ENABLED: '0' } })
            let themeReady = false
            const input = {
                refreshTheme: async () => { await preferences.get({ surface: 'desktop' }); themeReady = true },
                initializeAnalytics: () => analytics.initialize(),
                initializeOnboarding: () => onboarding.initialize()
            }
            const cpuStart = process.cpuUsage()
            const start = performance.now()
            let result
            if (mode === 'before') {
                await input.refreshTheme(); await input.initializeAnalytics(); result = await input.initializeOnboarding()
            } else result = await initializeDesktopStartup(input)
            const wallMs = performance.now() - start
            const cpu = process.cpuUsage(cpuStart)
            assert.equal(themeReady, true)
            assert.equal(result?.accessAllowed, true)
            assert.equal(onboarding.isAccessAllowed(), true)
            if (sample >= 0) samples[mode]!.push({ wallMs, cpuMs: (cpu.user + cpu.system) / 1000 })
            await analytics.shutdown({ timeoutMs: 100 })
        }
    }
    // Delayed dependencies must still hold the mandatory gate, including failure.
    let releaseTheme!: () => void
    let releaseSetup!: () => void
    let returned = false
    const gate = initializeDesktopStartup({ refreshTheme: () => new Promise(resolve => { releaseTheme = resolve }), initializeAnalytics: async () => {}, initializeOnboarding: () => new Promise(resolve => { releaseSetup = () => resolve(null) }) }).then(value => { returned = true; return value })
    await Promise.resolve(); assert.equal(returned, false)
    releaseSetup(); await Promise.resolve(); assert.equal(returned, false)
    releaseTheme(); assert.equal(await gate, null)
    await assert.rejects(initializeDesktopStartup({ refreshTheme: async () => {}, initializeAnalytics: async () => { throw Error('failure') }, initializeOnboarding: async () => null }), /failure/)
    const report = { protocol: { samples: 15, warmups: 3, alternatingOrder: true, workload: 'Actual preferences, onboarding and disabled analytics; cold service instances, warm synthetic file cache. Startup gate only; no Electron window/provider.' }, samples, memory: process.memoryUsage(), resource: process.resourceUsage(), correctness: { themeGate: true, setupGate: true, completedSetup: true, failure: true } }
    const output = process.argv.indexOf('--output')
    if (output >= 0) await writeFile(resolve(process.argv[output + 1]!), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-perf-startup-')) throw Error('Unexpected cleanup path')
    await rm(directory, { recursive: true, force: true })
}

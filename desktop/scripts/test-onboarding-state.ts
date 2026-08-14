import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DevicePreferencesService } from '../src/main/setup/device-preferences-service'
import { OnboardingService } from '../src/main/setup/onboarding-service'
import { OpenAIConnectionService } from '../src/main/setup/openai-connection-service'

const root = await mkdtemp(join(tmpdir(), 'zyra-onboarding-test-'))
const onboardingPath = join(root, 'setup', 'onboarding.json')
const preferencesPath = join(root, 'setup', 'device-preferences.json')
let connected = true
let tick = Date.parse('2026-08-14T10:00:00.000Z')
const now = () => new Date(tick += 1_000)

async function verifyOpenAiConnectionContract() {
    let apiConfigured = false
    let verifiedApiKey: string | null = null
    let verificationCalls = 0
    const apiAuth = new OpenAIConnectionService({
        now,
        openExternal: () => undefined,
        loadAccount: async () => ({
            // A pre-existing subscription must not let an unverified API-key action pass.
            buildChatGptAccountStatus: async () => ({ provider: 'openai-codex', status: { configured: true }, usage: {} })
        }),
        loadSdk: async () => ({
            loginZyraAuth: async () => undefined,
            configureZyraOpenAIApiKey: async (key: string) => { apiConfigured = true; verifiedApiKey = key },
            verifyZyraOpenAIApiAuth: async () => { verificationCalls += 1; return { ok: true } },
            getZyraAuthStatus: async () => ({ provider: 'openai', status: { configured: apiConfigured } })
        })
    })
    const apiStatus = await apiAuth.connectApiKey('test-openai-key')
    assert.equal(verifiedApiKey, 'test-openai-key')
    assert.equal(verificationCalls, 1, 'API-key onboarding must execute Pi’s provider verification call')
    assert.equal(apiStatus.method, 'api-key')
    assert.equal(apiStatus.verified, true)

    let chatConnected = false
    let openedUrl: string | null = null
    const chatAuth = new OpenAIConnectionService({
        now,
        openExternal: (url) => { openedUrl = url },
        loadAccount: async () => ({
            buildChatGptAccountStatus: async () => chatConnected
                ? { provider: 'openai-codex', status: { configured: true }, usage: {} }
                : { provider: 'openai-codex', status: { configured: false } }
        }),
        loadSdk: async () => ({
            loginZyraAuth: async (_provider: string, options: Record<string, unknown>) => {
                const onAuth = options.onAuth as (info: { url: string }) => void
                onAuth({ url: 'https://auth.openai.test/' })
                chatConnected = true
            },
            configureZyraOpenAIApiKey: async () => undefined,
            verifyZyraOpenAIApiAuth: async () => ({ ok: true }),
            getZyraAuthStatus: async () => ({ provider: 'openai', status: { configured: false } })
        })
    })
    const chatStatus = await chatAuth.connectChatGpt()
    assert.equal(openedUrl, 'https://auth.openai.test/')
    assert.equal(chatStatus.method, 'chatgpt')
    assert.equal(chatStatus.verified, true)
}

function createAuth() {
    return new OpenAIConnectionService({
        now,
        openExternal: () => undefined,
        loadAccount: async () => ({
            buildChatGptAccountStatus: async () => connected
                ? { provider: 'openai-codex', status: { configured: true }, usage: {} }
                : { provider: 'openai-codex', status: { configured: false } }
        }),
        loadSdk: async () => ({
            loginZyraAuth: async () => undefined,
            configureZyraOpenAIApiKey: async () => undefined,
            verifyZyraOpenAIApiAuth: async () => ({ ok: true }),
            getZyraAuthStatus: async () => ({ provider: 'openai', status: { configured: false } })
        })
    })
}

try {
    await verifyOpenAiConnectionContract()
    const preferences = new DevicePreferencesService(preferencesPath, now)
    const service = new OnboardingService(onboardingPath, preferences, createAuth(), now)
    let snapshot = await service.initialize()
    assert.equal(snapshot.accessAllowed, false)
    assert.equal(snapshot.record?.currentStep, 'welcome')
    assert.equal(snapshot.record?.revision, 0)

    await assert.rejects(
        service.navigate({ expectedRevision: 0, step: 'appearance' }),
        /Complete setup steps in order/
    )

    snapshot = await service.commitStep({ expectedRevision: 0, step: 'welcome' })
    assert.equal(snapshot.record?.currentStep, 'connect-openai')
    assert.equal(snapshot.record?.revision, 1)
    const resumedCheckpoint = await new OnboardingService(onboardingPath, preferences, createAuth(), now).initialize()
    assert.equal(resumedCheckpoint.record?.currentStep, 'connect-openai', 'a restart must resume the exact committed checkpoint')
    assert.equal(resumedCheckpoint.record?.revision, 1)
    await assert.rejects(
        service.commitStep({ expectedRevision: 0, step: 'connect-openai' }),
        /expected revision 0, found 1/
    )

    snapshot = await service.commitStep({ expectedRevision: 1, step: 'connect-openai' })
    snapshot = await service.commitStep({
        expectedRevision: 2,
        step: 'appearance',
        selection: {
            appearanceThemeMode: 'system',
            appearanceDarkTheme: 'dark',
            appearanceUiFont: 'hanken',
            appearanceCodeFont: 'system-mono',
            accessibilityReduceMotion: false
        }
    })
    snapshot = await service.commitStep({
        expectedRevision: 3,
        step: 'web-access',
        selection: { webSearch: false, webFetch: true }
    })
    snapshot = await service.commitStep({
        expectedRevision: 4,
        step: 'projects',
        selection: { projectsFolder: 'C:/work/projects' }
    })
    assert.equal(snapshot.record?.currentStep, 'review')
    snapshot = await service.commitStep({ expectedRevision: 5, step: 'review' })
    assert.equal(snapshot.accessAllowed, true)
    assert.equal(snapshot.showOnboarding, false)
    assert.equal(snapshot.record?.status, 'completed')
    assert.equal(snapshot.record?.revision, 6)

    const stored = await readFile(onboardingPath, 'utf8')
    assert.equal(stored.includes('test-openai-key'), false, 'onboarding persistence must never contain a credential')
    assert.equal(stored.includes('webSearch'), true)
    assert.equal((await readdir(join(root, 'setup'))).some((name) => name.includes('.tmp-')), false, 'atomic temp files must be cleaned up')

    const webDefaults = await preferences.getNewChatWebDefaults()
    assert.deepEqual(webDefaults, { webSearch: false, webFetch: true })

    connected = false
    const restarted = new OnboardingService(onboardingPath, preferences, createAuth(), now)
    const remembered = await restarted.initialize()
    assert.equal(remembered.accessAllowed, true, 'later auth expiry must not invalidate completed onboarding')

    const review = await restarted.beginReview({ expectedRevision: 6 })
    assert.equal(review.accessAllowed, true, 'review mode must preserve completed access')
    assert.equal(review.showOnboarding, true)
    assert.equal(review.record?.reviewActive, true)
    const resumedReview = new OnboardingService(onboardingPath, preferences, createAuth(), now)
    assert.equal((await resumedReview.initialize()).record?.reviewActive, true, 'review progress must resume after close')
    const cancelled = await resumedReview.cancelReview({ expectedRevision: 7 })
    assert.equal(cancelled.showOnboarding, false)
    assert.equal(cancelled.record?.status, 'completed')

    await assert.rejects(
        resumedReview.beginReview({ expectedRevision: 8, invalidateCompletion: true }),
        /Explicit confirmation/
    )

    const corruptPath = join(root, 'setup', 'corrupt-onboarding.json')
    await writeFile(corruptPath, '{not json')
    const corruptService = new OnboardingService(corruptPath, preferences, createAuth(), now)
    const recovered = await corruptService.initialize()
    assert.equal(recovered.accessAllowed, false)
    assert.equal(recovered.recovery?.reason, 'corrupt')
    assert.ok(recovered.recovery?.backupPath, 'corrupt setup must be backed up instead of trusted')

    const futurePath = join(root, 'setup', 'future-onboarding.json')
    const futureContents = JSON.stringify({ schemaVersion: 99, revision: 42, status: 'completed' })
    await writeFile(futurePath, futureContents)
    const futureService = new OnboardingService(futurePath, preferences, createAuth(), now)
    const future = await futureService.initialize()
    assert.equal(future.blockedReason, 'future-schema')
    assert.equal(future.accessAllowed, false)
    assert.equal(await readFile(futurePath, 'utf8'), futureContents, 'future schema data must remain untouched')

    const futureFlowPath = join(root, 'setup', 'future-flow-onboarding.json')
    const futureFlowContents = JSON.stringify({ schemaVersion: 1, flowVersion: 7, revision: 2, status: 'in-progress' })
    await writeFile(futureFlowPath, futureFlowContents)
    const futureFlowService = new OnboardingService(futureFlowPath, preferences, createAuth(), now)
    assert.equal((await futureFlowService.initialize()).blockedReason, 'future-schema')
    assert.equal(await readFile(futureFlowPath, 'utf8'), futureFlowContents, 'future flow versions must remain untouched')

    const concurrentPath = join(root, 'setup', 'concurrent-onboarding.json')
    const concurrent = new OnboardingService(concurrentPath, preferences, createAuth(), now)
    await concurrent.initialize()
    await concurrent.commitStep({ expectedRevision: 0, step: 'welcome' })
    connected = true
    const concurrentResults = await Promise.allSettled([
        concurrent.commitStep({ expectedRevision: 1, step: 'connect-openai' }),
        concurrent.commitStep({ expectedRevision: 1, step: 'connect-openai' })
    ])
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1, 'serialized writes must reject a stale concurrent revision')
    assert.equal((await concurrent.getState()).record?.currentStep, 'appearance')

    console.log('onboarding state and persistence: ok')
} finally {
    await rm(root, { recursive: true, force: true })
}

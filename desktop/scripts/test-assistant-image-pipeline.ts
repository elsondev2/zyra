import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { prepareAssistantPromptImages } from '../src/main/assistant/prompt-images'
import { ZyraPiRuntime } from '../src/main/assistant/zyra-pi-runtime'
import {
    buildPromptImageInputs,
    buildPromptWithContextFiles
} from '../src/renderer/src/pages/assistant/assistant-composer-utils'
import type { ComposerContextFile } from '../src/renderer/src/pages/assistant/assistant-composer-types'

const tempDir = await mkdtemp(join(tmpdir(), 'zyra-image-pipeline-'))
try {
    const imagePath = join(tempDir, 'capture.png')
    const unsupportedPath = join(tempDir, 'not-an-image.txt')
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
    )
    await writeFile(imagePath, pngBytes)
    await writeFile(unsupportedPath, 'plain text')

    const contextFiles: ComposerContextFile[] = [
        {
            id: 'image-1',
            path: imagePath,
            name: 'capture.png',
            mimeType: 'image/png',
            kind: 'image',
            source: 'paste'
        },
        {
            id: 'doc-1',
            path: join(tempDir, 'notes.txt'),
            name: 'notes.txt',
            mimeType: 'text/plain',
            kind: 'doc',
            source: 'manual'
        }
    ]

    const imageInputs = buildPromptImageInputs(contextFiles)
    assert.deepEqual(imageInputs, [{ path: imagePath, name: 'capture.png', mimeType: 'image/png' }])

    const serializedPrompt = buildPromptWithContextFiles('Inspect the marked control.', contextFiles.slice(0, 1))
    assert.equal(serializedPrompt.includes(imagePath), false, 'private clipboard storage paths must stay out of chat text')
    assert.match(serializedPrompt, /ref: clipboard:\/\/capture\.png/)

    const prepared = await prepareAssistantPromptImages(imageInputs)
    assert.equal(prepared.length, 1)
    assert.equal(prepared[0]?.type, 'image')
    assert.equal(prepared[0]?.mimeType, 'image/png')
    assert.deepEqual(Buffer.from(prepared[0]?.data || '', 'base64'), pngBytes)

    const preparedFromClipboardReference = await prepareAssistantPromptImages(
        [{ path: 'clipboard://capture.png', name: 'Pasted image', mimeType: 'image/png' }],
        { resolveClipboardAttachment: async () => imagePath }
    )
    assert.deepEqual(preparedFromClipboardReference, prepared)

    const fakeRoot = join(tempDir, 'fake-root')
    const fakeSdkDir = join(fakeRoot, 'src')
    const bridgeCapturePath = join(tempDir, 'bridge-capture.json')
    await mkdir(fakeSdkDir, { recursive: true })
    await writeFile(join(fakeSdkDir, 'zyra-sdk.mjs'), `
import { writeFile } from 'node:fs/promises'
export async function createZyraSession() {
    return {
        session: {
            subscribe: () => () => {},
            sessionManager: { getSessionId: () => 'fake-provider-thread' },
            dispose: () => {}
        },
        managedBash: { subscribe: () => () => {}, abortAll: () => {} }
    }
}
export function describeRuntime() { return { sessionId: 'fake-provider-thread', model: 'fake/model', profile: 'default' } }
export async function setModel() {}
export function setThinking() {}
export async function setProfile() {}
export async function runZyraPrompt(_runtime, prompt, options) {
    await writeFile(process.env.ZYRA_IMAGE_CAPTURE_PATH, JSON.stringify({ prompt, images: options.images }))
}
export function getZyraModelThinkingLevels() { return [] }
export function getZyraAvailableModels() { return [] }
export async function listAvailableModels() { return [] }
export async function warmupZyraRuntime() { return { models: [] } }
`)

    const bridgeProcess = spawn('node', [fileURLToPath(new URL('../../src/zyra-ui-bridge.mjs', import.meta.url))], {
        cwd: fakeRoot,
        env: {
            ...process.env,
            ZYRA_ROOT: fakeRoot,
            ZYRA_CALLER_CWD: tempDir,
            ZYRA_IMAGE_CAPTURE_PATH: bridgeCapturePath
        },
        stdio: ['pipe', 'pipe', 'pipe']
    })
    const bridgeExited = new Promise<void>((resolve) => bridgeProcess.once('close', () => resolve()))
    const bridgeLines = createInterface({ input: bridgeProcess.stdout })
    const bridgeErrors: string[] = []
    bridgeProcess.stderr.setEncoding('utf8')
    bridgeProcess.stderr.on('data', (chunk) => bridgeErrors.push(String(chunk)))
    const bridgeResponses = new Map<number, (message: Record<string, unknown>) => void>()
    bridgeLines.on('line', (line) => {
        const message = JSON.parse(line) as Record<string, unknown>
        if (message['type'] !== 'response' || typeof message['id'] !== 'number') return
        bridgeResponses.get(message['id'])?.(message)
        bridgeResponses.delete(message['id'])
    })
    const requestBridge = async (id: number, type: string, payload: Record<string, unknown>) => {
        const response = new Promise<Record<string, unknown>>((resolve, reject) => {
            const timeout = setTimeout(() => {
                bridgeResponses.delete(id)
                reject(new Error(`Timed out waiting for bridge ${type}: ${bridgeErrors.join('')}`))
            }, 10_000)
            bridgeResponses.set(id, (message) => {
                clearTimeout(timeout)
                resolve(message)
            })
        })
        bridgeProcess.stdin.write(`${JSON.stringify({ id, type, payload })}\n`)
        return await response
    }
    const connectResponse = await requestBridge(1, 'connect', {
        cwd: tempDir,
        noSession: true,
        model: 'fake/model',
        profile: 'default',
        thinking: 'medium'
    })
    assert.equal(connectResponse['ok'], true)
    const promptResponse = await requestBridge(2, 'prompt', {
        prompt: 'Inspect the image.',
        model: 'fake/model',
        profile: 'default',
        thinking: 'medium',
        images: prepared
    })
    assert.equal(promptResponse['ok'], true)
    const bridgeCapture = JSON.parse(await readFile(bridgeCapturePath, 'utf8')) as Record<string, unknown>
    assert.equal(bridgeCapture['prompt'], 'Inspect the image.')
    assert.deepEqual(bridgeCapture['images'], prepared, 'the JSON-line bridge must deliver native images to runZyraPrompt')
    await requestBridge(3, 'dispose', {})
    await bridgeExited
    bridgeLines.close()

    await assert.rejects(
        () => prepareAssistantPromptImages([{ path: unsupportedPath, name: 'not-an-image.txt' }]),
        /not a supported PNG, JPEG, GIF, or WebP image/
    )
    await assert.rejects(
        () => prepareAssistantPromptImages([{ path: join(tempDir, 'missing.png'), name: 'missing.png' }]),
        /no longer available/
    )

    const runtime = new ZyraPiRuntime()
    const promptRequests: Array<Record<string, unknown>> = []
    const turnId = 'turn-with-image'
    const runtimeContext = {
        localThreadId: 'thread-with-image',
        providerThreadId: 'provider-with-image',
        resumeProviderThreadId: 'provider-with-image',
        worker: {
            request: async (type: string, payload: Record<string, unknown>) => {
                if (type === 'prompt') promptRequests.push(payload)
                return {}
            },
            isAlive: () => true
        },
        connected: true,
        connectPromise: null,
        cwd: tempDir,
        model: 'openai-codex/gpt-5.5',
        thinking: 'medium',
        runtimeMode: 'approval-required',
        interactionMode: 'default',
        profile: 'default',
        activeTurnId: turnId,
        assistantMessageSequence: 0,
        activeAssistantItemId: null,
        toolArgsByCallId: new Map<string, Record<string, unknown>>(),
        toolStartedAtByCallId: new Map<string, string>(),
        commandActivityIdByJobId: new Map<string, string>(),
        assistantTextByItemId: new Map<string, string>(),
        assistantCompletedItemIds: new Set<string>(),
        internalTextByItemId: new Map<string, string>(),
        internalCompletedItemIds: new Set<string>(),
        activeCompaction: null,
        lastAssistantItemId: null,
        lastUsage: null
    }
    const runtimeRunner = runtime as unknown as {
        runPromptTurn: (
            context: typeof runtimeContext,
            activeTurnId: string,
            prompt: string,
            options: { images: typeof prepared }
        ) => Promise<void>
    }
    await runtimeRunner.runPromptTurn(runtimeContext, turnId, 'Inspect the image.', { images: prepared })
    assert.equal(promptRequests.length, 1)
    assert.deepEqual(promptRequests[0]?.['images'], prepared, 'the desktop runtime must send prepared images to the Pi bridge')

    const bridgeSource = await readFile(new URL('../../src/zyra-ui-bridge.mjs', import.meta.url), 'utf8')
    assert.match(
        bridgeSource,
        /runZyraPrompt\(runtime, payload\.prompt, \{ images \}\)/,
        'the Pi bridge must forward native image content to the SDK'
    )

    const serviceSource = await readFile(new URL('../src/main/assistant/service-session-actions.ts', import.meta.url), 'utf8')
    const sendActionSource = serviceSource.slice(serviceSource.indexOf('export async function sendAssistantPromptAction'))
    assert.ok(
        sendActionSource.indexOf('prepareAssistantPromptImages(options?.images)')
            < sendActionSource.indexOf('createAssistantUserMessage(input'),
        'image validation must happen before the user message is recorded'
    )

    console.log('Assistant native image pipeline: ok')
} finally {
    await rm(tempDir, { recursive: true, force: true })
}

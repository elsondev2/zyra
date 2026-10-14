import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const noop = () => {}
mock.module('electron-log', () => ({ default: { info: noop, warn: noop, error: noop, debug: noop } }))
mock.module('electron', () => ({
    app: { getPath: () => tmpdir(), on: noop, isReady: () => true },
    BrowserWindow: class {
        static getAllWindows() {
            return []
        }
    },
    ipcMain: {},
    shell: {},
}))
mock.module('../src/main/utils', () => ({ is: { dev: false } }))
const { respondAssistantUserInputAction } = await import('../src/main/assistant/service-session-actions')
const directory = await mkdtemp(join(tmpdir(), 'zyra-question-images-'))
try {
    const bytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=',
        'base64',
    )
    const path = join(directory, 'evidence.png')
    await writeFile(path, bytes)
    const question = {
        id: 'answer',
        header: 'Choice',
        question: 'Choose or explain',
        type: 'single_select',
        options: [{ label: 'A', description: '' }],
        allowOther: true,
        required: true,
    }
    const thread: any = {
        id: 'thread',
        providerThreadId: 'canonical',
        model: 'fixture/model',
        cwd: directory,
        state: 'ready',
        runtimeMode: 'full-access',
        interactionMode: 'default',
        pendingUserInputs: [{ requestId: 'request', status: 'pending', questions: [question] }],
    }
    const session: any = {
        id: 'session',
        title: 'Existing session',
        activeThreadId: thread.id,
        threads: [thread],
    }
    const snapshot: any = { selectedSessionId: session.id, sessions: [session] }
    const events: any[] = []
    const prompts: any[] = []
    let resolved = 0
    const deps: any = {
        ensureReady: async () => {},
        getSnapshot: () => snapshot,
        getSessionRuntimeCwd: () => directory,
        getFirstUserMessageText: async () => 'Earlier message',
        appendEvent: (...args: any[]) => events.push(args),
        runtime: {
            hasSession: () => true,
            ensurePromptAvailable: async () => {},
            respondUserInput: async () => {
                resolved++
                return {}
            },
            sendPrompt: async (id: string, prompt: string, options: any) => {
                prompts.push({ id, prompt, options })
                return { turnId: options.turnId }
            },
        },
    }
    await respondAssistantUserInputAction(deps, {
        requestId: 'request',
        answers: { answer: 'My own explanation' },
        contextText: 'Supporting files for these answers:\nExact supporting text.',
        images: [{ path, name: 'evidence.png' }],
    })
    assert.equal(resolved, 1)
    assert.equal(prompts.length, 1)
    assert.match(prompts[0].prompt, /My own explanation/)
    assert.match(prompts[0].prompt, /Exact supporting text\./)
    assert.equal(prompts[0].options.images[0].mimeType, 'image/png')
    assert.equal(prompts[0].options.images[0].data, bytes.toString('base64'))
    assert.equal(
        events.filter((e) => e[0] === 'thread.message.user').length,
        1,
        'one linked question response, not another unrelated user message',
    )
    const previous = resolved
    await assert.rejects(
        respondAssistantUserInputAction(deps, {
            requestId: 'request',
            answers: { answer: 'A' },
            contextText: 'x'.repeat(256001),
        }),
        /too large/,
    )
    await assert.rejects(
        respondAssistantUserInputAction(deps, {
            requestId: 'request',
            answers: { answer: 'A' },
            images: [{ path: 'not-an-absolute-path.png' }],
        }),
        /absolute/,
    )
    assert.equal(resolved, previous, 'invalid evidence is rejected before resolving the pending question')
    console.log(
        'Question evidence reaches the canonical prompt as full text and prepared images; invalid input leaves the question pending: ok',
    )
} finally {
    await rm(directory, { recursive: true, force: true })
}

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import readline from 'node:readline'
import log from 'electron-log'
import type { AssistantReasoningEffort, AssistantThread } from '../../shared/assistant/contracts'
import { checkCodexAvailability } from '../assistant/codex-app-server-support'
import { handleStdoutLine } from '../assistant/codex-runtime-events'
import {
    asRecord,
    asString,
    buildTurnParams,
    killChildTree,
    type SessionContext
} from '../assistant/codex-runtime-protocol'
import { recordAiDebugLog, serializeForAiLog } from './ai-debug-log'
import { isLowQualityCommitMessage, sanitizeCommitMessage } from './commit-message-quality'

const CODEX_TIMEOUT_MS = 45_000
const CODEX_CONNECT_TIMEOUT_MS = 15_000
const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex'

function createEphemeralThread(cwd: string, model?: string): AssistantThread {
    const now = new Date().toISOString()
    return {
        id: `codex-ephemeral-${randomUUID()}`,
        providerThreadId: null,
        source: 'root',
        parentThreadId: null,
        providerParentThreadId: null,
        subagentDepth: null,
        agentNickname: null,
        agentRole: null,
        model: String(model || '').trim(),
        cwd,
        messageCount: 0,
        lastSeenCompletedTurnId: null,
        runtimeMode: 'full-access',
        interactionMode: 'default',
        state: 'starting',
        lastError: null,
        createdAt: now,
        updatedAt: now,
        latestTurn: null,
        activePlan: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        pendingApprovals: [],
        pendingUserInputs: []
    }
}

function createContext(cwd: string, model?: string): { context: SessionContext; child: ReturnType<typeof spawn>; output: readline.Interface } {
    const child = spawn(CODEX_BINARY, ['app-server'], {
        cwd,
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
    })
    const output = readline.createInterface({ input: child.stdout })
    const context: SessionContext = {
        child,
        output,
        pending: new Map(),
        pendingApprovals: new Map(),
        pendingUserInputs: new Map(),
        fileChangeRevisionByItemId: new Map(),
        nextRequestId: 1,
        stopping: false,
        thread: createEphemeralThread(cwd, model)
    }
    return { context, child, output }
}

async function pingCodexAppServer(cwd?: string, model?: string): Promise<{ success: boolean; error?: string }> {
    const availability = await checkCodexAvailability(CODEX_BINARY)
    if (!availability.available) {
        return { success: false, error: availability.reason || 'Codex CLI is unavailable.' }
    }

    const normalizedCwd = String(cwd || process.cwd()).trim() || process.cwd()
    const { context, child, output } = createContext(normalizedCwd, model)

    output.on('line', (line) => {
        handleStdoutLine(context, line, {
            emitRuntime: () => undefined,
            writeMessage: (targetContext, message) => writeMessage(targetContext, message),
            registerThreadAlias: () => undefined
        })
    })

    try {
        await sendRequest(context, 'initialize', {
            clientInfo: {
                name: 'cara_agent',
                title: "Zyra",
                version: '0.1.0'
            },
            capabilities: {
                experimentalApi: true
            }
        }, CODEX_CONNECT_TIMEOUT_MS)
        writeMessage(context, { method: 'initialized' })
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err?.message || 'Codex app-server ping failed.' }
    } finally {
        context.stopping = true
        for (const pending of context.pending.values()) {
            clearTimeout(pending.timer)
        }
        context.pending.clear()
        output.close()
        if (!child.killed) {
            killChildTree(child)
        }
    }
}

function writeMessage(context: SessionContext, message: Record<string, unknown>): void {
    if (!context.child.stdin.writable) {
        throw new Error('Cannot write to codex app-server stdin.')
    }
    context.child.stdin.write(`${JSON.stringify(message)}\n`)
}

async function sendRequest<T>(context: SessionContext, method: string, params: Record<string, unknown>, timeoutMs = CODEX_TIMEOUT_MS): Promise<T> {
    const id = context.nextRequestId++
    const result = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
            context.pending.delete(String(id))
            reject(new Error(`Timed out waiting for ${method}.`))
        }, timeoutMs)
        context.pending.set(String(id), { method, timer, resolve, reject })
        writeMessage(context, { id, method, params })
    })
    return result as T
}

async function withCodexSession<T>(options: {
    cwd?: string
    model?: string
    run: (context: SessionContext) => Promise<T>
}): Promise<T> {
    const cwd = String(options.cwd || process.cwd()).trim() || process.cwd()
    const availability = await checkCodexAvailability(CODEX_BINARY)
    if (!availability.available) {
        throw new Error(availability.reason || 'Codex CLI is unavailable.')
    }

    const { context, child, output } = createContext(cwd, options.model)

    output.on('line', (line) => {
        handleStdoutLine(context, line, {
            emitRuntime: () => undefined,
            writeMessage: (targetContext, message) => writeMessage(targetContext, message),
            registerThreadAlias: () => undefined
        })
    })

    try {
        await sendRequest(context, 'initialize', {
            clientInfo: {
                name: 'cara_agent',
                title: "Zyra",
                version: '0.1.0'
            },
            capabilities: {
                experimentalApi: true
            }
        }, CODEX_CONNECT_TIMEOUT_MS)
        writeMessage(context, { method: 'initialized' })

        const sessionOverrides = {
            cwd,
            model: String(options.model || '').trim() || undefined,
            approvalPolicy: 'never',
            sandbox: 'danger-full-access'
        }

        const threadResponse = await sendRequest<Record<string, unknown>>(context, 'thread/start', sessionOverrides, CODEX_CONNECT_TIMEOUT_MS)
        const providerThreadId = asString(asRecord(threadResponse?.['thread'])?.['id']) || asString(threadResponse?.['threadId'])
        if (!providerThreadId) {
            throw new Error('Codex thread start did not return a thread id.')
        }
        context.thread.providerThreadId = providerThreadId
        context.thread.model = String(options.model || '').trim()

        return await options.run(context)
    } finally {
        context.stopping = true
        for (const pending of context.pending.values()) {
            clearTimeout(pending.timer)
        }
        context.pending.clear()
        output.close()
        if (!child.killed) {
            killChildTree(child)
        }
    }
}

export async function generateCodexText(prompt: string, options?: {
    cwd?: string
    model?: string
    timeoutMs?: number
    effort?: AssistantReasoningEffort
    serviceTier?: 'fast'
}): Promise<{ success: boolean; text?: string; model?: string; error?: string }> {
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedPrompt) {
        return { success: false, error: 'Prompt is required.' }
    }

    const effectiveModel = String(options?.model || '').trim() || undefined
    try {
        const result = await withCodexSession({
            cwd: options?.cwd,
            model: effectiveModel,
            run: async (context) => {
                let assistantText = ''
                const completedTexts: string[] = []
                let activeTurnId: string | null = null

                const completion = new Promise<void>((resolve, reject) => {
                    const lineHandler = (line: string) => {
                        handleStdoutLine(context, line, {
                            emitRuntime: (event) => {
                                if (event.type === 'approval.requested') {
                                    reject(new Error('Codex requested approval while generating text. Retry with a simpler prompt or different model.'))
                                    return
                                }
                                if (event.type === 'user-input.requested') {
                                    reject(new Error('Codex requested interactive input while generating text. Retry with a simpler prompt or different model.'))
                                    return
                                }
                                if (event.type === 'content.delta' && event.payload.streamKind === 'assistant_text') {
                                    if (!activeTurnId || !event.turnId || event.turnId === activeTurnId) {
                                        assistantText += event.payload.delta
                                    }
                                    return
                                }
                                if (event.type === 'content.completed' && event.payload.streamKind === 'assistant_text') {
                                    const text = String(event.payload.text || '').trim()
                                    if (text) {
                                        completedTexts.push(text)
                                    }
                                    return
                                }
                                if (event.type === 'turn.completed') {
                                    if (activeTurnId && event.turnId && event.turnId !== activeTurnId) {
                                        return
                                    }
                                    if (event.payload.outcome === 'completed') {
                                        resolve()
                                    } else {
                                        reject(new Error(event.payload.errorMessage || `Codex turn ${event.payload.outcome}.`))
                                    }
                                }
                            },
                            writeMessage: (targetContext, message) => writeMessage(targetContext, message),
                            registerThreadAlias: () => undefined
                        })
                    }

                    context.output.off('line', lineHandler)
                    context.output.on('line', lineHandler)
                })

                const response = await sendRequest<Record<string, unknown>>(
                    context,
                    'turn/start',
                    buildTurnParams(
                        context.thread,
                        normalizedPrompt,
                        effectiveModel,
                        'full-access',
                        'default',
                        options?.effort || 'medium',
                        options?.serviceTier
                    ),
                    options?.timeoutMs || CODEX_TIMEOUT_MS
                )
                activeTurnId = asString(asRecord(response?.['turn'])?.['id']) || asString(response?.['turnId']) || null
                if (!activeTurnId) {
                    throw new Error('Codex turn start did not return a turn id.')
                }

                await completion
                const text = assistantText.trim() || completedTexts.join('\n\n').trim()
                if (!text) {
                    throw new Error('Codex returned an empty response.')
                }
                return text
            }
        })

        return {
            success: true,
            text: result,
            ...(effectiveModel ? { model: effectiveModel } : {})
        }
    } catch (err: any) {
        log.error('[Codex] Failed to generate text:', err)
        return { success: false, error: err?.message || 'Failed to generate text.' }
    }
}

export async function testCodexConnection(model?: string): Promise<{ success: boolean; error?: string }> {
    const result = await pingCodexAppServer(process.cwd(), model)

    if (!result.success) {
        recordAiDebugLog({
            provider: 'codex',
            action: 'testConnection',
            status: 'error',
            model,
            error: result.error || 'Codex app-server ping failed.'
        })
        return { success: false, error: result.error || 'Codex app-server ping failed.' }
    }

    recordAiDebugLog({
        provider: 'codex',
        action: 'testConnection',
        status: 'success',
        model,
        finalMessage: 'Codex app-server ping succeeded.'
    })
    return { success: true }
}

export async function generateCodexCommitMessage(
    diff: string,
    model?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!diff || diff.trim().length === 0 || diff === 'No changes') {
        return { success: false, error: 'No changes to commit' }
    }

    const maxDiffLength = 12000
    const truncatedDiff = diff.length > maxDiffLength
        ? `${diff.slice(0, maxDiffLength)}\n\n... (diff truncated)`
        : diff

    const prompt = `You are an expert software engineer writing git commit messages for long-term project history.
Follow these rules:
1. Use conventional commit format: type(scope): description
   Types: feat, fix, docs, style, refactor, test, chore, perf
2. First line (title): max 72 characters, imperative mood
3. Add a blank line after the title
4. Add 3-5 bullet points, each starting with "- "
5. Bullets must clearly cover:
   - Core code changes
   - Behavior or developer impact
   - Important implementation details or constraints
6. Keep bullets concise, specific, and grounded in the diff only
7. Do not invent details, tickets, benchmarks, or files not shown
8. Only output the commit message, nothing else

Generate a commit message for this diff.
Prioritize clarity and accuracy over verbosity.

\`\`\`diff
${truncatedDiff}
\`\`\`

Commit message:`

    try {
        const initial = await generateCodexText(prompt, {
            model
        })
        if (!initial.success || !initial.text) {
            recordAiDebugLog({
                provider: 'codex',
                action: 'generateCommitMessage',
                status: 'error',
                model,
                error: initial.error || 'No response from Codex',
                promptPreview: prompt,
                requestPayload: serializeForAiLog({ model, diffLength: diff.length }),
                rawResponse: serializeForAiLog(initial)
            })
            return { success: false, error: initial.error || 'No response from Codex' }
        }

        let message = sanitizeCommitMessage(initial.text)
        const initialCandidate = message

        if (isLowQualityCommitMessage(message)) {
            const failureMessage = 'Codex returned an incomplete or low-quality commit message. Please retry.'
            recordAiDebugLog({
                provider: 'codex',
                action: 'generateCommitMessage',
                status: 'error',
                model,
                error: failureMessage,
                promptPreview: prompt,
                requestPayload: serializeForAiLog({ model, diffLength: diff.length }),
                rawResponse: serializeForAiLog({ initialText: initial.text }),
                candidateMessage: initialCandidate,
                finalMessage: message,
                metadata: {
                    diffLength: diff.length,
                    truncatedDiffLength: truncatedDiff.length,
                    lowQualityInitialCandidate: isLowQualityCommitMessage(initialCandidate)
                }
            })
            return { success: false, error: failureMessage }
        }

        recordAiDebugLog({
            provider: 'codex',
            action: 'generateCommitMessage',
            status: 'success',
            model,
            promptPreview: prompt,
            requestPayload: serializeForAiLog({ model, diffLength: diff.length }),
            rawResponse: serializeForAiLog({ initialText: initial.text }),
            candidateMessage: initialCandidate,
            finalMessage: message,
            metadata: {
                diffLength: diff.length,
                truncatedDiffLength: truncatedDiff.length,
                lowQualityInitialCandidate: isLowQualityCommitMessage(initialCandidate)
            }
        })

        return { success: true, message }
    } catch (err: any) {
        recordAiDebugLog({
            provider: 'codex',
            action: 'generateCommitMessage',
            status: 'error',
            model,
            error: err?.message || 'Failed to generate message',
            metadata: {
                diffLength: diff.length
            }
        })
        log.error('[Codex] Generate commit message failed:', err)
        return { success: false, error: err?.message || 'Failed to generate message' }
    }
}

import log from 'electron-log'
import type { AssistantReasoningEffort } from '../../shared/assistant/contracts'
import { getAssistantService } from '../assistant'
import { recordAiDebugLog, serializeForAiLog } from './ai-debug-log'
import { isLowQualityCommitMessage, sanitizeCommitMessage } from './commit-message-quality'

const CHATGPT_TEXT_TIMEOUT_MS = 45_000

/**
 * Backward-compatible internal name for the Git provider. Generation is routed
 * through the agent-server utility worker and never creates a canonical chat.
 */
export async function generateChatGptText(prompt: string, options?: {
    cwd?: string
    model?: string
    timeoutMs?: number
    effort?: AssistantReasoningEffort
    serviceTier?: 'fast'
}): Promise<{ success: boolean; text?: string; model?: string; error?: string }> {
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedPrompt) return { success: false, error: 'Prompt is required.' }

    try {
        return await getAssistantService().generateUtilityText(normalizedPrompt, {
            cwd: options?.cwd,
            model: String(options?.model || '').trim() || undefined,
            effort: options?.effort || 'medium',
            timeoutMs: options?.timeoutMs || CHATGPT_TEXT_TIMEOUT_MS
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'ChatGPT text generation failed.'
        log.error('[ChatGPT] Failed to generate Git text:', message)
        return { success: false, error: message }
    }
}

export async function testChatGptConnection(model?: string): Promise<{ success: boolean; error?: string }> {
    const result = await getAssistantService().testChatGptUtilityConnection(model)
    if (!result.success) {
        recordAiDebugLog({
            provider: 'codex',
            action: 'testConnection',
            status: 'error',
            model,
            error: result.error || 'ChatGPT could not be verified through Pi.'
        })
        return { success: false, error: result.error || 'ChatGPT could not be verified through Pi.' }
    }

    recordAiDebugLog({
        provider: 'codex',
        action: 'testConnection',
        status: 'success',
        model: result.model || model,
        finalMessage: 'Zyra verified ChatGPT auth and models through Pi without making a paid request.'
    })
    return { success: true }
}

export async function generateChatGptCommitMessage(
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
        const initial = await generateChatGptText(prompt, { model })
        if (!initial.success || !initial.text) {
            recordAiDebugLog({
                provider: 'codex',
                action: 'generateCommitMessage',
                status: 'error',
                model,
                error: initial.error || 'No response from ChatGPT',
                promptPreview: prompt,
                requestPayload: serializeForAiLog({ model, diffLength: diff.length }),
                rawResponse: serializeForAiLog(initial)
            })
            return { success: false, error: initial.error || 'No response from ChatGPT' }
        }

        const message = sanitizeCommitMessage(initial.text)
        const initialCandidate = message
        if (isLowQualityCommitMessage(message)) {
            const failureMessage = 'ChatGPT returned an incomplete or low-quality commit message. Please retry.'
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
                    lowQualityInitialCandidate: true
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
                lowQualityInitialCandidate: false
            }
        })
        return { success: true, message }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate message'
        recordAiDebugLog({
            provider: 'codex',
            action: 'generateCommitMessage',
            status: 'error',
            model,
            error: message,
            metadata: { diffLength: diff.length }
        })
        log.error('[ChatGPT] Generate commit message failed:', message)
        return { success: false, error: message }
    }
}

/**
 * Zyra - Groq AI Integration
 * Uses Groq API for fast LLM inference
 */

import log from 'electron-log'
import { recordAiDebugLog, serializeForAiLog } from './ai-debug-log'
import { sanitizeCommitMessage, isLowQualityCommitMessage } from './commit-message-quality'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant' // Fast and free tier

interface GroqResponse {
    choices?: Array<{
        finish_reason?: string
        message?: {
            content?: string
        }
    }>
    error?: {
        message?: string
    }
}

type GroqRequestPayload = {
    model: string
    messages: Array<{ role: 'system' | 'user'; content: string }>
    max_tokens: number
    temperature: number
}

async function requestGroq(
    apiKey: string,
    payload: GroqRequestPayload
): Promise<{
    success: boolean
    text?: string
    error?: string
    status?: number
    rawResponse?: unknown
    finishReason?: string
}> {
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })

    const data = await response.json().catch(() => ({})) as GroqResponse
    if (!response.ok) {
        return {
            success: false,
            status: response.status,
            error: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
            rawResponse: data
        }
    }

    const choice = data.choices?.[0]
    const text = choice?.message?.content?.trim()
    if (!text) {
        return {
            success: false,
            error: 'Unexpected API response',
            rawResponse: data,
            finishReason: choice?.finish_reason
        }
    }

    return {
        success: true,
        text,
        rawResponse: data,
        finishReason: choice?.finish_reason
    }
}

/**
 * Test the Groq API connection with a simple request
 */
export async function testGroqConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await requestGroq(apiKey, {
            model: MODEL,
            messages: [{ role: 'user', content: 'Say "Connection successful" in exactly 2 words.' }],
            max_tokens: 10,
            temperature: 0
        })
        if (result.success) {
            return { success: true }
        }

        return { success: false, error: result.error || 'Unexpected API response' }
    } catch (err: any) {
        log.error('[Groq] Connection test failed:', err)
        return { success: false, error: err.message || 'Connection failed' }
    }
}

/**
 * Generate a commit message from a git diff
 */
export async function generateCommitMessage(
    apiKey: string,
    diff: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!diff || diff.trim().length === 0) {
        return { success: false, error: 'No changes to commit' }
    }

    const maxDiffLength = 12000
    const truncatedDiff = diff.length > maxDiffLength
        ? diff.slice(0, maxDiffLength) + '\n\n... (diff truncated)'
        : diff

    const systemPrompt = `You are an expert software engineer writing git commit messages for long-term project history.
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

Example format:
feat(auth): add user login functionality

- Implement JWT-based authentication flow
- Add login form with email/password validation
- Create auth context for session management
- Add protected route wrapper component`

    const userPrompt = `Generate a commit message for this diff.
Prioritize clarity and accuracy over verbosity.

\`\`\`diff
${truncatedDiff}
\`\`\`

Commit message:`
    const strictRetryPrompt = `Regenerate the commit message from this diff.
The previous draft was too vague or incomplete.

Rules:
1. Use conventional commit format: type(scope): description
2. Keep title imperative and max 72 chars
3. Add exactly 3-5 bullet points, each starting with "- "
4. Each bullet must be specific and complete (no vague bullets like "Update")
5. Include concrete details present in the diff (tools, dependencies, behavior)
6. Output only the commit message

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`
`

    try {
        log.info('[Groq] Generating commit message...')

        const requestPayload: GroqRequestPayload = {
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 900,
            temperature: 0.15
        }
        const strictRetryPayload: GroqRequestPayload = {
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: strictRetryPrompt }
            ],
            max_tokens: 1100,
            temperature: 0.1
        }

        let result = await requestGroq(apiKey, requestPayload)
        if (!result.success || !result.text) {
            recordAiDebugLog({
                provider: 'groq',
                action: 'generateCommitMessage',
                status: 'error',
                model: MODEL,
                error: result.error || 'No response from AI',
                promptPreview: userPrompt,
                requestPayload: serializeForAiLog(requestPayload),
                rawResponse: serializeForAiLog(result.rawResponse),
                metadata: {
                    diffLength: diff.length,
                    truncatedDiffLength: truncatedDiff.length,
                    usedRetryPrompt: false,
                    initialFinishReason: result.finishReason || 'unknown'
                }
            })
            return { success: false, error: result.error || 'No response from AI' }
        }

        let message = sanitizeCommitMessage(result.text)
        if (!message) {
            return { success: false, error: 'No response from AI' }
        }

        const initialCandidate = message
        const initialFinishReason = result.finishReason
        let loggedRawResponse: unknown = result.rawResponse
        let usedRetryPrompt = false
        let retriedCandidate: string | undefined
        let retryFinishReason: string | undefined

        if (isLowQualityCommitMessage(message)) {
            usedRetryPrompt = true
            const strictRetry = await requestGroq(apiKey, strictRetryPayload)
            if (strictRetry.success && strictRetry.text) {
                const retriedMessage = sanitizeCommitMessage(strictRetry.text)
                retriedCandidate = retriedMessage
                retryFinishReason = strictRetry.finishReason
                if (!isLowQualityCommitMessage(retriedMessage)) {
                    message = retriedMessage
                    loggedRawResponse = strictRetry.rawResponse
                }
            }
        }

        if (isLowQualityCommitMessage(message)) {
            const failureMessage = 'AI response was incomplete or too vague. Please retry.'
            recordAiDebugLog({
                provider: 'groq',
                action: 'generateCommitMessage',
                status: 'error',
                model: MODEL,
                error: failureMessage,
                promptPreview: usedRetryPrompt ? strictRetryPrompt : userPrompt,
                requestPayload: serializeForAiLog(usedRetryPrompt ? strictRetryPayload : requestPayload),
                rawResponse: serializeForAiLog(loggedRawResponse),
                candidateMessage: retriedCandidate || initialCandidate,
                finalMessage: message,
                metadata: {
                    diffLength: diff.length,
                    truncatedDiffLength: truncatedDiff.length,
                    usedRetryPrompt,
                    lowQualityInitialCandidate: isLowQualityCommitMessage(initialCandidate),
                    initialFinishReason: initialFinishReason || 'unknown',
                    retryFinishReason: retryFinishReason || 'none'
                }
            })
            return { success: false, error: failureMessage }
        }

        recordAiDebugLog({
            provider: 'groq',
            action: 'generateCommitMessage',
            status: 'success',
            model: MODEL,
            promptPreview: usedRetryPrompt ? strictRetryPrompt : userPrompt,
            requestPayload: serializeForAiLog(usedRetryPrompt ? strictRetryPayload : requestPayload),
            rawResponse: serializeForAiLog(loggedRawResponse),
            candidateMessage: retriedCandidate || initialCandidate,
            finalMessage: message,
            metadata: {
                diffLength: diff.length,
                truncatedDiffLength: truncatedDiff.length,
                usedRetryPrompt,
                lowQualityInitialCandidate: isLowQualityCommitMessage(initialCandidate),
                initialFinishReason: initialFinishReason || 'unknown',
                retryFinishReason: retryFinishReason || 'none'
            }
        })

        log.info('[Groq] Generated commit message:', message)
        return { success: true, message }
    } catch (err: any) {
        recordAiDebugLog({
            provider: 'groq',
            action: 'generateCommitMessage',
            status: 'error',
            model: MODEL,
            error: err.message || 'Failed to generate message',
            metadata: {
                diffLength: diff.length
            }
        })
        log.error('[Groq] Generate commit message failed:', err)
        return { success: false, error: err.message || 'Failed to generate message' }
    }
}

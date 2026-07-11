/**
 * Zyra - Gemini AI Integration
 * Uses Google Gemini API for commit message generation
 */

import log from 'electron-log'
import { recordAiDebugLog, serializeForAiLog } from './ai-debug-log'
import { sanitizeCommitMessage, isLowQualityCommitMessage } from './commit-message-quality'
import {
    buildCommitPrompt,
    buildCompactDiffContext,
    buildFallbackPrompt,
    buildLocalFallbackCommitMessage,
    buildStrictRetryPrompt
} from './gemini/context'
import { resolveTruncationFallbackModel, shouldRetryWithRefreshedModel } from './gemini/model-selection'
import { requestGenerateContent } from './gemini/request'

export async function testGeminiConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: 'Reply with exactly: Connection successful' }]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 16
            }
        }

        let result = await requestGenerateContent(apiKey, requestBody)
        if (!result.success && result.error && shouldRetryWithRefreshedModel(result.status || 0, result.error)) {
            result = await requestGenerateContent(apiKey, requestBody, { forceModelRefresh: true })
        }

        if (!result.success) {
            return { success: false, error: result.error || 'Connection failed' }
        }

        return { success: true }
    } catch (err: any) {
        log.error('[Gemini] Connection test failed:', err)
        return { success: false, error: err.message || 'Connection failed' }
    }
}

export async function generateGeminiCommitMessage(
    apiKey: string,
    diff: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!diff || diff.trim().length === 0 || diff === 'No changes') {
        return { success: false, error: 'No changes to commit' }
    }

    const maxDiffLength = 7000
    const truncatedDiff = diff.length > maxDiffLength
        ? `${diff.slice(0, maxDiffLength)}\n\n... (diff truncated)`
        : diff
    const compactDiff = buildCompactDiffContext(truncatedDiff)
    const prompt = buildCommitPrompt(truncatedDiff)
    const strictRetryPrompt = buildStrictRetryPrompt(compactDiff)

    try {
        log.info('[Gemini] Generating commit message...')

        const requestBody = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.15,
                maxOutputTokens: 900,
                thinkingConfig: { thinkingBudget: 0 }
            }
        }
        const strictRetryBody = {
            contents: [{ role: 'user', parts: [{ text: strictRetryPrompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1100,
                thinkingConfig: { thinkingBudget: 0 }
            }
        }

        let result = await requestGenerateContent(apiKey, requestBody)
        if (!result.success && result.error && shouldRetryWithRefreshedModel(result.status || 0, result.error)) {
            result = await requestGenerateContent(apiKey, requestBody, { forceModelRefresh: true })
        }

        if (!result.success || !result.text) {
            recordAiDebugLog({
                provider: 'gemini',
                action: 'generateCommitMessage',
                status: 'error',
                model: result.modelName,
                error: result.error || 'No response from AI',
                promptPreview: prompt,
                requestPayload: serializeForAiLog(requestBody),
                rawResponse: serializeForAiLog(result.rawResponse),
                metadata: {
                    diffLength: diff.length,
                    truncatedDiffLength: truncatedDiff.length,
                    compactDiffLength: compactDiff.length,
                    usedRetryPrompt: false
                }
            })
            return { success: false, error: result.error || 'No response from AI' }
        }

        let message = sanitizeCommitMessage(result.text)
        if (!message) {
            recordAiDebugLog({
                provider: 'gemini',
                action: 'generateCommitMessage',
                status: 'error',
                model: result.modelName,
                error: 'No response from AI',
                promptPreview: prompt,
                requestPayload: serializeForAiLog(requestBody),
                rawResponse: serializeForAiLog(result.rawResponse),
                candidateMessage: result.text,
                metadata: {
                    diffLength: diff.length,
                    truncatedDiffLength: truncatedDiff.length,
                    compactDiffLength: compactDiff.length,
                    usedRetryPrompt: false
                }
            })
            return { success: false, error: 'No response from AI' }
        }

        const initialCandidate = message
        let loggedRawResponse: unknown = result.rawResponse
        let loggedModel = result.modelName
        const initialFinishReason = result.finishReason
        let retriedCandidate: string | undefined
        let retryFinishReason: string | undefined
        let usedRetryPrompt = false
        let localFallbackUsed = false

        if (isLowQualityCommitMessage(message)) {
            log.warn('[Gemini] Low-quality commit message detected, retrying with strict prompt')
            usedRetryPrompt = true
            let strictRetry = await requestGenerateContent(apiKey, strictRetryBody, { forceModelRefresh: true })
            if (!strictRetry.success && strictRetry.error && shouldRetryWithRefreshedModel(strictRetry.status || 0, strictRetry.error)) {
                strictRetry = await requestGenerateContent(apiKey, strictRetryBody, { forceModelRefresh: true })
            }

            if (strictRetry.success && strictRetry.text) {
                const retriedMessage = sanitizeCommitMessage(strictRetry.text)
                retriedCandidate = retriedMessage
                retryFinishReason = strictRetry.finishReason
                if (!isLowQualityCommitMessage(retriedMessage)) {
                    message = retriedMessage
                    loggedRawResponse = strictRetry.rawResponse
                    loggedModel = strictRetry.modelName || loggedModel
                }
            }
        }

        let fallbackModel: string | null = null
        let fallbackFinishReason: string | undefined
        if (
            isLowQualityCommitMessage(message)
            && (initialFinishReason === 'MAX_TOKENS' || retryFinishReason === 'MAX_TOKENS')
        ) {
            fallbackModel = await resolveTruncationFallbackModel(apiKey, loggedModel)
            if (fallbackModel) {
                const fallbackPrompt = buildFallbackPrompt(compactDiff)
                const fallbackBody = {
                    contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 900,
                        thinkingConfig: { thinkingBudget: 0 }
                    }
                }

                let fallbackResult = await requestGenerateContent(apiKey, fallbackBody, {
                    preferredModel: fallbackModel,
                    forceModelRefresh: true
                })
                if (!fallbackResult.success && fallbackResult.error && shouldRetryWithRefreshedModel(fallbackResult.status || 0, fallbackResult.error)) {
                    fallbackResult = await requestGenerateContent(apiKey, fallbackBody, {
                        preferredModel: fallbackModel,
                        forceModelRefresh: true
                    })
                }

                fallbackFinishReason = fallbackResult.finishReason
                if (fallbackResult.success && fallbackResult.text) {
                    const fallbackMessage = sanitizeCommitMessage(fallbackResult.text)
                    if (!isLowQualityCommitMessage(fallbackMessage)) {
                        message = fallbackMessage
                        usedRetryPrompt = true
                        retriedCandidate = fallbackMessage
                        loggedModel = fallbackResult.modelName || fallbackModel
                        loggedRawResponse = fallbackResult.rawResponse
                    }
                }
            }
        }

        if (isLowQualityCommitMessage(message)) {
            const localFallbackMessage = buildLocalFallbackCommitMessage(diff)
            if (localFallbackMessage && !isLowQualityCommitMessage(localFallbackMessage)) {
                message = localFallbackMessage
                localFallbackUsed = true
            }
        }

        if (isLowQualityCommitMessage(message)) {
            const failureMessage = 'AI response was incomplete (truncated). Please retry.'
            recordAiDebugLog({
                provider: 'gemini',
                action: 'generateCommitMessage',
                status: 'error',
                model: loggedModel,
                error: failureMessage,
                promptPreview: usedRetryPrompt ? strictRetryPrompt : prompt,
                requestPayload: serializeForAiLog(usedRetryPrompt ? strictRetryBody : requestBody),
                rawResponse: serializeForAiLog(loggedRawResponse),
                candidateMessage: retriedCandidate || initialCandidate,
                finalMessage: message,
                metadata: {
                    diffLength: diff.length,
                    truncatedDiffLength: truncatedDiff.length,
                    compactDiffLength: compactDiff.length,
                    usedRetryPrompt,
                    lowQualityInitialCandidate: isLowQualityCommitMessage(initialCandidate),
                    initialFinishReason: initialFinishReason || 'unknown',
                    retryFinishReason: retryFinishReason || 'none',
                    fallbackModel: fallbackModel || 'none',
                    fallbackFinishReason: fallbackFinishReason || 'none',
                    localFallbackUsed
                }
            })
            return { success: false, error: failureMessage }
        }

        recordAiDebugLog({
            provider: 'gemini',
            action: 'generateCommitMessage',
            status: 'success',
            model: loggedModel,
            promptPreview: usedRetryPrompt ? strictRetryPrompt : prompt,
            requestPayload: serializeForAiLog(usedRetryPrompt ? strictRetryBody : requestBody),
            rawResponse: serializeForAiLog(loggedRawResponse),
            candidateMessage: retriedCandidate || initialCandidate,
            finalMessage: message,
            metadata: {
                diffLength: diff.length,
                truncatedDiffLength: truncatedDiff.length,
                compactDiffLength: compactDiff.length,
                usedRetryPrompt,
                lowQualityInitialCandidate: isLowQualityCommitMessage(initialCandidate),
                initialFinishReason: initialFinishReason || 'unknown',
                retryFinishReason: retryFinishReason || 'none',
                fallbackModel: fallbackModel || 'none',
                fallbackFinishReason: fallbackFinishReason || 'none',
                localFallbackUsed
            }
        })

        return { success: true, message }
    } catch (err: any) {
        log.error('[Gemini] Generate commit message failed:', err)
        return { success: false, error: err.message || 'Failed to generate message' }
    }
}

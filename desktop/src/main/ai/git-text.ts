import type { DevScopeGitTextProvider } from '../../shared/contracts/devscope-git-contracts'
import { generateCodexCommitMessage, testCodexConnection } from './codex'
import { generateGeminiCommitMessage, testGeminiConnection } from './gemini'
import {
    generateCodexPullRequestDraft,
    generateGeminiPullRequestDraft,
    generateGroqPullRequestDraft
} from './pull-request'
import { generateCommitMessage as generateGroqCommitMessage, testGroqConnection } from './groq'

export type GitTextProviderInput = {
    provider: DevScopeGitTextProvider
    apiKey?: string
    model?: string
}

function requireApiKey(provider: Exclude<DevScopeGitTextProvider, 'codex'>, apiKey?: string) {
    const normalized = String(apiKey || '').trim()
    if (!normalized) {
        throw new Error(`${provider === 'groq' ? 'Groq' : 'Gemini'} API key is required.`)
    }
    return normalized
}

export async function testGitTextProviderConnection(input: GitTextProviderInput): Promise<{ success: boolean; error?: string }> {
    if (input.provider === 'codex') {
        return await testCodexConnection(input.model)
    }
    if (input.provider === 'groq') {
        return await testGroqConnection(requireApiKey('groq', input.apiKey))
    }
    return await testGeminiConnection(requireApiKey('gemini', input.apiKey))
}

export async function generateGitCommitMessageWithProvider(
    input: GitTextProviderInput & { diff: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (input.provider === 'codex') {
        return await generateCodexCommitMessage(input.diff, input.model)
    }
    if (input.provider === 'groq') {
        return await generateGroqCommitMessage(requireApiKey('groq', input.apiKey), input.diff)
    }
    return await generateGeminiCommitMessage(requireApiKey('gemini', input.apiKey), input.diff)
}

export async function generateGitPullRequestDraftWithProvider(
    input: GitTextProviderInput & {
        draftInput: {
            projectName?: string
            currentBranch: string
            targetBranch: string
            scopeLabel: string
            diff: string
            guideText?: string
        }
    }
): Promise<{ success: boolean; title?: string; body?: string; error?: string }> {
    if (input.provider === 'codex') {
        return await generateCodexPullRequestDraft(input.draftInput, input.model)
    }
    if (input.provider === 'groq') {
        return await generateGroqPullRequestDraft(requireApiKey('groq', input.apiKey), input.draftInput)
    }
    return await generateGeminiPullRequestDraft(requireApiKey('gemini', input.apiKey), input.draftInput)
}

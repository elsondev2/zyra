import log from 'electron-log'
import { ensureDraft } from './github-pull-request-draft'
import { createPullRequest, findLatestPullRequest, findOpenPullRequest, runGh } from './github-pull-request-gh'
import {
    ensureNoWorkingTreeChanges,
    getPreferredGitHubRemote,
    pushCurrentBranchIfNeeded,
    readBranchState,
    resolveBaseBranch,
    resolveBranchHeadContext,
    resolveRepoCwd
} from './github-pull-request-branch'
import type { PullRequestState } from './github-pull-request-types'
import type {
    DevScopeCreatePullRequestInput,
    DevScopePullRequestDraftSource,
    DevScopePullRequestProvider,
    DevScopePullRequestSummary
} from '../../shared/contracts/devscope-git-contracts'

function toServiceError(err: unknown, fallback: string): Error {
    if (err instanceof Error && err.message) return err
    return new Error(fallback)
}

export async function ensurePullRequestPrerequisites(projectPath: string): Promise<void> {
    const cwd = await resolveRepoCwd(projectPath)
    await runGh(cwd, ['--version'])
    await runGh(cwd, ['auth', 'status'])
}

export async function getCurrentBranchPullRequest(projectPath: string): Promise<DevScopePullRequestSummary | null> {
    const branchState = await readBranchState(projectPath)
    if (branchState.detached || !branchState.branch) {
        return null
    }

    const preferredRemote = getPreferredGitHubRemote(branchState.remotes)
    if (!preferredRemote) {
        return null
    }

    const headContext = await resolveBranchHeadContext(projectPath, branchState)
    const latest = await findLatestPullRequest(branchState.cwd, headContext.headSelectors)
    if (!latest) return null

    return {
        number: latest.number,
        title: latest.title,
        url: latest.url,
        baseBranch: latest.baseBranch,
        headBranch: latest.headBranch,
        state: latest.state
    }
}

export async function createOrOpenPullRequest(
    projectPath: string,
    input: DevScopeCreatePullRequestInput,
    onProgress?: (message: string) => void
) {
    onProgress?.('Checking branch...')
    const branchStateBeforePush = await readBranchState(projectPath)
    const requestedTargetBranch = String(input.targetBranch || '').trim()
    const currentBranch = String(branchStateBeforePush.branch || '').trim()
    if (requestedTargetBranch && currentBranch && currentBranch !== 'HEAD' && requestedTargetBranch === currentBranch) {
        throw new Error('Choose a target branch that is different from the current branch.')
    }
    await ensureNoWorkingTreeChanges(branchStateBeforePush)

    const preferredRemote = getPreferredGitHubRemote(branchStateBeforePush.remotes)
    if (!preferredRemote) {
        throw new Error('Add a GitHub remote before creating a PR.')
    }

    onProgress?.('Pushing...')
    await pushCurrentBranchIfNeeded(projectPath, branchStateBeforePush)

    onProgress?.('Refreshing branch...')
    const branchState = await readBranchState(projectPath)
    await ensureNoWorkingTreeChanges(branchState)
    const branch = String(branchState.branch || '').trim()
    if (!branch) {
        throw new Error('Detached HEAD: checkout a branch before creating a PR.')
    }

    onProgress?.('Checking PR...')
    const headContext = await resolveBranchHeadContext(projectPath, branchState)
    const existing = await findOpenPullRequest(branchState.cwd, headContext.headSelectors)
    if (existing) {
        return {
            status: 'opened_existing' as const,
            draftSource: 'provided' as DevScopePullRequestDraftSource,
            pullRequest: {
                number: existing.number,
                title: existing.title,
                url: existing.url,
                baseBranch: existing.baseBranch,
                headBranch: existing.headBranch,
                state: existing.state
            }
        }
    }

    onProgress?.('Resolving base...')
    const baseBranch = await resolveBaseBranch(
        branchState.cwd,
        branch,
        branchState.upstreamRef,
        headContext.isCrossRepository,
        input.targetBranch
    )
    if (baseBranch === branch) {
        throw new Error('Choose a target branch that is different from the current branch.')
    }

    onProgress?.('Preparing PR...')
    const draft = await ensureDraft(branchState.cwd, branch, baseBranch, input)

    onProgress?.('Creating PR...')
    const createStdout = await createPullRequest(branchState.cwd, {
        baseBranch,
        headSelector: headContext.preferredHeadSelector,
        title: draft.title,
        body: draft.body,
        draft: input.draft !== false
    })

    onProgress?.('Finalizing PR...')
    const created = await findOpenPullRequest(branchState.cwd, headContext.headSelectors)
    if (created) {
        return {
            status: 'created' as const,
            draftSource: draft.source,
            ...(draft.provider ? { provider: draft.provider } : {}),
            pullRequest: {
                number: created.number,
                title: created.title,
                url: created.url,
                baseBranch: created.baseBranch,
                headBranch: created.headBranch,
                state: created.state
            }
        }
    }

    const urlMatch = createStdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i)
    if (!urlMatch) {
        throw new Error("Pull request was created, but Zyra could not resolve its URL.")
    }

    return {
        status: 'created' as const,
        draftSource: draft.source,
        ...(draft.provider ? { provider: draft.provider } : {}),
        pullRequest: {
            number: 0,
            title: draft.title,
            url: urlMatch[0],
            baseBranch,
            headBranch: headContext.headBranch,
            state: 'open' as PullRequestState
        }
    }
}

export function summarizePullRequestOutcome(input: {
    status: 'created' | 'opened_existing'
    draftSource: DevScopePullRequestDraftSource
    provider?: DevScopePullRequestProvider
}) {
    if (input.status === 'opened_existing') {
        return 'Opened existing pull request.'
    }

    if (input.draftSource === 'ai' && input.provider) {
        return `Created pull request with ${input.provider === 'groq' ? 'Groq' : input.provider === 'gemini' ? 'Gemini' : 'Codex'} draft content.`
    }

    if (input.draftSource === 'fallback') {
        return 'Created pull request with the built-in draft template.'
    }

    return 'Created pull request.'
}

export function logPullRequestError(context: string, error: unknown) {
    log.error(`[GitHub PR] ${context}:`, error)
    return toServiceError(error, 'Failed to handle pull request.')
}

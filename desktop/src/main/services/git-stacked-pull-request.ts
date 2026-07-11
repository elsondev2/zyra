import { generateGitCommitMessageWithProvider } from '../ai/git-text'
import { createCommit, getGitStatusDetailed, getWorkingChangesForAI, getWorkingDiff, stageFiles } from '../inspectors/git'
import { createGit } from '../inspectors/git/core'
import { createOrOpenPullRequest, ensurePullRequestPrerequisites } from './github-pull-request'
import type { DevScopeCommitPushPullRequestInput } from '../../shared/contracts/devscope-git-contracts'

function normalizeDiff(diff: string) {
    const normalized = String(diff || '').trim()
    return normalized && normalized !== 'No changes' ? normalized : ''
}

function parsePorcelainStatus(stdout: string) {
    const lines = String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)

    let stagedCount = 0
    let unstagedCount = 0

    for (const line of lines) {
        const code = line.slice(0, 2)
        const indexCode = code[0] || ' '
        const workTreeCode = code[1] || ' '

        if (code !== '??' && code !== '!!' && indexCode !== ' ') {
            stagedCount += 1
        }
        if (code === '??' || (code !== '!!' && workTreeCode !== ' ')) {
            unstagedCount += 1
        }
    }

    return { stagedCount, unstagedCount }
}

async function readStackedCommitState(projectPath: string) {
    const git = createGit(projectPath)
    const [stagedDiffRaw, unstagedDiffRaw, statusDetails, aiContext, porcelainStatusRaw] = await Promise.all([
        getWorkingDiff(projectPath, undefined, 'staged').catch(() => ''),
        getWorkingDiff(projectPath, undefined, 'unstaged').catch(() => ''),
        getGitStatusDetailed(projectPath, { includeStats: false }).catch(() => []),
        getWorkingChangesForAI(projectPath).catch(() => ''),
        git.raw(['status', '--short']).catch(() => '')
    ])

    const stagedDiff = normalizeDiff(stagedDiffRaw)
    const unstagedDiff = normalizeDiff(unstagedDiffRaw)
    const stagedEntries = Array.isArray(statusDetails) ? statusDetails.filter((entry) => entry.staged) : []
    const unstagedEntries = Array.isArray(statusDetails) ? statusDetails.filter((entry) => entry.unstaged) : []
    const aiContextText = String(aiContext || '').trim()
    const porcelainStatus = parsePorcelainStatus(porcelainStatusRaw)

    return {
        stagedDiff,
        unstagedDiff,
        hasStagedChanges: stagedDiff.length > 0 || stagedEntries.length > 0 || porcelainStatus.stagedCount > 0,
        hasUnstagedChanges: unstagedDiff.length > 0 || unstagedEntries.length > 0 || porcelainStatus.unstagedCount > 0,
        commitGenerationContext: stagedDiff || (aiContextText && aiContextText !== 'No changes' ? aiContextText : '')
    }
}

export async function commitPushAndCreatePullRequest(
    projectPath: string,
    input: DevScopeCommitPushPullRequestInput,
    onProgress?: (message: string) => void
) {
    const requestedTargetBranch = String(input.targetBranch || '').trim()
    if (requestedTargetBranch) {
        onProgress?.('Checking target...')
        const currentBranch = String(await createGit(projectPath).raw(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
        if (currentBranch && currentBranch !== 'HEAD' && currentBranch === requestedTargetBranch) {
            throw new Error('Choose a target branch that is different from the current branch.')
        }
    }

    onProgress?.('Checking GitHub...')
    await ensurePullRequestPrerequisites(projectPath)

    if (input.autoStageAll) {
        onProgress?.('Staging all...')
        await stageFiles(projectPath, [], { scope: input.stageScope === 'project' ? 'project' : 'repo' })
    }

    onProgress?.('Reading changes...')
    const state = await readStackedCommitState(projectPath)

    if (!state.hasStagedChanges) {
        throw new Error('Stage changes before running Commit, Push & Create PR.')
    }
    if (state.hasUnstagedChanges) {
        throw new Error('Stage or discard unstaged changes before running Commit, Push & Create PR.')
    }

    let commitMessage = String(input.commitMessage || '').trim()
    if (!commitMessage) {
        if (!input.provider) {
            throw new Error('Enter a commit message or configure an AI provider first.')
        }
        if (!state.commitGenerationContext) {
            throw new Error("Zyra could not read the staged changes needed for commit generation. Try refreshing Git data and retrying.")
        }
        onProgress?.('Generating commit...')
        const generated = await generateGitCommitMessageWithProvider({
            provider: input.provider,
            apiKey: input.apiKey,
            model: input.model,
            diff: state.commitGenerationContext
        })
        if (!generated.success || !String(generated.message || '').trim()) {
            throw new Error(generated.error || 'Failed to generate a commit message.')
        }
        commitMessage = String(generated.message || '').trim()
    }

    let committed = false
    try {
        onProgress?.('Creating commit...')
        await createCommit(projectPath, commitMessage)
        committed = true
        const prResult = await createOrOpenPullRequest(projectPath, {
            projectName: input.projectName,
            targetBranch: input.targetBranch,
            draft: input.draft,
            guideText: input.guideText,
            provider: input.provider,
            apiKey: input.apiKey,
            model: input.model
        }, onProgress)

        onProgress?.('Done.')
        return {
            ...prResult,
            commitMessage
        }
    } catch (err: any) {
        if (committed) {
            throw new Error(`Commit created, but PR flow failed: ${err?.message || 'Unknown error.'}`)
        }
        throw err
    }
}

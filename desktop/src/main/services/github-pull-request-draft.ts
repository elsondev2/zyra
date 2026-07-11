import { generateGitPullRequestDraftWithProvider } from '../ai/git-text'
import { createGit } from '../inspectors/git/core'
import type { DraftInput, EnsuredDraft } from './github-pull-request-types'

async function buildRangeContext(cwd: string, baseBranch: string) {
    const git = createGit(cwd)
    const [commitSummaryRaw, diffSummaryRaw, diffPatchRaw, commitCountRaw] = await Promise.all([
        git.raw(['log', '--reverse', '--format=- %s', `${baseBranch}..HEAD`]).catch(() => ''),
        git.raw(['diff', '--stat', `${baseBranch}...HEAD`]).catch(() => ''),
        git.raw(['diff', '--unified=3', `${baseBranch}...HEAD`]).catch(() => ''),
        git.raw(['rev-list', '--count', `${baseBranch}..HEAD`]).catch(() => '0')
    ])

    const commitCount = Number.parseInt(String(commitCountRaw || '0').trim(), 10)
    if (!Number.isFinite(commitCount) || commitCount <= 0) {
        throw new Error('No local branch commits are available to include in a pull request.')
    }

    return {
        diff: [
            '## Commits',
            String(commitSummaryRaw || '').trim() || '(no commit summary available)',
            '',
            '## Diff Summary',
            String(diffSummaryRaw || '').trim() || '(no diff summary available)',
            '',
            '## Diff Patch',
            String(diffPatchRaw || '').trim() || '(no diff patch available)'
        ].join('\n'),
        commitMessages: String(commitSummaryRaw || '')
            .split(/\r?\n/)
            .map((line) => line.replace(/^-\s*/, '').trim())
            .filter(Boolean)
    }
}

function buildFallbackPullRequestDraft(input: {
    projectName: string
    currentBranch: string
    targetBranch: string
    guideText?: string
    commitMessages?: string[]
}) {
    const normalizedProjectName = String(input.projectName || 'project').trim() || 'project'
    const normalizedCurrentBranch = String(input.currentBranch || '').trim()
    const normalizedTargetBranch = String(input.targetBranch || '').trim() || 'main'
    const title = normalizedCurrentBranch
        ? `Update ${normalizedProjectName} (${normalizedCurrentBranch} -> ${normalizedTargetBranch})`
        : `Update ${normalizedProjectName}`
    const uniqueMessages = Array.from(new Set((input.commitMessages || []).map((message) => String(message || '').trim()).filter(Boolean))).slice(0, 6)
    const guideNote = String(input.guideText || '').trim()

    const bodyLines = [
        '## Summary',
        `- Prepare a pull request for ${normalizedProjectName}.`,
        `- Source branch: \`${normalizedCurrentBranch || 'current'}\` into \`${normalizedTargetBranch}\`.`,
        '',
        '## Changes',
        ...(uniqueMessages.length > 0
            ? uniqueMessages.map((message) => `- ${message}`)
            : ['- Review the branch diff and expand this summary before publishing.']),
        '',
        '## Testing',
        '- Not yet validated.',
        '',
        '## Risks',
        '- Review the generated title/body and confirm the target branch before publishing.'
    ]

    if (guideNote) {
        bodyLines.push('', '## Guide Notes', guideNote)
    }

    return {
        title,
        body: bodyLines.join('\n')
    }
}

export async function ensureDraft(cwd: string, branch: string, baseBranch: string, input: DraftInput): Promise<EnsuredDraft> {
    const providedTitle = String(input.title || '').trim()
    const providedBody = String(input.body || '').trim()
    if (providedTitle && providedBody) {
        return {
            title: providedTitle,
            body: providedBody,
            source: 'provided'
        }
    }

    const rangeContext = await buildRangeContext(cwd, baseBranch)
    const fallbackDraft = buildFallbackPullRequestDraft({
        projectName: input.projectName || 'Project',
        currentBranch: branch,
        targetBranch: baseBranch,
        guideText: input.guideText,
        commitMessages: rangeContext.commitMessages
    })
    const provider = input.provider
        ? {
            provider: input.provider,
            ...(input.apiKey?.trim() ? { apiKey: input.apiKey.trim() } : {}),
            ...(input.model?.trim() ? { model: input.model.trim() } : {})
        }
        : null

    if (!provider) {
        return {
            ...fallbackDraft,
            source: 'fallback'
        }
    }

    const generateResult = await generateGitPullRequestDraftWithProvider({
        ...provider,
        draftInput: {
            projectName: input.projectName,
            currentBranch: branch,
            targetBranch: baseBranch,
            scopeLabel: 'Current branch changes',
            diff: rangeContext.diff,
            guideText: input.guideText
        }
    })

    if (!generateResult.success || !String(generateResult.title || '').trim() || !String(generateResult.body || '').trim()) {
        return {
            ...fallbackDraft,
            source: 'fallback',
            provider: provider.provider
        }
    }

    return {
        title: String(generateResult.title || '').trim(),
        body: String(generateResult.body || '').trim(),
        source: 'ai',
        provider: provider.provider
    }
}

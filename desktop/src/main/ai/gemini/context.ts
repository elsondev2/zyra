export function buildCompactDiffContext(diff: string, maxChars: number = 4500): string {
    const lines = diff.split('\n')
    const stagedPatchIndex = lines.findIndex((line) => line.trim() === '## STAGED PATCH')
    const compactBase = stagedPatchIndex >= 0 ? lines.slice(0, stagedPatchIndex).join('\n') : diff

    if (compactBase.length <= maxChars) return compactBase
    return `${compactBase.slice(0, maxChars)}\n... (compact context truncated)`
}

function extractStatusPathsFromDiffContext(diffContext: string): string[] {
    const marker = '## WORKING TREE STATUS (SHORT)'
    const start = diffContext.indexOf(marker)
    if (start < 0) return []

    const sectionText = diffContext.slice(start + marker.length)
    const lines = sectionText.split('\n')
    const paths: string[] = []

    for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        if (line.startsWith('## ')) break

        const match = line.match(/^(?:\?\?|[MADRCU][ MADRCU]?)\s+(.+)$/)
        if (!match?.[1]) continue
        paths.push(match[1].trim())
    }

    return Array.from(new Set(paths))
}

export function buildLocalFallbackCommitMessage(diffContext: string): string {
    const files = extractStatusPathsFromDiffContext(diffContext)
    if (files.length === 0) return ''

    const hasAI = files.some((file) => /src[\\/]+main[\\/]+ai[\\/]/i.test(file))
    const hasProjectDetails = files.some((file) => /project-details/i.test(file))
    const hasSettings = files.some((file) => /pages[\\/]+settings[\\/]/i.test(file))
    const hasBuild = files.some((file) => /(?:^|[\\/])(?:package\.json|package-lock\.json|bun\.lockb?|bun\.lock|README\.md)$/i.test(file))

    const type = hasAI || hasProjectDetails ? 'refactor' : 'chore'
    const scope = hasAI ? 'ai' : hasProjectDetails ? 'project-details' : hasBuild ? 'build' : 'repo'

    const areaLabels: string[] = []
    if (hasAI) areaLabels.push('AI commit generation')
    if (hasProjectDetails) areaLabels.push('project details')
    if (hasBuild) areaLabels.push('build and dependency setup')
    if (hasSettings) areaLabels.push('settings pages')

    const primaryArea = areaLabels.slice(0, 2).join(' and ') || 'project files'
    let title = `${type}(${scope}): improve ${primaryArea}`
    if (title.length > 72) {
        title = `${type}(${scope}): improve repository updates`
    }

    const topFiles = files.slice(0, 5)
    const topFilesText = topFiles.length > 0
        ? topFiles.join(', ') + (files.length > 5 ? ', and others.' : '.')
        : 'key source and configuration files.'

    const bullets = [
        `- Update ${files.length} changed file${files.length === 1 ? '' : 's'} in the current working tree.`,
        `- Focus changes on ${primaryArea}.`,
        `- Touch key paths including ${topFilesText}`,
        '- Keep the commit summary aligned with the currently modified files only.'
    ]

    return `${title}\n\n${bullets.join('\n')}`
}

export function buildCommitPrompt(truncatedDiff: string): string {
    return `You are an expert software engineer writing git commit messages for long-term project history.
Rules:
1. Use conventional commit format: type(scope): description
2. First line should be imperative and max 72 chars
3. Add a blank line after the title
4. Add 3-5 bullet points, each starting with "- "
5. Bullets must cover:
   - core code changes
   - behavior or developer impact
   - key implementation details or constraints
6. Keep output concise, specific, and grounded in the diff only
7. Do not invent details, tickets, benchmarks, or files not shown
8. Output only the commit message

Generate a commit message for this diff:
\`\`\`diff
${truncatedDiff}
\`\`\`
`
}

export function buildStrictRetryPrompt(compactDiff: string): string {
    return `Regenerate the commit message from this diff.
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
${compactDiff}
\`\`\`
`
}

export function buildFallbackPrompt(compactDiff: string): string {
    return `Generate a concise commit message from this change summary.

Rules:
1. Format: type(scope): description
2. Title max 72 chars, imperative.
3. Add exactly 3-5 specific bullet points starting with "- ".
4. Output only the commit message.

Summary:
\`\`\`text
${compactDiff}
\`\`\`
`
}

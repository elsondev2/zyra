const PROPOSED_PLAN_BLOCK_REGEX = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/gi

export function getDisplayedProposedPlanMarkdown(planMarkdown: string): string {
    const trimmed = String(planMarkdown || '').trim()
    if (!trimmed) return ''
    const lines = trimmed.split(/\r?\n/)
    if (lines.length > 0 && /^#\s+/.test(lines[0].trim())) {
        return lines.slice(1).join('\n').trim()
    }
    return trimmed
}

export function getProposedPlanTitle(planMarkdown: string): string | null {
    const firstLine = String(planMarkdown || '').trim().split(/\r?\n/)[0]?.trim() || ''
    const heading = /^#\s+(.+)$/.exec(firstLine)
    return heading?.[1]?.trim() || null
}

export function stripProposedPlanBlocks(text: string): string {
    const normalized = String(text || '')
    if (!normalized) return ''
    return normalized.replace(PROPOSED_PLAN_BLOCK_REGEX, '')
}

/**
 * Shared commit-message quality checks used by all AI providers.
 */

const COMMIT_TITLE_PATTERN = /^[a-z]+(?:\([^)]+\))?(?:!)?:\s.+$/i
const VAGUE_BULLET_PATTERN = /^(update|fix|change|improve|cleanup|refactor|adjust|misc|various)\.?$/i

export function sanitizeCommitMessage(text: string): string {
    return text
        .trim()
        .replace(/^```(?:\w+)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/^commit message:\s*/i, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export function isLowQualityCommitMessage(message: string): boolean {
    if (!message) return true

    const lines = message
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

    if (lines.length < 2) return true
    if (!COMMIT_TITLE_PATTERN.test(lines[0])) return true

    const bullets = lines
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim())

    if (bullets.length < 3) return true

    if (bullets.some((bullet) => bullet.length < 12 || VAGUE_BULLET_PATTERN.test(bullet))) {
        return true
    }

    return false
}

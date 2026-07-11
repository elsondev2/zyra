export function formatAssistantModelLabel(value: string | null | undefined): string {
    const trimmed = String(value || '').trim()
    if (!trimmed) return ''

    return trimmed
        .replace(/\bvia\s+zyra\s*\/\s*pi\b/gi, '')
        .replace(/\bvia\s+zyra\b/gi, '')
        .replace(/\bvia\s+pi\b/gi, '')
        .replace(/^openai-codex\//i, '')
        .replace(/\s+/g, ' ')
        .trim()
}

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

export function resolveAssistantInboxModelPresentation(value: string | null | undefined): {
    modelName: string
    provider: string | null
} {
    const model = String(value || '').trim()
    if (!model) return { modelName: '', provider: null }

    const providerSeparator = model.indexOf('/')
    if (providerSeparator < 0) return { modelName: model, provider: null }

    const provider = model.slice(0, providerSeparator).trim().toLowerCase()
    const modelName = model.slice(providerSeparator + 1).split('/').at(-1)?.trim()
    return { modelName: modelName || '', provider: provider || null }
}

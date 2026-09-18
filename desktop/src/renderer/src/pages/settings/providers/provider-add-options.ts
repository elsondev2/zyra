export type ProviderAddKind = 'openai-codex' | 'openai' | 'opencode' | 'anthropic' | 'custom'
export type ProviderAddChoice = { id: ProviderAddKind; label: string; description: string }

const choices: readonly ProviderAddChoice[] = [
    { id: 'openai-codex', label: 'ChatGPT subscription', description: 'Sign in with your ChatGPT account.' },
    { id: 'openai', label: 'OpenAI API', description: 'Verify and save an OpenAI API key.' },
    { id: 'opencode', label: 'OpenCode Zen', description: 'Connect with a Zen API key.' },
    { id: 'anthropic', label: 'Claude API', description: 'Connect with an Anthropic API key.' },
    { id: 'custom', label: 'Custom endpoint', description: 'Add a compatible provider and model.' }
]

export function availableProviderAddChoices(existing: readonly string[], chatGptConfigured: boolean, openAiConfigured: boolean): ProviderAddChoice[] {
    return choices.filter(choice => {
        if (choice.id === 'custom') return true
        if (choice.id === 'openai-codex') return !chatGptConfigured
        if (choice.id === 'openai') return !openAiConfigured
        return !existing.includes(choice.id)
    })
}

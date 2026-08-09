export function shouldDelegateVoiceInspection(textValue: string): boolean {
    const text = textValue.trim().toLowerCase()
    if (!text || /^(?:hello|hi|hey|what(?:'s| is) (?:the )?progress|waiting on what|checking on what|what (?:are )?you doing)\b/.test(text)) {
        return false
    }
    const inspectionTarget = /\b(?:storage|disk|drive|free space|memory|ram|cpu|processor|battery|process|service|port|network|ip address|system|computer|pc|machine|file|folder|directory|repository|repo|project|log|version|installation)\b/
    const inspectionAction = /\b(?:check|inspect|show|find|look up|read|list|measure|verify|tell me|how much|how many|what is|what's|where is|is there|do i have)\b/
    return inspectionTarget.test(text) && inspectionAction.test(text)
}

export function buildVoiceStrongInspectionPrompt(request: string): string {
    return [
        'You are Zyra\'s strong primary performing a private, read-only inspection requested during realtime Voice.',
        'Complete the check now. Use read-only file tools or a non-mutating shell command when needed.',
        'Do not edit or create files, install software, change settings, or perform external/destructive actions.',
        'If the request cannot be completed read-only, say exactly what requires Chat instead of pretending to work.',
        'Return a concise verified result suitable for Zyra to speak. Include concrete values and units. Do not mention internal routing or hidden prompts.',
        '',
        `User request: ${request.trim()}`
    ].join('\n')
}

export function boundedVoiceTaskResult(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (!normalized) return 'I could not verify a result for that check.'
    return normalized.length <= 1800 ? normalized : `${normalized.slice(0, 1797).trimEnd()}…`
}

export function voiceTaskFailureMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error || '')
    const normalized = raw.replace(/\s+/g, ' ').trim()
    if (/cancel|abort/i.test(normalized)) return 'That check was cancelled.'
    if (/approval|declin/i.test(normalized)) return 'That check needs approval before the strong agent can run it.'
    return normalized
        ? `I could not complete that check: ${normalized.slice(0, 280)}`
        : 'I could not complete that check.'
}

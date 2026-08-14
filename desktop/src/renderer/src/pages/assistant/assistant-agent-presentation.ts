import type { AgentRunState, AgentTranscriptPage } from '@shared/assistant/contracts'

type AgentIdentitySource = Pick<AgentRunState, 'agentRunId' | 'agentId' | 'definitionName' | 'label' | 'goal'>

export type AssistantAgentVibe = 'inquiry' | 'systems' | 'guardian' | 'craft' | 'proof' | 'builder' | 'velocity' | 'contemplative'

export interface AssistantAgentIdentity {
    seed: string
    name: string
    roleTitle: string
    vibe: AssistantAgentVibe
}

export interface AssistantAgentTranscriptMessage {
    index: number
    role: 'user' | 'assistant'
    text: string
    timestamp: string | null
}

const AGENT_NAMES_BY_VIBE: Record<AssistantAgentVibe, string[]> = {
    inquiry: ['Socrates', 'Hypatia', 'Zeno', 'Diogenes', 'Hume', 'Spinoza', 'Popper', 'Plato', 'Aristotle', 'Descartes', 'Kierkegaard', 'Nietzsche'],
    systems: ['Ada', 'Turing', 'Archimedes', 'Tesla', 'Hopper', 'Shannon', 'Pascal', 'Euclid', 'Galileo', 'Faraday', 'Lovelace', 'Babbage'],
    guardian: ['Athena', 'Seneca', 'Kant', 'Arendt', 'Locke', 'Confucius', 'Laozi', 'Marcus', 'Cicero', 'Rawls', 'Hobbes', 'Themis'],
    craft: ['Sappho', 'Rumi', 'Iris', 'Woolf', 'Sontag', 'Maya', 'Basho', 'Blake', 'Dante', 'Homer', 'Virgil', 'Calliope'],
    proof: ['Curie', 'Gauss', 'Euler', 'Noether', 'Darwin', 'Franklin', 'Bacon', 'Kepler', 'Feynman', 'Leibniz', 'Ramanujan', 'Emmy'],
    builder: ['Vitruvius', 'Brunel', 'Hedy', 'Daedalus', 'Fuller', 'Foster', 'Edison', 'Bell', 'Imhotep', 'Hero', 'Woz', 'Hephaestus'],
    velocity: ['Hermes', 'Achilles', 'Maxwell', 'Fermi', 'Newton', 'Boltzmann', 'Tycho', 'Halley', 'Ampere', 'Volta', 'Joule', 'Kelvin'],
    contemplative: ['Thales', 'Solon', 'Epictetus', 'Rhea', 'Plotinus', 'Avicenna', 'Averroes', 'Maimonides', 'Parmenides', 'Heraclitus', 'Proclus', 'Orpheus']
}

function stableHash(value: string): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function humanizeAgentLabel(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_.:/]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
}

export function resolveAssistantAgentRoleTitle(run: AgentIdentitySource): string {
    const task = run.goal.toLowerCase()
    const definition = [run.agentId, run.definitionName, run.label].filter(Boolean).join(' ').toLowerCase()

    if (/\b(security|vulnerabilit|threat|permission|encryption|credential|secret)\w*\b/.test(task)) return 'Security Analyst'
    if (/\b(performance|latency|memory|startup|optimi[sz]|benchmark)\w*\b/.test(task)) return 'Performance Analyst'
    if (/\b(documentation|docs?|readme|guide)\b/.test(task)) return 'Documentation Editor'
    if (/\b(test|tests|testing|coverage|regression|fixture)\w*\b/.test(task)) return 'Test Engineer'
    if (/\b(ui|ux|interface|layout|frontend|renderer|visual|accessibility)\b/.test(task)) return 'Interface Engineer'
    if (/\b(database|schema|sqlite|sql|persistence|migration)\b/.test(task)) return 'Data Engineer'
    if (/\b(server|backend|api|protocol|runtime|lifecycle)\b/.test(task)) return 'Systems Analyst'

    if (/code[\s-]*review|reviewer/.test(definition)) return 'Code Reviewer'
    if (/bug[\s-]*(analy[sz]er|investigator)|debugger/.test(definition)) return 'Bug Investigator'
    if (/research|investigat|analy[sz]/.test(definition)) return 'Research Analyst'
    if (/\b(review|audit|inspect)\w*\b/.test(task)) return 'Code Reviewer'
    if (/\b(debug|bug|failure|root cause)\b/.test(task)) return 'Bug Investigator'
    if (/\b(research|trace|investigate|analy[sz]|compare|find)\w*\b/.test(task)) return 'Research Analyst'
    if (/\b(implement|build|fix|refactor|change|add|create)\w*\b/.test(task)) return 'Software Engineer'

    const definitionTitle = humanizeAgentLabel(run.definitionName || run.agentId || run.label)
    if (definitionTitle && definitionTitle.toLowerCase() !== 'agent') return definitionTitle
    return 'Task Specialist'
}

function resolveAssistantAgentVibe(roleTitle: string): AssistantAgentVibe {
    if (roleTitle === 'Security Analyst') return 'guardian'
    if (roleTitle === 'Performance Analyst') return 'velocity'
    if (roleTitle === 'Documentation Editor' || roleTitle === 'Interface Engineer') return 'craft'
    if (roleTitle === 'Test Engineer' || roleTitle === 'Data Engineer') return 'proof'
    if (roleTitle === 'Systems Analyst') return 'systems'
    if (roleTitle === 'Software Engineer') return 'builder'
    if (roleTitle === 'Code Reviewer' || roleTitle === 'Bug Investigator' || roleTitle === 'Research Analyst') return 'inquiry'
    return 'contemplative'
}

export function resolveAssistantAgentIdentity(run: AgentIdentitySource): AssistantAgentIdentity {
    const seed = `zyra-agent:${run.agentRunId}`
    const roleTitle = resolveAssistantAgentRoleTitle(run)
    const vibe = resolveAssistantAgentVibe(roleTitle)
    const names = AGENT_NAMES_BY_VIBE[vibe]
    return {
        seed,
        name: names[stableHash(`${seed}:${vibe}`) % names.length],
        roleTitle,
        vibe
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function readMessageText(message: Record<string, unknown>): string {
    const content = message['content']
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
        return content.flatMap((part) => {
            if (typeof part === 'string') return [part]
            const record = asRecord(part)
            if (!record) return []
            const type = String(record['type'] || 'text')
            if (!['text', 'input_text', 'output_text'].includes(type)) return []
            return typeof record['text'] === 'string' ? [record['text']] : []
        }).join('\n').trim()
    }
    return typeof message['text'] === 'string' ? message['text'].trim() : ''
}

function normalizeTranscriptTimestamp(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function projectAssistantAgentTranscriptMessages(
    entries: AgentTranscriptPage['entries']
): AssistantAgentTranscriptMessage[] {
    return entries.flatMap((entry) => {
        const nestedMessage = asRecord(entry['message'])
        const message = nestedMessage || entry
        const role = message['role']
        if (role !== 'user' && role !== 'assistant') return []
        const text = readMessageText(message)
        if (!text) return []
        const projected: AssistantAgentTranscriptMessage = {
            index: entry.index,
            role,
            text,
            timestamp: normalizeTranscriptTimestamp(entry['timestamp'] ?? message['timestamp'])
        }
        return [projected]
    }).sort((left, right) => left.index - right.index)
}

export function mergeAssistantAgentTranscriptPages(
    current: AgentTranscriptPage,
    older: AgentTranscriptPage
): AgentTranscriptPage {
    const entriesByIndex = new Map<number, AgentTranscriptPage['entries'][number]>()
    for (const entry of [...older.entries, ...current.entries]) entriesByIndex.set(entry.index, entry)
    const entries = [...entriesByIndex.values()].sort((left, right) => left.index - right.index)
    return {
        entries,
        nextBefore: older.nextBefore,
        totalEntries: Math.max(current.totalEntries, older.totalEntries),
        bytes: Math.max(current.bytes, older.bytes),
        truncatedEntries: Math.max(current.truncatedEntries, older.truncatedEntries),
        hydrated: entries.length
    }
}

export function shortAssistantAgentModel(model: string): string {
    const selected = model.split('/').at(-1) || model
    return selected.replace(/^gpt-\d+(?:\.\d+)?-/, '')
}

export function formatAssistantAgentElapsed(ms: number): string {
    const seconds = Math.max(0, Math.round((ms || 0) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export function formatAssistantAgentTokens(tokens: number | null | undefined): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(tokens || 0)
}

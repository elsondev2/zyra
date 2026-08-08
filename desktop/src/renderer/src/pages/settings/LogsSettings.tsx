import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSegmented
} from './settings-layout'

type ProviderFilter = 'all' | 'groq' | 'gemini' | 'codex'
type AiDebugLogEntry = {
    id: string
    timestamp: number
    provider: 'groq' | 'gemini' | 'codex'
    action: 'generateCommitMessage' | 'testConnection'
    status: 'success' | 'error'
    model?: string
    error?: string
    promptPreview?: string
    requestPayload?: string
    rawResponse?: string
    candidateMessage?: string
    finalMessage?: string
    metadata?: Record<string, string | number | boolean | null>
}

export default function LogsSettings() {
    const [logs, setLogs] = useState<AiDebugLogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<ProviderFilter>('all')
    const [copiedKey, setCopiedKey] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const loadLogs = async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await window.devscope.getAiDebugLogs(200)
            if (!result?.success) throw new Error(result?.error || 'Could not load AI debug logs.')
            setLogs(Array.isArray(result.logs) ? result.logs : [])
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Could not load AI debug logs.')
            setLogs([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void loadLogs() }, [])

    const filteredLogs = useMemo(() => filter === 'all' ? logs : logs.filter((entry) => entry.provider === filter), [filter, logs])

    const copyText = async (key: string, value: string) => {
        if (!value.trim()) return
        try {
            const result = await window.devscope.copyToClipboard?.(value)
            if (result && result.success === false) throw new Error(result.error || 'Could not copy logs.')
            if (!result && navigator.clipboard?.writeText) await navigator.clipboard.writeText(value)
            setCopiedKey(key)
            window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1500)
        } catch (copyError) {
            setError(copyError instanceof Error ? copyError.message : 'Could not copy logs.')
        }
    }

    const clearLogs = async () => {
        if (logs.length > 0 && !window.confirm('Clear all local AI debug logs?')) return
        setClearing(true)
        setError(null)
        try {
            const result = await window.devscope.clearAiDebugLogs()
            if (!result?.success) throw new Error(result?.error || 'Could not clear AI debug logs.')
            setLogs([])
        } catch (clearError) {
            setError(clearError instanceof Error ? clearError.message : 'Could not clear AI debug logs.')
        } finally {
            setClearing(false)
        }
    }

    const visiblePayload = filteredLogs.map(formatLogEntry).join('\n\n====================\n\n')

    return (
        <SettingsPageContainer>
            <SettingsSection title="Diagnostics" headerAction={<div className="flex gap-1"><SettingsButton variant="ghost" onClick={() => void loadLogs()} disabled={loading}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Refresh</SettingsButton><SettingsButton variant="ghost" onClick={() => void copyText('visible', visiblePayload)} disabled={filteredLogs.length === 0}>{copiedKey === 'visible' ? <Check size={12} /> : <Copy size={12} />}Copy visible</SettingsButton></div>}>
                {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
                <SettingsRow title="AI debug logs" description="Local provider requests and responses retained for Git AI troubleshooting." control={<span className="font-mono text-xs tabular-nums text-sparkle-text-secondary">{logs.length}</span>} />
                <SettingsRow title="Provider filter" description="Limit the visible log records by provider." control={<SettingsSegmented value={filter} options={[{ value: 'all', label: 'All' }, { value: 'groq', label: 'Groq' }, { value: 'gemini', label: 'Gemini' }, { value: 'codex', label: 'Codex' }]} onChange={setFilter} label="AI log provider filter" />} />
                <SettingsRow title="Clear logs" description="Remove all local AI provider debug records." control={<SettingsButton variant="danger" onClick={() => void clearLogs()} disabled={clearing || logs.length === 0}><Trash2 size={12} />{clearing ? 'Clearing…' : 'Clear'}</SettingsButton>} />
            </SettingsSection>

            <SettingsSection title="AI provider records">
                {filteredLogs.length === 0 ? <SettingsNotice>{loading ? 'Loading logs…' : 'No matching debug records.'}</SettingsNotice> : filteredLogs.map((entry) => {
                    const expanded = expandedId === entry.id
                    const payload = formatLogEntry(entry)
                    return (
                        <SettingsRow
                            key={entry.id}
                            title={`${entry.provider.toUpperCase()} · ${entry.action === 'testConnection' ? 'Connection test' : 'Commit message'}`}
                            description={entry.error || entry.finalMessage || entry.candidateMessage || entry.promptPreview || 'No summary available.'}
                            status={`${entry.status} · ${new Date(entry.timestamp).toLocaleString()}${entry.model ? ` · ${entry.model}` : ''}`}
                            statusTone={entry.status === 'success' ? 'ready' : 'danger'}
                            control={<div className="flex gap-1"><SettingsButton variant="ghost" onClick={() => setExpandedId(expanded ? null : entry.id)}>{expanded ? 'Hide' : 'Details'}</SettingsButton><SettingsButton variant="ghost" onClick={() => void copyText(entry.id, payload)}>{copiedKey === entry.id ? <Check size={12} /> : <Copy size={12} />}</SettingsButton></div>}
                        >
                            {expanded ? <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap border-t border-[var(--settings-border)] py-4 font-mono text-[11px] leading-relaxed text-sparkle-text-secondary">{payload}</pre> : null}
                        </SettingsRow>
                    )
                })}
            </SettingsSection>
        </SettingsPageContainer>
    )
}

function formatLogEntry(entry: AiDebugLogEntry): string {
    const parts = [
        `Timestamp: ${new Date(entry.timestamp).toLocaleString()}`,
        `Provider: ${entry.provider}`,
        `Action: ${entry.action}`,
        `Status: ${entry.status}`
    ]
    if (entry.model) parts.push(`Model: ${entry.model}`)
    if (entry.error) parts.push(`Error: ${entry.error}`)
    if (entry.finalMessage) parts.push(`Final Message:\n${entry.finalMessage}`)
    if (entry.candidateMessage) parts.push(`Candidate Message:\n${entry.candidateMessage}`)
    if (entry.promptPreview) parts.push(`Prompt Preview:\n${entry.promptPreview}`)
    if (entry.requestPayload) parts.push(`Request Payload:\n${entry.requestPayload}`)
    if (entry.rawResponse) parts.push(`Raw Response:\n${entry.rawResponse}`)
    if (entry.metadata) parts.push(`Metadata:\n${JSON.stringify(entry.metadata, null, 2)}`)
    return parts.join('\n\n')
}

/**
 * Zyra - AI Logs Settings Page
 * Inspect commit-generation prompts and raw/final AI outputs.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bug, RefreshCw, Trash2, CheckCircle, AlertCircle, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type ProviderFilter = 'all' | 'groq' | 'gemini' | 'codex'

interface AiDebugLogEntry {
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

function formatLogEntry(entry: AiDebugLogEntry): string {
    const parts: string[] = []

    parts.push(`Timestamp: ${new Date(entry.timestamp).toLocaleString()}`)
    parts.push(`Provider: ${entry.provider}`)
    parts.push(`Action: ${entry.action}`)
    parts.push(`Status: ${entry.status}`)
    if (entry.model) parts.push(`Model: ${entry.model}`)
    if (entry.error) parts.push(`Error: ${entry.error}`)

    if (entry.finalMessage) {
        parts.push(`Final Message:\n${entry.finalMessage}`)
    }
    if (entry.candidateMessage) {
        parts.push(`Candidate Message:\n${entry.candidateMessage}`)
    }
    if (entry.promptPreview) {
        parts.push(`Prompt Preview:\n${entry.promptPreview}`)
    }
    if (entry.requestPayload) {
        parts.push(`Request Payload:\n${entry.requestPayload}`)
    }
    if (entry.rawResponse) {
        parts.push(`Raw Response:\n${entry.rawResponse}`)
    }
    if (entry.metadata) {
        parts.push(`Metadata:\n${JSON.stringify(entry.metadata, null, 2)}`)
    }

    return parts.join('\n\n')
}

export default function LogsSettings({ embedded = false }: { embedded?: boolean } = {}) {
    const [logs, setLogs] = useState<AiDebugLogEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isClearing, setIsClearing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<ProviderFilter>('all')
    const [copiedKey, setCopiedKey] = useState<string | null>(null)

    const loadLogs = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const result = await window.devscope.getAiDebugLogs(200)
            if (!result?.success) {
                setError(result?.error || 'Failed to load logs')
                setLogs([])
                return
            }
            setLogs(Array.isArray(result.logs) ? result.logs : [])
        } catch (err: any) {
            setError(err?.message || 'Failed to load logs')
            setLogs([])
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        void loadLogs()
    }, [])

    const handleClear = async () => {
        setIsClearing(true)
        setError(null)
        try {
            const result = await window.devscope.clearAiDebugLogs()
            if (!result?.success) {
                setError(result?.error || 'Failed to clear logs')
                return
            }
            setLogs([])
        } catch (err: any) {
            setError(err?.message || 'Failed to clear logs')
        } finally {
            setIsClearing(false)
        }
    }

    const filteredLogs = useMemo(() => {
        if (filter === 'all') return logs
        return logs.filter((entry) => entry.provider === filter)
    }, [logs, filter])

    const copyText = async (key: string, value: string) => {
        if (!value?.trim()) return
        setError(null)
        try {
            const result = await window.devscope.copyToClipboard?.(value)
            if (result && result.success === false) {
                throw new Error(result.error || 'Failed to copy logs')
            }
            if (!result && navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(value)
            }
            setCopiedKey(key)
            window.setTimeout(() => {
                setCopiedKey((prev) => (prev === key ? null : prev))
            }, 1500)
        } catch (err: any) {
            setError(err?.message || 'Failed to copy logs')
        }
    }

    const copyVisibleLogs = async () => {
        const payload = filteredLogs.map((entry) => formatLogEntry(entry)).join('\n\n====================\n\n')
        await copyText('visible', payload)
    }

    return (
        <div className="animate-fadeIn">
            {!embedded && (
                <div className="mb-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <Bug className="text-amber-400" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold text-sparkle-text">AI Logs</h1>
                                <p className="text-sm text-sparkle-text-secondary">
                                    Inspect raw AI responses and final commit messages
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/settings"
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-sparkle-text hover:text-[var(--accent-primary)] bg-sparkle-card hover:bg-sparkle-card-hover border border-sparkle-border rounded-lg transition-all shrink-0"
                        >
                            <ArrowLeft size={16} />
                            Back to Settings
                        </Link>
                    </div>
                </div>
            )}

            <div className="bg-sparkle-card rounded-xl border border-sparkle-border p-4 mb-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setFilter('all')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                                filter === 'all'
                                    ? 'bg-[var(--accent-primary)]/15 border-[var(--accent-primary)]/40 text-[var(--accent-primary)]'
                                    : 'bg-sparkle-bg border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text'
                            )}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilter('gemini')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                                filter === 'gemini'
                                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                                    : 'bg-sparkle-bg border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text'
                            )}
                        >
                            Gemini
                        </button>
                        <button
                            onClick={() => setFilter('groq')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                                filter === 'groq'
                                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                                    : 'bg-sparkle-bg border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text'
                            )}
                        >
                            Groq
                        </button>
                        <button
                            onClick={() => setFilter('codex')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                                filter === 'codex'
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                    : 'bg-sparkle-bg border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text'
                            )}
                        >
                            Codex
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={copyVisibleLogs}
                            disabled={filteredLogs.length === 0}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                            <Copy size={16} />
                            {copiedKey === 'visible' ? 'Copied' : 'Copy Visible'}
                        </button>
                        <button
                            onClick={loadLogs}
                            disabled={isLoading}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={cn(isLoading && 'animate-spin')} />
                            Refresh
                        </button>
                        <button
                            onClick={handleClear}
                            disabled={isClearing}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                            <Trash2 size={16} />
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {filteredLogs.length === 0 && (
                    <div className="bg-sparkle-card rounded-xl border border-sparkle-border p-6 text-sm text-sparkle-text-secondary">
                        No AI logs yet. Generate a commit message, then refresh this page.
                    </div>
                )}

                {filteredLogs.map((entry) => {
                    const providerColor = entry.provider === 'gemini'
                        ? 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                        : entry.provider === 'codex'
                            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-violet-400 bg-violet-500/10 border-violet-500/20'

                    return (
                        <div key={entry.id} className="bg-sparkle-card rounded-xl border border-sparkle-border p-4 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={cn('text-xs px-2 py-1 rounded-md border uppercase tracking-wide', providerColor)}>
                                    {entry.provider}
                                </span>
                                <span className={cn(
                                    'text-xs px-2 py-1 rounded-md border uppercase tracking-wide',
                                    entry.status === 'success'
                                        ? 'text-green-400 bg-green-500/10 border-green-500/20'
                                        : 'text-red-400 bg-red-500/10 border-red-500/20'
                                )}>
                                    {entry.status}
                                </span>
                                <span className="text-xs text-sparkle-text-muted">
                                    {new Date(entry.timestamp).toLocaleString()}
                                </span>
                                {entry.model && (
                                    <span className="text-xs text-sparkle-text-secondary font-mono">
                                        {entry.model}
                                    </span>
                                )}
                                {entry.status === 'success' && (
                                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                        <CheckCircle size={12} />
                                        saved
                                    </span>
                                )}
                                <button
                                    onClick={() => void copyText(`entry-${entry.id}`, formatLogEntry(entry))}
                                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-sparkle-bg border border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text"
                                >
                                    <Copy size={12} />
                                    {copiedKey === `entry-${entry.id}` ? 'Copied' : 'Copy Entry'}
                                </button>
                            </div>

                            {entry.error && (
                                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                    {entry.error}
                                </div>
                            )}

                            {entry.finalMessage && (
                                <LogBlock
                                    title="Final Commit Message"
                                    value={entry.finalMessage}
                                    copied={copiedKey === `final-${entry.id}`}
                                    onCopy={() => void copyText(`final-${entry.id}`, entry.finalMessage!)}
                                />
                            )}
                            {entry.candidateMessage && (
                                <LogBlock
                                    title="AI Candidate Message"
                                    value={entry.candidateMessage}
                                    copied={copiedKey === `candidate-${entry.id}`}
                                    onCopy={() => void copyText(`candidate-${entry.id}`, entry.candidateMessage!)}
                                />
                            )}

                            <details className="group rounded-lg border border-sparkle-border p-3">
                                <summary className="cursor-pointer text-sm text-sparkle-text-secondary group-open:text-sparkle-text">
                                    Show Request / Raw Response
                                </summary>
                                <div className="space-y-3 mt-3">
                                    {entry.promptPreview && (
                                        <LogBlock
                                            title="Prompt Preview"
                                            value={entry.promptPreview}
                                            copied={copiedKey === `prompt-${entry.id}`}
                                            onCopy={() => void copyText(`prompt-${entry.id}`, entry.promptPreview!)}
                                        />
                                    )}
                                    {entry.requestPayload && (
                                        <LogBlock
                                            title="Request Payload"
                                            value={entry.requestPayload}
                                            copied={copiedKey === `request-${entry.id}`}
                                            onCopy={() => void copyText(`request-${entry.id}`, entry.requestPayload!)}
                                        />
                                    )}
                                    {entry.rawResponse && (
                                        <LogBlock
                                            title="Raw API Response"
                                            value={entry.rawResponse}
                                            copied={copiedKey === `raw-${entry.id}`}
                                            onCopy={() => void copyText(`raw-${entry.id}`, entry.rawResponse!)}
                                        />
                                    )}
                                    {entry.metadata && (
                                        <LogBlock
                                            title="Metadata"
                                            value={JSON.stringify(entry.metadata, null, 2)}
                                            copied={copiedKey === `meta-${entry.id}`}
                                            onCopy={() => void copyText(`meta-${entry.id}`, JSON.stringify(entry.metadata, null, 2))}
                                        />
                                    )}
                                </div>
                            </details>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function LogBlock({
    title,
    value,
    onCopy,
    copied
}: {
    title: string
    value: string
    onCopy?: () => void
    copied?: boolean
}) {
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs uppercase tracking-wide text-sparkle-text-muted">{title}</p>
                {onCopy && (
                    <button
                        onClick={onCopy}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-sparkle-bg border border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text"
                    >
                        <Copy size={11} />
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                )}
            </div>
            <pre className="text-xs leading-5 bg-sparkle-bg border border-sparkle-border rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words text-sparkle-text-secondary">
                {value}
            </pre>
        </div>
    )
}

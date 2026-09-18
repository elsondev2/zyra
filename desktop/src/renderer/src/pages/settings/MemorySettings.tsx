import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import type { ZyraMemoryOverview, ZyraMemoryJobStatus } from '@shared/contracts/memory-contracts'
import { ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_OPTIONS } from '@shared/assistant/runtime-policy'
import { useSettings } from '@/lib/settings'
import { registerSettingsCacheClearer } from '@/lib/settings-cache-registry'
import { SettingsPageLink } from './SettingsPageTabs'
import { SettingsKeyValueList } from './SettingsKeyValueList'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSelect
} from './settings-layout'
import { createSettingsRowTargetId } from './settings-search'

const MEMORY_OVERVIEW_TTL_MS = 15_000
let cachedMemoryOverview: ZyraMemoryOverview | null = null
let cachedMemoryOverviewAt = 0
let memoryCacheTimer = 0

function rememberMemoryOverview(overview: ZyraMemoryOverview): void {
    cachedMemoryOverview = overview
    cachedMemoryOverviewAt = Date.now()
    window.clearTimeout(memoryCacheTimer)
    memoryCacheTimer = window.setTimeout(() => {
        cachedMemoryOverview = null
        cachedMemoryOverviewAt = 0
    }, MEMORY_OVERVIEW_TTL_MS)
}

registerSettingsCacheClearer('settings-memory', () => {
    window.clearTimeout(memoryCacheTimer)
    cachedMemoryOverview = null
    cachedMemoryOverviewAt = 0
})

type LoadState =
    | { status: 'loading'; overview: ZyraMemoryOverview | null; error: null }
    | { status: 'ready'; overview: ZyraMemoryOverview; error: null }
    | { status: 'error'; overview: ZyraMemoryOverview | null; error: string }

export type MemorySettingsView = 'overview' | 'inspect'

export default function MemorySettings({ view = 'overview' }: { view?: MemorySettingsView }) {
    const [state, setState] = useState<LoadState>(() => cachedMemoryOverview
        ? { status: 'ready', overview: cachedMemoryOverview, error: null }
        : { status: 'loading', overview: null, error: null })
    const [selectedId, setSelectedId] = useState<string | null>(() => cachedMemoryOverview?.memoryLayers[0]?.id || null)
    const [copiedValue, setCopiedValue] = useState<string | null>(null)
    const requestIdRef = useRef(0)
    const copiedTimerRef = useRef<number | null>(null)

    const load = useCallback(async (forceRefresh = false) => {
        if (!forceRefresh && cachedMemoryOverview && Date.now() - cachedMemoryOverviewAt < MEMORY_OVERVIEW_TTL_MS) {
            setState({ status: 'ready', overview: cachedMemoryOverview, error: null })
            setSelectedId((current) => current || cachedMemoryOverview?.memoryLayers[0]?.id || null)
            return
        }
        const requestId = ++requestIdRef.current
        setState((current) => ({ status: 'loading', overview: current.overview, error: null }))
        try {
            const result = await window.devscope.memory.getOverview()
            if (requestId !== requestIdRef.current) return
            if (!result.success) {
                setState((current) => ({ status: 'error', overview: current.overview, error: result.error }))
                return
            }
            rememberMemoryOverview(result.overview)
            setState({ status: 'ready', overview: result.overview, error: null })
            setSelectedId((current) => current || result.overview.memoryLayers[0]?.id || null)
        } catch (error) {
            if (requestId !== requestIdRef.current) return
            setState((current) => ({
                status: 'error',
                overview: current.overview,
                error: error instanceof Error ? error.message : 'Could not load local memory.'
            }))
        }
    }, [])

    useEffect(() => {
        if (view === 'inspect') void load()
        return () => {
            requestIdRef.current += 1
            if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
        }
    }, [load, view])

    const copyValue = useCallback(async (value: string) => {
        try {
            const result = await window.devscope.copyToClipboard(value)
            if (result?.success === false) throw new Error(result.error || 'Could not copy this value.')
            setCopiedValue(value)
            if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
            copiedTimerRef.current = window.setTimeout(() => {
                copiedTimerRef.current = null
                setCopiedValue((current) => current === value ? null : current)
            }, 1400)
        } catch (error) {
            setState((current) => ({
                status: 'error',
                overview: current.overview,
                error: error instanceof Error ? error.message : 'Could not copy this value.'
            }))
        }
    }, [])

    return (
        <SettingsPageContainer title={view === 'inspect' ? 'Saved memory' : 'Context & memory'} navigation={<></>} backTo="/settings/assistant/memory" backLabel="Context & memory" showSettingsBack={view === 'inspect'}>
            {view === 'overview' ? (
                <MemoryOverviewView />
            ) : (
                <MemoryInspectView
                    state={state}
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                    load={load}
                    copiedValue={copiedValue}
                    copyValue={copyValue}
                />
            )}
        </SettingsPageContainer>
    )
}

function MemoryOverviewView() {
    const { settings, updateSettings } = useSettings()
    const { job, error: jobError } = useMemoryJobStatus()
    const jobLabel = jobError ? 'Unavailable' : job?.phase === 'running' ? 'Updating memory'
        : job?.phase === 'waiting' ? 'Waiting for chats to be idle'
            : job?.phase === 'error' ? 'Update needs attention'
                : job?.phase === 'offline' ? 'Background service is idle'
                    : job ? 'Ready for the next conversation' : 'Checking'
    const jobDescription = jobError || job?.lastError
        || (job?.lastSuccessAt ? `Last saved ${new Date(job.lastSuccessAt).toLocaleString()}`
            : job?.lastCheckedAt ? `Last checked ${new Date(job.lastCheckedAt).toLocaleString()}. No new memory was needed.`
                : 'Useful context is saved after a conversation becomes idle.')

    return (
        <>
            <SettingsSection title="Context" searchSection="Reasoning and context">
                <SettingsRow
                    title="Context limit"
                    description="Summarize older context before it reaches this token limit."
                    info="Smaller model windows use a lower safe limit."
                    status={formatContextTokenLimit(settings.assistantContextCompactionThresholdTokens)}
                    statusTone="info"
                    control={(
                        <SettingsSelect
                            value={String(settings.assistantContextCompactionThresholdTokens)}
                            onChange={(event) => updateSettings({ assistantContextCompactionThresholdTokens: Number(event.target.value) })}
                            aria-label="Context compaction limit"
                        >
                            {ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_OPTIONS.map((tokens) => (
                                <option key={tokens} value={tokens}>{formatContextTokenLimit(tokens)} tokens</option>
                            ))}
                        </SettingsSelect>
                    )}
                />
            </SettingsSection>

            <SettingsSection title="Memory">
                <SettingsRow title="Automatic updates" description={jobDescription} status={jobLabel} statusTone={jobError || job?.phase === 'error' ? 'danger' : 'muted'} />
                <SettingsPageLink to="/settings/assistant/memory/inspect" title="Inspect saved memory" description="Read saved context and copy its file locations." />
            </SettingsSection>
        </>
    )
}

function MemoryInspectView({ state, selectedId, setSelectedId, load, copiedValue, copyValue }: {
    state: LoadState
    selectedId: string | null
    setSelectedId: (id: string) => void
    load: (forceRefresh?: boolean) => Promise<void>
    copiedValue: string | null
    copyValue: (value: string) => Promise<void>
}) {
    const overview = state.overview
    const selectedLayer = useMemo(
        () => overview?.memoryLayers.find((layer) => layer.id === selectedId) || overview?.memoryLayers[0] || null,
        [overview, selectedId]
    )

    return (
        <>
            <SettingsSection title="Layers" headerAction={<SettingsButton variant="ghost" onClick={() => void load(true)} disabled={state.status === 'loading'}><RefreshCw size={12} className={state.status === 'loading' ? 'animate-spin' : ''} />Refresh</SettingsButton>}>
                {state.status === 'error' ? <SettingsNotice tone="error">{state.error}</SettingsNotice> : null}
                {overview?.memoryLayers.length && selectedLayer ? (
                    <>
                        <SettingsRow
                            title="Memory layer"
                            description="Choose a file to read its saved context."
                            status={formatBytes(selectedLayer.size)}
                            info={<div className="space-y-2"><p>{selectedLayer.summary || 'No stable summary yet.'}</p><p>Updated {new Date(selectedLayer.updatedAt).toLocaleString()}</p><code className="block break-all text-[11px]">{selectedLayer.filePath}</code></div>}
                            control={<div className="flex items-center gap-1"><SettingsSelect value={selectedLayer.id} onChange={(event) => setSelectedId(event.target.value)} aria-label="Memory layer">{overview.memoryLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.title}</option>)}</SettingsSelect><MemoryCopyButton value={selectedLayer.filePath} label={`${selectedLayer.title} path`} copiedValue={copiedValue} onCopy={copyValue} /></div>}
                        />
                        <pre
                            data-settings-search-target={createSettingsRowTargetId('Layers', 'File content')}
                            tabIndex={-1}
                            aria-label={`${selectedLayer.title} content`}
                            className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words border-t border-[var(--settings-row-divider)] p-4 font-mono text-[12px] leading-5 text-[var(--settings-text-secondary)] [scrollbar-gutter:stable]"
                        >{selectedLayer.content || 'This memory layer is empty.'}</pre>
                    </>
                ) : <SettingsNotice>{state.status === 'loading' ? 'Loading memory layers…' : state.status === 'error' ? 'Memory layers could not be loaded.' : 'No memory layers were found.'}</SettingsNotice>}
            </SettingsSection>

            <SettingsSection title="Locations">
                {overview ? <SettingsKeyValueList label="Memory locations" items={[
                    ['root', 'Zyra data', overview.rootPath],
                    ['memory', 'Memory files', overview.memoryDirectory],
                    ['sessions', 'Chat records', overview.sessionsDirectory],
                    ['cli', 'CLI entry', overview.cliPath]
                ].map(([id, label, value]) => ({ id, label, value: <div className="flex min-w-0 items-center justify-end gap-2"><code className="min-w-0 truncate text-[11px]" title={value}>{value}</code><MemoryCopyButton value={value} label={`${label} path`} copiedValue={copiedValue} onCopy={copyValue} /></div> }))} /> : <SettingsNotice>{state.status === 'loading' ? 'Loading locations…' : 'Locations are unavailable.'}</SettingsNotice>}
            </SettingsSection>

            <SettingsSection title="Recommended prompts">
                {overview?.recommendedPrompts.length ? overview.recommendedPrompts.map((prompt) => (
                    <SettingsRow key={prompt} title={<span className="block truncate" title={prompt}>{prompt}</span>} description="Copy this suggestion into a chat." control={<MemoryCopyButton value={prompt} label="suggested prompt" copiedValue={copiedValue} onCopy={copyValue} />} />
                )) : <SettingsNotice>{state.status === 'loading' ? 'Loading suggestions…' : 'No recommended prompts are available.'}</SettingsNotice>}
            </SettingsSection>
        </>
    )
}

function useMemoryJobStatus(): { job: ZyraMemoryJobStatus | null; error: string | null } {
    const [job, setJob] = useState<ZyraMemoryJobStatus | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        let pending = false
        const read = async () => {
            if (pending || document.hidden) return
            pending = true
            try {
                const result = await window.devscope.memory.getJobStatus()
                if (mounted) {
                    if (result.success) { setJob(result.status); setError(null) }
                    else setError(result.error || 'Could not check memory updates.')
                }
            } catch {
                if (mounted) setError('Could not check memory updates; retrying automatically.')
            } finally {
                pending = false
            }
        }
        void read()
        const timer = window.setInterval(() => void read(), 5000)
        document.addEventListener('visibilitychange', read)
        return () => {
            mounted = false
            window.clearInterval(timer)
            document.removeEventListener('visibilitychange', read)
        }
    }, [])

    return { job, error }
}

function MemoryCopyButton({ value, label, copiedValue, onCopy }: {
    value: string
    label: string
    copiedValue: string | null
    onCopy: (value: string) => Promise<void>
}) {
    const copied = copiedValue === value
    return (
        <SettingsButton variant="ghost" onClick={() => void onCopy(value)} aria-label={`Copy ${label}`}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
        </SettingsButton>
    )
}

function formatContextTokenLimit(value: number): string {
    return `${Math.round(value / 1_000).toLocaleString()}k`
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
    return `${Math.round(value / 1024 / 102.4) / 10} MB`
}

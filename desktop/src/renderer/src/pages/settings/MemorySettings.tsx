import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import type { ZyraMemoryOverview } from '@shared/contracts/memory-contracts'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection
} from './settings-layout'

type LoadState =
    | { status: 'loading'; overview: ZyraMemoryOverview | null; error: null }
    | { status: 'ready'; overview: ZyraMemoryOverview; error: null }
    | { status: 'error'; overview: null; error: string }

export default function MemorySettings() {
    const [state, setState] = useState<LoadState>({ status: 'loading', overview: null, error: null })
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [copiedPath, setCopiedPath] = useState<string | null>(null)

    const load = async () => {
        setState((current) => ({ status: 'loading', overview: current.overview, error: null }))
        const result = await window.devscope.memory.getOverview()
        if (!result.success) {
            setState({ status: 'error', overview: null, error: result.error })
            return
        }
        setState({ status: 'ready', overview: result.overview, error: null })
        setSelectedId((current) => current || result.overview.memoryLayers[0]?.id || null)
    }

    useEffect(() => { void load() }, [])

    const overview = state.overview
    const selectedLayer = useMemo(() => overview?.memoryLayers.find((layer) => layer.id === selectedId) || overview?.memoryLayers[0] || null, [overview, selectedId])

    const copyPath = async (path: string) => {
        await window.devscope.copyToClipboard(path)
        setCopiedPath(path)
        window.setTimeout(() => setCopiedPath((current) => current === path ? null : current), 1400)
    }

    const copyButton = (path: string, label: string) => (
        <SettingsButton variant="ghost" onClick={() => void copyPath(path)} aria-label={`Copy ${label}`}>
            {copiedPath === path ? <Check size={13} /> : <Copy size={13} />}
            {copiedPath === path ? 'Copied' : 'Copy'}
        </SettingsButton>
    )

    return (
        <SettingsPageContainer>
            <SettingsSection title="Memory" headerAction={<SettingsButton variant="ghost" onClick={() => void load()} disabled={state.status === 'loading'}><RefreshCw size={12} className={state.status === 'loading' ? 'animate-spin' : ''} />Refresh</SettingsButton>}>
                {state.status === 'error' ? <SettingsNotice tone="error">{state.error}</SettingsNotice> : null}
                <SettingsRow title="Zyra root" description="Local root used by the active Zyra installation." status={overview?.rootPath || 'Loading…'} statusTone={overview ? 'muted' : 'info'} control={overview ? copyButton(overview.rootPath, 'Zyra root') : null} />
                <SettingsRow title="Memory directory" description="Folder containing the memory layers loaded before a chat starts." status={overview?.memoryDirectory || 'Loading…'} statusTone={overview ? 'muted' : 'info'} control={overview ? copyButton(overview.memoryDirectory, 'memory directory') : null} />
                <SettingsRow title="Sessions directory" description="Local location for canonical session records." status={overview?.sessionsDirectory || 'Loading…'} statusTone={overview ? 'muted' : 'info'} control={overview ? copyButton(overview.sessionsDirectory, 'sessions directory') : null} />
                <SettingsRow title="Runtime defaults" description="Default model and thinking level used by the local runtime." control={<span className="text-xs font-medium text-sparkle-text-secondary">{overview ? `${overview.defaultModel} · ${overview.defaultThinking}` : 'Loading…'}</span>} />
            </SettingsSection>

            <SettingsSection title="Layers">
                {overview?.memoryLayers.length ? overview.memoryLayers.map((layer) => (
                    <SettingsRow
                        key={layer.id}
                        title={layer.title}
                        description={layer.summary || 'No stable summary yet.'}
                        status={`${formatBytes(layer.size)} · updated ${new Date(layer.updatedAt).toLocaleString()}`}
                        className={selectedLayer?.id === layer.id ? 'bg-[var(--settings-active)]' : undefined}
                        control={<div className="flex gap-1"><SettingsButton variant="ghost" onClick={() => setSelectedId(layer.id)}>{selectedLayer?.id === layer.id ? 'Selected' : 'View'}</SettingsButton>{copyButton(layer.filePath, `${layer.title} path`)}</div>}
                    />
                )) : <SettingsNotice>{state.status === 'loading' ? 'Loading memory layers…' : 'No memory layers were found.'}</SettingsNotice>}
            </SettingsSection>

            {selectedLayer ? (
                <SettingsSection title={selectedLayer.title}>
                    <SettingsRow title="File content" description="Read-only view of the selected local memory layer.">
                        <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap border-t border-[var(--settings-border)] py-4 font-mono text-[12px] leading-relaxed text-sparkle-text-secondary">{selectedLayer.content || 'This memory layer is empty.'}</pre>
                    </SettingsRow>
                </SettingsSection>
            ) : null}

            <SettingsSection title="Recommended prompts">
                {overview?.recommendedPrompts.length ? overview.recommendedPrompts.map((prompt) => <SettingsRow key={prompt} title={prompt} description="Suggested prompt derived from the active memory setup." />) : <SettingsNotice>No recommended prompts are available.</SettingsNotice>}
            </SettingsSection>
        </SettingsPageContainer>
    )
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
    return `${Math.round(value / 1024 / 102.4) / 10} MB`
}

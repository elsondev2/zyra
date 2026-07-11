import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AssistantComposer, type AssistantComposerSendOptions, type ComposerContextFile } from '../assistant/AssistantComposer'
import { ConnectedDropdownButton } from '@/components/ui/ConnectedDropdownButton'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings'
import type { AssistantTranscriptionModelState } from '@shared/assistant/contracts'

type ModelOption = { id: string; label: string; description?: string }

const TRANSCRIPTION_ENGINE_META = {
    browser: {
        title: 'Browser speech service',
        summary: 'Ready immediately. No download.'
    },
    vosk: {
        title: 'Local Vosk model',
        summary: 'Local model with rolling updates.'
    }
} as const

export function AssistantDefaultsPanel() {
    const [searchParams, setSearchParams] = useSearchParams()
    const { settings, updateSettings } = useSettings()
    const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
    const [modelsLoading, setModelsLoading] = useState(false)
    const [modelsError, setModelsError] = useState<string | null>(null)
    const [lastAppliedPrompt, setLastAppliedPrompt] = useState('')
    const [lastAppliedAt, setLastAppliedAt] = useState<number | null>(null)
    const [composerResetVersion, setComposerResetVersion] = useState(0)
    const [transcriptionModelState, setTranscriptionModelState] = useState<AssistantTranscriptionModelState | null>(null)
    const [transcriptionModelLoading, setTranscriptionModelLoading] = useState(false)
    const [transcriptionModelError, setTranscriptionModelError] = useState<string | null>(null)
    const [highlightTranscriptionSection, setHighlightTranscriptionSection] = useState(false)
    const transcriptionSectionRef = useRef<HTMLElement | null>(null)

    const loadTranscriptionModelState = useCallback(async () => {
        setTranscriptionModelLoading(true)
        setTranscriptionModelError(null)
        try {
            const result = await window.devscope.assistant.getTranscriptionModelState()
            if (!result.success) {
                throw new Error(result.error || 'Failed to read transcription model state.')
            }
            setTranscriptionModelState(result.state)
        } catch (error) {
            setTranscriptionModelError(error instanceof Error ? error.message : 'Failed to read transcription model state.')
        } finally {
            setTranscriptionModelLoading(false)
        }
    }, [])

    const loadModels = useCallback(async (forceRefresh = false) => {
        setModelsLoading(true)
        setModelsError(null)
        try {
            const result = await window.devscope.assistant.listModels(forceRefresh)
            if (!result.success) {
                throw new Error(result.error || 'Failed to load assistant models.')
            }
            setModelOptions(result.models)
        } catch (error) {
            setModelsError(error instanceof Error ? error.message : 'Failed to load assistant models.')
        } finally {
            setModelsLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadModels(false)
    }, [loadModels])

    useEffect(() => {
        void loadTranscriptionModelState()
    }, [loadTranscriptionModelState])

    useEffect(() => {
        if (transcriptionModelState?.status !== 'downloading') return
        const intervalId = window.setInterval(() => {
            void loadTranscriptionModelState()
        }, 1800)
        return () => window.clearInterval(intervalId)
    }, [loadTranscriptionModelState, transcriptionModelState?.status])

    useEffect(() => {
        if (searchParams.get('highlight') !== 'transcription') return
        setHighlightTranscriptionSection(true)

        const scrollTimeout = window.setTimeout(() => {
            transcriptionSectionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            })
        }, 80)

        const cleanupParamsTimeout = window.setTimeout(() => {
            const nextParams = new URLSearchParams(searchParams)
            nextParams.delete('highlight')
            setSearchParams(nextParams, { replace: true })
        }, 220)

        const clearHighlightTimeout = window.setTimeout(() => {
            setHighlightTranscriptionSection(false)
        }, 2600)

        return () => {
            window.clearTimeout(scrollTimeout)
            window.clearTimeout(cleanupParamsTimeout)
            window.clearTimeout(clearHighlightTimeout)
        }
    }, [searchParams, setSearchParams])

    const activeProfileLabel = settings.assistantDefaultRuntimeMode === 'full-access' ? 'yolo-fast' : 'safe-dev'

    const handleSandboxSend = useCallback(async (
        prompt: string,
        _contextFiles: ComposerContextFile[],
        options: AssistantComposerSendOptions
    ) => {
        updateSettings({
            assistantDefaultModel: options.model || '',
            assistantDefaultPromptTemplate: prompt,
            assistantDefaultRuntimeMode: options.runtimeMode,
            assistantDefaultInteractionMode: options.interactionMode,
            assistantDefaultEffort: options.effort,
            assistantDefaultFastMode: options.serviceTier === 'fast'
        })
        setLastAppliedPrompt(prompt.trim().slice(0, 120))
        setLastAppliedAt(Date.now())
        setComposerResetVersion((current) => current + 1)
        return true
    }, [updateSettings])

    const handleDownloadTranscriptionModel = useCallback(async () => {
        setTranscriptionModelLoading(true)
        setTranscriptionModelError(null)
        setTranscriptionModelState((previous) => previous ? {
            ...previous,
            status: 'downloading',
            error: null
        } : {
            provider: 'vosk',
            modelId: 'vosk-model-small-en-us-0.15',
            modelName: 'Vosk Small English (US)',
            status: 'downloading',
            installPath: null,
            downloadUrl: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
            error: null
        })
        try {
            const result = await window.devscope.assistant.downloadTranscriptionModel()
            if (!result.success) {
                throw new Error(result.error || 'Failed to download transcription model.')
            }
            setTranscriptionModelState(result.state)
        } catch (error) {
            setTranscriptionModelError(error instanceof Error ? error.message : 'Failed to download transcription model.')
        } finally {
            setTranscriptionModelLoading(false)
        }
    }, [])

    const transcriptionStatusLabel = transcriptionModelState?.status === 'ready'
        ? 'Installed'
        : transcriptionModelState?.status === 'downloading'
            ? 'Downloading'
            : transcriptionModelState?.status === 'error'
                ? 'Error'
                : 'Not installed'
    const transcriptionModelReady = transcriptionModelState?.status === 'ready'
    const transcriptionModelDownloading = transcriptionModelState?.status === 'downloading'
    const showVoskDownloadAction = settings.assistantTranscriptionEngine === 'vosk' && !transcriptionModelReady
    const transcriptionEngineMeta = TRANSCRIPTION_ENGINE_META[settings.assistantTranscriptionEngine]
    const lastAppliedLabel = lastAppliedAt
        ? new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        }).format(new Date(lastAppliedAt))
        : null

    return (
        <div className="w-full space-y-4">
            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.04fr)_minmax(360px,0.96fr)]">
                <section className={cn('rounded-2xl border border-white/10 bg-sparkle-card p-3 sm:p-4', modelsLoading && 'opacity-100')}>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-sparkle-text">Composer Defaults</h2>
                            <p className="mt-1 text-sm text-sparkle-text-secondary">
                                Set the prompt, model, and runtime defaults for new threads.
                            </p>
                        </div>
                        {lastAppliedLabel ? (
                            <span className="inline-flex rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-sparkle-text-muted">
                                Saved {lastAppliedLabel}
                            </span>
                        ) : null}
                    </div>

                    <div className="rounded-2xl bg-black/[0.14] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:p-2.5">
                        <AssistantComposer
                            key={`settings-assistant-defaults-${composerResetVersion}`}
                            sessionId={null}
                            disabled={false}
                            allowEmptySubmit
                            isSending={false}
                            isThinking={false}
                            thinkingLabel="Previewing..."
                            isConnected={true}
                            activeModel={settings.assistantDefaultModel.trim() || modelOptions[0]?.id || undefined}
                            modelOptions={modelOptions}
                            modelsLoading={modelsLoading}
                            modelsError={modelsError}
                            onRefreshModels={() => void loadModels(true)}
                            activeProfile={activeProfileLabel}
                            runtimeMode={settings.assistantDefaultRuntimeMode}
                            interactionMode={settings.assistantDefaultInteractionMode}
                            projectPath={null}
                            compact={settings.compactMode}
                            submitLabel="Save"
                            dirtySubmitLabel="Unsaved"
                            cancelLabel="Cancel"
                            showCancelWhenDirty
                            onSend={handleSandboxSend}
                        />
                    </div>

                    {lastAppliedPrompt ? (
                        <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-sparkle-text-muted">
                            <span className="mr-1 text-sparkle-text-secondary">Last prompt:</span>
                            <span className="truncate">{lastAppliedPrompt}</span>
                        </div>
                    ) : null}

                    {modelsError ? <p className="mt-2 text-xs text-rose-300">{modelsError}</p> : null}
                </section>

                <div className="grid gap-4 xl:h-full xl:grid-rows-4">
                    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-sparkle-card p-4 sm:p-5">
                        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                            <div>
                                <h2 className="text-sm font-semibold text-sparkle-text">Streaming</h2>
                                <p className="mt-1 text-sm text-sparkle-text-secondary">
                                    Choose live or chunked output.
                                </p>
                            </div>
                            <ConnectedDropdownButton
                                className="justify-self-end self-center"
                                value={settings.assistantTextStreamingMode}
                                options={[
                                    { id: 'stream', label: 'Live stream', tone: 'sky' },
                                    { id: 'chunks', label: 'Chunked output', tone: 'amber' }
                                ]}
                                menuLabel="Choose streaming mode"
                                onChange={(value) => updateSettings({ assistantTextStreamingMode: value as 'stream' | 'chunks' })}
                            />
                        </div>
                    </section>

                    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-sparkle-card p-4 sm:p-5">
                        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                            <div>
                                <h2 className="text-sm font-semibold text-sparkle-text">Command Output</h2>
                                <p className="mt-1 text-sm text-sparkle-text-secondary">
                                    Choose whether live tool output opens automatically.
                                </p>
                            </div>
                            <ConnectedDropdownButton
                                className="justify-self-end self-center"
                                value={settings.assistantToolOutputDefaultMode}
                                options={[
                                    { id: 'expanded', label: 'Expand live', tone: 'sky' },
                                    { id: 'minimized', label: 'Keep minimized', tone: 'amber' }
                                ]}
                                menuLabel="Choose command output mode"
                                onChange={(value) => updateSettings({ assistantToolOutputDefaultMode: value as 'expanded' | 'minimized' })}
                            />
                        </div>
                    </section>

                    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-sparkle-card p-4 sm:p-5">
                        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                            <div>
                                <h2 className="text-sm font-semibold text-sparkle-text">Busy Send</h2>
                                <p className="mt-1 text-sm text-sparkle-text-secondary">
                                    Set the default send action during an active turn.
                                </p>
                            </div>
                            <ConnectedDropdownButton
                                className="justify-self-end self-center"
                                value={settings.assistantBusyMessageMode}
                                options={[
                                    { id: 'queue', label: 'Queue next', tone: 'emerald' },
                                    { id: 'force', label: 'Interrupt turn', tone: 'rose' }
                                ]}
                                menuLabel="Choose busy send mode"
                                onChange={(value) => updateSettings({ assistantBusyMessageMode: value as 'queue' | 'force' })}
                            />
                        </div>
                    </section>

                    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-sparkle-card p-4 sm:p-5">
                        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                            <div>
                                <h2 className="text-sm font-semibold text-sparkle-text">Playground Terminal</h2>
                                <p className="mt-1 text-sm text-sparkle-text-secondary">
                                    Default access for no-lab Playground chats.
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings.assistantPlaygroundTerminalAccessDefault}
                                aria-label={settings.assistantPlaygroundTerminalAccessDefault ? 'Disable Playground terminal access by default' : 'Enable Playground terminal access by default'}
                                onClick={() => updateSettings({ assistantPlaygroundTerminalAccessDefault: !settings.assistantPlaygroundTerminalAccessDefault })}
                                className={cn(
                                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-[border-color,background-color,box-shadow] duration-200 justify-self-end',
                                    settings.assistantPlaygroundTerminalAccessDefault
                                        ? 'border-emerald-400/55 bg-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                )}
                            >
                                <span
                                    className={cn(
                                        'inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.28)] transition-transform',
                                        settings.assistantPlaygroundTerminalAccessDefault ? 'translate-x-6' : 'translate-x-1'
                                    )}
                                />
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            <section
                ref={transcriptionSectionRef}
                className={cn(
                    'mt-4 w-full rounded-2xl border border-transparent bg-sparkle-card p-4 transition-[background-color,box-shadow] duration-300 sm:p-5',
                    highlightTranscriptionSection
                        ? 'bg-[color-mix(in_srgb,var(--accent-primary)_10%,var(--color-sparkle-card))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_32%,transparent),0_0_24px_color-mix(in_srgb,var(--accent-primary)_16%,transparent)]'
                        : ''
                )}
            >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div>
                        <h2 className="text-sm font-semibold text-sparkle-text">Voice Transcription</h2>
                        <p className="mt-1 text-sm text-sparkle-text-secondary">Voice input for new threads.</p>
                    </div>
                    <div className="flex items-start justify-end">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={settings.assistantTranscriptionEnabled}
                            aria-label={settings.assistantTranscriptionEnabled ? 'Disable voice transcription' : 'Enable voice transcription'}
                            onClick={() => updateSettings({ assistantTranscriptionEnabled: !settings.assistantTranscriptionEnabled })}
                            className={cn(
                                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-[border-color,background-color,box-shadow] duration-200',
                                settings.assistantTranscriptionEnabled
                                    ? 'border-emerald-400/55 bg-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                            )}
                        >
                            <span
                                className={cn(
                                    'inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.28)] transition-transform',
                                    settings.assistantTranscriptionEnabled ? 'translate-x-6' : 'translate-x-1'
                                )}
                            />
                        </button>
                    </div>
                </div>

                {settings.assistantTranscriptionEnabled ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-semibold text-sparkle-text">
                                            {settings.assistantTranscriptionEngine === 'browser'
                                                ? transcriptionEngineMeta.title
                                                : (transcriptionModelState?.modelName || 'Vosk Small English (US)')}
                                        </h3>
                                        <span className={cn(
                                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                            settings.assistantTranscriptionEngine === 'browser'
                                                ? 'bg-sky-500/12 text-sky-200'
                                                : transcriptionModelState?.status === 'ready'
                                                    ? 'bg-emerald-500/12 text-emerald-200'
                                                    : transcriptionModelState?.status === 'downloading'
                                                        ? 'bg-sky-500/12 text-sky-200'
                                                        : transcriptionModelState?.status === 'error'
                                                            ? 'bg-rose-500/12 text-rose-200'
                                                            : 'bg-white/[0.04] text-sparkle-text-secondary'
                                        )}>
                                            {settings.assistantTranscriptionEngine === 'browser' ? 'Ready' : transcriptionStatusLabel}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-xs text-sparkle-text-secondary">
                                        {transcriptionEngineMeta.summary}
                                    </p>
                                </div>
                                <div className="flex flex-col items-start gap-2 sm:items-end">
                                    <ConnectedDropdownButton
                                        value={settings.assistantTranscriptionEngine}
                                        options={[
                                            { id: 'browser', label: 'Browser', tone: 'sky' },
                                            { id: 'vosk', label: 'Vosk', tone: 'emerald' }
                                        ]}
                                        className="self-start sm:ml-auto"
                                        menuLabel="Choose transcription engine"
                                        onChange={(value) => updateSettings({ assistantTranscriptionEngine: value as 'browser' | 'vosk' })}
                                    />
                                    {showVoskDownloadAction ? (
                                        <button
                                            type="button"
                                            onClick={() => void handleDownloadTranscriptionModel()}
                                            disabled={transcriptionModelLoading || transcriptionModelDownloading}
                                            className={cn(
                                                'inline-flex min-w-[148px] items-center justify-center rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                                                'bg-white/[0.04] text-sparkle-text hover:bg-white/[0.06]',
                                                (transcriptionModelLoading || transcriptionModelDownloading) && 'cursor-wait opacity-80'
                                            )}
                                        >
                                            {transcriptionModelDownloading ? 'Downloading...' : 'Download model'}
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            {settings.assistantTranscriptionEngine === 'vosk' && transcriptionModelState?.installPath ? (
                                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sparkle-text-muted">Install Path</p>
                                    <p className="mt-1 truncate text-[11px] text-sparkle-text-muted">
                                        {transcriptionModelState.installPath}
                                    </p>
                                </div>
                            ) : null}

                            {transcriptionModelState?.error || transcriptionModelError ? (
                                <p className="text-xs text-rose-300">{transcriptionModelState?.error || transcriptionModelError}</p>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </section>
        </div>
    )
}

import { useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, FolderOpen, KeyRound, RefreshCw } from 'lucide-react'
import type {
    OnboardingAppearanceSelection,
    OnboardingAuthStatus,
    OnboardingProjectsSelection,
    OnboardingRecord,
    OnboardingWebSelection
} from '@shared/onboarding/contracts'
import {
    APPEARANCE_CODE_FONTS,
    APPEARANCE_UI_FONTS,
    type DarkTheme,
    type Settings
} from '@/lib/settings'
import { getThemeDefinition } from '@/lib/settings-theme-catalog'
import { AppearanceSystemThemeCard, AppearanceThemeCard } from '@/pages/settings/appearance/AppearancePreviews'
import { SettingsInput, SettingsSelect, SettingsSwitch } from '@/pages/settings/settings-layout'
import { cn } from '@/lib/utils'

function StepHeading({ title, description }: { title: string; description: string }) {
    return (
        <header className="mb-8 max-w-[620px]">
            <h1 className="text-[28px] font-medium tracking-[-0.04em] text-sparkle-text sm:text-[32px]">{title}</h1>
            <p className="mt-3 text-[14px] leading-6 text-sparkle-text-secondary">{description}</p>
        </header>
    )
}

export function WelcomeStep() {
    return (
        <div className="flex min-h-full max-w-[680px] flex-col justify-center py-10">
            <div className="mb-8 flex items-center gap-3 text-[12px] font-medium text-sparkle-text-secondary">
                <span className="h-px w-8 bg-[var(--accent-primary)]" />
                Your local workshop
            </div>
            <h1 className="max-w-[640px] text-[42px] font-medium leading-[1.04] tracking-[-0.055em] text-sparkle-text sm:text-[52px]">
                Set up Zyra for this computer.
            </h1>
            <p className="mt-6 max-w-[560px] text-[16px] leading-7 text-sparkle-text-secondary">
                Connect OpenAI, choose how Zyra looks and reaches the web, then give it a bounded projects folder.
            </p>
            <div className="mt-10 grid max-w-[650px] gap-5 border-t border-[var(--surface-divider)] pt-6 sm:grid-cols-3">
                <div><p className="text-[12px] font-medium text-sparkle-text">Private by default</p><p className="mt-1 text-[11px] leading-5 text-sparkle-text-muted">Credentials stay in their existing protected stores.</p></div>
                <div><p className="text-[12px] font-medium text-sparkle-text">Resumable</p><p className="mt-1 text-[11px] leading-5 text-sparkle-text-muted">Close the window whenever you need to.</p></div>
                <div><p className="text-[12px] font-medium text-sparkle-text">Changeable</p><p className="mt-1 text-[11px] leading-5 text-sparkle-text-muted">Review these choices later in Settings.</p></div>
            </div>
        </div>
    )
}

export function ConnectOpenAiStep({
    status,
    loading,
    activity,
    error,
    onRefresh,
    onConnectChatGpt,
    onConnectApiKey
}: {
    status: OnboardingAuthStatus | null
    loading: boolean
    activity: 'checking' | 'chatgpt' | 'api-key' | null
    error: string | null
    onRefresh: () => Promise<void>
    onConnectChatGpt: () => Promise<void>
    onConnectApiKey: (apiKey: string) => Promise<void>
}) {
    const [apiKey, setApiKey] = useState('')
    const [showApiKey, setShowApiKey] = useState(false)
    const connected = status?.verified === true

    const submitApiKey = async () => {
        const key = apiKey
        setApiKey('')
        await onConnectApiKey(key)
    }

    return (
        <div>
            <StepHeading title="Connect OpenAI" description="Zyra uses Pi’s existing OpenAI credential store. A connected ChatGPT account or a verified API key can complete this step." />
            <div className="space-y-3">
                <section className={cn('border-y px-1 py-5', connected ? 'border-[color-mix(in_srgb,var(--status-success)_28%,transparent)]' : 'border-[var(--surface-divider)]')}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-[14px] font-medium">ChatGPT account</h2>
                                {connected && status?.method === 'chatgpt' ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--status-success)]"><Check size={11} />Connected</span> : null}
                            </div>
                            <p className="mt-1 text-[12px] leading-5 text-sparkle-text-secondary">Opens OpenAI sign-in in your default browser and returns here after the callback.</p>
                        </div>
                        <button type="button" disabled={loading} onClick={() => void onConnectChatGpt()} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--accent-primary)] px-3.5 text-[12px] font-semibold text-[var(--accent-on-primary)] transition-opacity hover:opacity-90 disabled:opacity-50">
                            <ExternalLink size={13} />{activity === 'chatgpt' ? 'Waiting…' : activity === 'checking' ? 'Checking…' : connected && status?.method === 'chatgpt' ? 'Reconnect' : 'Connect ChatGPT'}
                        </button>
                    </div>
                </section>

                <section className="border-b border-[var(--surface-divider)] px-1 py-5">
                    <div className="flex items-start gap-3">
                        <KeyRound size={16} className="mt-0.5 shrink-0 text-sparkle-text-muted" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-[14px] font-medium">OpenAI API key</h2>
                                {connected && status?.method === 'api-key' ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--status-success)]"><Check size={11} />Connected</span> : null}
                            </div>
                            <p className="mt-1 text-[12px] leading-5 text-sparkle-text-secondary">Verified with OpenAI, then saved by Pi. The key is never added to setup state or browser preferences.</p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                <SettingsInput
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="sk-…"
                                    aria-label="OpenAI API key"
                                    onChange={(event) => setApiKey(event.target.value)}
                                    className="!w-full sm:!w-auto sm:flex-1"
                                />
                                <button type="button" onClick={() => setShowApiKey((value) => !value)} className="h-8 rounded-md px-2.5 text-[11px] font-medium text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text">{showApiKey ? 'Hide' : 'Show'}</button>
                                <button type="button" disabled={loading || !apiKey.trim()} onClick={() => void submitApiKey()} className="h-8 rounded-md border border-[var(--surface-divider)] px-3 text-[11px] font-semibold text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-45">{activity === 'api-key' ? 'Verifying…' : 'Verify key'}</button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="mt-5 flex min-h-6 items-center gap-2 text-[11px]">
                {loading ? <RefreshCw size={12} className="animate-spin motion-reduce:animate-none text-sparkle-text-muted" /> : null}
                <span className={error ? 'text-[var(--status-danger)]' : connected ? 'text-[var(--status-success)]' : 'text-sparkle-text-muted'}>
                    {error || status?.detail || (connected ? status.label : 'No verified OpenAI connection found yet.')}
                </span>
                {!loading ? <button type="button" onClick={() => void onRefresh()} className="ml-auto text-sparkle-text-muted hover:text-sparkle-text">Check again</button> : null}
            </div>
        </div>
    )
}

export function AppearanceStep({ settings, selection, onChange }: {
    settings: Settings
    selection: OnboardingAppearanceSelection
    onChange: (selection: OnboardingAppearanceSelection) => void
}) {
    const lightTheme = getThemeDefinition('light')
    const darkTheme = getThemeDefinition(settings.appearanceDarkTheme as DarkTheme)
    const selectMode = (appearanceThemeMode: OnboardingAppearanceSelection['appearanceThemeMode']) => onChange({ ...selection, appearanceThemeMode })

    return (
        <div>
            <StepHeading title="Appearance" description="Choose an appearance intent for both Desktop and the local browser. Each surface still follows its own window layout." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Zyra appearance">
                <AppearanceSystemThemeCard darkTheme={darkTheme} lightTheme={lightTheme} selected={selection.appearanceThemeMode === 'system'} onSelect={() => selectMode('system')} />
                <AppearanceThemeCard theme={lightTheme} label="Light" selected={selection.appearanceThemeMode === 'light'} onSelect={() => selectMode('light')} />
                <AppearanceThemeCard theme={darkTheme} label="Dark" selected={selection.appearanceThemeMode === 'dark'} onSelect={() => selectMode('dark')} />
            </div>
            <div className="mt-8 divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div><p className="text-[13px] font-medium">Interface font</p><p className="mt-1 text-[11px] text-sparkle-text-muted">Used across navigation, chat, and settings.</p></div>
                    <SettingsSelect value={selection.appearanceUiFont} onChange={(event) => onChange({ ...selection, appearanceUiFont: event.target.value })} aria-label="Interface font">{APPEARANCE_UI_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</SettingsSelect>
                </div>
                <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div><p className="text-[13px] font-medium">Code font</p><p className="mt-1 text-[11px] text-sparkle-text-muted">Used for code, diffs, and terminal text.</p></div>
                    <SettingsSelect value={selection.appearanceCodeFont} onChange={(event) => onChange({ ...selection, appearanceCodeFont: event.target.value })} aria-label="Code font">{APPEARANCE_CODE_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</SettingsSelect>
                </div>
                <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div><p className="text-[13px] font-medium">Reduce motion</p><p className="mt-1 text-[11px] text-sparkle-text-muted">Minimize transitions and smooth scrolling.</p></div>
                    <SettingsSwitch checked={selection.accessibilityReduceMotion} onCheckedChange={(accessibilityReduceMotion) => onChange({ ...selection, accessibilityReduceMotion })} label="Reduce motion" />
                </div>
            </div>
        </div>
    )
}

const WEB_CHOICES: Array<{ id: 'all' | 'search' | 'fetch' | 'off'; title: string; detail: string; selection: OnboardingWebSelection }> = [
    { id: 'all', title: 'Search and open pages', detail: 'New chats can search the web and fetch pages from URLs.', selection: { webSearch: true, webFetch: true } },
    { id: 'search', title: 'Search only', detail: 'New chats can search, but do not fetch full pages by URL.', selection: { webSearch: true, webFetch: false } },
    { id: 'fetch', title: 'Open pages only', detail: 'New chats can fetch a URL you provide, but do not search.', selection: { webSearch: false, webFetch: true } },
    { id: 'off', title: 'Keep web tools off', detail: 'New chats start local. You can change the default in Settings.', selection: { webSearch: false, webFetch: false } }
]

export function WebAccessStep({ selection, onChange }: { selection: OnboardingWebSelection; onChange: (selection: OnboardingWebSelection) => void }) {
    return (
        <div>
            <StepHeading title="Web access" description="Set the starting web tools for new chats. Existing chats keep the values they were created with." />
            <div className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]" role="radiogroup" aria-label="Default web access">
                {WEB_CHOICES.map((choice) => {
                    const selected = choice.selection.webSearch === selection.webSearch && choice.selection.webFetch === selection.webFetch
                    return (
                        <button key={choice.id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(choice.selection)} className="grid w-full grid-cols-[20px_minmax(0,1fr)] gap-3 px-1 py-4 text-left hover:bg-[var(--surface-hover)]">
                            <span className={cn('mt-0.5 inline-flex size-4 items-center justify-center rounded-full border', selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-on-primary)]' : 'border-[var(--surface-divider)]')}>{selected ? <Check size={10} strokeWidth={2.5} /> : null}</span>
                            <span><span className="block text-[13px] font-medium text-sparkle-text">{choice.title}</span><span className="mt-1 block text-[11px] leading-5 text-sparkle-text-muted">{choice.detail}</span></span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function ProjectsStep({ selection, onChange }: {
    selection: OnboardingProjectsSelection
    onChange: (selection: OnboardingProjectsSelection) => void
}) {
    const [choosing, setChoosing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const choose = async () => {
        setChoosing(true)
        setError(null)
        try {
            const result = await window.devscope.selectFolder()
            if (!result.success) throw new Error(result.error || 'Could not open the folder chooser.')
            if (result.folderPath) onChange({ projectsFolder: result.folderPath })
        } catch (choiceError) {
            setError(choiceError instanceof Error ? choiceError.message : 'Could not choose a projects folder.')
        } finally {
            setChoosing(false)
        }
    }

    return (
        <div>
            <StepHeading title="Projects" description="Choose one bounded folder for project discovery. Zyra will not treat your whole home directory or drive as an implicit workspace." />
            <div className="border-y border-[var(--surface-divider)] py-6">
                <p className="text-[12px] font-medium text-sparkle-text-secondary">Main projects folder</p>
                <p className="mt-2 min-h-6 break-all font-mono text-[13px] text-sparkle-text">{selection.projectsFolder || 'No folder selected'}</p>
                <button type="button" disabled={choosing} onClick={() => void choose()} className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--surface-divider)] px-3 text-[12px] font-semibold text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-50">
                    <FolderOpen size={14} />{choosing ? 'Opening…' : selection.projectsFolder ? 'Choose another folder' : 'Choose folder'}
                </button>
                {error ? <p className="mt-3 text-[11px] text-[var(--status-danger)]">{error}</p> : null}
            </div>
        </div>
    )
}

export function ReviewStep({ record }: { record: OnboardingRecord }) {
    const web = record.data.web
    const webLabel = web?.webSearch && web.webFetch ? 'Search and fetch' : web?.webSearch ? 'Search only' : web?.webFetch ? 'Fetch only' : 'Off'
    const rows = useMemo(() => [
        ['OpenAI', record.data.auth?.method === 'api-key' ? 'Verified API key' : 'Verified ChatGPT account'],
        ['Appearance', record.data.appearance?.appearanceThemeMode === 'system' ? 'System default' : record.data.appearance?.appearanceThemeMode || '—'],
        ['Web access', webLabel],
        ['Projects', record.data.projects?.projectsFolder || '—']
    ], [record.data.appearance?.appearanceThemeMode, record.data.auth?.method, record.data.projects?.projectsFolder, webLabel])

    return (
        <div>
            <StepHeading title={record.reviewActive ? 'Review setup' : 'Ready to open Zyra'} description={record.reviewActive ? 'Save these device defaults or go back to adjust a step. Your previous completion remains valid while you review.' : 'Zyra will validate the OpenAI connection once more, save the final checkpoint, and open your workspace.'} />
            <dl className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                {rows.map(([label, value]) => (
                    <div key={label} className="grid gap-2 py-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                        <dt className="text-[11px] font-medium text-sparkle-text-muted">{label}</dt>
                        <dd className={cn('text-[13px] text-sparkle-text', label === 'Projects' && 'break-all font-mono text-[12px]')}>{value}</dd>
                    </div>
                ))}
            </dl>
            <p className="mt-5 text-[11px] leading-5 text-sparkle-text-muted">Completing setup does not depend on staying signed in forever. If OpenAI expires later, Zyra remembers that this device finished setup and asks you to reconnect where needed.</p>
        </div>
    )
}

export function createAppearanceSelection(settings: Settings, record: OnboardingRecord): OnboardingAppearanceSelection {
    const saved = record.data.appearance
    return {
        appearanceThemeMode: saved?.appearanceThemeMode || settings.appearanceThemeMode,
        appearanceDarkTheme: saved?.appearanceDarkTheme || settings.appearanceDarkTheme,
        appearanceUiFont: saved?.appearanceUiFont || settings.appearanceUiFont,
        appearanceCodeFont: saved?.appearanceCodeFont || settings.appearanceCodeFont,
        accessibilityReduceMotion: saved?.accessibilityReduceMotion ?? settings.accessibilityReduceMotion
    }
}

export function createWebSelection(settings: Settings, record: OnboardingRecord): OnboardingWebSelection {
    return record.data.web || {
        webSearch: settings.assistantDefaultWebSearch,
        webFetch: settings.assistantDefaultWebFetch
    }
}

export function createProjectsSelection(settings: Settings, record: OnboardingRecord): OnboardingProjectsSelection {
    return record.data.projects || { projectsFolder: settings.projectsFolder }
}

export function useOpenAiStatus(load: () => Promise<OnboardingAuthStatus>, stepActive: boolean) {
    const [status, setStatus] = useState<OnboardingAuthStatus | null>(null)
    const [loading, setLoading] = useState(false)
    const [activity, setActivity] = useState<'checking' | 'chatgpt' | 'api-key' | null>(null)
    const [error, setError] = useState<string | null>(null)

    const refresh = async () => {
        setLoading(true)
        setActivity('checking')
        setError(null)
        try {
            setStatus(await load())
        } catch (statusError) {
            setError(statusError instanceof Error ? statusError.message : 'Could not verify OpenAI.')
        } finally {
            setLoading(false)
            setActivity(null)
        }
    }

    useEffect(() => {
        if (stepActive) void refresh()
        // The caller is stable for the lifetime of this wizard.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepActive])

    return { status, setStatus, loading, setLoading, activity, setActivity, error, setError, refresh }
}

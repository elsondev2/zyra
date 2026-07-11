/**
 * Zyra - Behavior Settings Page
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
    ArrowLeft,
    Edit3,
    Expand,
    Eye,
    EyeOff,
    ListChecks,
    Mouse,
    PanelLeft,
    PanelRight,
    Play,
    Power,
    RefreshCw,
    TerminalSquare
} from 'lucide-react'
import nodeIconUrl from '@/assets/runtime-icons/nodejs.svg'
import npmIconUrl from '@/assets/runtime-icons/npm.svg'
import pnpmIconUrl from '@/assets/runtime-icons/pnpm.svg'
import yarnIconUrl from '@/assets/runtime-icons/yarn.svg'
import bunIconUrl from '@/assets/runtime-icons/bun.svg'
import { useSettings, type PackageRuntimePreference } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { ScrollPreviewModal } from './ScrollPreviewModal'
import type { DevScopeInstalledPackageRuntime, DevScopePackageRuntimeId } from '@shared/contracts/devscope-api'

type BehaviorTab = 'startup' | 'preview' | 'terminal'
type PackageRuntimeOption = {
    key: PackageRuntimePreference
    runtimeId?: DevScopePackageRuntimeId
    label: string
    caption: string
    iconUrl: string
    toneClassName: string
    iconClassName: string
    pillClassName: string
}

const PACKAGE_RUNTIME_OPTIONS: PackageRuntimeOption[] = [
    { key: 'auto', label: 'Auto', caption: 'Use project lockfiles', iconUrl: nodeIconUrl, toneClassName: 'border-sky-400/40 bg-sky-500/10', iconClassName: 'bg-sky-400/10 ring-sky-300/20', pillClassName: 'bg-sky-400/15 text-sky-100 ring-sky-300/25' },
    { key: 'node', runtimeId: 'node', label: 'Node.js', caption: 'node --run scripts', iconUrl: nodeIconUrl, toneClassName: 'border-emerald-400/40 bg-emerald-500/10', iconClassName: 'bg-emerald-400/10 ring-emerald-300/20', pillClassName: 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/25' },
    { key: 'npm', runtimeId: 'npm', label: 'npm', caption: 'npm run scripts', iconUrl: npmIconUrl, toneClassName: 'border-red-400/40 bg-red-500/10', iconClassName: 'bg-red-400/10 ring-red-300/20', pillClassName: 'bg-red-400/15 text-red-100 ring-red-300/25' },
    { key: 'pnpm', runtimeId: 'pnpm', label: 'pnpm', caption: 'pnpm run scripts', iconUrl: pnpmIconUrl, toneClassName: 'border-amber-400/40 bg-amber-500/10', iconClassName: 'bg-amber-400/10 ring-amber-300/20', pillClassName: 'bg-amber-400/15 text-amber-100 ring-amber-300/25' },
    { key: 'yarn', runtimeId: 'yarn', label: 'Yarn', caption: 'yarn scripts', iconUrl: yarnIconUrl, toneClassName: 'border-cyan-400/40 bg-cyan-500/10', iconClassName: 'bg-cyan-400/10 ring-cyan-300/20', pillClassName: 'bg-cyan-400/15 text-cyan-100 ring-cyan-300/25' },
    { key: 'bun', runtimeId: 'bun', label: 'Bun', caption: 'bun run scripts', iconUrl: bunIconUrl, toneClassName: 'border-orange-300/45 bg-orange-400/10', iconClassName: 'bg-orange-300/10 ring-orange-200/20', pillClassName: 'bg-orange-300/15 text-orange-100 ring-orange-200/25' }
]

export default function BehaviorSettings() {
    const { settings, updateSettings } = useSettings()
    const [startupStatus, setStartupStatus] = useState<string | null>(null)
    const [packageRuntimes, setPackageRuntimes] = useState<DevScopeInstalledPackageRuntime[]>([])
    const [packageRuntimesLoading, setPackageRuntimesLoading] = useState(false)
    const [packageRuntimesError, setPackageRuntimesError] = useState<string | null>(null)
    const [showScrollPreview, setShowScrollPreview] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()
    const activeTab = useMemo<BehaviorTab>(() => {
        const tab = String(searchParams.get('tab') || '').trim()
        return tab === 'preview' || tab === 'terminal' ? tab : 'startup'
    }, [searchParams])

    useEffect(() => {
        let isMounted = true

        void window.devscope.getStartupSettings?.()
            .then((result: any) => {
                if (!isMounted || !result?.success) return
                updateSettings({
                    startWithWindows: Boolean(result.openAtLogin),
                    startMinimized: Boolean(result.openAsHidden)
                })
            })
            .catch(() => {})

        return () => {
            isMounted = false
        }
    }, [updateSettings])

    const refreshPackageRuntimes = async () => {
        setPackageRuntimesLoading(true)
        setPackageRuntimesError(null)
        try {
            const result = await window.devscope.listInstalledPackageRuntimes()
            if (!result.success) {
                throw new Error(result.error || 'Failed to detect package runtimes.')
            }
            setPackageRuntimes(result.runtimes)
        } catch (error) {
            setPackageRuntimesError(error instanceof Error ? error.message : 'Failed to detect package runtimes.')
        } finally {
            setPackageRuntimesLoading(false)
        }
    }

    useEffect(() => {
        void refreshPackageRuntimes()
    }, [])

    const runtimeById = useMemo(
        () => new Map(packageRuntimes.map((runtime) => [runtime.id, runtime])),
        [packageRuntimes]
    )

    const handleStartupToggle = async (enabled: boolean) => {
        try {
            const result = await (window.devscope as any).setStartupSettings?.({
                openAtLogin: enabled,
                openAsHidden: settings.startMinimized
            })
            if (result?.success) {
                updateSettings({ startWithWindows: enabled })
                setStartupStatus(enabled ? 'Startup enabled' : 'Startup disabled')
            } else {
                setStartupStatus('Failed to update')
            }
        } catch {
            setStartupStatus('Failed to update')
        }
        setTimeout(() => setStartupStatus(null), 3000)
    }

    const handleMinimizedToggle = async (minimized: boolean) => {
        updateSettings({ startMinimized: minimized })
        if (settings.startWithWindows) {
            await (window.devscope as any).setStartupSettings?.({
                openAtLogin: true,
                openAsHidden: minimized
            })
        }
    }

    const setActiveTab = (nextTab: BehaviorTab) => {
        const nextParams = new URLSearchParams(searchParams)
        if (nextTab === 'startup') {
            nextParams.delete('tab')
        } else {
            nextParams.set('tab', nextTab)
        }
        setSearchParams(nextParams, { replace: true })
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-500/10 p-2">
                            <Power className="text-blue-400" size={24} />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-sparkle-text">Behavior</h1>
                            <p className="text-sm text-sparkle-text-secondary">Startup, preview, and terminal controls</p>
                        </div>
                    </div>
                    <Link
                        to="/settings"
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-[var(--accent-primary)]"
                    >
                        <ArrowLeft size={16} />
                        Back to Settings
                    </Link>
                </div>
            </div>

            <div className="mb-6 inline-flex items-center rounded-lg border border-white/10 bg-sparkle-card p-1">
                <BehaviorTabButton active={activeTab === 'startup'} onClick={() => setActiveTab('startup')} label="Startup & Scroll" />
                <BehaviorTabButton active={activeTab === 'preview'} onClick={() => setActiveTab('preview')} label="File Preview" />
                <BehaviorTabButton active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} label="Terminal" />
            </div>

            <div className="space-y-6">
                {activeTab === 'startup' && (
                    <div className="grid gap-6 xl:grid-cols-2">
                        <SettingsSection title="Startup" description="Choose how Zyra behaves when Windows launches.">
                            <div className="space-y-4">
                                <SettingRow
                                    icon={<Power size={20} className="text-sparkle-text-secondary" />}
                                    title={settings.startWithWindows ? 'Launch with Windows' : 'Manual launch only'}
                                    description={startupStatus || "Open Zyra automatically every time Windows starts."}
                                    control={<ToggleSwitch checked={settings.startWithWindows} onChange={handleStartupToggle} />}
                                />
                                <SettingRow
                                    icon={<EyeOff size={20} className="text-sparkle-text-secondary" />}
                                    title={settings.startMinimized ? 'Start hidden in tray' : 'Start with window visible'}
                                    description="Choose whether the app appears immediately or stays tucked into the tray."
                                    control={<ToggleSwitch checked={settings.startMinimized} onChange={handleMinimizedToggle} />}
                                />
                            </div>
                        </SettingsSection>

                        <SettingsSection title="Scroll Feel" description="Pick the scroll behavior that should be used across the app.">
                            <div className="space-y-4">
                                <SettingRow
                                    icon={<Mouse size={20} className="text-sparkle-text-secondary" />}
                                    title={settings.scrollMode === 'smooth' ? 'Buttery smooth scroll' : 'Native platform scroll'}
                                    description="This affects long pages, settings views, and dense panels."
                                    control={(
                                        <SegmentedControl
                                            activeKey={settings.scrollMode}
                                            options={[
                                                { key: 'smooth', label: 'Buttery' },
                                                { key: 'native', label: 'Native' }
                                            ]}
                                            onChange={(value) => updateSettings({ scrollMode: value as 'smooth' | 'native' })}
                                        />
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowScrollPreview(true)}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.05]"
                                >
                                    <Play size={16} />
                                    Preview Scroll Behaviors
                                </button>
                            </div>
                        </SettingsSection>
                    </div>
                )}

                {activeTab === 'preview' && (
                    <div className="grid gap-6 xl:grid-cols-2">
                        <SettingsSection
                            title="Default Open State"
                            description="Control how file previews open by default in File Browse and Project Details."
                        >
                            <div className="space-y-4">
                                <SettingRow
                                    icon={<Expand size={20} className="text-sparkle-text-secondary" />}
                                    title={settings.filePreviewOpenInFullscreen ? 'Open in fullscreen mode' : 'Open in windowed mode'}
                                    description="Applies whenever a file preview modal is opened."
                                    control={<ToggleSwitch checked={settings.filePreviewOpenInFullscreen} onChange={(next) => updateSettings({ filePreviewOpenInFullscreen: next })} />}
                                />
                                <SettingRow
                                    icon={settings.filePreviewDefaultMode === 'edit'
                                        ? <Edit3 size={20} className="text-sparkle-text-secondary" />
                                        : <Eye size={20} className="text-sparkle-text-secondary" />}
                                    title={`Default mode: ${settings.filePreviewDefaultMode === 'edit' ? 'Edit' : 'Preview'}`}
                                    description="Used as the initial mode for newly opened previews."
                                    control={(
                                        <SegmentedControl
                                            activeKey={settings.filePreviewDefaultMode}
                                            options={[
                                                { key: 'preview', label: 'Preview' },
                                                { key: 'edit', label: 'Edit' }
                                            ]}
                                            onChange={(value) => updateSettings({ filePreviewDefaultMode: value as 'preview' | 'edit' })}
                                        />
                                    )}
                                />
                                <SettingRow
                                    icon={settings.filePreviewPythonRunMode === 'terminal'
                                        ? <TerminalSquare size={20} className="text-sparkle-text-secondary" />
                                        : <ListChecks size={20} className="text-sparkle-text-secondary" />}
                                    title={`Python run default: ${settings.filePreviewPythonRunMode === 'terminal' ? 'Terminal' : 'Output tab'}`}
                                    description="Controls the default selection in the preview Play dropdown."
                                    control={(
                                        <SegmentedControl
                                            activeKey={settings.filePreviewPythonRunMode}
                                            options={[
                                                { key: 'terminal', label: 'Terminal' },
                                                { key: 'output', label: 'Output' }
                                            ]}
                                            onChange={(value) => updateSettings({ filePreviewPythonRunMode: value as 'terminal' | 'output' })}
                                        />
                                    )}
                                />
                            </div>
                        </SettingsSection>

                        <SettingsSection title="Fullscreen Sidebars" description="Choose which side panels stay visible in fullscreen preview.">
                            <div className="space-y-4">
                                <SettingRow
                                    icon={<PanelLeft size={20} className="text-sparkle-text-secondary" />}
                                    title={settings.filePreviewFullscreenShowLeftPanel ? 'Left panel enabled' : 'Left panel hidden'}
                                    description="Controls the left-side navigation and preview context area."
                                    control={<ToggleSwitch checked={settings.filePreviewFullscreenShowLeftPanel} onChange={(next) => updateSettings({ filePreviewFullscreenShowLeftPanel: next })} />}
                                />
                                <SettingRow
                                    icon={<PanelRight size={20} className="text-sparkle-text-secondary" />}
                                    title={settings.filePreviewFullscreenShowRightPanel ? 'Right panel enabled' : 'Right panel hidden'}
                                    description="Controls the secondary right-side info panel in fullscreen mode."
                                    control={<ToggleSwitch checked={settings.filePreviewFullscreenShowRightPanel} onChange={(next) => updateSettings({ filePreviewFullscreenShowRightPanel: next })} />}
                                />
                            </div>
                        </SettingsSection>
                    </div>
                )}

                {activeTab === 'terminal' && (
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
                        <SettingsSection title="Default Shell" description="Choose which shell Zyra launches for terminal actions.">
                            <div className="grid gap-4 md:grid-cols-2">
                                <TerminalChoiceCard
                                    active={settings.defaultShell === 'powershell'}
                                    accentClassName="border-blue-500/50 bg-blue-500/10 text-blue-100"
                                    idleClassName="border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                                    glyphClassName="text-blue-300"
                                    label="PowerShell"
                                    caption="Recommended for Windows workflows"
                                    glyph="PS"
                                    onClick={() => updateSettings({ defaultShell: 'powershell' })}
                                />
                                <TerminalChoiceCard
                                    active={settings.defaultShell === 'cmd'}
                                    accentClassName="border-amber-500/50 bg-amber-500/10 text-amber-100"
                                    idleClassName="border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                                    glyphClassName="text-amber-300"
                                    label="Command Prompt"
                                    caption="Classic shell fallback"
                                    glyph="CMD"
                                    onClick={() => updateSettings({ defaultShell: 'cmd' })}
                                />
                            </div>
                        </SettingsSection>

                        <SettingsSection title="Package Runtime" description="Choose the runner used by project script buttons.">
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {PACKAGE_RUNTIME_OPTIONS.map((option) => {
                                        const runtime = option.runtimeId ? runtimeById.get(option.runtimeId) : null
                                        const installed = option.key === 'auto' || runtime?.installed === true
                                        const active = settings.packageRuntimePreference === option.key
                                        return (
                                            <PackageRuntimeChoiceCard
                                                key={option.key}
                                                active={active}
                                                disabled={!installed}
                                                iconUrl={option.iconUrl}
                                                toneClassName={option.toneClassName}
                                                iconClassName={option.iconClassName}
                                                pillClassName={option.pillClassName}
                                                label={option.label}
                                                caption={option.key === 'auto'
                                                    ? option.caption
                                                    : runtime?.version
                                                        ? `${option.caption} · ${runtime.version}`
                                                        : installed
                                                            ? option.caption
                                                            : 'Not installed'}
                                                onClick={() => {
                                                    if (!installed) return
                                                    updateSettings({ packageRuntimePreference: option.key })
                                                }}
                                            />
                                        )
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                                    <span className="text-xs text-sparkle-text-secondary">
                                        {packageRuntimesError || (packageRuntimesLoading ? 'Detecting installed runtimes...' : 'Auto follows lockfiles: pnpm, Yarn, Bun, then npm.')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => void refreshPackageRuntimes()}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs text-sparkle-text-secondary transition-colors hover:bg-white/[0.07] hover:text-sparkle-text"
                                    >
                                        <RefreshCw size={13} className={cn(packageRuntimesLoading && 'animate-spin')} />
                                        Refresh
                                    </button>
                                </div>
                            </div>
                        </SettingsSection>

                    </div>
                )}
            </div>

            {showScrollPreview && (
                <ScrollPreviewModal
                    currentMode={settings.scrollMode}
                    onClose={() => setShowScrollPreview(false)}
                    onApply={(mode) => {
                        updateSettings({ scrollMode: mode })
                        setShowScrollPreview(false)
                    }}
                />
            )}
        </div>
    )
}

function PackageRuntimeChoiceCard({
    active,
    disabled,
    iconUrl,
    toneClassName,
    iconClassName,
    pillClassName,
    label,
    caption,
    onClick
}: {
    active: boolean
    disabled: boolean
    iconUrl: string
    toneClassName: string
    iconClassName: string
    pillClassName: string
    label: string
    caption: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'relative overflow-hidden rounded-xl border p-4 text-left transition-all',
                active
                    ? toneClassName
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]',
                disabled && 'cursor-not-allowed opacity-45 hover:border-white/10 hover:bg-white/[0.03]'
            )}
        >
            <div className="flex items-start gap-3">
                <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1',
                    active ? iconClassName : 'bg-white/[0.05] ring-white/10'
                )}>
                    <img src={iconUrl} alt="" className="h-6 w-6 object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-sparkle-text">{label}</span>
                        {active ? (
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', pillClassName)}>
                                Selected
                            </span>
                        ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-sparkle-text-secondary">{caption}</span>
                </span>
            </div>
        </button>
    )
}

function BehaviorTabButton({
    active,
    onClick,
    label
}: {
    active: boolean
    onClick: () => void
    label: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                active
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-sparkle-text-secondary hover:bg-white/[0.03] hover:text-sparkle-text'
            )}
        >
            {label}
        </button>
    )
}

function SettingsSection({
    title,
    description,
    children
}: {
    title: string
    description: string
    children: ReactNode
}) {
    return (
        <div className="h-full rounded-xl border border-white/10 bg-sparkle-card p-5">
            <h2 className="mb-1 font-semibold text-sparkle-text">{title}</h2>
            <p className="mb-4 text-sm text-sparkle-text-secondary">{description}</p>
            {children}
        </div>
    )
}

function SettingRow({
    icon,
    title,
    description,
    control
}: {
    icon: ReactNode
    title: string
    description: string
    control: ReactNode
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">{icon}</div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-sparkle-text">{title}</p>
                            <p className="mt-1 text-xs text-sparkle-text-secondary">{description}</p>
                        </div>
                    </div>
                </div>
                <div className="shrink-0 lg:ml-4">{control}</div>
            </div>
        </div>
    )
}

function SegmentedControl({
    activeKey,
    options,
    onChange
}: {
    activeKey: string
    options: Array<{ key: string; label: string }>
    onChange: (value: string) => void
}) {
    return (
        <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {options.map((option) => (
                <button
                    key={option.key}
                    type="button"
                    onClick={() => onChange(option.key)}
                    className={cn(
                        'rounded-md px-3 py-1.5 text-xs transition-colors',
                        activeKey === option.key
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'text-sparkle-text-secondary hover:bg-white/[0.03] hover:text-sparkle-text'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

function ToggleSwitch({
    checked,
    onChange,
    disabled
}: {
    checked: boolean
    onChange: (value: boolean) => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            className={cn(
                'relative h-7 w-12 rounded-full transition-colors',
                checked ? 'bg-[var(--accent-primary)]' : 'bg-white/10',
                disabled && 'cursor-not-allowed opacity-50'
            )}
        >
            <div
                className={cn(
                    'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    checked ? 'translate-x-6' : 'translate-x-1'
                )}
            />
        </button>
    )
}

function TerminalChoiceCard({
    active,
    accentClassName,
    idleClassName,
    glyphClassName,
    label,
    caption,
    glyph,
    onClick
}: {
    active: boolean
    accentClassName: string
    idleClassName: string
    glyphClassName: string
    label: string
    caption: string
    glyph: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-xl border p-5 text-left transition-all',
                active ? accentClassName : idleClassName
            )}
        >
            <div className={cn('text-2xl font-semibold', glyphClassName)}>{glyph}</div>
            <p className="mt-3 text-sm font-medium text-sparkle-text">{label}</p>
            <p className="mt-1 text-xs text-sparkle-text-secondary">{caption}</p>
        </button>
    )
}

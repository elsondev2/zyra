/**
 * Zyra - Appearance Settings Page
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Palette } from 'lucide-react'
import { useSettings, THEMES, ACCENT_COLORS } from '@/lib/settings'
import { cn } from '@/lib/utils'

const THEME_PAGE_SIZE = 6

export default function AppearanceSettings() {
    const { settings, updateSettings } = useSettings()
    const darkThemes = useMemo(() => THEMES.filter((theme) => theme.id !== 'light'), [])
    const activeDarkThemeId = settings.theme === 'light' ? settings.lastDarkTheme : settings.theme
    const resolveThemePage = (themeId: string) => {
        const selectedIndex = darkThemes.findIndex((theme) => theme.id === themeId)
        return selectedIndex >= 0 ? Math.floor(selectedIndex / THEME_PAGE_SIZE) : 0
    }
    const [themePage, setThemePage] = useState(() => resolveThemePage(activeDarkThemeId))

    const handleThemeChange = (themeId: string) => {
        const selectedTheme = THEMES.find((theme) => theme.id === themeId)
        if (!selectedTheme) return

        const matchingAccent = ACCENT_COLORS.find((color) => color.name === selectedTheme.accentColor)
        if (matchingAccent) {
            updateSettings({
                theme: selectedTheme.id,
                accentColor: matchingAccent
            })
            return
        }

        updateSettings({ theme: selectedTheme.id })
    }

    const isLightModeEnabled = settings.theme === 'light'
    const handleLightModeToggle = (enabled: boolean) => {
        if (enabled) {
            updateSettings({ theme: 'light' })
            return
        }

        if (settings.theme === 'light') {
            updateSettings({ theme: settings.lastDarkTheme })
        }
    }

    useEffect(() => {
        setThemePage((current) => {
            const next = resolveThemePage(activeDarkThemeId)
            return current === next ? current : next
        })
    }, [activeDarkThemeId])

    const totalThemePages = Math.max(1, Math.ceil(darkThemes.length / THEME_PAGE_SIZE))
    const themePageStart = themePage * THEME_PAGE_SIZE
    const visibleThemes = darkThemes.slice(themePageStart, themePageStart + THEME_PAGE_SIZE)

    return (
        <div className="animate-fadeIn">
            <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-purple-500/10 p-2">
                            <Palette className="text-purple-400" size={24} />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-sparkle-text">Appearance</h1>
                            <p className="text-sm text-sparkle-text-secondary">Theme, colors, and display options</p>
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

            <div className="space-y-6">
                <SettingsSection
                    title="Themes"
                    description="Browse the dark-theme library a page at a time. Light mode stays available below."
                    headerActions={(
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setThemePage((current) => Math.max(0, current - 1))}
                                disabled={themePage === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-white/[0.03] px-3 py-1.5 text-xs text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeft size={14} />
                                Prev
                            </button>
                            <span className="min-w-[72px] text-center text-xs text-sparkle-text-secondary">
                                Page <span className="text-sparkle-text">{themePage + 1}</span> / {totalThemePages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setThemePage((current) => Math.min(totalThemePages - 1, current + 1))}
                                disabled={themePage >= totalThemePages - 1}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-white/[0.03] px-3 py-1.5 text-xs text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Next
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                >

                    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                        {visibleThemes.map((theme) => {
                            const active = settings.theme !== 'light' && settings.theme === theme.id
                            return (
                                <button
                                    key={theme.id}
                                    type="button"
                                    onClick={() => handleThemeChange(theme.id)}
                                    className={cn(
                                        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                                        active
                                            ? 'border-white/20 bg-white/[0.05]'
                                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.04]'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <ThemeRadio active={active} />
                                        <div
                                            className="mt-0.5 h-9 w-9 shrink-0 rounded-lg border border-white/10 shadow-inner"
                                            style={{ backgroundColor: theme.color }}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-sparkle-text">{theme.name}</p>
                                                <span className="inline-flex rounded-full border border-transparent bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sparkle-text-secondary">
                                                    {theme.accentColor}
                                                </span>
                                                {active && (
                                                    <span className="inline-flex rounded-full border border-white/10 bg-[var(--accent-primary)]/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--accent-primary)]">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs text-sparkle-text-secondary">{theme.description}</p>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    <div className="mt-4 flex justify-end text-xs text-sparkle-text-secondary">
                        <span>
                            Showing <span className="text-sparkle-text">{themePageStart + 1}-{Math.min(themePageStart + THEME_PAGE_SIZE, darkThemes.length)}</span> of <span className="text-sparkle-text">{darkThemes.length}</span> dark themes
                        </span>
                    </div>
                </SettingsSection>

                <SettingsSection title="Accent Color" description="Customize the highlight color throughout the app.">
                    <div className="flex flex-wrap gap-3">
                        {ACCENT_COLORS.map((color) => (
                            <button
                                key={color.name}
                                onClick={() => updateSettings({ accentColor: color })}
                                className={cn(
                                    'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                                    settings.accentColor.name === color.name
                                        ? 'scale-110 border-white shadow-lg'
                                        : 'border-transparent hover:scale-105'
                                )}
                                style={{ backgroundColor: color.primary }}
                                title={color.name}
                            >
                                {settings.accentColor.name === color.name && (
                                    <Check size={18} className="text-white drop-shadow" />
                                )}
                            </button>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-sparkle-text-muted">
                        Current: <span className="text-[var(--accent-primary)]">{settings.accentColor.name}</span>
                    </p>
                </SettingsSection>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
                    <SettingsSection title="Compact Mode" description="Reduce spacing for a denser interface.">
                        <ToggleOption
                            checked={settings.compactMode}
                            onChange={(value) => updateSettings({ compactMode: value })}
                            label={settings.compactMode ? 'Enabled' : 'Disabled'}
                        />
                    </SettingsSection>

                    <div className="self-start rounded-xl border border-red-400/20 bg-red-500/8 p-4 text-left">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-lg border border-red-400/20 bg-red-500/10 p-2 text-red-200">
                                <AlertTriangle size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
                                    Danger Zone
                                </p>
                                <p className="mt-2 text-sm font-medium text-sparkle-text">
                                    Light mode
                                </p>
                                <p className="mt-1 text-xs text-sparkle-text-secondary">
                                    Built by people who live in dark mode. Light mode exists, but some screens may still come out a little cursed because that path gets far less real use.
                                </p>
                                <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
                                    <ToggleOption
                                        checked={isLightModeEnabled}
                                        onChange={handleLightModeToggle}
                                        label={isLightModeEnabled ? 'Enabled' : 'Disabled'}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function ThemeRadio({ active }: { active: boolean }) {
    return (
        <span
            className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                active
                    ? 'border-[var(--accent-primary)]'
                    : 'border-white/15'
            )}
        >
            <span
                className={cn(
                    'h-2.5 w-2.5 rounded-full transition-colors',
                    active ? 'bg-[var(--accent-primary)]' : 'bg-transparent'
                )}
            />
        </span>
    )
}

function SettingsSection({
    title,
    description,
    children,
    headerActions
}: {
    title: string
    description: string
    children: ReactNode
    headerActions?: ReactNode
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-sparkle-card p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="mb-1 font-semibold text-sparkle-text">{title}</h2>
                    <p className="text-sm text-sparkle-text-secondary">{description}</p>
                </div>
                {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
            </div>
            {children}
        </div>
    )
}

function ToggleOption({
    checked,
    onChange,
    label
}: {
    checked: boolean
    onChange: (value: boolean) => void
    label: string
}) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-sparkle-text">{label}</span>
            <button
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative h-7 w-12 rounded-full transition-colors',
                    checked ? 'bg-[var(--accent-primary)]' : 'bg-white/10'
                )}
            >
                <div
                    className={cn(
                        'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
                        checked ? 'translate-x-6' : 'translate-x-1'
                    )}
                />
            </button>
        </div>
    )
}

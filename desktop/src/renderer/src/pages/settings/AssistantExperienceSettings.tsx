import { Link } from 'react-router-dom'
import { ArrowLeft, Gauge, History, Radio, ShieldCheck, Sparkles } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

export default function AssistantExperienceSettings() {
    const { settings, updateSettings, clearCache } = useSettings()

    const setRuntimeMode = (mode: 'approval-required' | 'full-access') => {
        if (
            mode === 'full-access'
            && settings.assistantDefaultRuntimeMode !== 'full-access'
            && !window.confirm('Enable Full access for new chats? Tools may run commands and change files without asking first.')
        ) return
        updateSettings({ assistantDefaultRuntimeMode: mode })
    }

    return (
        <div className="animate-fadeIn">
            <SettingsHeader />
            <div className="space-y-5">
                <section className="rounded-2xl border border-white/10 bg-sparkle-card p-5">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><ShieldCheck size={18} /></div>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-semibold text-sparkle-text">Default permission mode</h2>
                            <p className="mt-1 text-sm text-sparkle-text-secondary">Applied to new chats. You can still change it from the Supervised pill in the composer.</p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <ChoiceCard
                                    active={settings.assistantDefaultRuntimeMode === 'approval-required'}
                                    title="Supervised"
                                    description="Ask before commands, file changes, and other side effects."
                                    onClick={() => setRuntimeMode('approval-required')}
                                />
                                <ChoiceCard
                                    active={settings.assistantDefaultRuntimeMode === 'full-access'}
                                    title="Full access"
                                    description="Run tools without approval prompts for the chat."
                                    warning
                                    onClick={() => setRuntimeMode('full-access')}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-2">
                    <SettingsGroup icon={<Radio size={18} />} title="Connection" description="How Desktop restores the selected canonical chat.">
                        <ToggleRow
                            label="Reconnect selected chat on startup"
                            description="Attach to the server-owned worker after the cached shell appears."
                            checked={settings.assistantAutoReconnect}
                            onChange={(assistantAutoReconnect) => updateSettings({ assistantAutoReconnect })}
                        />
                        <ToggleRow
                            label="Show cross-surface status"
                            description="Show when this same chat is open or running in the TUI."
                            checked={settings.assistantShowStatusDetails}
                            onChange={(assistantShowStatusDetails) => updateSettings({ assistantShowStatusDetails })}
                        />
                        <ToggleRow
                            label="Show canonical diagnostics"
                            description="Show worker presence and replay sequence in the chat header."
                            checked={settings.assistantShowDiagnostics}
                            onChange={(assistantShowDiagnostics) => updateSettings({ assistantShowDiagnostics })}
                        />
                    </SettingsGroup>

                    <SettingsGroup icon={<History size={18} />} title="History" description="Keep long chats responsive with bounded loading.">
                        <ToggleRow
                            label="Prefetch one earlier page"
                            description="After the newest page renders, load one older page once per chat in the background."
                            checked={settings.assistantHistoryPrefetch}
                            onChange={(assistantHistoryPrefetch) => updateSettings({ assistantHistoryPrefetch })}
                        />
                        <ToggleRow
                            label="Expand live tool output"
                            description="Open command output while a tool is running."
                            checked={settings.assistantToolOutputDefaultMode === 'expanded'}
                            onChange={(expanded) => updateSettings({ assistantToolOutputDefaultMode: expanded ? 'expanded' : 'minimized' })}
                        />
                        <button
                            type="button"
                            onClick={clearCache}
                            className="mt-1 inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-sparkle-text-secondary transition-colors hover:bg-white/[0.06] hover:text-sparkle-text"
                        >
                            Clear cached UI data
                        </button>
                    </SettingsGroup>

                    <SettingsGroup icon={<Gauge size={18} />} title="Accessibility" description="Display behavior used throughout Desktop.">
                        <ToggleRow
                            label="Reduce motion"
                            description="Minimize transitions, animation, and smooth scrolling."
                            checked={settings.accessibilityReduceMotion}
                            onChange={(accessibilityReduceMotion) => updateSettings({ accessibilityReduceMotion })}
                        />
                        <ToggleRow
                            label="Compact layout"
                            description="Use tighter spacing across chat and settings."
                            checked={settings.compactMode}
                            onChange={(compactMode) => updateSettings({ compactMode })}
                        />
                    </SettingsGroup>

                    <SettingsGroup icon={<Sparkles size={18} />} title="Agent defaults" description="Model, effort, speed, voice, and composer behavior.">
                        <p className="text-sm leading-6 text-sparkle-text-secondary">Open the full defaults panel to preview and save the composer configuration used by new threads.</p>
                        <Link to="/settings/assistant" className="mt-3 inline-flex h-9 items-center rounded-lg border border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/10 px-3 text-xs font-medium text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)]/15">
                            Open assistant defaults
                        </Link>
                    </SettingsGroup>
                </div>
            </div>
        </div>
    )
}

function SettingsHeader() {
    return (
        <div className="mb-6 flex items-center justify-between gap-4">
            <div>
                <h1 className="text-xl font-semibold text-sparkle-text">Chat & permissions</h1>
                <p className="mt-1 text-sm text-sparkle-text-secondary">Runtime safety, connection, history, and status behavior</p>
            </div>
            <Link to="/settings" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text-secondary transition-colors hover:bg-white/[0.04] hover:text-sparkle-text">
                <ArrowLeft size={15} /> Back to Settings
            </Link>
        </div>
    )
}

function SettingsGroup({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-white/10 bg-sparkle-card p-5">
            <div className="mb-4 flex items-start gap-3">
                <div className="rounded-xl bg-white/[0.04] p-2 text-sparkle-text-secondary">{icon}</div>
                <div><h2 className="font-semibold text-sparkle-text">{title}</h2><p className="mt-1 text-sm text-sparkle-text-secondary">{description}</p></div>
            </div>
            <div className="space-y-3">{children}</div>
        </section>
    )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
            <div className="min-w-0"><p className="text-sm font-medium text-sparkle-text">{label}</p><p className="mt-0.5 text-xs leading-5 text-sparkle-text-muted">{description}</p></div>
            <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors', checked ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/35' : 'border-white/10 bg-white/[0.05]')}>
                <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-[4px]')} />
            </button>
        </div>
    )
}

function ChoiceCard({ active, title, description, warning = false, onClick }: { active: boolean; title: string; description: string; warning?: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={cn('rounded-xl border p-4 text-left transition-colors', active ? warning ? 'border-amber-400/35 bg-amber-500/[0.09]' : 'border-emerald-400/35 bg-emerald-500/[0.09]' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.045]')}>
            <p className={cn('text-sm font-semibold', active && warning ? 'text-amber-100' : active ? 'text-emerald-100' : 'text-sparkle-text')}>{title}</p>
            <p className="mt-1 text-xs leading-5 text-sparkle-text-secondary">{description}</p>
        </button>
    )
}

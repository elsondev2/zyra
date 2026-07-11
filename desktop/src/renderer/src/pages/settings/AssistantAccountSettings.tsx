import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    ArrowLeft,
    BarChart3,
    Clock3,
    KeyRound,
    Mail,
    RefreshCw,
    ShieldCheck,
    SlidersHorizontal,
    User
} from 'lucide-react'
import type { AssistantAccountOverview, AssistantAccountPlanType } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings'
import { AccountField, RateLimitUsageCard } from './AssistantAccountRateLimitCards'
import { AssistantDefaultsPanel } from './AssistantDefaultsPanel'
import {
    buildRateLimitCards,
    findBalanceLabel,
    formatFetchedAt,
    formatPlan
} from './assistant-account-rate-limits'

const POLL_INTERVAL_MS = 15000

type ActiveTab = 'defaults' | 'limits' | 'account'

function resolvePreferredPlanType(overview: AssistantAccountOverview | null): AssistantAccountPlanType | null {
    const accountPlanType = overview?.account?.planType ?? null
    const rateLimitPlanType = overview?.rateLimits?.planType ?? null

    if (rateLimitPlanType && rateLimitPlanType !== 'free') return rateLimitPlanType
    if (accountPlanType && accountPlanType !== 'free') return accountPlanType
    return accountPlanType || rateLimitPlanType
}

export default function AssistantAccountSettings() {
    const { settings, updateSettings } = useSettings()
    const [overview, setOverview] = useState<AssistantAccountOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<ActiveTab>('defaults')
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    const loadOverview = async (background = false) => {
        if (!isMountedRef.current) return

        if (background) setRefreshing(true)
        else setLoading(true)

        try {
            const result = await window.devscope.assistant.getAccountOverview()
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch account overview.')
            }
            if (!isMountedRef.current) return
            setOverview(result.overview)
            setError(null)
        } catch (loadError) {
            if (!isMountedRef.current) return
            setError(loadError instanceof Error ? loadError.message : 'Failed to fetch account overview.')
        } finally {
            if (!isMountedRef.current) return
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        let disposed = false

        const run = async (background = false) => {
            if (disposed) return
            await loadOverview(background)
        }

        void run(false)

        const interval = window.setInterval(() => {
            void run(true)
        }, POLL_INTERVAL_MS)

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                void run(true)
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => {
            disposed = true
            window.clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [])

    const accountLabel = overview?.authMode === 'chatgpt' || overview?.authMode === 'chatgptAuthTokens' || overview?.account?.type === 'chatgpt'
        ? "Zyra signed in"
        : overview?.authMode === 'apikey' || overview?.account?.type === 'apiKey'
            ? 'API key signed in'
            : 'Not signed in'

    const isSignedIn = accountLabel !== 'Not signed in'
    const accountPlan = formatPlan(resolvePreferredPlanType(overview))
    const usageCards = useMemo(
        () => buildRateLimitCards(overview, settings.assistantUsageDisplayMode),
        [overview, settings.assistantUsageDisplayMode]
    )
    const showOverviewLoadingState = loading && !overview && activeTab !== 'defaults'

    const tabs = [
        { id: 'defaults' as const, label: 'Defaults', icon: SlidersHorizontal },
        { id: 'limits' as const, label: 'Limits', icon: BarChart3 },
        { id: 'account' as const, label: 'Account', icon: User }
    ]

    return (
        <div className="animate-fadeIn">
            <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-sky-500/10 p-2">
                            <ShieldCheck className="text-sky-400" size={24} />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-sparkle-text">Assistant Settings</h1>
                            <p className="text-sm text-sparkle-text-secondary">
                                Account, usage limits, and assistant defaults
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void loadOverview(true)}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-3.5 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03]"
                        >
                            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <Link
                            to="/settings"
                            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-3.5 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-[var(--accent-primary)]"
                        >
                            <ArrowLeft size={15} />
                            Back to Settings
                        </Link>
                    </div>
                </div>
            </div>

            <div className="mb-6 inline-flex items-center rounded-lg border border-white/10 bg-sparkle-card p-1">
                {tabs.map(({ id, label }) => {
                    const active = activeTab === id
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
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
                })}
            </div>

            {error ? (
                <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            ) : null}

            {showOverviewLoadingState ? (
                <div className="rounded-2xl border border-white/10 bg-sparkle-card px-6 py-12 text-center text-sparkle-text-secondary">
                    <RefreshCw size={20} className="mx-auto mb-3 animate-spin opacity-40" />
                    Fetching account and usage data...
                </div>
            ) : (
                <>
                    {activeTab === 'defaults' ? (
                        <div className="animate-fadeIn">
                            <AssistantDefaultsPanel />
                        </div>
                    ) : null}

                    {activeTab === 'limits' ? (
                        <div className="space-y-5 animate-fadeIn">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-xl border border-white/10 bg-sparkle-card px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sparkle-text-muted">Balance</p>
                                    <p className="mt-1.5 text-sm font-semibold text-sparkle-text">{findBalanceLabel(overview)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-sparkle-card px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sparkle-text-muted">Last Sync</p>
                                    <p className="mt-1.5 text-sm font-semibold text-sparkle-text">{formatFetchedAt(overview?.fetchedAt)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-sparkle-card px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sparkle-text-muted">Rate Limit Windows</p>
                                    <p className="mt-1.5 text-sm font-semibold text-sparkle-text">{usageCards.length} window{usageCards.length !== 1 ? 's' : ''}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-sparkle-card px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sparkle-text-muted">Auto-Refresh</p>
                                    <p className="mt-1.5 text-sm font-semibold text-sparkle-text">Every {Math.round(POLL_INTERVAL_MS / 1000)}s</p>
                                </div>
                            </div>

                            {usageCards.length > 0 ? (
                                <div>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sparkle-text-muted">Rate Limit Windows</p>
                                        <div className="inline-flex items-center rounded-lg border border-white/10 bg-black/10 p-1">
                                            {(['remaining', 'used'] as const).map((mode) => {
                                                const selected = settings.assistantUsageDisplayMode === mode
                                                return (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => updateSettings({ assistantUsageDisplayMode: mode })}
                                                        className={cn(
                                                            'rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-all',
                                                            selected
                                                                ? 'bg-white/10 text-sparkle-text shadow-sm'
                                                                : 'text-sparkle-text-secondary hover:text-sparkle-text'
                                                        )}
                                                    >
                                                        {mode}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                        {usageCards.map((card) => (
                                            <RateLimitUsageCard key={card.id} card={card} mode={settings.assistantUsageDisplayMode} />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-sparkle-text-secondary">
                                    No rate-limit windows were returned by the server for this account.
                                </div>
                            )}
                        </div>
                    ) : null}

                    {activeTab === 'account' ? (
                        <div className="space-y-5 animate-fadeIn">
                            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/[0.07] via-white/[0.02] to-transparent p-6">
                                <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
                                <div className="relative flex items-center gap-4">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10">
                                        <ShieldCheck size={26} className="text-sky-400" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-400/70">Signed In As</p>
                                        <p className="mt-0.5 text-base font-semibold text-sparkle-text">
                                            {overview?.account?.email || 'Unknown Account'}
                                        </p>
                                        <p className="mt-0.5 text-sm text-sparkle-text-secondary">{accountLabel}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className={cn(
                                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                                            isSignedIn
                                                ? 'border-green-500/20 bg-green-500/10 text-green-400'
                                                : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                                        )}>
                                            <span className={cn(
                                                'h-1.5 w-1.5 rounded-full',
                                                isSignedIn ? 'bg-green-400' : 'bg-amber-400'
                                            )} />
                                            {overview ? accountLabel : 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-2">
                                <div className="rounded-xl border border-white/10 bg-sparkle-card p-5">
                                    <h2 className="mb-1 font-semibold text-sparkle-text">Identity</h2>
                                    <p className="mb-4 text-sm text-sparkle-text-secondary">Your Zyra account information</p>
                                    <div className="space-y-3">
                                        <AccountField
                                            label="Authentication"
                                            value={accountLabel}
                                            icon={<KeyRound size={13} />}
                                        />
                                        <AccountField
                                            label="Email"
                                            value={overview?.account?.email || 'Unavailable'}
                                            icon={<Mail size={13} />}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/10 bg-sparkle-card p-5">
                                    <h2 className="mb-1 font-semibold text-sparkle-text">Status</h2>
                                    <p className="mb-4 text-sm text-sparkle-text-secondary">Plan and sign-in status</p>
                                    <div className="space-y-3">
                                        <AccountField
                                            label="Plan"
                                            value={accountPlan}
                                            icon={<ShieldCheck size={13} />}
                                            accent={isSignedIn}
                                        />
                                        <AccountField
                                            label="Sign-in"
                                            value={accountLabel}
                                            icon={<Clock3 size={13} />}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    )
}

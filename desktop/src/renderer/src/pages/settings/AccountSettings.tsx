import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { AssistantAccountOverview, AssistantAccountPlanType } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { buildRateLimitCards, formatFetchedAt, formatPlan } from './assistant-account-rate-limits'
import { AccountResetCreditsSection } from './AccountResetCreditsSection'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSegmented
} from './settings-layout'

const ACCOUNT_POLL_INTERVAL_MS = 15_000

function resolvePreferredPlanType(overview: AssistantAccountOverview | null): AssistantAccountPlanType | null {
    const accountPlanType = overview?.account?.planType ?? null
    const rateLimitPlanType = overview?.rateLimits?.planType ?? null
    if (rateLimitPlanType && rateLimitPlanType !== 'free') return rateLimitPlanType
    if (accountPlanType && accountPlanType !== 'free') return accountPlanType
    return accountPlanType || rateLimitPlanType
}

export default function AccountSettings() {
    const { settings, updateSettings } = useSettings()
    const [overview, setOverview] = useState<AssistantAccountOverview | null>(null)
    const [overviewLoading, setOverviewLoading] = useState(true)
    const [overviewError, setOverviewError] = useState<string | null>(null)
    const overviewRequestIdRef = useRef(0)

    const loadOverview = useCallback(async () => {
        const requestId = ++overviewRequestIdRef.current
        setOverviewLoading(true)
        setOverviewError(null)
        try {
            const result = await window.devscope.assistant.getAccountOverview()
            if (!result.success) throw new Error(result.error || 'Could not load ChatGPT account information.')
            if (requestId !== overviewRequestIdRef.current) return
            setOverview(result.overview)
        } catch (error) {
            if (requestId !== overviewRequestIdRef.current) return
            setOverviewError(error instanceof Error ? error.message : 'Could not load ChatGPT account information.')
        } finally {
            if (requestId === overviewRequestIdRef.current) setOverviewLoading(false)
        }
    }, [])

    const applyAccountOverview = useCallback((nextOverview: AssistantAccountOverview) => {
        overviewRequestIdRef.current += 1
        setOverview(nextOverview)
        setOverviewError(null)
        setOverviewLoading(false)
    }, [])

    useEffect(() => {
        void loadOverview()
        const interval = window.setInterval(() => void loadOverview(), ACCOUNT_POLL_INTERVAL_MS)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') void loadOverview()
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => {
            overviewRequestIdRef.current += 1
            window.clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [loadOverview])

    const usageCards = useMemo(
        () => buildRateLimitCards(overview, settings.assistantUsageDisplayMode),
        [overview, settings.assistantUsageDisplayMode]
    )
    const initialAccountLoading = overviewLoading && !overview
    const accountUnavailable = Boolean(overviewError && !overview)
    const displayAccountValue = (value: string | null | undefined, fallback = 'Unavailable') =>
        initialAccountLoading ? 'Checking…' : value || fallback
    const connectionLabel = initialAccountLoading
        ? 'Checking…'
        : accountUnavailable
            ? 'Unavailable'
            : overview?.authMode === 'chatgpt'
                || overview?.authMode === 'chatgptAuthTokens'
                || overview?.account?.type === 'chatgpt'
                ? 'ChatGPT via Pi'
                : overview?.authMode === 'apikey' || overview?.account?.type === 'apiKey'
                    ? 'OpenAI API key'
                    : 'Not connected'
    const accountPlan = initialAccountLoading
        ? 'Checking…'
        : formatPlan(resolvePreferredPlanType(overview))

    return (
        <SettingsPageContainer>
            <SettingsSection title="ChatGPT account" headerAction={<SettingsButton variant="ghost" onClick={() => void loadOverview()} disabled={overviewLoading}><RefreshCw size={12} className={overviewLoading ? 'animate-spin motion-reduce:animate-none' : ''} />Refresh</SettingsButton>}>
                {overviewError ? <SettingsNotice tone="error">{overviewError}</SettingsNotice> : null}
                {overview?.requiresOpenaiAuth ? <SettingsNotice tone="warning">Connect your ChatGPT account through Zyra to view its identity, plan, usage limits, and banked resets.</SettingsNotice> : null}
                <SettingsRow
                    title="Connection"
                    description="Zyra uses this ChatGPT/OpenAI account through Pi for supported models and account limits."
                    status={initialAccountLoading ? 'Checking' : overview?.requiresOpenaiAuth ? 'Connect account' : overview ? 'Connected' : 'Unavailable'}
                    statusTone={overview?.requiresOpenaiAuth ? 'warning' : overview ? 'ready' : 'muted'}
                    control={<span className="text-xs font-medium text-sparkle-text-secondary">{connectionLabel}</span>}
                />
                <SettingsRow
                    title="Email"
                    description="Email returned by the connected ChatGPT account."
                    status={overview?.emailVerified === true ? 'Verified' : null}
                    statusTone="ready"
                    control={<span title={overview?.account?.email || undefined} className="max-w-64 truncate text-xs font-medium text-sparkle-text-secondary">{displayAccountValue(overview?.account?.email)}</span>}
                />
                <SettingsRow title="Plan" description="Plan reported by ChatGPT for this account." control={<span className="text-xs font-medium text-sparkle-text-secondary">{accountPlan}</span>} />
                <SettingsRow title="Pi provider" description="Provider identifier Pi uses for this ChatGPT connection." control={<span className="max-w-64 truncate text-xs font-medium text-sparkle-text-secondary">{displayAccountValue(overview?.provider)}</span>} />
                <SettingsRow title="Account ID" description="OpenAI account identifier associated with the connected ChatGPT account." control={<span title={overview?.accountId || undefined} className="max-w-64 truncate text-xs font-medium text-sparkle-text-secondary">{displayAccountValue(overview?.accountId)}</span>} />
                <SettingsRow title="Access refresh" description="When Pi is expected to refresh the current ChatGPT access token." control={<span className="text-xs font-medium text-sparkle-text-secondary">{initialAccountLoading ? 'Checking…' : formatAccountDateTime(overview?.tokenExpiresAt)}</span>} />
                <SettingsRow title="Connection source" description="Where Zyra reads the account connection and quota snapshot." control={<span title={overview?.source || undefined} className="max-w-64 truncate text-xs font-medium text-sparkle-text-secondary">{displayAccountValue(overview?.source)}</span>} />
            </SettingsSection>

            <SettingsSection title="Usage limits">
                {overview?.usageError ? <SettingsNotice tone="warning">Usage could not be refreshed: {overview.usageError}</SettingsNotice> : null}
                <SettingsRow title="Usage display" description="Show the amount remaining or already used in each limit window." control={<SettingsSegmented value={settings.assistantUsageDisplayMode} options={[{ value: 'remaining', label: 'Remaining' }, { value: 'used', label: 'Used' }]} onChange={(assistantUsageDisplayMode) => updateSettings({ assistantUsageDisplayMode })} label="Usage display" />} />
                {initialAccountLoading ? (
                    <SettingsRow
                        title="Usage windows"
                        description="Checking the current ChatGPT usage limits."
                        status="Checking"
                        statusTone="muted"
                        control={<RefreshCw size={13} className="animate-spin motion-reduce:animate-none text-[var(--settings-text-muted)]" />}
                    />
                ) : usageCards.map((card) => (
                    <SettingsRow
                        key={card.id}
                        title={`${card.bucketLabel} · ${card.durationLabel}`}
                        description={`${card.resetSummary} · synced ${formatFetchedAt(overview?.fetchedAt)}`}
                        status={card.resetAbsolute}
                        control={(
                            <div className="w-full sm:w-44">
                                <div className="mb-1 flex items-center justify-between text-[11px] text-sparkle-text-muted"><span>{card.percentLabel}</span><span>{Math.round(card.percent)}%</span></div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--settings-track)]"><div className={cn('h-full rounded-full bg-[var(--accent-primary)]')} style={{ width: `${card.percent}%` }} /></div>
                            </div>
                        )}
                    />
                ))}
                {overview && !overview.usageError && usageCards.length === 0 ? (
                    <SettingsRow title="Usage windows" description="No usage-limit windows were returned by ChatGPT for this account." status="Unavailable" statusTone="muted" />
                ) : null}
            </SettingsSection>

            <AccountResetCreditsSection
                overview={overview}
                loading={overviewLoading}
                onOverviewChange={applyAccountOverview}
            />
        </SettingsPageContainer>
    )
}

function formatAccountDateTime(value: string | null | undefined): string {
    if (!value) return 'Unavailable'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString()
}

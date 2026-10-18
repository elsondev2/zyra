import type { ReactNode } from 'react'
import { ListFilter, RefreshCw, Star, UserRoundMinus, UserRoundPlus, Users } from 'lucide-react'
import type { ChatGptAccountProfile, ChatGptAccountUsageWindow, ChatGptRoutingPolicy } from '@shared/onboarding/contracts'
import { SettingsActionsMenu } from '../SettingsActionsMenu'
import { AccountResetCreditsSection } from '../AccountResetCreditsSection'
import { SettingsStatusPill, SettingsSwitch } from '../settings-layout'
import { accountLabel, accountPlan, accountStates, saveRoutingPolicy } from './chatgpt-account-presentation'
import { currentUsedPercent } from './chatgpt-usage-groups'
import { usageResetDate, usageWindowResetLabel } from './ChatGptUsageHeader'
import { ChatGptUsageDonut } from './ChatGptUsageDonut'
import type { useChatGptAccountPool } from './useChatGptAccountPool'
import { ChatGptAccountIdentity } from './ChatGptAccountIdentity'

export function ChatGptUsageAccountRow({ account, windows, pool, mode, resetCredits, showResetCredits = true, onReconnect, reconnecting = false, onModeChange }: {
    account: ChatGptAccountProfile
    windows: { key: string; label: string; window: ChatGptAccountUsageWindow | null }[]
    pool: ReturnType<typeof useChatGptAccountPool>
    mode: 'used' | 'remaining'
    resetCredits?: ReactNode
    showResetCredits?: boolean
    onReconnect?: (accountId: string) => void
    reconnecting?: boolean
    onModeChange?: (mode: 'used' | 'remaining') => void
}) {
    const policy = pool.snapshot!.policy
    const label = accountLabel(account)
    const selected = policy.accountMode === 'all' || policy.accountIds.includes(account.id)
    const save = (patch: Partial<ChatGptRoutingPolicy>) => saveRoutingPolicy(pool, patch)
    return <div data-chatgpt-usage-account={account.id} className={`chatgpt-usage-account ${windows.length === 2 ? 'chatgpt-usage-account-dual' : ''} border-b border-[var(--settings-row-divider)] px-4 py-3 last:border-b-0`}>
        <div className="chatgpt-usage-identity min-w-0">
            <h4 className="min-w-0 text-[12px] font-medium text-[var(--settings-text)]"><ChatGptAccountIdentity account={account} disabled={pool.busy} onRename={alias => pool.update({ action: 'alias', accountId: account.id, alias })} /></h4>
            <div className="mt-1 flex flex-wrap items-center gap-1.5"><SettingsStatusPill label={accountPlan(account)} />{account.state !== 'ready' ? <SettingsStatusPill label={accountStates[account.state]} tone={account.state === 'limited' || account.state === 'needs-sign-in' ? 'warning' : 'muted'} /> : null}{!selected ? <SettingsStatusPill label="Excluded" /> : null}{showResetCredits ? <span data-chatgpt-reset-owner={account.id} className="text-[10px] text-[var(--settings-text-muted)]">{account.primary && resetCredits ? resetCredits : <AccountResetCreditsSection compact accountId={account.id} accountLabel={label} remainingCount={account.usage?.availableResetCount ?? null} overview={null} loading={false} onOverviewChange={() => { void pool.refresh(true) }} />}</span> : null}</div>
        </div>
        {windows.map(({ key, label: period, window }) => {
            const used = window ? currentUsedPercent(window) : null
            return <div key={key} data-chatgpt-usage-window={key} aria-label={`${period} usage for ${label}`} title={window?.resetAt ? `Resets ${usageResetDate(window.resetAt)}` : 'Reset time unavailable'} className="chatgpt-usage-values text-[11px] tabular-nums">
                {windows.length === 2 ? <span className="chatgpt-usage-period">{period}</span> : null}
                <span className="inline-flex items-center gap-2">
                {used !== null ? <ChatGptUsageDonut percent={mode === 'remaining' ? 100 - used : used} label={`${period} ${mode} for ${label}`} /> : null}
                {used !== null && onModeChange ? <button type="button" data-chatgpt-mode-toggle data-mode={mode} className="chatgpt-usage-mode font-medium" aria-label={`Show ${mode === 'remaining' ? 'used' : 'remaining'} ${period.toLowerCase()} usage for ${label}`} onClick={() => onModeChange(mode === 'remaining' ? 'used' : 'remaining')}>{Math.round(mode === 'remaining' ? 100 - used : used)}% {mode}</button> : <span className="font-medium text-[var(--settings-text)]">{used === null ? 'Unavailable' : `${Math.round(mode === 'remaining' ? 100 - used : used)}% ${mode}`}</span>}
                </span>
                <span data-chatgpt-reset-time className={`chatgpt-usage-reset-time ${used !== null ? 'chatgpt-usage-reset-time-known' : ''}`}>{usageWindowResetLabel(window)}</span>
            </div>
        })}
        <div className="chatgpt-usage-controls flex items-center justify-end gap-2">
            {account.state === 'needs-sign-in' ? <button type="button" disabled={pool.busy || reconnecting || !onReconnect} onClick={() => onReconnect?.(account.id)} className="chatgpt-usage-signin disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Sign in again to ${label}`}><RefreshCw size={13} aria-hidden="true" />Sign in again</button> : <SettingsActionsMenu iconOnly ariaLabel={`Usage options for ${label}`} label="Options" disabled={pool.busy} items={[
                ...(!account.primary ? [{ id: 'primary', label: 'Make primary', icon: <Star size={13} />, onSelect: () => pool.update({ action: 'primary', accountId: account.id }) }] : []),
                ...(policy.accountMode === 'selected' ? [{ id: 'allowed', label: selected ? 'Exclude this account' : 'Include this account', icon: selected ? <UserRoundMinus size={13} /> : <UserRoundPlus size={13} />, onSelect: () => save({ accountIds: selected ? policy.accountIds.filter(id => id !== account.id) : [...policy.accountIds, account.id] }) }] : []),
                { id: 'only', label: 'Use only this account', icon: <ListFilter size={13} />, checked: policy.accountMode === 'selected' && policy.accountIds.length === 1 && selected, onSelect: () => save({ accountMode: 'selected', accountIds: [account.id] }) },
                { id: 'all', label: 'Use all enabled accounts', icon: <Users size={13} />, checked: policy.accountMode === 'all', onSelect: () => save({ accountMode: 'all', accountIds: [] }) }
            ]} />}
            <SettingsSwitch label={`Enable ${label}`} checked={account.enabled} disabled={pool.busy} onCheckedChange={enabled => void pool.update({ action: 'enabled', accountId: account.id, enabled })} />
        </div>
    </div>
}

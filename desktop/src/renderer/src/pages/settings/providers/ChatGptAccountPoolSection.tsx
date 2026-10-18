import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { SettingsButton, SettingsNotice, SettingsRow, SettingsSection } from '../settings-layout'
import { SettingsPageLink } from '../SettingsPageTabs'
import { groupChatGptUsage } from './chatgpt-usage-groups'
import { ChatGptUsageGroup } from './ChatGptUsageGroup'
import { ChatGptUsageRules } from './ChatGptUsageRules'
import { ChatGptUsageComparison } from './ChatGptUsageComparison'
import type { useChatGptAccountPool } from './useChatGptAccountPool'

export function ChatGptAccountPoolSection({ pool, mode = 'remaining', onModeChange, onRefresh, resetCredits, notice, onReconnect, reconnecting }: {
    pool: ReturnType<typeof useChatGptAccountPool>
    mode?: 'used' | 'remaining'
    onModeChange?: (mode: 'used' | 'remaining') => void
    onRefresh?: () => void
    resetCredits?: ReactNode
    notice?: ReactNode
    onReconnect?: (accountId: string) => void
    reconnecting?: boolean
}) {
    const { snapshot, busy } = pool
    const groups = groupChatGptUsage(snapshot?.accounts || [])
    const headerGroup = groups.length === 2 ? groups[1] : groups[0]
    const refreshAction = <SettingsButton variant="ghost" className={groups.length ? '!size-8 !p-0' : undefined} title={pool.refreshing ? 'Refreshing usage' : 'Refresh usage'} disabled={busy || pool.refreshing} aria-busy={pool.refreshing} onClick={() => { void pool.refresh(true); onRefresh?.() }}><RefreshCw size={13} className={pool.refreshing ? 'motion-safe:animate-spin' : undefined} /><span className={groups.length ? 'sr-only' : undefined}>{pool.refreshing ? 'Refreshing…' : 'Refresh'}</span></SettingsButton>
    const resetOwnerGroups = new Map<string, string>()
    for (const group of groups) for (const { account } of group.entries) {
        if (!resetOwnerGroups.has(account.id)) resetOwnerGroups.set(account.id, group.key)
    }
    const resetOwnerGroup = resetOwnerGroups.get(snapshot?.accounts.find(account => account.primary)?.id || '')
    return <>
        <SettingsSection title="ChatGPT usage" hideHeader={groups.length > 0} bodyClassName="!border-0 !bg-transparent !shadow-none" headerAction={refreshAction}>
            {pool.error ? <SettingsNotice tone="error">{pool.error}</SettingsNotice> : null}
            {notice}
            {!snapshot && !pool.error ? <SettingsRow title="Checking usage" description="Loading your connected accounts." /> : null}
            {snapshot?.accounts.length === 0 ? <SettingsPageLink to="/settings/providers" title="Connect a ChatGPT account" description="Add accounts in Connections to see usage here." /> : null}
            {groups.length === 2 ? <ChatGptUsageComparison groups={[groups[0], groups[1]]} onReconnect={onReconnect} reconnecting={reconnecting} pool={pool} mode={mode} onModeChange={onModeChange} resetCredits={resetCredits} headerAction={refreshAction} /> : groups.map(group => <ChatGptUsageGroup key={group.key} group={group} resetOwnerGroups={resetOwnerGroups} onReconnect={onReconnect} reconnecting={reconnecting} pool={pool} mode={mode} onModeChange={onModeChange} headerAction={group.key === headerGroup?.key ? refreshAction : undefined} resetCredits={group.key === resetOwnerGroup ? resetCredits : undefined} />)}
        </SettingsSection>
        <ChatGptUsageRules pool={pool} />
    </>
}

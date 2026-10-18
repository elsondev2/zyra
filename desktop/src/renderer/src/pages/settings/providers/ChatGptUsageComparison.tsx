import type { ReactNode } from 'react'
import { ChatGptUsageHeader } from './ChatGptUsageHeader'
import { ChatGptUsageAccountRow } from './ChatGptUsageAccountRow'
import type { ChatGptUsageGroup } from './chatgpt-usage-groups'
import type { useChatGptAccountPool } from './useChatGptAccountPool'
import './ChatGptUsageGroup.css'

export function ChatGptUsageComparison({ groups, pool, mode, onModeChange, resetCredits, headerAction, onReconnect, reconnecting }: {
    groups: [ChatGptUsageGroup, ChatGptUsageGroup]
    pool: ReturnType<typeof useChatGptAccountPool>
    mode: 'used' | 'remaining'
    onModeChange?: (mode: 'used' | 'remaining') => void
    resetCredits?: ReactNode
    headerAction?: ReactNode
    onReconnect?: (accountId: string) => void
    reconnecting?: boolean
}) {
    const { accounts } = pool.snapshot!
    const visibleAccounts = accounts.filter(account => groups.some(group => group.entries.some(entry => entry.account.id === account.id)))
    return <div>
        <ChatGptUsageHeader label="Account limits" headerAction={headerAction} />
        <div data-chatgpt-usage-comparison data-chatgpt-usage-group={groups[1].key} className="overflow-hidden rounded-xl border border-[var(--settings-border)] bg-[var(--settings-section)]">
            {visibleAccounts.map(account => <ChatGptUsageAccountRow key={account.id} account={account} onReconnect={onReconnect} reconnecting={reconnecting} pool={pool} mode={mode} onModeChange={onModeChange} resetCredits={resetCredits} windows={groups.map(group => ({ key: group.key, label: group.label, window: group.entries.find(entry => entry.account.id === account.id)?.window || null }))} />)}
        </div>
    </div>
}

import type { ReactNode } from 'react'
import type { ChatGptUsageGroup as UsageGroup } from './chatgpt-usage-groups'
import type { useChatGptAccountPool } from './useChatGptAccountPool'
import { ChatGptUsageHeader } from './ChatGptUsageHeader'
import { ChatGptUsageAccountRow } from './ChatGptUsageAccountRow'
import './ChatGptUsageGroup.css'

export function ChatGptUsageGroup({ group, pool, mode, onModeChange, resetCredits, headerAction, onReconnect, reconnecting }: { group: UsageGroup; pool: ReturnType<typeof useChatGptAccountPool>; mode: 'used' | 'remaining'; onModeChange?: (mode: 'used' | 'remaining') => void; resetCredits?: ReactNode; headerAction?: ReactNode; onReconnect?: (accountId: string) => void; reconnecting?: boolean }) {
    return <div className="!border-0 [&+div]:mt-4">
        <ChatGptUsageHeader label={`${group.label} limits`} headerAction={headerAction} />
        <div data-chatgpt-usage-group={group.key} className="overflow-hidden rounded-xl border border-[var(--settings-border)] bg-[var(--settings-section)]">
            {group.entries.map(({ account, window }) => <ChatGptUsageAccountRow key={account.id} account={account} onReconnect={onReconnect} reconnecting={reconnecting} windows={[{ key: group.key, label: group.label, window }]} pool={pool} mode={mode} onModeChange={onModeChange} resetCredits={resetCredits} />)}
        </div>
    </div>
}

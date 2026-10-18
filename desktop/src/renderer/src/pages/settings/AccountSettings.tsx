import { useCallback, useEffect, useRef, useState } from 'react'
import { AccountResetCreditsSection } from './AccountResetCreditsSection'
import { AccountUsageLimits } from './AccountUsageLimits'
import { SettingsNotice } from './settings-layout'
import { useOpenAIAccountSettings } from './providers/useOpenAIAccountSettings'
import { useChatGptAccountPool } from './providers/useChatGptAccountPool'
import { ChatGptAccountPoolSection } from './providers/ChatGptAccountPoolSection'
import { ChatGptLimitsLoading } from './providers/ChatGptLimitsLoading'
import { OpenAIConnectionNotices } from './providers/OpenAIConnectionRows'

export default function AccountSettings({ onRefreshReady }: { onRefreshReady?: (refresh: (() => Promise<void>) | null) => void } = {}) {
    const connection = useOpenAIAccountSettings({ usageActive: true })
    const pool = useChatGptAccountPool()
    const { settings, updateSettings, overview, overviewLoading, overviewError, loadOverview, applyAccountOverview } = connection
    const refreshPool = pool.refresh
    const reconnectPending = useRef(false)
    const [reconnecting, setReconnecting] = useState(false)
    const reconnect = async (accountId: string) => {
        if (reconnectPending.current || pool.busy || connection.connectionBusy || !connection.desktopHost) return
        reconnectPending.current = true
        setReconnecting(true)
        try {
            await connection.connectChatGpt('browser', accountId)
            await refreshPool()
            void refreshPool(true)
        } finally {
            reconnectPending.current = false
            setReconnecting(false)
        }
    }
    const refreshUsage = useCallback(async () => {
        // Wait for both sources even if one request fails. Their hooks retain errors and stale data.
        const results = await Promise.allSettled([refreshPool(true), loadOverview(true)])
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
    }, [refreshPool, loadOverview])
    useEffect(() => {
        onRefreshReady?.(pool.busy || pool.refreshing ? null : refreshUsage)
        return () => onRefreshReady?.(null)
    }, [onRefreshReady, pool.busy, pool.refreshing, refreshUsage])
    if (pool.initialLoading && (!pool.snapshot || (pool.snapshot.accounts.length > 0 && pool.snapshot.accounts.every(account => !account.usage)))) return <ChatGptLimitsLoading />
    if (!pool.snapshot && (pool.supported === false || connection.usageCards.length > 0)) return <>
        {pool.error ? <SettingsNotice tone="warning">{pool.error}</SettingsNotice> : null}
        {overviewError ? <SettingsNotice tone="error">{overviewError}</SettingsNotice> : null}
        <AccountUsageLimits cards={connection.usageCards} mode={settings.assistantUsageDisplayMode}
            onModeChange={assistantUsageDisplayMode => updateSettings({ assistantUsageDisplayMode })}
            loading={connection.initialAccountLoading} error={overview?.usageError} fetchedAt={overview?.fetchedAt} />
        <AccountResetCreditsSection overview={overview} loading={overviewLoading} onOverviewChange={applyAccountOverview} />
    </>
    return <><ChatGptAccountPoolSection pool={pool} mode={settings.assistantUsageDisplayMode}
        onReconnect={connection.desktopHost ? accountId => void reconnect(accountId) : undefined} reconnecting={reconnecting || connection.connectionBusy}
        onModeChange={assistantUsageDisplayMode => updateSettings({ assistantUsageDisplayMode })}
        onRefresh={() => void loadOverview(true)}
        notice={<OpenAIConnectionNotices connection={connection} />} />
    </>
}

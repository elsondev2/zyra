import { useCallback, useEffect, useState } from 'react'
import { useRuntimeConnection } from './runtime-connection'
import { nextRuntimeNotice } from './runtime-connection-presentation'

export function useRuntimeNotice() {
    const { state } = useRuntimeConnection()
    const [notice, setNotice] = useState(() => nextRuntimeNotice(null, state))
    const [dismissed, setDismissed] = useState(false)
    const dismiss = useCallback(() => setDismissed(true), [])
    useEffect(() => { setNotice(previous => nextRuntimeNotice(previous, state)) }, [state])
    useEffect(() => {
        if (notice?.tone !== 'info') { setDismissed(false); return }
        const timer = window.setTimeout(dismiss, 6_000)
        return () => window.clearTimeout(timer)
        // Heartbeats and copy changes must not restart the timer or resurrect a dismissed update.
    }, [notice?.tone, dismiss])
    return { notice: notice?.tone === 'info' && dismissed ? null : notice, dismiss }
}

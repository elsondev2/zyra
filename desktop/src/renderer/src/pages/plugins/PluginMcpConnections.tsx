import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link2, RefreshCw, Unplug } from 'lucide-react'
import type { AssistantPluginMcpConnectionStatus } from '@shared/assistant/contracts'
import { pluginDownloadController } from './plugin-download-controller'

export function PluginMcpConnections({ pluginId, active, compact = false }: { pluginId: string; active: boolean; compact?: boolean }) {
    const [connections, setConnections] = useState<AssistantPluginMcpConnectionStatus[]>([])
    const [working, setWorking] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [loading, setLoading] = useState(active)
    const installation = useSyncExternalStore(pluginDownloadController.subscribe, pluginDownloadController.getSnapshot, pluginDownloadController.getSnapshot)
    const autoConnecting = installation.phase === 'connecting' && installation.installedPluginId === pluginId
    const connectionRevision = installation.installedPluginId === pluginId ? installation.connectionRevision : 0

    useEffect(() => {
        let cancelled = false
        setError(null)
        setNotice(null)
        setConnections([])
        setLoading(active)
        if (!active) {
            setConnections([])
            return () => { cancelled = true }
        }
        void Promise.resolve().then(() => {
            if (typeof window.devscope.assistant.getPluginMcpConnections !== 'function') throw Error('Restart Zyra Desktop to connect this Plugin.')
            return window.devscope.assistant.getPluginMcpConnections(pluginId)
        }).then((response) => {
            if (cancelled) return
            if (!response.success) throw new Error(response.error || 'Could not load MCP servers.')
            setConnections(response.connections)
        }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load MCP servers.') })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [pluginId, active, connectionRevision])

    const change = async (server: string, connect: boolean) => {
        setWorking(server)
        setError(null)
        setNotice(null)
        try {
            const response = connect
                ? await window.devscope.assistant.connectPluginMcp(pluginId, server)
                : await window.devscope.assistant.disconnectPluginMcp(pluginId, server)
            if (!response.success) throw new Error(response.error || 'Could not update this MCP connection.')
            const refreshed = await window.devscope.assistant.getPluginMcpConnections(pluginId)
            if (!refreshed.success) throw new Error(refreshed.error || 'Could not refresh MCP connections.')
            setConnections(refreshed.connections)
            setNotice(compact ? connect ? 'Connected. Ready to use in chat.' : 'Disconnected.' : connect ? `${server} is ready to use in existing and new Chats.` : `${server} disconnected.`)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not update this MCP connection.')
            // A failed reconnect may have cleared its verified account marker.
            // Do not leave an old Connected label beside the failure.
            try {
                const refreshed = await window.devscope.assistant.getPluginMcpConnections(pluginId)
                if (refreshed.success) setConnections(refreshed.connections)
            } catch { /* The original connection error stays visible. */ }
        } finally { setWorking(null) }
    }

    return <section className={compact ? 'plugin-product-connections' : 'plugin-detail-section'} aria-label="MCP connections">
        {!compact ? <><h3>MCP connections</h3>
        <p className="plugin-help">Connected tools are available automatically in regular Chats. Connecting a local server runs its command; Chat tool calls still ask permission.</p></> : null}
        {error ? <p className="plugin-notice" role="alert">{error}</p> : null}
        {notice ? <p className="plugin-help" role="status">{notice}</p> : null}
        {loading ? <p className="plugin-help" role="status">Checking connection…</p> : connections.length ? connections.map((entry) => <div className={compact ? 'plugin-product-connect-row' : 'plugin-detail-row'} key={entry.server}>
            <div><strong>{entry.server}</strong><p>{compact ? entry.kind === 'stdio' && entry.state !== 'connected' ? `Runs ${entry.destination} on this device` : entry.state === 'connected' ? 'Connected' : entry.state === 'needs-review' ? 'Reconnect for this release' : 'Connect your account to use its tools' : `${entry.kind === 'stdio' ? 'Local server' : 'Remote server'} · ${entry.destination} · ${entry.state === 'connected' ? 'Ready' : entry.state === 'needs-review' ? 'Reconnect for this release' : 'Not connected'}`}</p></div>
            <button type="button" className={compact && entry.state !== 'connected' ? 'plugin-button' : 'plugin-icon-button'} disabled={!active || working !== null || autoConnecting} onClick={() => void change(entry.server, entry.state !== 'connected')} aria-label={entry.state === 'connected' ? `Disconnect ${entry.server}` : `Connect ${entry.server}`} title={entry.state === 'connected' ? 'Disconnect' : 'Connect'}>
                {working === entry.server || autoConnecting && installation.connectingServer === entry.server ? <RefreshCw size={16} className="animate-spin" /> : entry.state === 'connected' ? <Unplug size={16} /> : <Link2 size={16} />}
                {compact && entry.state !== 'connected' ? working === entry.server || autoConnecting && installation.connectingServer === entry.server ? 'Connecting…' : 'Connect' : null}
            </button>
        </div>) : !error ? <p className="plugin-help">{active ? 'No servers declared in this release.' : 'Enable this Plugin to manage its MCP connections.'}</p> : null}
    </section>
}

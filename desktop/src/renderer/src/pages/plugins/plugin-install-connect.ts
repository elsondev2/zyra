import type { AssistantPluginCatalog, AssistantPluginInspection, AssistantPluginMcpConnectionStatus } from '@shared/assistant/contracts'
import { getReviewedCatalogPluginSelection } from './plugin-directory-state'
type Result<T = object> = ({ success: true } & T) | { success: false; error?: string }
export interface PluginInstallConnectApi {
    getPluginMcpConnections?(pluginId: string): Promise<Result<{ connections: AssistantPluginMcpConnectionStatus[] }>>
    connectPluginMcp?(pluginId: string, server: string): Promise<Result<{ result: { toolCount: number } }>>
}
/** Continue only the reviewed installation selected by the explicit Install &
 * connect action. Never connect a same-name/digest package from another source. */
export async function connectReviewedPlugin(api: PluginInstallConnectApi, catalog: AssistantPluginCatalog, name: string | null,
    inspection: AssistantPluginInspection, onConnecting: (server: string) => void = () => undefined): Promise<string> {
    const selection = getReviewedCatalogPluginSelection(catalog, name, inspection)
    if (!selection) throw new Error('The installed reviewed release is no longer active. Refresh before connecting.')
    const release = catalog.releases.find(entry => entry.id === selection.releaseId && entry.pluginId === selection.pluginId)
    if (!release?.manifest.contributions.mcp) return selection.pluginId
    if (!api.getPluginMcpConnections || !api.connectPluginMcp) throw new Error('Restart Zyra Desktop to finish connecting this installed Plugin.')
    const response = await api.getPluginMcpConnections(selection.pluginId)
    if (!response.success) throw new Error(response.error || 'Could not check this Plugin’s connections.')
    if (!response.connections.length) throw new Error('This Plugin declares connections but no supported servers were found.')
    if (response.connections.length > 32 || response.connections.some(entry => entry.pluginId !== selection.pluginId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(entry.server)) || new Set(response.connections.map(entry => entry.server)).size !== response.connections.length) throw new Error('Plugin connection identity did not match the reviewed installation.')
    // One sign-in window at a time. A failure leaves the package and any already
    // connected services intact; normal Connect remains the recovery action.
    for (const entry of response.connections) {
        if (entry.state === 'connected') continue
        onConnecting(entry.server)
        const connected = await api.connectPluginMcp(selection.pluginId, entry.server)
        if (!connected.success) throw new Error(connected.error || `Could not connect ${entry.server}.`)
        if (!Number.isInteger(connected.result.toolCount) || connected.result.toolCount <= 0) throw new Error(`${entry.server} advertised no tools after connecting.`)
        const refreshed = await api.getPluginMcpConnections(selection.pluginId)
        if (!refreshed.success) throw new Error(refreshed.error || 'Could not verify the connection.')
        if (!refreshed.connections.some(item => item.pluginId === selection.pluginId && item.server === entry.server && item.state === 'connected')) throw new Error(`${entry.server} did not finish connecting.`)
    }
    return selection.pluginId
}

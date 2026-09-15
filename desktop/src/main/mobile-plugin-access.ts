import type { AssistantService } from './assistant/service'
import { MobilePluginSession } from '../../../mobile/gateway/src/plugin-session.mjs'
import directory from '../shared/plugins/openai-directory.json'

// Electron webContents IDs use the lower integer range. Acquisition owners are
// assigned on the host, never from phone input, and are distinct per connection.
let nextMobilePluginOwner = 0x1_0000_0000

export class MobilePluginAccess extends MobilePluginSession {
    constructor(service: AssistantService, changed?: () => void) {
        const owner = nextMobilePluginOwner++
        if (!Number.isSafeInteger(owner)) throw new Error('Restart Zyra before preparing another Plugin.')
        super({
            context: id => service.getMobilePluginContext(id),
            catalog: async () => (await service.getPluginCatalog()).catalog,
            subscribe: listener => service.onPluginCatalogChanged(listener),
            defaults: input => service.setPluginSet(input),
            refresh: input => service.refreshChatPluginScope(input),
            state: input => service.setPluginState(input.pluginId, input.state, input.expectedCatalogRevision),
            rollback: input => service.rollbackPlugin(input.pluginId, input.releaseId, true, input.expectedCatalogRevision),
            downloads: {
                directory: async () => directory,
                installed: async () => {
                    const catalog = (await service.getPluginCatalog()).catalog
                    return catalog.plugins.map(plugin => ({name:plugin.name,sourceId:plugin.sourceId,state:plugin.state,
                        version:catalog.releases.find(release => release.id === plugin.activeReleaseId)?.version || ''}))
                },
                start: async name => (await service.startPluginDownload(name, owner)).download,
                status: async id => service.getPluginDownload(id, owner).download,
                cancelAll: () => service.cancelPluginDownloadsForOwner(owner),
                install: reviewId => service.installInspectedPlugin({ reviewId, confirmed: true }, owner)
            }
        }, changed)
    }
}

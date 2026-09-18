import { assert, fault } from './errors.mjs';
import { projectPluginCatalog } from './plugin-projection.mjs';
import { ZYRA_PLUGIN_LIMITS } from '../../../src/plugins/plugin-contract.mjs';
import { MobilePluginDownloads, PLUGIN_STORE_METHODS } from './plugin-store.mjs';
import { dispatchPluginControl, PLUGIN_CONTROL_METHODS } from './plugin-controls.mjs';

export const PLUGIN_METHODS = new Set(['plugins.list', 'plugins.defaults', 'plugins.refresh', ...PLUGIN_STORE_METHODS, ...PLUGIN_CONTROL_METHODS]);
export const PLUGIN_READS = new Set(['plugins.list', 'plugins.store', 'plugins.download.status', 'plugins.download.cancel', 'plugins.detail']);

/** Resolves Desktop's local session/project identity on the PC. Caller-supplied
 * project IDs and catalog scopes are never accepted as authority. */
export class MobilePluginSession {
  supportsMachineScope = true;
  constructor(api, changed) {
    this.api = api; this.changed = changed; this.closed = false; this.unsubscribe = null; this.changeTimer = null;
    this.downloads = api.downloads ? new MobilePluginDownloads(api.downloads) : null;
  }
  watch() {
    if (this.unsubscribe || !this.changed || !this.api.subscribe) return;
    this.unsubscribe = this.api.subscribe(() => {
      if (this.closed || this.changeTimer) return;
      this.changeTimer = setTimeout(() => { this.changeTimer = null; if (!this.closed) this.changed(); }, 250);
      this.changeTimer.unref();
    });
  }
  check() { if (this.closed) throw fault('CONNECTION_CLOSED', 'Reconnect this PC to manage Plugins.'); }
  async dispatch(method, params, chat, manageMachine) {
    this.check();
    assert(PLUGIN_METHODS.has(method), 'This Plugin action is unavailable.');
    const machineScope = chat === null && params.scope === 'machine';
    assert(machineScope || chat?.canonicalChatId, 'Choose a computer or a chat for Plugins.');
    const context = machineScope ? { sessionId: null, projectId: null, machineScope: true } : await this.api.context(chat.canonicalChatId);
    this.check();
    assert(machineScope || (context && typeof context.sessionId === 'string'), 'This chat has not synchronized with Desktop yet. Refresh and try again.');
    this.watch();
    if (PLUGIN_CONTROL_METHODS.has(method)) return dispatchPluginControl(this.api, method, params, manageMachine, () => this.check());
    if (PLUGIN_STORE_METHODS.has(method)) {
      assert(this.downloads, 'Update Zyra Desktop to browse the Plugin Store.');
      const value = await this.downloads.dispatch(method, params, manageMachine); this.check(); return value;
    }
    if (method === 'plugins.defaults') {
      assert(context.projectId || manageMachine, 'This phone cannot change PC-wide Plugin defaults.');
      assert(Array.isArray(params.pluginIds) && params.pluginIds.length <= ZYRA_PLUGIN_LIMITS.maxActiveSkillPlugins &&
        params.pluginIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 128) && new Set(params.pluginIds).size === params.pluginIds.length, 'Choose valid Plugins.');
      assert(Number.isSafeInteger(params.expectedRevision) && params.expectedRevision >= 1, 'Refresh the Plugin selection first.');
      await this.api.defaults({ projectId: context.projectId || null, pluginIds: params.pluginIds, expectedRevision: params.expectedRevision });
    } else if (method === 'plugins.refresh') {
      assert(!machineScope, 'Open a chat before updating its saved Plugin versions.');
      assert(params.confirmed === true && Number.isSafeInteger(params.expectedCatalogRevision) && params.expectedCatalogRevision >= 1, 'Review the Plugins before updating this chat.');
      await this.api.refresh({ sessionId: context.sessionId, expectedCatalogRevision: params.expectedCatalogRevision });
    }
    this.check();
    const catalog = await this.api.catalog();
    this.check();
    return projectPluginCatalog(catalog, context, method === 'plugins.list' ? params : {}, manageMachine);
  }
  close() { this.closed = true; clearTimeout(this.changeTimer); this.unsubscribe?.(); this.unsubscribe = null; this.downloads?.close(); }
}

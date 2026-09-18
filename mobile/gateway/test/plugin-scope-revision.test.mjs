import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ZyraPluginRegistry} from '../../../src/plugins/plugin-registry.mjs';

test('a reviewed chat refresh rejects a queued PC change without rewriting its saved scope', async () => {
  const parent=path.resolve(os.tmpdir());const root=await mkdtemp(path.join(parent,'zyra-mobile-plugin-revision-'));
  try {
    const registry=new ZyraPluginRegistry({rootPath:root});
    await registry.createChatScope({sessionId:'chat',projectId:'project'});
    const reviewed=await registry.getCatalog();const before=await registry.getChatScope('chat');
    // Queue the PC change and phone confirmation together to exercise the registry lock.
    const pc=registry.setEnabledPlugins({projectId:'project',pluginIds:[],expectedRevision:1});
    const phone=registry.refreshChatScope({sessionId:'chat',projectId:'project',expectedCatalogRevision:reviewed.revision});
    await pc;
    await assert.rejects(phone,{code:'PLUGIN_CATALOG_REVISION_CHANGED'});
    assert.deepEqual(await registry.getChatScope('chat'),before);
    const current=await registry.getCatalog();
    const refreshed=await registry.refreshChatScope({sessionId:'chat',projectId:'project',expectedCatalogRevision:current.revision});
    assert.equal(refreshed.scope.scopeRevision,before.scopeRevision+1);
    // Existing Desktop callers without the new optional guard retain their contract.
    await registry.refreshChatScope({sessionId:'chat',projectId:'project'});
  } finally { assert.equal(path.dirname(path.resolve(root)),parent);await rm(root,{recursive:true,force:true}); }
});

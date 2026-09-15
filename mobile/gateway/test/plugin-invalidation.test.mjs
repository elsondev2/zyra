import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,mkdir,rename} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ZyraPluginRegistry} from '../../../src/plugins/plugin-registry.mjs';
import {MobilePluginSession} from '../src/plugin-session.mjs';

test('registry notifications follow durable writes and cannot fail an accepted mutation',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'zyra-plugin-invalidation-'));const revisions=[];
  try {
    const registry=new ZyraPluginRegistry({rootPath:root,onChange:revision=>{
      assert.equal(JSON.parse(readFileSync(registry.stateFile,'utf8')).revision,revision);
      revisions.push(revision);throw new Error('Broken observer');
    }});
    await registry.initialize();assert.deepEqual(revisions,[]);
    await registry.setEnabledPlugins({projectId:'project',pluginIds:[],expectedRevision:1});
    assert.equal(revisions.length,1);assert.equal((await registry.getCatalog()).revision,revisions[0]);
    await assert.rejects(registry.setEnabledPlugins({projectId:'project',pluginIds:[],expectedRevision:999}));
    assert.equal(revisions.length,1);
    const saved=registry.stateFile+'.saved';await rename(registry.stateFile,saved);await mkdir(registry.stateFile);
    await assert.rejects(registry.setEnabledPlugins({projectId:'other',pluginIds:[],expectedRevision:1}));
    assert.equal(revisions.length,1);assert.equal((await registry.getCatalog()).revision,revisions[0]);
    await rm(registry.stateFile,{recursive:true});await rename(saved,registry.stateFile);
  } finally {assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await rm(root,{recursive:true,force:true});}
});

test('mobile subscription is lazy, coalesced and removed immediately on close',async()=>{
  let listener,subscriptions=0,unsubscribed=0;const notifications=[];
  const api={context:async()=>({sessionId:'chat',projectId:'project'}),catalog:async()=>({revision:1,plugins:[],releases:[],sources:[],pluginSets:[],chatScopes:[]}),
    subscribe:callback=>{subscriptions++;listener=callback;return()=>unsubscribed++;}};
  const session=new MobilePluginSession(api,()=>notifications.push('changed'));
  assert.equal(subscriptions,0);
  await session.dispatch('plugins.list',{}, {canonicalChatId:'chat'},true);
  await session.dispatch('plugins.list',{}, {canonicalChatId:'chat'},true);assert.equal(subscriptions,1);
  listener();listener();listener();await new Promise(resolve=>setTimeout(resolve,300));assert.deepEqual(notifications,['changed']);
  listener();session.close();session.close();assert.equal(unsubscribed,1);
  listener();await new Promise(resolve=>setTimeout(resolve,300));assert.deepEqual(notifications,['changed']);
});

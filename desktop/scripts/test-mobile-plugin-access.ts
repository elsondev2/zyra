import assert from 'node:assert/strict'
import { MobilePluginAccess } from '../src/main/mobile-plugin-access'

const owners: number[] = [], cancelled: number[] = [], installed: Array<{owner:number;reviewId:string}> = []
const controls: unknown[][]=[]
const listeners=new Set<() => void>();let notifications=0
const catalog={revision:1,plugins:[{id:'plugin',name:'design',state:'active',activeReleaseId:'v2',releaseIds:['v2','v1']}],
    releases:['v1','v2'].map(id=>({id,pluginId:'plugin',version:id,contentDigest:id.repeat(32),manifest:{description:'Tools'},skills:[]})),sources:[],pluginSets:[],chatScopes:[]}
const service = {
    getMobilePluginContext: async (id: string) => { assert.equal(id,'canonical'); return {sessionId:'desktop',projectId:'project'} },
    getPluginCatalog: async () => ({catalog}),
    onPluginCatalogChanged: (listener: () => void) => {listeners.add(listener);return()=>listeners.delete(listener)},
    setPluginState: async (...args:unknown[]) => {controls.push(['state',...args])},
    rollbackPlugin: async (...args:unknown[]) => {controls.push(['rollback',...args])},
    startPluginDownload: async (name: string, owner: number) => { assert.equal(name,'figma');owners.push(owner);return {download:{id:'download',status:'downloading'}} },
    getPluginDownload: (id: string, owner: number) => { assert.equal(id,'download');assert.ok(owners.includes(owner));return {download:{id,status:'ready',inspection:{reviewId:'review',expiresAt:new Date(Date.now()+60000).toISOString(),release:{contentDigest:'a'.repeat(64)}}}} },
    cancelPluginDownloadsForOwner: async (owner: number) => {cancelled.push(owner)},
    installInspectedPlugin: async (input: {reviewId:string;confirmed:true}, owner: number) => {assert.equal(input.confirmed,true);installed.push({owner,reviewId:input.reviewId})},
} as unknown as ConstructorParameters<typeof MobilePluginAccess>[0]
const first=new MobilePluginAccess(service,()=>notifications++),second=new MobilePluginAccess(service),chat={canonicalChatId:'canonical'}
try {
    const catalog=await first.dispatch('plugins.store',{},chat,false)
    assert.equal(catalog.manageMachine,false);assert.ok(catalog.entries.length>0)
    assert.equal(listeners.size,1);for(const listener of listeners){listener();listener()}
    await new Promise(resolve=>setTimeout(resolve,300));assert.equal(notifications,1)
    await first.dispatch('plugins.download.start',{name:'figma',ownerId:7},chat,true)
    await second.dispatch('plugins.download.start',{name:'figma',ownerId:7},chat,true)
    assert.equal(new Set(owners).size,2);assert.ok(owners.every(id=>Number.isSafeInteger(id)&&id>=0x1_0000_0000))
    const ready=await first.dispatch('plugins.download.status',{id:'download'},chat,true)
    await first.dispatch('plugins.install',{id:'download',reviewId:ready.review.id,digest:ready.review.digest,confirmed:true},chat,true)
    assert.deepEqual(installed,[{owner:owners[0],reviewId:'review'}])
    await first.dispatch('plugins.state',{pluginId:'plugin',state:'disabled',confirmed:true,expectedCatalogRevision:1},chat,true)
    await first.dispatch('plugins.rollback',{pluginId:'plugin',releaseId:'v1',digest:'v1'.repeat(32),confirmed:true,expectedCatalogRevision:1},chat,true)
    assert.deepEqual(controls,[['state','plugin','disabled',1],['rollback','plugin','v1',true,1]])
} finally {first.close();second.close()}
assert.deepEqual(cancelled,owners)
assert.equal(listeners.size,0)
console.log('Mobile Plugin adapter passed: isolated owners, pinned catalog, exact review, authority-service controls and cleanup.')

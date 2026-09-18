import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {AssistantPluginRegistry} from '../src/main/assistant/assistant-plugin-registry'

const root=await mkdtemp(path.join(tmpdir(),'zyra-plugin-notify-'))
const registry=new AssistantPluginRegistry({rootPath:root})
let changes=0
try {
    registry.onChange(async()=>{throw new Error('Broken view')})
    const unsubscribe=registry.onChange(()=>{changes++})
    await registry.initialize();assert.equal(changes,0)
    const initialSets=(await registry.getCatalog()).pluginSets.length
    await registry.setPluginSet({projectId:'first',pluginIds:[],expectedRevision:1})
    assert.equal(changes,1);assert.equal((await registry.getCatalog()).pluginSets.length,initialSets+1)
    await assert.rejects(registry.setPluginSet({projectId:'first',pluginIds:[],expectedRevision:999}))
    assert.equal(changes,1)
    unsubscribe();await registry.setPluginSet({projectId:'second',pluginIds:[],expectedRevision:1})
    assert.equal(changes,1)
    console.log('Desktop Plugin notifications passed: persisted core changes, isolated observers, failed-write silence and unsubscribe.')
} finally {
    await registry.dispose()
    assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()))
    await rm(root,{recursive:true,force:true})
}

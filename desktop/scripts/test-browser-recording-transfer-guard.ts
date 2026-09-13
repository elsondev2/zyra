import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { browserRecordingCapture } from '../src/main/browser-recording-capture'
mock.module('electron',()=>({BrowserWindow:class{},screen:{}}))
mock.module('../src/main/ipc/trusted-ipc',()=>({ipcMain:{handle(){}}}))
mock.module('../src/main/agent-control',()=>({getAgentControlBroker(){throw Error('No computer-control service is needed for this test')}}))
const { AssistantUtilityWindowManager }=await import('../src/main/assistant/assistant-utility-window-manager')
const frame={}
const owner={id:37,mainFrame:frame,isDestroyed:()=>false,session:{setDisplayMediaRequestHandler(){}}} as any
const guest={id:73,isDestroyed:()=>false,mainFrame:{}} as any
let created=0
let transferred=0
const tab={id:'browser:utility:fixture',workspace:'browser',canonicalChatId:'fixture'}
const windowState={id:'detached',tabs:[tab],activeTabId:tab.id}
const manager=new AssistantUtilityWindowManager({userDataPath:'fixture-not-written',createWindow:()=>{created++;throw Error('Unexpected provisional window')},activateWindow(){throw Error('Unexpected activation')},getMainWindow:()=>null,resolveChat:async()=>null,isTrustedRenderer:()=>true,browserViews:{transferTo(){transferred++;throw Error('Unexpected transfer')}} as any}) as any
manager.load=async()=>{}
manager.state={version:1,windows:[windowState]}
manager.windows.set('detached',{isDestroyed:()=>false,webContents:owner})
manager.commitAndPublish=async()=>{throw Error('Guard must run before persistent state is changed')}
browserRecordingCapture.arm(owner,guest,'off')
const before=JSON.stringify(manager.state)
await assert.rejects(manager.beginTearOff({sender:owner,senderFrame:frame},{sourceWindowId:'detached',tab,screenPoint:{x:1,y:1},grabOffset:{x:1,y:1}}),/Stop and save the recording before moving the last tab out of this window\./)
await assert.rejects(manager.moveTab({sourceWindowId:'detached',tabId:tab.id,targetWindowId:'main',screenPoint:{x:1,y:1}}),/Stop and save the recording before moving the last tab out of this window\./)
assert.equal(JSON.stringify(manager.state),before,'rejected last-tab moves preserve all window/tab state')
assert.equal(created,0,'reject before creating a provisional window')
assert.equal(transferred,0,'reject before moving the native page')
assert.deepEqual(await manager.moveTab({sourceWindowId:'detached',tabId:tab.id,targetWindowId:'detached'}),{targetWindowId:'detached'},'same-window reorder remains harmless')
assert.doesNotThrow(()=>manager.assertRecordingRendererSurvivesMove('main'),'the persistent main renderer can keep recording after transfer')
windowState.tabs.push({...tab,id:'retained-tab'})
assert.doesNotThrow(()=>manager.assertRecordingRendererSurvivesMove('detached'),'a retained original renderer can keep recording')
windowState.tabs.pop();browserRecordingCapture.cancel(owner.id)
assert.doesNotThrow(()=>manager.assertRecordingRendererSurvivesMove('detached'),'completed recording releases last-tab transfer restriction')
console.log('Utility recording last-tab guard: rejects before transfer side effects; main/retained owners remain movable')

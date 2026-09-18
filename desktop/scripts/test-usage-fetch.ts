import assert from 'node:assert/strict'
import { fetchUsageSummary } from '../src/renderer/src/pages/settings/usage/useUsageSummary'
import { buildUsageSummary } from '../src/shared/assistant/usage-summary'
let calls=0
let resolve: (value: any)=>void = ()=>{}
const response = new Promise(r=>{resolve=r})
Object.assign(globalThis,{window:{devscope:{assistant:{getUsageSummary:()=>{calls++; return response}}}}})
const input = {days:7 as const,timeZone:'UTC'}
const first=fetchUsageSummary(input), second=fetchUsageSummary(input,true)
assert.equal(calls,1,'concurrent refreshes share one IPC query')
const summary=buildUsageSummary([],input)
resolve({success:true,summary})
assert.equal(await first,summary);assert.equal(await second,summary)
assert.equal(await fetchUsageSummary(input),summary)
assert.equal(calls,1,'warm range cache avoids repeated reads')
await fetchUsageSummary(input,true)
assert.equal(calls,2,'explicit refresh bypasses cache')
window.devscope.assistant.getUsageSummary=async()=>({success:false,error:'Unavailable'})
await assert.rejects(fetchUsageSummary({days:30,timeZone:'UTC'}),/Unavailable/)
window.devscope.assistant.getUsageSummary=async()=>({success:true,summary})
assert.equal(await fetchUsageSummary({days:30,timeZone:'UTC'}),summary,'failed requests can retry')
console.log('Usage fetch: deduplication, cache, force refresh and error recovery passed.')

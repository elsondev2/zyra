import {assignUsageOwnership,usageProjectionFallback} from '../src/shared/assistant/usage-ownership'
import {buildUsageRollup,summarizeUsageRollup} from '../src/shared/assistant/usage-rollup'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,appendFile,readFile,rm,utimes} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {HarnessIndex} from '../src/main/assistant/usage/harness-index'
import {initialParserState,parseHarnessRecord,putUsageRecord} from '../src/main/assistant/usage/harness-parsers'
import {buildUsageSummary,mergeUsageSummaries,type UsageEntry} from '../src/shared/assistant/usage-summary'
import {projectUsageChart} from '../src/shared/assistant/usage-chart'
const now=new Date('2026-09-17T12:00:00Z'),timestamp='2026-09-17T10:00:00Z',state=initialParserState('codex-test')
parseHarnessRecord('codex',{type:'session_meta',payload:{id:'session',model:'gpt-5',model_provider:'openai-codex'}},state)
const event=(input:number,output:number)=>({type:'event_msg',timestamp,payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:20}}}})
const a=parseHarnessRecord('codex',event(100,10),state)!
assert.equal(parseHarnessRecord('codex',event(100,10),state),null)
const b=parseHarnessRecord('codex',event(150,20),state)!
assert.equal(b.usage!.inputTokens,50)
assert.equal(buildUsageSummary([a,b],{days:7},now).totals.tokens,170)
const pi=(id='p1')=>({type:'message',id,timestamp,message:{role:'assistant',model:'model',provider:'test',responseId:id,usage:{input:100,output:10,cacheRead:20,cacheWrite:5,cost:{total:.01}}}})
const p=parseHarnessRecord('pi',pi(),initialParserState('pi'))!
assert.equal(buildUsageSummary([p],{days:7},now).totals.tokens,135)
const records:Record<string,UsageEntry>={}
putUsageRecord(records,p);putUsageRecord(records,parseHarnessRecord('devscope',pi(),initialParserState('other')))
assert.equal(Object.keys(records).length,1,'copied provider response counted once')
const claude=(output:number)=>({type:'assistant',sessionId:'c',timestamp,message:{role:'assistant',id:'response-c',model:'claude',usage:{input_tokens:10,output_tokens:output,cache_read_input_tokens:5,cache_creation_input_tokens:2}}})
putUsageRecord(records,parseHarnessRecord('claude',claude(1),initialParserState('c')))
putUsageRecord(records,parseHarnessRecord('claude',claude(30),initialParserState('c')))
assert.equal(Object.values(records).find(row=>row.harness==='claude')!.usage!.outputTokens,30)
const full=buildUsageSummary([p,{...p,id:'older',requestedAt:'2025-04-01T00:00:00Z'}],{days:'all'},now)
assert.equal(full.daily[0].date,'2025-04-01')
assert.equal(projectUsageChart(full.daily,'cumulative').at(-1)!.tokens,full.totals.tokens)
assert.equal(projectUsageChart(full.daily,'weekly').reduce((sum,day)=>sum+day.tokens,0),full.totals.tokens)
assert.equal(mergeUsageSummaries(full,buildUsageSummary([a],{days:'all'},now)).totals.tokens,380)
const rollup=buildUsageRollup([a,b,p],'Africa/Dar_es_Salaam',now)
for (const days of [7,30,'all'] as const) {
 const selected=summarizeUsageRollup(rollup,{days,harness:'all'},now)
 assert.deepEqual(selected.totals,buildUsageSummary([a,b,p],{days,timeZone:'Africa/Dar_es_Salaam'},now).totals,'rollup matches direct counters')
 assert.equal(summarizeUsageRollup(rollup,{days,harness:'pi'},now).totals.tokens,135)
}
const edge={...p,id:'edge',requestedAt:'2026-09-16T22:30:00Z'}
const edgeRollup=buildUsageRollup([edge],'Asia/Kathmandu',now)
assert.equal(summarizeUsageRollup(edgeRollup,{days:'all',harness:'pi'},now).daily[0].date,'2026-09-17','localized all-time range keeps fractional timezone boundaries')
const forwardDay=buildUsageRollup([{...p,requestedAt:'2026-09-17T11:00:00Z'}],'Pacific/Kiritimati',now)
assert.equal(summarizeUsageRollup(forwardDay,{days:'all'},now).daily.length,1,'all-time uses local today across UTC date boundaries')
const ownership=assignUsageOwnership([p,a],['pi'])
assert.deepEqual(ownership.coveredSessionIds,['pi'])
assert.equal(ownership.entries.find(row=>row.id===p.id)!.harness,'zyra')
assert.equal(ownership.entries.find(row=>row.id===a.id)!.harness,'codex')
const projected=[{id:'projected',threadId:'desktop-id',sessionId:'desktop-chat',canonicalThreadId:'pi'},{id:'fallback',threadId:'other',sessionId:'other-chat'}] as any
assert.deepEqual(usageProjectionFallback(projected,ownership.coveredSessionIds).map(row=>row.id),['fallback'],'canonical transcripts replace their projection; missing transcripts keep the database fallback')
const root=await mkdtemp(join(tmpdir(),'zyra-usage-test-'))
try {
 const logs=join(root,'logs'),cache=join(root,'cache.json'),dbPath=join(root,'opencode.db');await mkdir(logs)
 const path=join(logs,'session.jsonl');await writeFile(path,JSON.stringify(pi())+'\n'+JSON.stringify(pi('p2')).slice(0,30))
 const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,data TEXT)')
 db.prepare('INSERT INTO message VALUES(?,?,?,?)').run('o','os',Date.parse(timestamp),JSON.stringify({role:'assistant',providerID:'test',modelID:'oc',tokens:{input:10,output:2,cache:{read:3,write:4}},cost:.02,content:'DO_NOT_CACHE_MESSAGE_CONTENT'}));db.close()
 const index=new HarnessIndex([{id:'pi',paths:[logs]},{id:'opencode',paths:[],database:dbPath},{id:'claude',paths:[join(root,'missing')]}],cache)
 await index.scan();assert.equal(index.records().length,2);assert.equal(index.sources.get('claude')!.state,'missing')
 await appendFile(path,JSON.stringify(pi('p2')).slice(30)+'\n');await index.scan();assert.equal(index.records().length,3)
 await index.scan();assert.equal(index.records().length,3)
 const restored=new HarnessIndex([{id:'pi',paths:[logs]}],cache);await restored.load();assert.equal(restored.records().length,2)
 assert.ok(!(await readFile(cache,'utf8')).includes('DO_NOT_CACHE_MESSAGE_CONTENT'))
 await writeFile(path,JSON.stringify(pi('replacement'))+'\n');await index.scan();assert.equal(index.records().filter(row=>row.harness==='pi').length,1)
 await writeFile(path,JSON.stringify(pi('same-length'))+'\n');await utimes(path,new Date(),new Date(Date.now()+1000));await index.scan();assert.equal(index.records().find(row=>row.harness==='pi')!.id,'same-length','same-sized rewrites are re-indexed')
 await rm(path);await index.scan();assert.equal(index.records().filter(row=>row.harness==='pi').length,0)
 const codexLogs=join(root,'codex');await mkdir(codexLogs)
 const codexFile=join(codexLogs,'large.jsonl')
 await writeFile(codexFile,JSON.stringify({type:'response_item',payload:'x'.repeat(33*1024*1024)})+'\n'+JSON.stringify(event(100,10))+'\n')
 const largeIndex=new HarnessIndex([{id:'codex',paths:[codexLogs]}],join(root,'large-cache.json'))
 await largeIndex.scan();assert.equal(largeIndex.sources.get('codex')!.state,'ready','large irrelevant bodies are skipped without the usage-line size limit');assert.equal(largeIndex.records().length,1)
 const row=largeIndex.records()[0];assert.equal(row.usage!.inputTokens,100)

} finally {await rm(root,{recursive:true,force:true})}
console.log('Harness usage: parsing, deduplication, chart projections, SQLite, partial append, rewrite, deletion and persistent cache passed.')

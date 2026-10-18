import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
// Kept in this scoped runner so the regression bundles the real index/parser call sites.
const compressedRegression=String.raw`
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,appendFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {zstdCompressSync} from 'node:zlib'
import {Worker} from 'node:worker_threads'
import {HarnessIndex} from '../src/main/assistant/usage/harness-index'
import {buildUsageSummary} from '../src/shared/assistant/usage-summary'
import {assignUsageOwnership} from '../src/shared/assistant/usage-ownership'
const root=await mkdtemp(join(tmpdir(),'zyra-compressed-usage-'))
const timestamp='2026-09-17T10:00:00Z',now=new Date('2026-09-17T12:00:00Z')
const log=(input,output,model='gpt-5')=>[
 {type:'session_meta',timestamp,payload:{id:'compressed-session',model,model_provider:'openai-codex'}},
 ...[1,2].map(()=>({type:'event_msg',timestamp,payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:20}}}}))
].map(value=>JSON.stringify(value)+'\n').join('')
try {
 const eofLogs=join(root,'compressed-eof');await mkdir(eofLogs)
 const eofPath=join(eofLogs,'eof.jsonl.zst'),eofCache=join(root,'eof-cache.json')
 const eofLog=log(100,10).split('\n').slice(0,2).join('\n')
 await writeFile(eofPath,zstdCompressSync(eofLog))
 const eofIndex=new HarnessIndex([{id:'codex',paths:[eofLogs]}],eofCache);await eofIndex.scan()
 assert.equal(eofIndex.records().length,1,'valid compressed EOF record without a newline must be indexed')
 assert.equal(eofIndex.records()[0].usage.inputTokens,100)
 const eofRestored=new HarnessIndex([{id:'codex',paths:[eofLogs]}],eofCache);await eofRestored.scan()
 assert.deepEqual(eofRestored.records(),eofIndex.records(),'unchanged compressed EOF record survives warm cache reload')
 await writeFile(eofPath,zstdCompressSync(eofLog+'\n'));await eofIndex.scan()
 assert.deepEqual(eofIndex.records(),eofRestored.records(),'trailing newline cannot change usage totals')
 await writeFile(eofPath,zstdCompressSync(eofLog+'\n'+log(200,20).trimEnd().split('\n').at(-1)));await eofIndex.scan()
 assert.equal(eofIndex.records().reduce((sum,record)=>sum+record.usage.inputTokens,0),200,'final cumulative delta at compressed EOF is retained')
 const eofGood=eofIndex.records()
 await writeFile(eofPath,zstdCompressSync(eofLog+'\n{"usage":invalid}'));await eofIndex.scan()
 assert.equal(eofIndex.sources.get('codex').state,'error')
 assert.deepEqual(eofIndex.records(),eofGood,'invalid final metadata cannot publish a partial replacement')
 const plainEofLogs=join(root,'plain-eof');await mkdir(plainEofLogs)
 const plainEofPath=join(plainEofLogs,'eof.jsonl');await writeFile(plainEofPath,eofLog)
 const plainEofIndex=new HarnessIndex([{id:'codex',paths:[plainEofLogs]}],join(root,'plain-eof-cache.json'));await plainEofIndex.scan()
 assert.equal(plainEofIndex.records().length,0,'live plain JSONL still waits for its final newline')
 await appendFile(plainEofPath,'\n');await plainEofIndex.scan()
 assert.equal(plainEofIndex.records()[0].usage.inputTokens,100,'plain append completes its pending record exactly once')
 const deltaLogs=join(root,'append-delta');await mkdir(deltaLogs)
 const deltaPath=join(deltaLogs,'delta.jsonl'),deltaBase=log(100,10),deltaNext=log(200,20).split('\n').slice(1).join('\n')
 await writeFile(deltaPath,deltaBase)
 const deltaIndex=new HarnessIndex([{id:'codex',paths:[deltaLogs]}],join(root,'delta-cache.json'));await deltaIndex.scan()
 const deltaGood=deltaIndex.records()
 await appendFile(deltaPath,deltaNext+'{"usage":invalid}\n');await deltaIndex.scan()
 assert.deepEqual(deltaIndex.records(),deltaGood,'failed plain append retains prior records and cumulative parser state')
 await writeFile(deltaPath,deltaBase+deltaNext);await deltaIndex.scan()
 assert.equal(deltaIndex.records().reduce((sum,record)=>sum+record.usage.inputTokens,0),200,'repaired append commits only the new token delta once')
 const claudeLogs=join(root,'claude-delta');await mkdir(claudeLogs)
 const claudePath=join(claudeLogs,'claude.jsonl'),claudeLog=(input,output)=>JSON.stringify({type:'assistant',timestamp,sessionId:'claude-session',message:{role:'assistant',id:'claude-response',model:'claude-sonnet-4',usage:{input_tokens:input,output_tokens:output}}})+'\n'
 await writeFile(claudePath,claudeLog(100,10))
 const claudeIndex=new HarnessIndex([{id:'claude',paths:[claudeLogs]}],join(root,'claude-cache.json'));await claudeIndex.scan()
 await appendFile(claudePath,claudeLog(50,20));await claudeIndex.scan()
 assert.equal(claudeIndex.records().length,1)
 assert.equal(claudeIndex.records()[0].usage.inputTokens,100,'append deduplication can read prior counters without copying the old map')
 assert.equal(claudeIndex.records()[0].usage.outputTokens,20)
 const logs=join(root,'sessions'),archives=join(root,'archived_sessions');await mkdir(logs);await mkdir(archives)
 const path=join(logs,'rollout.jsonl.zst'),cache=join(root,'cache.json')
 await writeFile(path,zstdCompressSync(log(100,10)))
 const index=new HarnessIndex([{id:'codex',paths:[logs,archives]}],cache)
 await index.scan()
 assert.equal(index.records().length,1,'compressed-only usage must be discovered and decompressed')
 assert.equal(index.records()[0].usage.inputTokens,100)
 await writeFile(join(logs,'copy.jsonl'),log(100,10))
 await writeFile(join(archives,'copy.jsonl.zst'),zstdCompressSync(log(100,10)))
 await index.scan()
 assert.equal(index.sources.get('codex').files,3)
 assert.equal(index.records().length,1,'plain, compressed, archived and repeated cumulative copies count once')
 await rm(join(logs,'copy.jsonl'));await rm(join(archives,'copy.jsonl.zst'))
 await writeFile(path,zstdCompressSync(log(150,20)));await index.scan()
 assert.equal(index.records().length,1,'changed compressed files replace their counters')
 assert.equal(index.records()[0].usage.inputTokens,150)
 const lastGood=index.records(),complete=zstdCompressSync(log(200,30)),partial=zstdCompressSync(log(250,40))
 await writeFile(path,Buffer.concat([complete,partial.subarray(0,partial.length-4)]));await index.scan()
 assert.equal(index.sources.get('codex').state,'error','truncated compressed frames are visibly incomplete')
 assert.deepEqual(index.records(),lastGood,'failed decompression cannot publish partially parsed replacement counters')
 const badPath=join(archives,'broken.jsonl.zst')
 await writeFile(badPath,Buffer.from('invalid zstd frame'));await index.scan()
 assert.deepEqual(index.records(),lastGood,'corrupt new files retain last-good counters')
 await rm(badPath);await writeFile(path,zstdCompressSync(log(200,30)));await index.scan()
 assert.equal(index.sources.get('codex').state,'ready','repaired compressed files recover')
 assert.equal(index.records()[0].usage.inputTokens,200)
 const restored=new HarnessIndex([{id:'codex',paths:[logs,archives]}],cache)
 await restored.load();assert.deepEqual(restored.records(),index.records())
 await writeFile(join(logs,'large.jsonl.zst'),zstdCompressSync(JSON.stringify({type:'response_item',payload:'x'.repeat(33*1024*1024)})+'\n'+log(300,40)))
 await index.scan()
 assert.equal(index.sources.get('codex').state,'ready','stream decompression preserves oversized irrelevant-body skipping')
 assert.equal(index.records().length,2)
 assert.equal(buildUsageSummary(index.records(),{days:'all'},now).totals.pricedTurns,2)
 const owned=assignUsageOwnership(index.records(),['compressed-session'])
 assert.deepEqual(owned.coveredSessionIds,['compressed-session'])
 assert.ok(owned.entries.every(record=>record.harness==='zyra'),'canonical ownership is preserved')
 await writeFile(join(logs,'unknown.jsonl.zst'),zstdCompressSync(log(400,50,'unrecognized-model')));await index.scan()
 const summary=buildUsageSummary(index.records(),{days:'all'},now)
 assert.equal(summary.totals.meteredTurns,3);assert.equal(summary.totals.pricedTurns,2,'unknown model usage remains unpriced, not free or guessed')
 const obsolete=join(root,'obsolete.json')
 await writeFile(obsolete,JSON.stringify({version:3,files:{obsolete:{records:{stale:index.records()[0]}}}}))
 const old=new HarnessIndex([{id:'codex',paths:[logs]}],obsolete)
 await old.load();assert.equal(old.records().length,0,'pre-compression caches are invalidated')
 // Exercise worker ownership and invalidate old incomplete rollups, not only the leaf index.
 const home=join(root,'worker-home'),codex=join(home,'.codex'),workerCache=join(root,'worker-cache.json')
 await mkdir(join(codex,'sessions'),{recursive:true});await writeFile(join(codex,'sessions','worker.jsonl.zst'),zstdCompressSync(log(100,10)))
 const env={...process.env,CODEX_HOME:codex,CLAUDE_CONFIG_DIR:join(home,'.claude'),ZYRA_CODING_AGENT_DIR:join(home,'.pi','agent'),XDG_DATA_HOME:join(home,'.local','share')}
 let worker,sequence=0
 const start=()=>new Worker(process.argv[2],{env,workerData:{home,cachePath:workerCache}})
 const request=()=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{worker.off('message',receive);reject(new Error('Compressed worker request timed out'))},5000)
  const receive=message=>{if(message.id===id){clearTimeout(timer);worker.off('message',receive);message.error?reject(new Error(message.error)):resolve(message)}}
  worker.on('message',receive);worker.postMessage({id,input:{days:'all',timeZone:'UTC',harness:'zyra'},ownedSessionIds:['compressed-session']})
 })
 const indexed=()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{worker.off('message',receive);reject(new Error('Compressed worker indexing timed out'))},5000)
  const receive=message=>{if(message.type==='indexed'){clearTimeout(timer);worker.off('message',receive);resolve()}}
  worker.on('message',receive)
 })
 try {
  worker=start();let ready=indexed();await request();await ready
  const result=await request();assert.equal(result.summary.totals.tokens,110);assert.deepEqual(result.coveredSessionIds,['compressed-session'])
  await worker.terminate()
  const snapshot=JSON.parse(await readFile(workerCache+'.summary','utf8'));assert.equal(snapshot.version,3)
  snapshot.version=2;await writeFile(workerCache+'.summary',JSON.stringify(snapshot))
  worker=start();ready=indexed()
  assert.equal((await request()).summary.totals.tokens,0,'old incomplete summary versions are not served as current')
  await ready;assert.equal((await request()).summary.totals.tokens,110)
 } finally {if(worker)await worker.terminate()}
 console.log('Compressed harness usage: discovery, streamed decoding, deduplication, replacement, corrupt/truncated frame rollback, recovery, cache invalidation, ownership and unknown pricing passed.')
} finally {await rm(root,{recursive:true,force:true})}
`
const dir=await mkdtemp(join(tmpdir(),'zyra-usage-check-'))
try {
 for (const [entry,name] of [['./test-harness-usage.ts','test'],['./test-harness-worker.ts','worker-test'],['../src/main/assistant/usage/harness-worker.ts','worker']]) {
  await build({entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:join(dir,name+'.mjs'),logLevel:'error'})
 }
 await build({stdin:{contents:compressedRegression,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'compressed-harness-regression.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:join(dir,'compressed-test.mjs'),logLevel:'error'})
 for(const name of ['compressed-test','test','worker-test']) {
  const result=spawnSync(process.execPath,[join(dir,name+'.mjs'),join(dir,'worker.mjs')],{stdio:'inherit',timeout:30000})
  if(result.status!==0){process.exitCode=result.status??1;break}
 }
} finally {await rm(dir,{recursive:true,force:true})}

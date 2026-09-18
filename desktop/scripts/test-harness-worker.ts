import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(),'zyra-usage-worker-'))
const project = join(root,'project'), timestamp = new Date().toISOString()
const env = {...process.env,CODEX_HOME:join(root,'.codex'),CLAUDE_CONFIG_DIR:join(root,'.claude'),PI_CODING_AGENT_DIR:join(root,'.pi','agent'),XDG_DATA_HOME:join(root,'.local','share')}
let worker: Worker | undefined, sequence = 0
async function request(harness='all') {
    const id = ++sequence
    return new Promise<any>((resolve,reject) => {
        const timer = setTimeout(()=>{worker!.off('message',receive);reject(new Error('Usage worker fixture timed out'))},5000)
        const receive = (message:any) => {if(message.id===id){clearTimeout(timer);worker!.off('message',receive);message.error?reject(new Error(message.error)):resolve(message)}}
        worker!.on('message',receive)
        worker!.postMessage({id,input:{days:'all',timeZone:'UTC',harness},ownedSessionIds:['canonical'],projectPaths:[project]})
    })
}
try {
    for(const [folder,session] of [[join(root,'.pi','agent','sessions'),'canonical'],[join(project,'.zyra','sessions'),'cli']]) {
        await mkdir(folder,{recursive:true})
        await writeFile(join(folder,'test.jsonl'),JSON.stringify({type:'session',id:session,timestamp})+'\n'+JSON.stringify({type:'message',id:session+'-msg',timestamp,message:{role:'assistant',provider:'test',model:'model',responseId:session+'-response',usage:{input:20,output:5,cacheRead:10}}})+'\n')
    }
    const create = () => new Worker(process.argv[2],{env,workerData:{home:root,cachePath:join(root,'cache.json')}})
    worker = create()
    const ready = new Promise<void>((resolve,reject)=>{worker!.on('error',reject);worker!.on('message',message=>{if(message.type==='indexed')resolve()})})
    await request();await ready
    const all=await request()
    assert.equal(all.summary.totals.tokens,70)
    assert.deepEqual(all.coveredSessionIds,['canonical'])
    assert.equal((await request('zyra')).summary.totals.tokens,35,'owned canonical requests are counted as Zyra')
    assert.equal((await request('pi')).summary.totals.tokens,0,'owned requests do not reappear under Pi')
    assert.equal((await request('zyra-cli')).summary.totals.tokens,35,'known project CLI history is included')
    await worker.terminate();worker=create()
    assert.equal((await request()).summary.totals.tokens,70,'warm start immediately serves the persisted daily index')
    console.log('Usage worker: source filters, canonical ownership, project roots, background indexing and warm snapshot passed.')
} finally {if(worker)await worker.terminate();await rm(root,{recursive:true,force:true})}

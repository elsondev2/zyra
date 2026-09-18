import { assignUsageOwnership } from '../../../shared/assistant/usage-ownership'
import { parentPort, workerData } from 'node:worker_threads'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join, isAbsolute } from 'node:path'
import { buildUsageSummary, type UsageSummaryInput } from '../../../shared/assistant/usage-summary'
import { buildUsageRollup, summarizeUsageRollup, type UsageRollup } from '../../../shared/assistant/usage-rollup'
import { HarnessIndex, harnessRoots } from './harness-index'

const index = new HarnessIndex(harnessRoots(workerData.home || homedir()),workerData.cachePath)
const cliBasePaths = [...index.roots.find(root => root.id === 'zyra-cli')!.paths]
const snapshotPath = workerData.cachePath + '.summary'
type Snapshot = UsageRollup & {coveredSessionIds:string[]}
const snapshots = new Map<string,Snapshot>()
const configurations = new Map<string,{timeZone:string; ownedSessionIds:string[]}>()
let scanning = false, scannedAt = 0, scanError = false
const snapshotReady = readFile(snapshotPath,'utf8').then(text => {
    const saved = JSON.parse(text)
    if (saved.version === 2) for (const [key,value] of saved.entries) snapshots.set(key,value)
}).catch(()=>{})
async function refresh() {
    scanning = true; scanError = false
    parentPort!.postMessage({type:'indexing'})
    try {
        const updateRollups = () => {
            const records = index.records()
            for (const [key,config] of configurations) {
                const {entries,coveredSessionIds} = assignUsageOwnership(records,config.ownedSessionIds)
                snapshots.set(key,{...buildUsageRollup(entries,config.timeZone),coveredSessionIds})
            }
        }
        await index.scan(updateRollups)
        updateRollups()
        while (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value!)
        await mkdir(dirname(snapshotPath),{recursive:true})
        await writeFile(snapshotPath+'.tmp',JSON.stringify({version:2,entries:[...snapshots]}),{mode:0o600})
        await rename(snapshotPath+'.tmp',snapshotPath)
    } catch { scanError = true }
    finally { scanning = false; scannedAt = Date.now(); parentPort!.postMessage({type:'indexed'}) }
}
parentPort!.on('message',async ({id,input,ownedSessionIds,projectPaths=[]}:{id:number;input:UsageSummaryInput;ownedSessionIds:string[];projectPaths?:string[]}) => {
    try {
        await snapshotReady
        const timeZone = input.timeZone || 'UTC'
        const cli = index.roots.find(root => root.id === 'zyra-cli')!
        cli.paths = [...new Set([...cliBasePaths,...projectPaths.filter(isAbsolute).map(path => join(path,'.zyra','sessions'))])]
        const key = createHash('sha256').update(JSON.stringify([timeZone,[...ownedSessionIds].sort(),[...projectPaths].sort()])).digest('hex')
        configurations.set(key,{timeZone,ownedSessionIds})
        while (configurations.size > 4) configurations.delete(configurations.keys().next().value!)
        const saved = snapshots.get(key)
        const needsRefresh = !scanning && (Date.now()-scannedAt > 60_000 || (!saved && !scanError))
        const summary = saved ? summarizeUsageRollup(saved,input) : buildUsageSummary([],input)
        summary.sources = [...index.sources.values()].map(source=>({...source,...((scanning || needsRefresh) && source.state !== 'error' ? {state:'indexing' as const} : {}),...(scanError ? {state:'error' as const,error:'Local history could not finish indexing. Refresh to retry; cached counters are shown.'} : {})}))
        // Answer from the small daily index before touching multi-gigabyte transcript history.
        parentPort!.postMessage({id,summary,coveredSessionIds:saved?.coveredSessionIds || []})
        if (needsRefresh) void refresh()
    } catch { parentPort!.postMessage({id,error:'Local history could not be indexed. Refresh to retry.'}) }
})

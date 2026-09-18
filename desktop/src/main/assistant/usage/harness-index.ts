import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile, rename, open } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import type { UsageEntry, UsageHarness, UsageSource } from '../../../shared/assistant/usage-summary'
import { initialParserState, parseHarnessRecord, putUsageRecord, type ParserState } from './harness-parsers'

type CachedFile = { size: number; mtime: number; offset: number; tail: string; state: ParserState; records: Record<string, UsageEntry> }
export type HarnessRoot = { id: UsageHarness; paths: string[]; database?: string }
export function harnessRoots(home: string, env: NodeJS.ProcessEnv = process.env): HarnessRoot[] {
    const codex = env.CODEX_HOME || join(home, '.codex')
    const oc = join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'opencode')
    return [
        { id: 'codex', paths: [join(codex,'sessions'), join(codex,'archived_sessions')] },
        { id: 'claude', paths: [join(env.CLAUDE_CONFIG_DIR || join(home,'.claude'),'projects')] },
        { id: 'pi', paths: [join(env.PI_CODING_AGENT_DIR || join(home,'.pi','agent'),'sessions')] },
        { id: 'opencode', paths: [join(oc,'storage','message')], database: join(oc,'opencode.db') },
        { id: 'devscope', paths: [join(home,'.dvs.pi','agent','sessions')] },
        { id: 'zyra-cli', paths: [join(home,'.zyra','sessions')] }
    ]
}
async function* files(root: string): AsyncGenerator<string> {
    let entries
    try { entries = await readdir(root, { withFileTypes: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    for (const item of entries.sort((a,b) => b.name.localeCompare(a.name))) {
        if (item.isSymbolicLink()) continue
        const path = join(root,item.name)
        if (item.isDirectory()) yield* files(path)
        else if (/\.jsonl?$/.test(item.name)) yield path
    }
}
async function tailHash(path: string, offset: number) {
    const file = await open(path,'r')
    try { const buffer = Buffer.alloc(Math.min(256,offset)); await file.read(buffer,0,buffer.length,offset-buffer.length); return createHash('sha256').update(buffer).digest('hex') } finally { await file.close() }
}
export class HarnessIndex {
    readonly sources = new Map<UsageHarness, UsageSource>()
    private cache: Record<string, CachedFile> = {}
    private loaded = false
    private databaseRecords: Record<string, UsageEntry> = {}
    private databaseStamp = ''
    constructor(readonly roots: HarnessRoot[], private readonly cachePath: string) { for (const root of roots) this.sources.set(root.id,{id:root.id,state:'indexing',files:0,records:0}) }
    async load() {
        if (this.loaded) return
        this.loaded = true
        try { const saved = JSON.parse(await readFile(this.cachePath,'utf8')); if (saved.version === 2) this.cache = saved.files || {} } catch { /* A cache is disposable; original logs remain authoritative. */ }
    }
    records(): UsageEntry[] {
        const records: Record<string, UsageEntry> = {}
        for (const file of Object.values(this.cache)) for (const record of Object.values(file.records)) putUsageRecord(records, record)
        for (const record of Object.values(this.databaseRecords)) putUsageRecord(records, record)
        return Object.values(records)
    }
    async scan(onProgress?: () => void) {
        let reportedAt = Date.now()
        await this.load()
        const seen = new Set<string>()
        for (const root of this.roots) {
            const source: UsageSource = { id:root.id, state:'indexing', files:0, records:0 }
            this.sources.set(root.id,source)
            try {
                if (root.database && await stat(root.database).catch(() => null)) {
                    await this.scanDatabase(root.database)
                    source.files = 1; source.records = Object.keys(this.databaseRecords).length
                } else {
                    if (root.database) { this.databaseRecords = {}; this.databaseStamp = '' }
                    for (const directory of root.paths) for await (const path of files(directory)) {
                        seen.add(path)
                        try { await this.scanFile(path,root.id) } catch { source.state = 'error'; source.error = 'Some files could not be indexed. Totals may be incomplete.' }
                        source.files++; source.records += Object.keys(this.cache[path]?.records || {}).length
                        if (onProgress && Date.now()-reportedAt > 20_000) { onProgress(); reportedAt = Date.now() }
                    }
                }
                if (source.state !== 'error') source.state = source.files ? 'ready' : 'missing'
                source.updatedAt = new Date().toISOString()
            } catch { source.state = 'error'; source.error = 'Some local history could not be read. Refresh to retry.' }
        }
        // Retain stale counters for a failed source, but remove files actually deleted from a healthy source.
        for (const [path,file] of Object.entries(this.cache)) {
            const harness = Object.values(file.records)[0]?.harness
            if (!seen.has(path) && (!harness || this.sources.get(harness)?.state !== 'error')) delete this.cache[path]
        }
        await mkdir(dirname(this.cachePath),{recursive:true})
        const temporary = this.cachePath + '.tmp'
        await writeFile(temporary,JSON.stringify({version:2,files:this.cache}),{mode:0o600})
        await rename(temporary,this.cachePath)
    }
    private async scanFile(path: string, harness: UsageHarness) {
        const info = await stat(path), previous = this.cache[path]
        if (previous?.size === info.size && previous.mtime === info.mtimeMs) return
        const append = !path.endsWith('.json') && previous && info.size > previous.size && previous.tail === await tailHash(path,previous.offset)
        const cached: CachedFile = append ? previous : { size:0,mtime:0,offset:0,tail:'',state:initialParserState(basename(path)),records:{} }
        if (path.endsWith('.json')) {
            putUsageRecord(cached.records,parseHarnessRecord(harness,JSON.parse(await readFile(path,'utf8')),cached.state))
            cached.offset = info.size
        } else if (info.size > cached.offset) {
            let parts: Buffer[] = [], length = 0, discard = false, prefix = ''
            for await (const chunk of createReadStream(path,{start:cached.offset,end:info.size-1,highWaterMark:256*1024})) {
                const buffer = chunk as Buffer
                let start = 0
                while (start < buffer.length) {
                    const end = buffer.indexOf(10,start)
                    const part = buffer.subarray(start,end < 0 ? buffer.length : end)
                    if (length < 512 && harness === 'codex') {
                        // Codex puts its envelope type before the payload. Ignore huge response/tool
                        // bodies without concatenating them, parsing them, or holding them in memory.
                        prefix += part.subarray(0,512-length).toString('utf8')
                        const type = prefix.match(/"type"\s*:\s*"([^"\\]+)"/)?.[1]
                        discard = !!type && !['session_meta','turn_context','event_msg'].includes(type)
                        if (discard) parts = []
                    }
                    length += part.length
                    if (!discard) parts.push(part)
                    if (end < 0) break
                    cached.offset += length+1
                    if (!discard) {
                        const line = Buffer.concat(parts,length).toString('utf8')
                        if (/"(?:usage|tokens|session_meta|turn_context|token_count|session)"/.test(line)) {
                            putUsageRecord(cached.records,parseHarnessRecord(harness,JSON.parse(line),cached.state))
                        }
                    }
                    parts = []; length = 0; discard = false; prefix = ''; start = end+1
                }
                if (!discard && length > 32*1024*1024) throw new Error('Oversized usage record')
            }
        }
        cached.size = info.size; cached.mtime = info.mtimeMs; cached.tail = await tailHash(path,cached.offset)
        this.cache[path] = cached
    }
    private async scanDatabase(path: string) {
        const main = await stat(path), wal = await stat(path+'-wal').catch(() => null)
        const stamp = `${main.size}:${main.mtimeMs}:${wal?.size}:${wal?.mtimeMs}`
        if (stamp === this.databaseStamp) return
        const { DatabaseSync } = await import('node:sqlite')
        const db = new DatabaseSync(path,{readOnly:true})
        const records: Record<string,UsageEntry> = {}
        try {
            db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1500;')
            // SQLite extracts counters: large message bodies never enter JavaScript.
            const query = db.prepare(`SELECT id, session_id, time_created, json_extract(data,'$.modelID') model, json_extract(data,'$.providerID') provider, json_extract(data,'$.tokens') tokens, json_extract(data,'$.cost') cost FROM message WHERE json_extract(data,'$.role')='assistant'`)
            for (const row of query.iterate()) {
                const obj = {id:row.id,sessionID:row.session_id,role:'assistant',modelID:row.model,providerID:row.provider,tokens:row.tokens ? JSON.parse(String(row.tokens)) : null,cost:row.cost,time:{created:row.time_created}}
                putUsageRecord(records,parseHarnessRecord('opencode',obj,initialParserState(String(row.session_id))))
            }
            this.databaseRecords = records; this.databaseStamp = stamp
        } finally { db.close() }
    }
}

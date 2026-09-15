import { open, opendir, stat, lstat, realpath, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { usageRecord, aggregateUsage, pricingSources, usagePeriod } from './usage-records.mjs';
import { workspaceScope, within } from './workspace-scope.mjs';
import { readOpenCodeUsage } from './usage-opencode.mjs';

const DAY = 86400000, SLICE = 1024*1024, MAX_RECORDS = 40000, MAX_CACHE = 16*1024*1024;
const sha = value => createHash('sha256').update(value).digest('hex');
/** On-demand numeric transcript index. No polling, provider calls, prompts or tool output in its cache. */
export class UsageIndex {
  constructor({directory, home = os.homedir(), env = process.env, roots} = {}) {
    this.file = directory ? path.join(directory,'usage-index-v1.json') : null;
    this.roots = roots || {codex:[path.join(env.CODEX_HOME || path.join(home,'.codex'),'sessions')],claude:[path.join(env.CLAUDE_CONFIG_DIR || path.join(home,'.claude'),'projects')],opencode:[path.join(env.XDG_DATA_HOME || path.join(home,'.local','share'),'opencode','storage','message')]};
    this.openCodeDatabase = roots ? null : path.join(env.XDG_DATA_HOME || path.join(home,'.local','share'),'opencode','opencode.db');
    this.cache = null; this.pending = Promise.resolve();
  }
  read(input) { const task = this.pending.then(()=>this.load(input)); this.pending = task.catch(()=>{}); return task; }
  async load({harness = 'zyra', projects = [], zyraChats = null, hiddenProjects = [], allProjects = false, now = Date.now()}) {
    if (!['zyra','codex','claude','opencode','all'].includes(harness)) throw new Error('Choose a usage source.');
    if (!this.cache) {
      try { if (!this.file || (await stat(this.file)).size > MAX_CACHE) throw new Error(); const saved=JSON.parse(await readFile(this.file,'utf8')); this.cache=saved.version===2 && saved.files && typeof saved.files==='object' ? saved.files : {}; this.limited=saved.version===2 && saved.limited===true; } catch { this.cache={}; }
    }
    const period = usagePeriod(now), since = Date.parse(period.start), scope = await workspaceScope(hiddenProjects), permission = new Map();
    const roots = {...this.roots,zyra:projects.map(project=>path.join(project,'.zyra','sessions'))};
    const chosen = harness === 'all' ? ['zyra','codex','claude','opencode'] : [harness];
    this.boundCache(since);
    const accepted = [], sources = []; let budget=8*SLICE, recordCount=0, bytesRead=0, indexing=false, dirty=false;
    for (const source of chosen) {
      let found=source==='zyra' && Array.isArray(zyraChats) ? await catalogFiles(zyraChats,since) : await listFiles(roots[source] || [],since,source==='opencode'?'.json':'.jsonl');
      let database=null;
      if(source==='opencode' && this.openCodeDatabase) {
        database=await readOpenCodeUsage(this.openCodeDatabase,this.cache['opencode-database'],since);
        if(database && !database.unavailable) { this.cache['opencode-database']=database; found={files:[{database:true,path:'opencode-database',size:0,mtime:now}],truncated:database.pending}; dirty ||= database.bytesRead>2; bytesRead+=database.bytesRead; }
      }
      let pending=found.truncated, count=0, failures=found.failures||0, partialFork=false;
      for (const item of found.files) {
        const key=item.database?'opencode-database':sha(source+'\0'+item.path); let cached=this.cache[key];
        if (!item.database && (!cached || cached.size>item.size || (cached.size===item.size && cached.mtime!==item.mtime))) cached={offset:0,state:{},records:[]};
        if (!item.database && budget>0 && (cached.offset<item.size || !cached.size)) {
          const result=await readSlice(item,cached,source,Math.min(SLICE,budget),since).catch(()=>null);
          if (!result) { failures++; continue; }
          cached=result; budget-=result.bytesRead; bytesRead+=result.bytesRead;
          cached.records=cached.records.filter(row=>row.timestamp>=since).slice(-MAX_RECORDS);
          this.cache[key]=cached;
          dirty=true;
        }
        if (!cached) { pending=true; continue; }
        partialFork ||= cached.state?.forkDetected===true;
        if (cached.offset<item.size) pending=true;
        for (const row of cached.records || []) {
          if (++recordCount>MAX_RECORDS) { pending=true; break; }
          if (row.timestamp<since || row.timestamp>now || typeof row.cwd!=='string' || !path.isAbsolute(row.cwd)) continue;
          if (item.project && !(await scope.allows(path.resolve(item.project),true))) continue;
          if (!permission.has(row.cwd)) {
            const actual=await realpath(row.cwd).catch(()=>null);
            const visible=allProjects || projects.some(project=>within(path.resolve(project),path.resolve(row.cwd)) && (!actual || within(path.resolve(project),actual)));
            permission.set(row.cwd,visible && await scope.allows(path.resolve(row.cwd),true));
          }
          if (permission.get(row.cwd)) { accepted.push(row); count++; }
        }
        if (recordCount>MAX_RECORDS) break;
      }
      sources.push({harness:source,partial:partialFork,state:failures || database?.unavailable ? 'unavailable' : found.files.length ? pending?'indexing':count?'ready':'no-visible-usage':'not-found',responses:count});
      indexing ||= pending;
    }
    // Retain bounded recent numeric records; no raw transcript line is serialized.
    this.boundCache(since); const saved=JSON.stringify({version:2,files:this.cache,limited:this.limited===true});
    if (dirty && Buffer.byteLength(saved)<=MAX_CACHE && this.file) {
      await mkdir(path.dirname(this.file),{recursive:true}); await writeFile(this.file+'.tmp',saved,{mode:0o600}); await rename(this.file+'.tmp',this.file);
    }
    return {...aggregateUsage(accepted,period),harness,days:30,sources,indexing,limited:this.limited===true,partial:sources.some(source=>source.partial || source.state==='unavailable'),bytesRead,fetchedAt:new Date(now).toISOString(),
      scope:'Shared projects only',pricing:{kind:'api-equivalent',verifiedAt:'2026-09-15',sources:pricingSources},
      note:'Recorded model costs and standard API estimates are not subscription charges. Unknown rates, cache-write tiers and long-context tiers remain unpriced.' + (sources.some(source=>source.partial) ? ' Forked Codex ledgers are excluded because copied parent usage cannot be distinguished reliably.' : '')};
  }
  boundCache(since) {
    let records=0,bytes=0; const bounded={};
    const entries=Object.entries(this.cache).filter(([,value])=>value?.mtime>=since && Array.isArray(value.records)).sort((a,b)=>b[1].mtime-a[1].mtime);
    if(entries.length>512)this.limited=true;
    for(const [key,value] of entries.slice(0,512)) {
      const kept=[]; bytes+=Buffer.byteLength(JSON.stringify({...value,records:[]}));
      for(const row of value.records.slice().reverse()) {
        const size=Buffer.byteLength(JSON.stringify(row));
        if(row.timestamp<since)continue;
        if(records>=MAX_RECORDS || bytes+size>12*SLICE) { this.limited=true; break; }
        kept.push(row); records++; bytes+=size;
      }
      if(bytes>13*SLICE) { this.limited=true; break; }
      bounded[key]={...value,records:kept.reverse()};
    }
    this.cache=bounded;
  }
}
async function catalogFiles(chats,since) {
  const files=[]; let failures=0;
  for(const chat of chats.slice(0,2000)) {
    if(typeof chat.sessionPath!=='string' || !path.isAbsolute(chat.sessionPath))continue;
    const metadata=await lstat(chat.sessionPath).catch(error=>{if(!['ENOENT','ENOTDIR'].includes(error.code))failures++;return null});
    if(metadata?.isFile() && !metadata.isSymbolicLink() && metadata.mtimeMs>=since)files.push({path:chat.sessionPath,project:chat.project,size:metadata.size,mtime:metadata.mtimeMs});
  }
  return {files:files.sort((a,b)=>b.mtime-a.mtime),truncated:chats.length>=2000,failures};
}
async function listFiles(roots,since,extension) {
  const files=[], queue=roots.map(root=>({root,depth:0})); let visited=0,truncated=false,failures=0;
  while(queue.length && visited<4096) {
    const {root,depth}=queue.shift();
    if (depth>6 || (await lstat(root).catch(()=>null))?.isSymbolicLink()) continue;
    const directory=await opendir(root).catch(error=>{if(!['ENOENT','ENOTDIR'].includes(error.code))failures++;return null}); if(!directory) continue;
    for await(const entry of directory) {
      if(++visited>4096) { truncated=true; break; }
      if(entry.isSymbolicLink())continue;
      const name=path.join(root,entry.name);
      if(entry.isDirectory())queue.push({root:name,depth:depth+1});
      else if(entry.isFile() && entry.name.endsWith(extension)) {
        const metadata=await stat(name).catch(()=>null);
        if(metadata && metadata.mtimeMs>=since)files.push({path:name,size:metadata.size,mtime:metadata.mtimeMs});
      }
    }
  }
  return {files:files.sort((a,b)=>b.mtime-a.mtime),truncated:truncated||queue.length>0,failures};
}
async function readSlice(item,cached,source,limit,since) {
  const handle=await open(item.path,'r');
  try {
    if(cached.offset>0) {
      const guard=Buffer.alloc(Math.min(64,cached.offset)); await handle.read(guard,0,guard.length,cached.offset-guard.length);
      if(sha(guard)!==cached.guard)cached={offset:0,state:{},records:[]};
    }
    const buffer=Buffer.alloc(Math.min(limit,item.size-cached.offset)); const {bytesRead}=await handle.read(buffer,0,buffer.length,cached.offset);
    const data=buffer.subarray(0,bytesRead); let consumed=data.lastIndexOf(10)+1;
    if(source==='opencode') { if(item.size>limit)throw new Error('Message exceeds usage parse limit.'); consumed=bytesRead; }
    let lines=source==='opencode'?[data.toString('utf8')]:data.subarray(0,consumed).toString('utf8').split('\n');
    if(!consumed && bytesRead===limit) { consumed=bytesRead; cached.skipLine=true; lines=[]; }
    else if(cached.skipLine && consumed>0) { lines.shift(); cached.skipLine=false; }
    for(const line of lines) {
      if(line.length>512*1024 || !/"(?:usage|session|turn_context|token_count|tokens|cwd)"/.test(line))continue;
      try { const row=usageRecord(source,JSON.parse(line),cached.state); if(row && row.timestamp>=since)cached.records.push(row); } catch {}
    }
    cached.offset+=consumed; const guard=Buffer.alloc(Math.min(64,cached.offset)); await handle.read(guard,0,guard.length,cached.offset-guard.length);
    return {...cached,guard:sha(guard),size:item.size,mtime:item.mtime,bytesRead};
  } finally { await handle.close(); }
}

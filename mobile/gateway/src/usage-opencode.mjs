import { lstat } from 'node:fs/promises';
import { usageRecord } from './usage-records.mjs';
import { queryOpenCodeUsage } from './usage-opencode-process.mjs';
/** Read-only numeric projection of OpenCode's native message ledger, never full message data. */
export async function readOpenCodeUsage(file, cached, since) {
  let denied=false;
  const metadata=await lstat(file).catch(error=>{denied=!['ENOENT','ENOTDIR'].includes(error.code);return null});
  if(denied)return {unavailable:true};
  if(!metadata)return null;
  if(metadata.isSymbolicLink() || !metadata.isFile())return {unavailable:true};
  try {
    const identity=`${metadata.dev}:${metadata.ino}:${metadata.birthtimeMs}`;
    if(cached?.identity!==identity)cached=null;
    const previous=cached || {cursor:since,cursorId:'',records:[]};
    const result=await queryOpenCodeUsage({file,since,cursor:previous.cursor,cursorId:previous.cursorId});
    if(result.unavailable)return result;
    const rows=result.rows;
    const records=new Map(previous.records.filter(row=>row.timestamp>=since).map(row=>[row.id,row]));
    for(const row of rows) {
      const parsed=usageRecord('opencode',{id:row.id,role:'assistant',directory:row.directory,modelID:row.model,tokens:{input:row.inputTokens,output:row.outputTokens,reasoning:row.reasoningTokens,cache:{read:row.cacheRead,write:row.cacheWrite}},cost:row.cost,time:{completed:row.completed}});
      if(parsed && parsed.timestamp>=since)records.set(parsed.id,parsed);
    }
    const last=rows.at(-1);
    return {identity,cursor:last?.updated??previous.cursor,cursorId:last?.id??previous.cursorId,records:[...records.values()],pending:rows.length===1000,
      mtime:Date.now(),offset:0,size:0,bytesRead:Buffer.byteLength(JSON.stringify(rows))};
  } catch { return {unavailable:true}; }
}

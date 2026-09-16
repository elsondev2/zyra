import { reviewHasChanges } from './review.mjs';
const cursors = new WeakMap();
/** Only already-authorized catalog rows enter this projection. Unknown metadata remains null. */
export async function projectCatalogMetadata(chats, review, files, hiddenProjects, { budgetMs = 250, now = Date.now } = {}) {
  let entries=[];
  try { entries=await review?.metadata?.(chats.slice(0,60).map(chat=>chat.canonicalChatId)) || []; } catch {}
  const metadata=new Map(entries.map(entry=>[entry.canonicalChatId,entry]));
  const results=new Map(), started=now(), count=chats.length;
  const start=count ? (cursors.get(files)||0)%count : 0;
  let next=start, exhausted=false;
  for(let offset=0;offset<count;offset++) {
    const position=(start+offset)%count, chat=chats[position], entry=metadata.get(chat.canonicalChatId);
    let hasChanges=null, skipped=false;
    if(entry?.index) {
      // Empty indexes have no paths to authorize and should not consume disk work.
      if(!(entry.index.turns||[]).some(turn=>turn.changes?.length)) hasChanges=entry.index.truncated?null:false;
      else if(!exhausted && now()-started<budgetMs) hasChanges=await reviewHasChanges(entry.index,files,chat,hiddenProjects).catch(()=>null);
      else { skipped=true; if(!exhausted)next=position; exhausted=true; }
    }
    results.set(chat.canonicalChatId,{...chat,hasWork:typeof entry?.hasWork==='boolean'?entry.hasWork:null,hasChanges,metadataPending:entry?.pending===true||skipped});
  }
  // Retries continue authorization where the preceding bounded page left off.
  // No permission grants are cached; the client merges only matching file revisions.
  if(count)cursors.set(files,exhausted?next:0);
  return chats.map(chat=>results.get(chat.canonicalChatId));
}

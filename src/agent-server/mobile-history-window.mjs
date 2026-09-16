/** On cold mobile open, include recent prompts in the first response when they
 * are within a bounded window. Collapsed outputs are skipped without disk reads.
 * Paging requests keep their exact exclusive cursor and requested page size. */
export function mobileHistoryStart({ start, end, bytesAt, isDeferredTool, readEntry }) {
  const lower = Math.max(0, end - 480);
  let bytes = 0, prompts = 0, selected = start;
  for (let index = end - 1; index >= lower; index--) {
    if (isDeferredTool(index)) continue;
    const size = bytesAt(index);
    if (!Number.isSafeInteger(size) || size < 0 || size > 1048576 - bytes) break;
    bytes += size;
    const entry = readEntry(index);
    if (entry?.type === 'message' && entry.message?.role === 'user') {
      selected = Math.min(selected, index);
      if (++prompts === 3) break;
    }
  }
  return selected;
}

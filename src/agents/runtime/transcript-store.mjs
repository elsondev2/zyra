import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import readline from "node:readline";

export class ChildTranscriptStore {
  constructor(options = {}) {
    this.maxPageEntries = Math.max(1, Math.min(200, Number(options.maxPageEntries) || 50));
    this.maxEntryBytes = Math.max(1024, Number(options.maxEntryBytes) || 128 * 1024);
  }

  async page(sessionFile, options = {}) {
    const limit = Math.max(1, Math.min(this.maxPageEntries, Number(options.limit) || this.maxPageEntries));
    const before = Number.isSafeInteger(options.before) ? options.before : Number.MAX_SAFE_INTEGER;
    const entries = [];
    let index = 0;
    let truncatedEntries = 0;
    const input = createReadStream(sessionFile, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const current = index++;
      if (current >= before) continue;
      try {
        const bytes = Buffer.byteLength(line, "utf8");
        if (bytes > this.maxEntryBytes) {
          entries.push({ index: current, type: "truncated", bytes });
          truncatedEntries += 1;
        } else {
          entries.push({ index: current, ...JSON.parse(line) });
        }
      } catch {
        entries.push({ index: current, type: "corrupt" });
      }
      if (entries.length > limit) entries.shift();
    }
    const file = await stat(sessionFile);
    const first = entries[0]?.index;
    return {
      entries,
      nextBefore: Number.isSafeInteger(first) && first > 0 ? first : null,
      totalEntries: index,
      bytes: file.size,
      truncatedEntries,
      hydrated: entries.length,
    };
  }
}

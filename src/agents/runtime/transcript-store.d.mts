export class ChildTranscriptStore {
    constructor(options?: { maxPageEntries?: number; maxEntryBytes?: number });
    page(sessionFile: string, options?: { limit?: number; before?: number; after?: number }): Promise<{ entries: Array<Record<string, unknown>>; nextBefore: number | null; nextAfter: number | null; totalEntries: number; bytes: number; truncatedEntries: number; hydrated: number }>;
}

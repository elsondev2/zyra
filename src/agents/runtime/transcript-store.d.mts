export class ChildTranscriptStore {
    constructor(options?: { maxPageEntries?: number; maxEntryBytes?: number });
    page(sessionFile: string, options?: { limit?: number; before?: number }): Promise<{ entries: Array<Record<string, unknown>>; nextBefore: number | null; totalEntries: number; bytes: number; truncatedEntries: number; hydrated: number }>;
}

type CandidateDatabase = {
    exec(sql: string, params: Array<string | number>): Array<{ values: unknown[][] }>
}

/** Completed assistant-only candidates; fence language names are case-insensitive. */
export function readVisualizationCandidatesFromDb(
    db: CandidateDatabase,
    threadId: string,
    after = 0,
    limit = 80,
) {
    const rows =
        db.exec(
            `
        SELECT rowid, id, text, created_at, turn_id FROM assistant_messages
        WHERE thread_id = ? AND role = 'assistant' AND streaming = 0 AND rowid > ?
            AND (instr(lower(text), '<visualization') > 0 OR instr(lower(text), 'mermaid') > 0)
        ORDER BY rowid ASC LIMIT ?
    `,
            [threadId, Math.max(0, after), Math.min(80, Math.max(1, limit))],
        )[0]?.values || []
    return rows.map((row) => ({
        cursor: Number(row[0]),
        id: String(row[1]),
        text: String(row[2]),
        createdAt: String(row[3]),
        turnId: row[4] ? String(row[4]) : null,
    }))
}

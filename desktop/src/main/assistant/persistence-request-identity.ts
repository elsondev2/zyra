import type { Database } from 'sql.js/dist/sql-asm.js'

type RequestTable = 'assistant_pending_user_inputs' | 'assistant_pending_approvals'

/** Called inside the event transaction. Merge the two stored aliases only when
 * both belong to this thread; never discard another thread's request. */
export function reconcileAssistantPersistedRequestIdentity(db: Database, table: RequestTable, threadId: string, id: string, requestId: string): void {
    const rows = db.exec(`SELECT id, thread_id, request_id FROM ${table} WHERE id = ? OR request_id = ?`, [id, requestId])[0]?.values || []
    const sameId = rows.find(row => row[0] === id)
    if (sameId && sameId[1] !== threadId && sameId[2] !== requestId) {
        throw new Error(`Assistant request ID collision across threads in ${table}; existing request preserved.`)
    }
    if (rows.length < 2) return
    if (rows.some(row => row[1] !== threadId)) {
        throw new Error(`Assistant request aliases belong to different threads in ${table}; existing requests preserved.`)
    }
    db.run(`DELETE FROM ${table} WHERE thread_id = ? AND request_id = ? AND id <> ?`, [threadId, requestId, id])
}

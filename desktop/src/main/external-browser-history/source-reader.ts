import { lstat } from 'node:fs/promises'
import type { ExternalBrowserHistoryFamily } from '../../shared/external-browser-history-contracts'

export type ExternalBrowserHistoryRow = {
    url: string
    title: string
    visitCount: number
    lastVisitedAt: string
}

type StatementSync = {
    all(...params: unknown[]): Array<Record<string, unknown>>
    setReadBigInts?(enabled: boolean): void
}

type DatabaseSync = {
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
}

type NodeSqlite = {
    DatabaseSync: new (path: string, options?: Record<string, unknown>) => DatabaseSync
}

const CHROMIUM_TO_UNIX_MICROSECONDS = 11_644_473_600_000_000n
const SAFARI_TO_UNIX_SECONDS = 978_307_200
const IMPORT_ROW_LIMIT = 5_000
const EARLIEST_IMPORT_MS = Date.UTC(1990, 0, 1)

function boundedTimestamp(milliseconds: number): string | null {
    if (!Number.isFinite(milliseconds) || milliseconds < EARLIEST_IMPORT_MS || milliseconds > Date.now() + 24 * 60 * 60_000) return null
    return new Date(milliseconds).toISOString()
}

export function chromiumHistoryTimestamp(value: unknown): string | null {
    try {
        const microseconds = typeof value === 'bigint' ? value : BigInt(String(value))
        const unixMicroseconds = microseconds - CHROMIUM_TO_UNIX_MICROSECONDS
        return boundedTimestamp(Number(unixMicroseconds / 1_000n))
    } catch {
        return null
    }
}

export function firefoxHistoryTimestamp(value: unknown): string | null {
    try {
        const microseconds = typeof value === 'bigint' ? value : BigInt(String(value))
        return boundedTimestamp(Number(microseconds / 1_000n))
    } catch {
        return null
    }
}

export function safariHistoryTimestamp(value: unknown): string | null {
    const seconds = Number(value)
    return boundedTimestamp((seconds + SAFARI_TO_UNIX_SECONDS) * 1_000)
}

function normalizeRow(row: Record<string, unknown>, timestamp: string | null): ExternalBrowserHistoryRow | null {
    const url = String(row.url || '').trim().slice(0, 2_048)
    if (!timestamp || (!url.startsWith('http://') && !url.startsWith('https://'))) return null
    const title = String(row.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 256)
    const visitCount = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(row.visit_count) || 1)))
    return { url, title, visitCount, lastVisitedAt: timestamp }
}

function sourceSinceThreshold(family: ExternalBrowserHistoryFamily, since: string | undefined): bigint | number | null {
    if (!since) return null
    const milliseconds = Date.parse(since)
    if (!Number.isFinite(milliseconds)) throw new Error('External history start date is invalid.')
    if (family === 'chromium') return BigInt(milliseconds) * 1_000n + CHROMIUM_TO_UNIX_MICROSECONDS
    if (family === 'firefox') return BigInt(milliseconds) * 1_000n
    return (milliseconds / 1_000) - SAFARI_TO_UNIX_SECONDS
}

function queryForFamily(family: ExternalBrowserHistoryFamily, filtered: boolean): string {
    if (family === 'chromium') return `
        SELECT url, title, visit_count, last_visit_time
        FROM urls
        WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%')${filtered ? ' AND last_visit_time >= ?' : ''}
        ORDER BY last_visit_time DESC
        LIMIT ?
    `
    if (family === 'firefox') return `
        SELECT url, title, visit_count, last_visit_date
        FROM moz_places
        WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%')${filtered ? ' AND last_visit_date >= ?' : ''}
        ORDER BY last_visit_date DESC
        LIMIT ?
    `
    return `
        SELECT history_items.url AS url,
               history_items.title AS title,
               COUNT(history_visits.id) AS visit_count,
               MAX(history_visits.visit_time) AS visit_time
        FROM history_items
        JOIN history_visits ON history_visits.history_item = history_items.id
        WHERE (history_items.url LIKE 'http://%' OR history_items.url LIKE 'https://%')${filtered ? ' AND history_visits.visit_time >= ?' : ''}
        GROUP BY history_items.id
        ORDER BY visit_time DESC
        LIMIT ?
    `
}

function countQueryForFamily(family: ExternalBrowserHistoryFamily, filtered: boolean): string {
    if (family === 'chromium') return `SELECT COUNT(*) AS total FROM urls WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%')${filtered ? ' AND last_visit_time >= ?' : ''}`
    if (family === 'firefox') return `SELECT COUNT(*) AS total FROM moz_places WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%')${filtered ? ' AND last_visit_date >= ?' : ''}`
    return `SELECT COUNT(DISTINCT history_items.id) AS total FROM history_items JOIN history_visits ON history_visits.history_item = history_items.id WHERE (history_items.url LIKE 'http://%' OR history_items.url LIKE 'https://%')${filtered ? ' AND history_visits.visit_time >= ?' : ''}`
}

export async function readExternalBrowserHistory(input: {
    databasePath: string
    family: ExternalBrowserHistoryFamily
    since?: string
}): Promise<{ rows: ExternalBrowserHistoryRow[]; skipped: number }> {
    const databaseInfo = await lstat(input.databasePath)
    if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink() || databaseInfo.size > 2 * 1024 * 1024 * 1024) {
        throw new Error('External history database is not a supported regular file.')
    }
    const moduleName = 'node:sqlite'
    const sqlite = await import(/* @vite-ignore */ moduleName) as unknown as NodeSqlite
    const database = new sqlite.DatabaseSync(input.databasePath, {
        readOnly: true,
        readBigInts: true,
        timeout: 1_500
    })
    try {
        database.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = 1500;')
        const threshold = sourceSinceThreshold(input.family, input.since)
        const statement = database.prepare(queryForFamily(input.family, threshold !== null))
        statement.setReadBigInts?.(true)
        const sourceRows = threshold === null ? statement.all(IMPORT_ROW_LIMIT) : statement.all(threshold, IMPORT_ROW_LIMIT)
        const countStatement = database.prepare(countQueryForFamily(input.family, threshold !== null))
        countStatement.setReadBigInts?.(true)
        const countRows = threshold === null ? countStatement.all() : countStatement.all(threshold)
        const total = Number(countRows[0]?.total || 0)
        const since = input.since ? Date.parse(input.since) : Number.NEGATIVE_INFINITY
        let skipped = Math.max(0, total - sourceRows.length)
        const rows: ExternalBrowserHistoryRow[] = []
        for (const sourceRow of sourceRows) {
            const timestamp = input.family === 'chromium'
                ? chromiumHistoryTimestamp(sourceRow.last_visit_time)
                : input.family === 'firefox'
                    ? firefoxHistoryTimestamp(sourceRow.last_visit_date)
                    : safariHistoryTimestamp(sourceRow.visit_time)
            const row = normalizeRow(sourceRow, timestamp)
            if (!row || Date.parse(row.lastVisitedAt) < since) {
                skipped += 1
                continue
            }
            rows.push(row)
        }
        return { rows, skipped }
    } finally {
        database.close()
    }
}

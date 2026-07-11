declare module 'sql.js/dist/sql-asm.js' {
    export type SqlValue = string | number | Uint8Array | null

    export interface QueryExecResult {
        columns: string[]
        values: SqlValue[][]
    }

    export interface Statement {
        bind(values?: SqlValue[] | Record<string, SqlValue>): boolean
        step(): boolean
        get(values?: SqlValue[] | Record<string, SqlValue>): SqlValue[]
        getAsObject(values?: SqlValue[] | Record<string, SqlValue>): Record<string, SqlValue>
        run(values?: SqlValue[] | Record<string, SqlValue>): void
        free(): void
    }

    export class Database {
        constructor(data?: Uint8Array | ArrayLike<number>)
        run(sql: string, values?: SqlValue[] | Record<string, SqlValue>): Database
        exec(sql: string, values?: SqlValue[] | Record<string, SqlValue>): QueryExecResult[]
        prepare(sql: string, values?: SqlValue[] | Record<string, SqlValue>): Statement
        export(): Uint8Array
        close(): void
    }

    export interface SqlJsStatic {
        Database: typeof Database
    }

    export default function initSqlJs(): Promise<SqlJsStatic>
}

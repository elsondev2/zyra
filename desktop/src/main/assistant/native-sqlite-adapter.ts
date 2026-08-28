import type { Database as SqlJsDatabase, SqlValue, Statement as SqlJsStatement } from 'sql.js/dist/sql-asm.js'

type SqlBindParams = SqlValue[] | Record<string, SqlValue>

type NativeStatement = {
    all(...params: unknown[]): unknown[][]
    run(...params: unknown[]): unknown
    columns(): Array<{ name: string; column?: string }>
    setReturnArrays(enabled: boolean): void
}

type NativeDatabase = {
    close(): void
    exec(sql: string): void
    prepare(sql: string): NativeStatement
}

type NativeSqliteModule = {
    DatabaseSync: new (path: string) => NativeDatabase
}

function normalizeParameters(params: SqlBindParams): unknown[] {
    return Array.isArray(params)
        ? params.map((value) => value === undefined ? null : value)
        : [params]
}

class SqlJsCompatibleNativeStatement {
    private readonly statement: NativeStatement

    constructor(statement: NativeStatement) {
        this.statement = statement
    }

    run(params: SqlBindParams = []): void {
        this.statement.run(...normalizeParameters(params))
    }

    free(): boolean {
        return true
    }
}

class SqlJsCompatibleNativeDatabase {
    private readonly database: NativeDatabase

    constructor(database: NativeDatabase) {
        this.database = database
    }

    run(sql: string, params: SqlBindParams = []): this {
        if (Array.isArray(params) && params.length === 0) {
            this.database.exec(sql)
            return this
        }
        this.database.prepare(sql).run(...normalizeParameters(params))
        return this
    }

    prepare(sql: string): SqlJsStatement {
        return new SqlJsCompatibleNativeStatement(this.database.prepare(sql)) as unknown as SqlJsStatement
    }

    exec(sql: string, params: SqlBindParams = []): Array<{ columns: string[]; values: SqlValue[][] }> {
        const statement = this.database.prepare(sql)
        statement.setReturnArrays(true)
        const values = statement.all(...normalizeParameters(params)) as SqlValue[][]
        if (values.length === 0) return []
        return [{
            columns: statement.columns().map((column) => column.name || column.column || ''),
            values
        }]
    }

    close(): void {
        this.database.close()
    }
}

export async function openNativeSqliteDatabase(filePath: string): Promise<SqlJsDatabase> {
    const moduleName = 'node:sqlite'
    const sqlite = await import(/* @vite-ignore */ moduleName) as unknown as NativeSqliteModule
    const database = new sqlite.DatabaseSync(filePath)
    try {
        database.exec(`
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA busy_timeout = 5000;
        `)
        return new SqlJsCompatibleNativeDatabase(database) as unknown as SqlJsDatabase
    } catch (error) {
        try { database.close() } catch {}
        throw error
    }
}

export const openNativeAssistantDatabase = openNativeSqliteDatabase

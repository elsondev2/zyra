import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupAssistantDatabaseSet } from '../src/main/assistant/assistant-database-files.ts'
import { openNativeAssistantDatabase } from '../src/main/assistant/native-sqlite-adapter.ts'

const root = await mkdtemp(join(tmpdir(), 'zyra-native-sqlite-'))
const file = join(root, 'assistant.sqlite')
try {
    let db = await openNativeAssistantDatabase(file)
    db.run(`
        CREATE TABLE records (id TEXT PRIMARY KEY, value TEXT NOT NULL, sequence INTEGER NOT NULL);
        CREATE INDEX records_sequence ON records(sequence);
    `)
    db.run('INSERT INTO records (id, value, sequence) VALUES (?, ?, ?)', ['one', 'alpha', 1])
    db.run('BEGIN IMMEDIATE')
    db.run('INSERT INTO records (id, value, sequence) VALUES (?, ?, ?)', ['two', 'beta', 2])
    db.run('COMMIT')
    assert.deepEqual(db.exec('SELECT id, value, sequence FROM records ORDER BY sequence')[0]?.values, [
        ['one', 'alpha', 1],
        ['two', 'beta', 2]
    ])
    assert.deepEqual(db.exec('SELECT value FROM records WHERE id = ?', ['missing']), [])
    db.run('BEGIN')
    db.run('INSERT INTO records (id, value, sequence) VALUES (?, ?, ?)', ['rolled-back', 'discarded', 3])
    db.run('ROLLBACK')
    assert.equal(db.exec('SELECT COUNT(*) FROM records')[0]?.values?.[0]?.[0], 2, 'native transactions preserve rollback semantics')
    db.close()

    db = await openNativeAssistantDatabase(file)
    assert.equal(String(db.exec('PRAGMA journal_mode')[0]?.values?.[0]?.[0]).toLowerCase(), 'wal')
    assert.equal(db.exec('SELECT COUNT(*) FROM records')[0]?.values?.[0]?.[0], 2)
    db.close()

    const recoveryFile = join(root, 'recovery.sqlite')
    await Promise.all([
        writeFile(recoveryFile, 'database'),
        writeFile(`${recoveryFile}-wal`, 'committed-wal'),
        writeFile(`${recoveryFile}-shm`, 'shared-memory')
    ])
    const backupFile = `${recoveryFile}.corrupt.bak`
    assert.equal(backupAssistantDatabaseSet(recoveryFile, backupFile).length, 3)
    assert.equal(await readFile(`${backupFile}-wal`, 'utf8'), 'committed-wal', 'recovery preserves committed WAL pages with the base database')
    console.log('native SQLite compatibility adapter: ok')
} finally {
    await rm(root, { recursive: true, force: true })
}

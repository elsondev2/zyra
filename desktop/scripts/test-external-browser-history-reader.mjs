import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { readExternalBrowserHistory } from '../src/main/external-browser-history/source-reader.ts'

const root = await mkdtemp(join(tmpdir(), 'zyra-external-reader-'))
const chromiumPath = join(root, 'History')
const firefoxPath = join(root, 'places.sqlite')
const safariPath = join(root, 'History.db')

try {
    const chromium = new DatabaseSync(chromiumPath)
    chromium.exec('CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER, hidden INTEGER DEFAULT 0)')
    const insertChromium = chromium.prepare('INSERT INTO urls(url,title,visit_count,last_visit_time,hidden) VALUES(?,?,?,?,?)')
    insertChromium.run('https://chromium.example/', 'Chromium', 3, 11644473600000000n + 1700000000000000n, 0)
    chromium.exec('BEGIN')
    for (let index = 0; index < 5_001; index += 1) {
        insertChromium.run(`https://chromium.example/page-${index}`, `Page ${index}`, 1, 11644473600000000n + 1690000000000000n - BigInt(index), 0)
    }
    chromium.exec('COMMIT')
    chromium.close()

    const firefox = new DatabaseSync(firefoxPath)
    firefox.exec('CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_date INTEGER, hidden INTEGER DEFAULT 0)')
    firefox.prepare('INSERT INTO moz_places(url,title,visit_count,last_visit_date,hidden) VALUES(?,?,?,?,?)').run('https://firefox.example/', 'Firefox', 4, 1700000000000000n, 0)
    firefox.close()

    const safari = new DatabaseSync(safariPath)
    safari.exec('CREATE TABLE history_items (id INTEGER PRIMARY KEY, url TEXT, title TEXT); CREATE TABLE history_visits (id INTEGER PRIMARY KEY, history_item INTEGER, visit_time REAL)')
    safari.prepare('INSERT INTO history_items(id,url,title) VALUES(?,?,?)').run(1, 'https://safari.example/', 'Safari')
    safari.prepare('INSERT INTO history_visits(history_item,visit_time) VALUES(?,?)').run(1, 1700000000 - 978307200)
    safari.close()

    const chromiumRows = await readExternalBrowserHistory({ databasePath: chromiumPath, family: 'chromium' })
    const firefoxRows = await readExternalBrowserHistory({ databasePath: firefoxPath, family: 'firefox' })
    const safariRows = await readExternalBrowserHistory({ databasePath: safariPath, family: 'safari' })
    assert.equal(chromiumRows.rows[0]?.lastVisitedAt, '2023-11-14T22:13:20.000Z')
    assert.equal(chromiumRows.rows.length, 5_000)
    assert.equal(chromiumRows.skipped, 2, 'source rows beyond the bounded read are reported rather than silently omitted')
    assert.equal(firefoxRows.rows[0]?.visitCount, 4)
    assert.equal(safariRows.rows[0]?.url, 'https://safari.example/')
    assert.equal((await readExternalBrowserHistory({ databasePath: firefoxPath, family: 'firefox', since: '2024-01-01T00:00:00.000Z' })).rows.length, 0)
    console.log('External Browser history SQLite readers: ok')
} finally {
    await rm(root, { recursive: true, force: true })
}

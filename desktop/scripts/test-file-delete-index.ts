import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import * as filesystem from 'node:fs/promises'
import initSqlJs from 'sql.js/dist/sql-asm.js'

const fs = { ...filesystem }
const temporary = await fs.mkdtemp(join(tmpdir(), 'zyra-file-delete-index-'))
const project = join(temporary, 'project')
const deleted = join(project, 'removed_%folder')
const similar = join(project, 'removed_Xfolder')
const reads: string[] = []
const warnings: unknown[] = []
let heartbeat: ReturnType<typeof setInterval> | undefined
const safePath = (path: string) => {
    const absolute = resolve(path)
    assert.ok(absolute.startsWith(resolve(temporary) + '/'.replace('/', process.platform === 'win32' ? '\\' : '/')), 'only generated fixture descendants may be deleted')
    return absolute
}
mock.module('electron', () => ({ app: { getPath: () => join(temporary, 'profile') }, shell: {
    trashItem: async (path: string) => fs.rm(safePath(path), { recursive: true, force: false })
} }))
mock.module('electron-log', () => ({ default: { info() {}, debug() {}, error(...args: unknown[]) { warnings.push(args) }, warn(...args: unknown[]) { warnings.push(args) } } }))
mock.module('node:fs/promises', () => ({ ...fs, readdir: async (...args: Parameters<typeof fs.readdir>) => {
    reads.push(resolve(String(args[0])))
    return fs.readdir(...args)
} }))
mock.module('../src/main/services/project-discovery-service', () => ({ invalidateScanProjectsCache() {} }))

try {
    await fs.mkdir(join(temporary, 'profile'), { recursive: true })
    await fs.mkdir(join(deleted, 'nested'), { recursive: true })
    await fs.writeFile(join(deleted, 'nested', 'obsolete.ts'), '')
    await fs.mkdir(join(similar, 'deep'), { recursive: true })
    await fs.writeFile(join(similar, 'deep', 'preserved.ts'), 'keep')
    const deepSiblings: string[] = []
    for (let index = 0; index < 12; index++) {
        const deep = join(project, `sibling-${index}`, 'deep')
        deepSiblings.push(deep)
        await fs.mkdir(deep, { recursive: true })
        await Promise.all(Array.from({ length: 24 }, (_, file) => fs.writeFile(join(deep, `kept-${index}-${file}.ts`), 'keep')))
    }
    await fs.writeFile(join(project, 'package.json'), '{"name":"fixture-project"}')
    const index = await import('../src/main/services/file-index-service')
    const handler = await import('../src/main/ipc/handlers/file-tree-write-handlers')
    assert.equal((await index.indexFilesAcrossFolders([project])).success, true)
    const search = (term: string, scopePath = project) => index.searchIndexedPaths({ scopePath, term, includeFiles: true, includeDirectories: true, includeAncestors: true, showHidden: true, limit: 1000 })
    assert.equal((await search('obsolete')).entries.length, 1)
    assert.equal((await search('kept-')).entries.length, 288)
    const retained = await search('preserved')
    reads.length = 0
    const started = performance.now()
    let previousHeartbeat = started
    let maxHeartbeatGapMs = 0
    let heartbeatCount = 0
    heartbeat = setInterval(() => {
        const now = performance.now()
        maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - previousHeartbeat)
        previousHeartbeat = now
        heartbeatCount += 1
    }, 10)
    assert.equal((await handler.handleDeleteFileSystemItem({} as never, deleted)).success, true)
    // Exercise the production 700ms debounce and serialized operation queue.
    for (let attempt = 0; attempt < 80 && (await search('obsolete')).entries.length; attempt++) await Bun.sleep(25)
    assert.equal((await search('obsolete')).entries.length, 0, 'deleted descendants disappear from cached indexed search')
    assert.deepEqual((await search('preserved')).entries, retained.entries, 'wildcard characters in deleted names do not remove a neighboring subtree')
    assert.equal((await search('kept-')).entries.length, 288, 'all deep sibling entries survive')
    assert.ok(reads.some(path => path === resolve(project)), 'the immediate parent metadata is refreshed')
    assert.equal(reads.some(path => [...deepSiblings, join(similar, 'deep')].some(deep => path === resolve(deep) || path.startsWith(resolve(deep) + '\\') || path.startsWith(resolve(deep) + '/'))), false, 'deletion queue never recursively enumerates sibling subtrees')
    assert.ok(reads.length <= 18, `deletion work stays at parent/direct-child scope, observed ${reads.length} reads`)
    const deletionReads = reads.length
    const rootSearch = () => index.searchIndexedPaths({ roots: [project], includeFiles: true, includeDirectories: true, showHidden: true, limit: 500 })
    assert.equal((await rootSearch()).entries.find(entry => resolve(entry.path) === resolve(project))?.isProject, true)
    reads.length = 0
    assert.equal((await handler.handleDeleteFileSystemItem({} as never, join(project, 'package.json'))).success, true)
    await Bun.sleep(750)
    const rootAfterMarkerDelete = (await rootSearch()).entries.find(entry => resolve(entry.path) === resolve(project))
    assert.equal(rootAfterMarkerDelete?.isProject, false, 'deleting a marker refreshes immediate parent project metadata')
    assert.equal(warnings.length, 0, JSON.stringify(warnings))
    // Let the fallback SQLite export timer finish inside the fixture before cleanup.
    await Bun.sleep(1300)
    clearInterval(heartbeat)
    assert.ok(heartbeatCount > 20, 'the main-loop analogue keeps servicing timers through deletion and export')
    const SQL = await initSqlJs()
    const database = new SQL.Database(await fs.readFile(join(temporary, 'profile', 'file-index', 'file-index.sqlite')))
    try {
        const target = resolve(deleted).replace(/\\/g, '/').toLowerCase()
        const plan = database.exec('EXPLAIN QUERY PLAN DELETE FROM file_index_entries WHERE normalized_path = ? OR (normalized_path >= ? AND normalized_path < ?)', [target, target + '/', target + '0'])
        console.log('INFO: literal subtree DELETE plan:', JSON.stringify(plan[0]?.values))
    } finally { database.close() }
    console.log('PASS: bounded deletion reads=' + deletionReads + ', heartbeat samples=' + heartbeatCount + ', max gap=' + Math.round(maxHeartbeatGapMs) + 'ms including legacy export')
    console.log(`PASS: actual delete handler and queued index invalidation preserve deep siblings without recursive refresh (${Math.round(performance.now() - started)}ms including debounce/export waits)`)
} finally {
    clearInterval(heartbeat)
    if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('zyra-file-delete-index-')) throw new Error('Unexpected deletion fixture cleanup path')
    await fs.rm(temporary, { recursive: true, force: true })
}

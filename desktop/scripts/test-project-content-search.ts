import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { searchProjectContents } from '../src/main/services/project-content-search'
import { parseQuickOpenQuery, rankQuickOpenFiles } from '../src/renderer/src/components/quick-open-model'

const root = await mkdtemp(join(tmpdir(), 'zyra-content-search-'))
try {
    execFileSync('git', ['init', '--quiet', root], { windowsHide: true })
    await mkdir(join(root, 'src'))
    await writeFile(join(root, '.gitignore'), 'ignored.txt\n')
    await writeFile(join(root, 'src', 'one.ts'), 'alpha\nNeedle with spaces\nneedle again\n')
    await writeFile(join(root, 'two.md'), 'needle in markdown\n')
    await writeFile(join(root, 'ignored.txt'), 'needle ignored\n')
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 110, 101, 101, 100, 108, 101]))
    const matches = await searchProjectContents({ root, query: 'needle', fileFilter: '*.ts' })
    assert.deepEqual(matches.matches.map(match => [match.relativePath, match.line, match.column]), [['src/one.ts', 2, 1], ['src/one.ts', 3, 1]])
    assert.equal((await searchProjectContents({ root, query: 'Needle', caseSensitive: true })).matches.length, 1)
    assert.equal((await searchProjectContents({ root, query: 'needle', limit: 1 })).truncated, true)
    const nested = await searchProjectContents({ root: join(root, 'src'), query: 'needle' })
    assert.equal(nested.matches.length, 2)
    assert.equal(nested.matches[0].relativePath, 'one.ts')
    assert.equal((await searchProjectContents({ root, query: 'needle' })).matches.some(match => match.path.endsWith('ignored.txt')), false)
    assert.equal((await searchProjectContents({ root, query: '   ' })).matches.length, 0)
    await assert.rejects(searchProjectContents({ root: '../outside', query: 'needle' }), /working folder/)
    await assert.rejects(searchProjectContents({ root, query: 'needle' }, AbortSignal.abort()))
    assert.deepEqual(parseQuickOpenQuery('C:\\src\\file.ts:42'), { term: 'C:\\src\\file.ts', line: 42 })
    assert.deepEqual(parseQuickOpenQuery('C:\\src\\file.ts'), { term: 'C:\\src\\file.ts' })
    assert.equal(rankQuickOpenFiles([{ path: 'b', name: 'other.ts' }, { path: 'a', name: 'auth.ts' }], ['b'], 'auth')[0].path, 'a')
    console.log('Project content search: scoped roots, ignored/binary files, line targets, filters, limits and cancellation: ok')
} finally { await rm(root, { recursive: true, force: true }) }

import assert from 'node:assert/strict'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { readVisualizationCandidatesFromDb } from '../src/main/assistant/visualization-candidates'
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVisualizationStore } from '../../src/visualizations/store.mjs'
import {
    VisualizationLibrary,
    resolveVisualizationLibraryContext,
} from '../src/main/assistant/visualization-library'
import { embedVisualizationReference } from '../src/shared/visualization-resources'

const SQL = await initSqlJs()
const db = new SQL.Database()
try {
    db.run(
        'CREATE TABLE assistant_messages(id TEXT, text TEXT, created_at TEXT, turn_id TEXT, thread_id TEXT, role TEXT, streaming INTEGER)',
    )
    for (const [id, text, thread, role, streaming] of [
        ['upper', '```Mermaid\ngraph LR\nA --> B\n```', 'owner', 'assistant', 0],
        ['lower', '```mermaid\ngraph LR\nA --> B\n```', 'owner', 'assistant', 0],
        ['user', '```Mermaid\nA --> B\n```', 'owner', 'user', 0],
        ['streaming', '```Mermaid\nA --> B\n```', 'owner', 'assistant', 1],
        ['foreign', '```Mermaid\nA --> B\n```', 'foreign', 'assistant', 0],
        ['ordinary', 'No diagram here', 'owner', 'assistant', 0],
    ])
        db.run('INSERT INTO assistant_messages VALUES(?, ?, ?, ?, ?, ?, ?)', [
            id,
            text,
            '2026-01-01T12:00:00.000Z',
            'turn',
            thread,
            role,
            streaming,
        ])
    assert.deepEqual(
        readVisualizationCandidatesFromDb(db, 'owner').map((row) => row.id),
        ['upper', 'lower'],
        'actual SQLite candidate filtering accepts fence case variants and excludes foreign/user/streaming messages',
    )
    assert.deepEqual(
        readVisualizationCandidatesFromDb(db, 'owner', 1, 1).map((row) => row.id),
        ['lower'],
        'candidate cursor and limit remain intact',
    )
} finally {
    db.close()
}

const cwd = await mkdtemp(join(tmpdir(), 'zyra-visualization-library-'))
try {
    const context = { cwd, threadId: 'canonical-thread' }
    const library = new VisualizationLibrary()
    const legacy = {
        cursor: 1,
        id: 'canonical-message',
        createdAt: '2026-01-01T12:00:00.000Z',
        text: 'A chart\n<visualization title="Original chart" summary="A saved chart" height="240">\n<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>\n</visualization>\n\n```mermaid\ngraph LR\nA --> B\n```',
    }
    const reader = async (after: number) => (after < 1 ? [legacy] : [])
    const first = await library.list(context, reader)
    assert.equal(first.length, 2)
    assert.ok(
        first.every(
            (item) =>
                item.sourceLoaded === false &&
                item.versions.every((revision) => revision.source === ''),
        ),
        'lists transport metadata only, including historical revisions',
    )
    assert.deepEqual(
        (await library.list(context, reader)).map((item) => item.id),
        first.map((item) => item.id),
        'repeat opening is idempotent',
    )
    assert.equal(
        (await new VisualizationLibrary().list(context, reader)).length,
        2,
        'reopening after process restart imports idempotently',
    )
    const html = first.find((item) => item.kind === 'html')!
    const revised = await createVisualizationStore(context).revise({
        id: html.id,
        baseVersion: 1,
        expectedVersion: 1,
        source: '<p>Version two</p>',
        changeNote: 'Changed chart',
    })
    assert.equal(
        (await library.get(context, html.id, 1)).versions[0].source.includes('viewBox'),
        true,
        'pinned revision stays original after edits',
    )
    assert.equal(revised.latestVersion, 2)
    const sourceFile = join(cwd, '.zyra', 'visualizations', html.id, 'v1.html')
    await rename(sourceFile, sourceFile + '.unavailable')
    try {
        const metadata = await library.list(context, reader)
        assert.ok(
            metadata.every(
                (item) =>
                    item.sourceLoaded === false &&
                    item.versions.every((revision) => revision.source === ''),
            ),
            'metadata listing does not open immutable source files',
        )
        assert.equal(
            (await new VisualizationLibrary().list(context, reader)).length,
            2,
            'restart ingestion of known legacy IDs remains metadata-only with an unavailable immutable file',
        )
        await assert.rejects(
            () => library.get(context, html.id),
            /ENOENT/,
            'detail loading still verifies immutable source files',
        )
    } finally {
        await rename(sourceFile + '.unavailable', sourceFile)
    }
    await assert.rejects(() => library.get(context, html.id, 9), /unavailable/)
    await assert.rejects(() => library.get(context, '../escape'), /UUID/)
    const secondContext = { cwd, threadId: 'explicit-reuse-thread' }
    const embed = {
        cursor: 2,
        id: 'reuse-message',
        text: embedVisualizationReference(html.id, 1),
        createdAt: legacy.createdAt,
    }
    const reused = await library.list(secondContext, async (after) => (after < 2 ? [embed] : []))
    assert.deepEqual(
        reused.map((item) => item.id),
        [html.id],
        'explicit embeds appear in owning thread Resources without cloning',
    )
    assert.equal((await library.list(secondContext, async () => [], 'project')).length, 2)
    const readonly = await resolveVisualizationLibraryContext({
        cwd,
        threadId: 'readonly',
        roots: [{ path: cwd, access: 'read-only' }],
    })
    assert.equal(readonly.canImport, false)
    await library.importMessage(readonly, { ...legacy, id: 'must-not-write' })
    assert.equal(
        (await createVisualizationStore(context).list()).length,
        2,
        'read-only historical viewing does not silently import',
    )
    const unrelated = join(cwd, 'other')
    await mkdir(unrelated)
    const writable = await resolveVisualizationLibraryContext({
        cwd: unrelated,
        threadId: 'writable',
        roots: [{ path: unrelated, access: 'read-write' }],
    })
    assert.equal(writable.canImport, true)
    await library.importMessage(context, {
        ...legacy,
        id: 'new-completed-message',
    })
    assert.equal(
        (await createVisualizationStore(context).list()).length,
        4,
        'completed messages save before inspector opens',
    )
    const changingAccess = { cwd, threadId: 'changed-access', canImport: false }
    assert.equal((await library.list(changingAccess, reader)).length, 0)
    assert.equal(
        (await library.list({ ...changingAccess, canImport: true }, reader)).length,
        2,
        'granting writable access revisits history skipped during read-only viewing',
    )
    const malicious = {
        ...legacy,
        id: 'unsafe-message',
        cursor: 3,
        text: '<visualization title="Unsafe" summary="Must skip">\n<script>alert(1)</script>\n</visualization>',
    }
    const safeAfter = { ...legacy, id: 'safe-after-unsafe', cursor: 4 }
    const mixedContext = { cwd, threadId: 'mixed-history' }
    const mixed = await library.list(mixedContext, async (after) =>
        after < 3 ? [malicious, safeAfter] : [],
    )
    assert.equal(mixed.length, 2, 'one unsafe legacy block does not hide unrelated valid resources')
    assert.equal(library.status(mixedContext).skippedCount, 1)
    const home = join(cwd, 'stable-project-home')
    await mkdir(home)
    const homeContext = { cwd: home, threadId: 'project-home', readRoots: [cwd] }
    const oldReference = {
        cursor: 1,
        id: 'old-cli-reference',
        text: embedVisualizationReference(html.id, 1),
        createdAt: legacy.createdAt,
    }
    assert.equal(
        (await library.list(homeContext, async (after) => (after < 1 ? [oldReference] : [])))[0]
            ?.id,
        html.id,
        'explicit CLI references resolve through the associated workspace',
    )
    assert.equal(
        (await library.get(homeContext, html.id, 1)).versions[0].source,
        (await library.get(context, html.id, 1)).versions[0].source,
    )
    assert.ok(
        (await library.list(homeContext, async (after) => (after < 1 ? [oldReference] : []))).every(
            (item) =>
                item.sourceLoaded === false &&
                item.versions.every((revision) => revision.source === ''),
        ),
        'associated references also remain metadata-only',
    )
    const mixedCaseContext = { cwd, threadId: 'mixed-case-fence' }
    const mixedCase = {
        ...legacy,
        cursor: 1,
        id: 'mixed-case-mermaid',
        text: '```Mermaid\ngraph LR\nA --> B\n```',
    }
    assert.equal(
        (await library.list(mixedCaseContext, async (after) => (after < 1 ? [mixedCase] : [])))
            .length,
        1,
        'completed-message import and historical indexing preserve mixed-case Mermaid fences',
    )
    const fullCwd = join(cwd, 'capacity-project')
    await mkdir(fullCwd)
    const fullContext = { cwd: fullCwd, threadId: 'capacity-thread' }
    const template = await createVisualizationStore(fullContext).create({
        kind: 'html',
        title: 'At capacity',
        source: '<p>Existing source</p>',
    })
    for (let index = 0; index < 499; index++) {
        const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
        const directory = join(fullCwd, '.zyra', 'visualizations', id)
        await mkdir(directory)
        await writeFile(join(directory, 'resource.json'), JSON.stringify({ ...template, id }))
        await writeFile(join(directory, 'v1.html'), template.versions[0].source)
    }
    const overCap = {
        ...legacy,
        cursor: 1,
        id: 'over-cap',
        text: '<visualization title="Extra" summary="Over capacity">\n<p>Extra</p>\n</visualization>',
    }
    const reads: number[] = []
    const capacityReader = async (after: number) => {
        reads.push(after)
        return after < 2 ? [overCap, { ...overCap, cursor: 2, id: 'over-cap-second' }] : []
    }
    const fullLibrary = new VisualizationLibrary()
    assert.equal(
        (await fullLibrary.list(fullContext, capacityReader)).length,
        500,
        'a failed legacy import at the supported cap cannot hide existing resources',
    )
    assert.equal(
        fullLibrary.status(fullContext).skippedCount,
        2,
        'over-cap imports are accounted for without repeated writes',
    )
    assert.equal((await fullLibrary.list(fullContext, capacityReader)).length, 500)
    assert.equal(reads.at(-1), 2, 'index cursor advances beyond capacity-blocked candidates')
    console.log(
        'Visualization library: legacy import, reopen, pins, explicit reuse, stable Project home, scope changes and completion passed',
    )
} finally {
    await rm(cwd, { recursive: true, force: true })
}

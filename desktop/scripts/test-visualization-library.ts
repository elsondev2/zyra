import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVisualizationStore } from '../../src/visualizations/store.mjs'
import { VisualizationLibrary, resolveVisualizationLibraryContext } from '../src/main/assistant/visualization-library'
import { embedVisualizationReference } from '../src/shared/visualization-resources'

const cwd = await mkdtemp(join(tmpdir(), 'zyra-visualization-library-'))
try {
    const context = { cwd, threadId: 'canonical-thread' }
    const library = new VisualizationLibrary()
    const legacy = { cursor: 1, id: 'canonical-message', createdAt: '2026-01-01T12:00:00.000Z', text: 'A chart\n<visualization title="Original chart" summary="A saved chart" height="240">\n<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>\n</visualization>\n\n```mermaid\ngraph LR\nA --> B\n```' }
    const reader = async (after: number) => after < 1 ? [legacy] : []
    const first = await library.list(context, reader)
    assert.equal(first.length, 2)
    assert.deepEqual((await library.list(context, reader)).map(item => item.id), first.map(item => item.id), 'repeat opening is idempotent')
    assert.equal((await new VisualizationLibrary().list(context, reader)).length, 2, 'reopening after process restart imports idempotently')
    const html = first.find(item => item.kind === 'html')!
    const revised = await createVisualizationStore(context).revise({ id: html.id, baseVersion: 1, expectedVersion: 1, source: '<p>Version two</p>', changeNote: 'Changed chart' })
    assert.equal((await library.get(context, html.id, 1)).versions[0].source.includes('viewBox'), true, 'pinned revision stays original after edits')
    assert.equal(revised.latestVersion, 2)
    await assert.rejects(() => library.get(context, html.id, 9), /unavailable/)
    await assert.rejects(() => library.get(context, '../escape'), /UUID/)
    const secondContext = { cwd, threadId: 'explicit-reuse-thread' }
    const embed = { cursor: 2, id: 'reuse-message', text: embedVisualizationReference(html.id, 1), createdAt: legacy.createdAt }
    const reused = await library.list(secondContext, async after => after < 2 ? [embed] : [])
    assert.deepEqual(reused.map(item => item.id), [html.id], 'explicit embeds appear in owning thread Resources without cloning')
    assert.equal((await library.list(secondContext, async () => [], 'project')).length, 2)
    const readonly = await resolveVisualizationLibraryContext({ cwd, threadId: 'readonly', roots: [{ path: cwd, access: 'read-only' }] })
    assert.equal(readonly.canImport, false)
    await library.importMessage(readonly, { ...legacy, id: 'must-not-write' })
    assert.equal((await createVisualizationStore(context).list()).length, 2, 'read-only historical viewing does not silently import')
    const unrelated = join(cwd, 'other'); await mkdir(unrelated)
    const writable = await resolveVisualizationLibraryContext({ cwd: unrelated, threadId: 'writable', roots: [{ path: unrelated, access: 'read-write' }] })
    assert.equal(writable.canImport, true)
    await library.importMessage(context, { ...legacy, id: 'new-completed-message' })
    assert.equal((await createVisualizationStore(context).list()).length, 4, 'completed messages save before inspector opens')
    const changingAccess = { cwd, threadId: 'changed-access', canImport: false }
    assert.equal((await library.list(changingAccess, reader)).length, 0)
    assert.equal((await library.list({ ...changingAccess, canImport: true }, reader)).length, 2, 'granting writable access revisits history skipped during read-only viewing')
    const malicious = { ...legacy, id: 'unsafe-message', cursor: 3, text: '<visualization title="Unsafe" summary="Must skip">\n<script>alert(1)</script>\n</visualization>' }
    const safeAfter = { ...legacy, id: 'safe-after-unsafe', cursor: 4 }
    const mixedContext = { cwd, threadId: 'mixed-history' }
    const mixed = await library.list(mixedContext, async after => after < 3 ? [malicious, safeAfter] : [])
    assert.equal(mixed.length, 2, 'one unsafe legacy block does not hide unrelated valid resources')
    assert.equal(library.status(mixedContext).skippedCount, 1)
    const home = join(cwd, 'stable-project-home'); await mkdir(home)
    const homeContext = { cwd: home, threadId: 'project-home', readRoots: [cwd] }
    const oldReference = { cursor: 1, id: 'old-cli-reference', text: embedVisualizationReference(html.id, 1), createdAt: legacy.createdAt }
    assert.equal((await library.list(homeContext, async after => after < 1 ? [oldReference] : []))[0]?.id, html.id, 'explicit CLI references resolve through the associated workspace')
    assert.equal((await library.get(homeContext, html.id, 1)).versions[0].source, html.versions[0].source)
    console.log('Visualization library: legacy import, reopen, pins, explicit reuse, stable Project home, scope changes and completion passed')
} finally { await rm(cwd, { recursive: true, force: true }) }

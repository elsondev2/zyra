import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { mock } from 'bun:test'
import type { DevScopeFileTreeNode } from '../src/shared/contracts/devscope-project-contracts'
import { filterWorkspaceTree } from '../src/renderer/src/components/ui/file-preview/PreviewNavigationSidebar'
import { buildVisiblePreviewTreeModel, normalizePreviewTreePath } from '../src/renderer/src/components/ui/file-preview/previewVirtualTreeModel'
import { readPreviewContentCache, writePreviewContentCache, type PreviewContentSnapshot } from '../src/renderer/src/components/ui/file-preview/preview-content-cache'
import { resolveMaterialFileIconAsset } from '../src/renderer/src/components/ui/file-preview/materialFileIconTheme'

// This is a developer micro-benchmark, not a release gate. Keep product code and behavior untouched.
const SAMPLE_COUNT = Math.max(7, Number(process.env.ZYRA_FILES_BENCHMARK_SAMPLES) || 15)
const WARMUP_COUNT = 3
const TREE_SIZES = [10_000, 50_000, 100_000]

const SOURCE_CONTRACT_EXPECTATIONS = {
    // Flip these to false in the product change that removes each baseline behavior.
    serializedDeepAncestorLoads: false,
    directPerMousemovePanelStateUpdates: false
} as const

type TimingSummary = {
    medianMs: number
    p95Ms: number
    minMs: number
    maxMs: number
}

type BenchmarkRow = TimingSummary & {
    metric: string
    input: string
    operationsPerSample: number
    medianMicrosecondsPerOperation: number
    p95MicrosecondsPerOperation: number
}

type TreeFixture = {
    nodes: DevScopeFileTreeNode[]
    expandedPathKeys: Set<string>
    nodeCount: number
    finalNeedleName: string
}

type SourceContractState = {
    [Key in keyof typeof SOURCE_CONTRACT_EXPECTATIONS]: boolean
}

let checksum = 0

function percentile(sortedSamples: number[], percentileValue: number): number {
    const index = Math.max(0, Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * percentileValue) - 1))
    return sortedSamples[index]
}

function summarize(samples: number[]): TimingSummary {
    const sorted = [...samples].sort((left, right) => left - right)
    return {
        medianMs: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        minMs: sorted[0],
        maxMs: sorted.at(-1) || 0
    }
}

async function measure({
    metric,
    input,
    operationsPerSample,
    run
}: {
    metric: string
    input: string
    operationsPerSample: number
    run: () => number | Promise<number>
}): Promise<BenchmarkRow> {
    for (let index = 0; index < WARMUP_COUNT; index += 1) {
        checksum = (checksum + await run()) >>> 0
    }

    const samples: number[] = []
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const startedAt = performance.now()
        checksum = (checksum + await run()) >>> 0
        samples.push(performance.now() - startedAt)
    }

    const summary = summarize(samples)
    return {
        metric,
        input,
        operationsPerSample,
        ...summary,
        medianMicrosecondsPerOperation: (summary.medianMs * 1_000) / operationsPerSample,
        p95MicrosecondsPerOperation: (summary.p95Ms * 1_000) / operationsPerSample
    }
}

function createTreeFixture(targetNodeCount: number): TreeFixture {
    const nodes: DevScopeFileTreeNode[] = []
    const expandedPathKeys = new Set<string>()
    const filesPerDirectory = 24
    let nodeCount = 0
    let directoryIndex = 0
    const finalNeedleName = 'needle-last-target.ts'

    while (nodeCount < targetNodeCount) {
        const remaining = targetNodeCount - nodeCount
        if (remaining === 1) {
            const name = nodeCount === targetNodeCount - 1 ? finalNeedleName : `root-${nodeCount}.ts`
            nodes.push({
                name,
                path: `C:/benchmark/${name}`,
                type: 'file',
                isHidden: false
            })
            nodeCount += 1
            continue
        }

        const directoryPath = `C:/benchmark/module-${String(directoryIndex).padStart(5, '0')}`
        const childCount = Math.min(filesPerDirectory, remaining - 1)
        const children: DevScopeFileTreeNode[] = []
        for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
            const isFinalNode = nodeCount + childIndex + 2 === targetNodeCount
            const sparseMatch = (nodeCount + childIndex) % 997 === 0
            const name = isFinalNode
                ? finalNeedleName
                : sparseMatch
                    ? `needle-${directoryIndex}-${childIndex}.ts`
                    : `entry-${directoryIndex}-${childIndex}.${childIndex % 5 === 0 ? 'md' : 'ts'}`
            children.push({
                name,
                path: `${directoryPath}/${name}`,
                type: 'file',
                size: childIndex * 17,
                isHidden: false
            })
        }
        nodes.push({
            name: `module-${String(directoryIndex).padStart(5, '0')}`,
            path: directoryPath,
            type: 'directory',
            isHidden: false,
            childrenLoaded: true,
            children
        })
        expandedPathKeys.add(normalizePreviewTreePath(directoryPath))
        nodeCount += childCount + 1
        directoryIndex += 1
    }

    assert.equal(nodeCount, targetNodeCount)
    return { nodes, expandedPathKeys, nodeCount, finalNeedleName }
}

function countTreeNodes(nodes: DevScopeFileTreeNode[]): number {
    let count = 0
    const stack = [...nodes]
    while (stack.length > 0) {
        const node = stack.pop()
        if (!node) continue
        count += 1
        if (node.children) stack.push(...node.children)
    }
    return count
}

function detectSourceContracts(): SourceContractState {
    const folderTreeSource = readFileSync(
        new URL('../src/renderer/src/components/ui/file-preview/usePreviewFolderTree.ts', import.meta.url),
        'utf8'
    )
    const previewChromeSource = readFileSync(
        new URL('../src/renderer/src/components/ui/file-preview/useFilePreviewChrome.ts', import.meta.url),
        'utf8'
    )

    const serializedDeepAncestorLoads = /await loadTree\(\)\s*for \(const ancestorPath of targetAncestorPaths\) \{[\s\S]*?await loadTree\(ancestorPath\)/.test(folderTreeSource)
    const mousemoveBody = previewChromeSource.match(
        /const handleMouseMove = \(event: MouseEvent\) => \{([\s\S]*?)\n\s*const stopResize =/
    )?.[1] || ''
    const directPerMousemovePanelStateUpdates = (
        previewChromeSource.includes("window.addEventListener('mousemove', handleMouseMove)")
        && /setLeftPanelWidth\(|setRightPanelWidth\(/.test(mousemoveBody)
        && !/requestAnimationFrame/.test(mousemoveBody)
    )

    const detected = { serializedDeepAncestorLoads, directPerMousemovePanelStateUpdates }
    assert.deepEqual(
        detected,
        SOURCE_CONTRACT_EXPECTATIONS,
        'Shared Files source behavior changed. Verify the product change, then flip the matching benchmark source-contract expectation.'
    )
    return detected
}

const COMMON_ICON_INPUTS = [
    ['README.md', 'file'],
    ['package.json', 'file'],
    ['package-lock.json', 'file'],
    ['tsconfig.json', 'file'],
    ['vite.config.ts', 'file'],
    ['index.ts', 'file'],
    ['App.tsx', 'file'],
    ['styles.css', 'file'],
    ['settings.json', 'file'],
    ['notes.md', 'file'],
    ['script.py', 'file'],
    ['main.rs', 'file'],
    ['go.mod', 'file'],
    ['Dockerfile', 'file'],
    ['proposal.docx', 'file'],
    ['forecast.xlsx', 'file'],
    ['slides.pptx', 'file'],
    ['diagram.svg', 'file'],
    ['photo.png', 'file'],
    ['archive.zip', 'file'],
    ['src', 'directory'],
    ['components', 'directory'],
    ['node_modules', 'directory'],
    ['.git', 'directory'],
    ['.github', 'directory'],
    ['.zyra', 'directory'],
    ['public', 'directory'],
    ['dist', 'directory']
] as const

function createSnapshot(content: string, modifiedAt: number): PreviewContentSnapshot {
    return {
        content,
        truncated: false,
        size: content.length,
        previewBytes: content.length,
        modifiedAt
    }
}

async function benchmarkPurePaths(): Promise<BenchmarkRow[]> {
    const rows: BenchmarkRow[] = []

    for (const size of TREE_SIZES) {
        const fixture = createTreeFixture(size)
        const initialModel = buildVisiblePreviewTreeModel(fixture.nodes, fixture.expandedPathKeys)
        assert.equal(initialModel.rows.length, fixture.nodeCount)
        assert.equal(initialModel.rowIndexByKey.size, fixture.nodeCount)

        rows.push(await measure({
            metric: 'visible tree model',
            input: `${size.toLocaleString()} visible nodes`,
            operationsPerSample: 1,
            run: () => {
                const model = buildVisiblePreviewTreeModel(fixture.nodes, fixture.expandedPathKeys)
                assert.equal(model.rows.length, fixture.nodeCount)
                return model.rows.length + model.rowIndexByKey.size + model.horizontalContentWidth
            }
        }))

        const initialFilteredTree = filterWorkspaceTree(fixture.nodes, 'needle')
        const filteredCount = countTreeNodes(initialFilteredTree)
        assert.ok(filteredCount > 0 && filteredCount < fixture.nodeCount)
        rows.push(await measure({
            metric: 'workspace tree filter',
            input: `${size.toLocaleString()} nodes, sparse match`,
            operationsPerSample: 1,
            run: () => {
                const filteredTree = filterWorkspaceTree(fixture.nodes, 'needle')
                const count = countTreeNodes(filteredTree)
                assert.equal(count, filteredCount)
                return count
            }
        }))
    }

    const iconRoundsPerSample = 2_000
    const iconOperations = COMMON_ICON_INPUTS.length * iconRoundsPerSample
    rows.push(await measure({
        metric: 'Material icon resolution',
        input: `${COMMON_ICON_INPUTS.length} common entries`,
        operationsPerSample: iconOperations,
        run: () => {
            let resolvedLength = 0
            for (let round = 0; round < iconRoundsPerSample; round += 1) {
                for (const [path, kind] of COMMON_ICON_INPUTS) {
                    const resolved = resolveMaterialFileIconAsset({
                        path,
                        kind,
                        expanded: kind === 'directory' && round % 2 === 1,
                        light: round % 4 === 0
                    })
                    assert.ok(resolved.definition)
                    assert.ok(resolved.fileName)
                    resolvedLength += resolved.definition.length + resolved.fileName.length
                }
            }
            return resolvedLength
        }
    }))

    const contentCache = new Map<string, PreviewContentSnapshot>()
    const cachePaths = Array.from({ length: 8 }, (_, index) => `C:/benchmark/cache/file-${index}.md`)
    for (let index = 0; index < cachePaths.length; index += 1) {
        writePreviewContentCache(contentCache, cachePaths[index], createSnapshot(`content-${index}`.repeat(128), index))
    }
    assert.equal(contentCache.size, cachePaths.length)

    const cacheLookupsPerSample = 100_000
    rows.push(await measure({
        metric: 'content cache warm lookup',
        input: '8-entry bounded LRU',
        operationsPerSample: cacheLookupsPerSample,
        run: () => {
            let contentLength = 0
            for (let index = 0; index < cacheLookupsPerSample; index += 1) {
                const path = cachePaths[index % cachePaths.length]
                const lookupPath = index % 2 === 0 ? path.toUpperCase().replaceAll('/', '\\') : path
                const snapshot = readPreviewContentCache(contentCache, lookupPath)
                assert.ok(snapshot)
                contentLength += snapshot.content.length
            }
            return contentLength
        }
    }))

    return rows
}

async function benchmarkElectronFreeIndexedSearch(): Promise<{ rows: BenchmarkRow[]; setupMs: number; setupMaxEventLoopDelayMs: number; coldSearchMs: number; indexedEntries: number }> {
    const sandboxPath = mkdtempSync(join(tmpdir(), 'zyra-shared-files-benchmark-'))
    const userDataPath = join(sandboxPath, 'user-data')
    const homePath = join(sandboxPath, 'home')
    const projectPath = join(sandboxPath, 'fixture-project')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(homePath, { recursive: true })
    mkdirSync(projectPath, { recursive: true })

    mock.module('electron', () => ({
        app: {
            getPath(name: string) {
                return name === 'userData' ? userDataPath : homePath
            }
        }
    }))
    mock.module('electron-log', () => ({
        default: {
            info() {},
            warn() {},
            error() {}
        }
    }))

    try {
        const directoryCount = 16
        const nestedDirectoriesPerDirectory = 12
        const filesPerNestedDirectory = 10
        let fileCount = 0
        let finalNeedlePath = ''
        for (let directoryIndex = 0; directoryIndex < directoryCount; directoryIndex += 1) {
            for (let nestedIndex = 0; nestedIndex < nestedDirectoriesPerDirectory; nestedIndex += 1) {
                const directoryPath = join(projectPath, `module-${directoryIndex}`, 'src', `feature-${nestedIndex}`)
                mkdirSync(directoryPath, { recursive: true })
                for (let fileIndex = 0; fileIndex < filesPerNestedDirectory; fileIndex += 1) {
                    const isFinalFile = (
                        directoryIndex === directoryCount - 1
                        && nestedIndex === nestedDirectoriesPerDirectory - 1
                        && fileIndex === filesPerNestedDirectory - 1
                    )
                    const fileName = isFinalFile ? 'needle-last-target.ts' : `entry-${directoryIndex}-${nestedIndex}-${fileIndex}.ts`
                    const filePath = join(directoryPath, fileName)
                    writeFileSync(filePath, '')
                    fileCount += 1
                    if (isFinalFile) finalNeedlePath = filePath
                }
            }
        }

        const service = await import('../src/main/services/file-index-service')
        let setupMaxEventLoopDelayMs = 0
        let expectedSampleAt = performance.now() + 16
        const delaySampler = setInterval(() => {
            const now = performance.now()
            setupMaxEventLoopDelayMs = Math.max(setupMaxEventLoopDelayMs, now - expectedSampleAt)
            expectedSampleAt = now + 16
        }, 16)
        const setupStartedAt = performance.now()
        const indexed = await service.indexFilesAcrossFolders([projectPath])
        const setupMs = performance.now() - setupStartedAt
        clearInterval(delaySampler)
        assert.equal(indexed.errors, undefined)
        assert.equal(indexed.indexedFiles, fileCount)

        // Let the service's debounced persistence finish inside the sandbox before cleanup.
        await Bun.sleep(1_300)

        const searchInput = {
            scopePath: projectPath,
            term: 'needle-last-target',
            extensionFilters: ['ts'],
            limit: 80,
            includeFiles: true,
            includeDirectories: true,
            includeAncestors: false,
            showHidden: false
        }
        const coldSearchStartedAt = performance.now()
        const initialResult = await service.searchIndexedPaths(searchInput)
        const coldSearchMs = performance.now() - coldSearchStartedAt
        assert.equal(initialResult.entries.length, 1)
        assert.equal(initialResult.entries[0]?.path, finalNeedlePath)
        assert.equal(initialResult.ancestors.length, 0)

        const searchesPerSample = 20
        const row = await measure({
            metric: 'indexed SQLite path search',
            input: `${indexed.indexedFiles.toLocaleString()} files, rare match`,
            operationsPerSample: searchesPerSample,
            run: async () => {
                let resultCount = 0
                for (let index = 0; index < searchesPerSample; index += 1) {
                    const result = await service.searchIndexedPaths(searchInput)
                    assert.equal(result.entries[0]?.path, finalNeedlePath)
                    resultCount += result.entries.length + result.ancestors.length
                }
                return resultCount
            }
        })

        return {
            rows: [row],
            setupMs,
            setupMaxEventLoopDelayMs,
            coldSearchMs,
            indexedEntries: indexed.indexedFiles + indexed.indexedFolders
        }
    } finally {
        rmSync(sandboxPath, { recursive: true, force: true })
    }
}

function formatNumber(value: number, fractionDigits = 3): string {
    return value.toFixed(fractionDigits)
}

function printRows(rows: BenchmarkRow[]): void {
    const headers = ['metric', 'input', 'ops/sample', 'median ms', 'p95 ms', 'median µs/op', 'p95 µs/op']
    const formattedRows = rows.map((row) => [
        row.metric,
        row.input,
        row.operationsPerSample.toLocaleString(),
        formatNumber(row.medianMs),
        formatNumber(row.p95Ms),
        formatNumber(row.medianMicrosecondsPerOperation),
        formatNumber(row.p95MicrosecondsPerOperation)
    ])
    const widths = headers.map((header, columnIndex) => Math.max(
        header.length,
        ...formattedRows.map((row) => row[columnIndex].length)
    ))
    const printLine = (values: string[]) => console.log(values.map((value, index) => value.padEnd(widths[index])).join('  '))
    printLine(headers)
    printLine(widths.map((width) => '-'.repeat(width)))
    for (const row of formattedRows) printLine(row)
}

console.log('Zyra Desktop shared Files surfaces benchmark (non-production)')
console.log(`Runtime: Bun ${Bun.version}; samples: ${SAMPLE_COUNT}; warmups: ${WARMUP_COUNT}`)
console.log('Electron app boot: no; builds/packages/restarts: no')

const sourceContracts = detectSourceContracts()
console.log('\nSource contracts (intentional current-behavior baselines):')
console.log(`  serialized deep ancestor loads: ${sourceContracts.serializedDeepAncestorLoads}`)
console.log(`  direct per-mousemove panel state updates: ${sourceContracts.directPerMousemovePanelStateUpdates}`)

const pureRows = await benchmarkPurePaths()
const indexedSearch = await benchmarkElectronFreeIndexedSearch()
const allRows = [...pureRows, ...indexedSearch.rows]

console.log('\nTiming results (lower is better):')
printRows(allRows)
console.log('\nIndexed-search benchmark engine: sql.js compatibility fallback (Bun does not expose node:sqlite)')
console.log(`Indexed-search fixture setup (excluded from search timing): ${formatNumber(indexedSearch.setupMs)} ms for ${indexedSearch.indexedEntries.toLocaleString()} indexed entries`)
console.log(`Indexed-search setup max event-loop delay: ${formatNumber(indexedSearch.setupMaxEventLoopDelayMs)} ms`)
console.log(`Indexed-search first uncached query: ${formatNumber(indexedSearch.coldSearchMs)} ms`)
console.log(`Checksum: ${checksum >>> 0}`)

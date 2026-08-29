import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePreviewType } from '../src/renderer/src/components/ui/file-preview/utils'
import { readBinaryPreviewFile } from '../src/main/ipc/handlers/binary-preview-file'

assert.deepEqual(resolvePreviewType('proposal.docx', 'docx'), { type: 'docx', needsContent: false })
assert.deepEqual(resolvePreviewType('forecast.xlsx', 'xlsx'), { type: 'xlsx', needsContent: false })
assert.deepEqual(resolvePreviewType('roadmap.pptx', 'pptx'), { type: 'pptx', needsContent: false })
assert.equal(resolvePreviewType('legacy.doc', 'doc'), null, 'legacy binary Office formats remain delegated to the native application')
assert.equal(resolvePreviewType('macros.xlsm', 'xlsm'), null, 'untested macro-enabled formats are not routed through the OOXML renderer')

const viewerSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/officePreviewViewer.ts', import.meta.url), 'utf8')
const contentSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/OfficePreviewContent.tsx', import.meta.url), 'utf8')
const bodySource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewBody.tsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewModalLayout.tsx', import.meta.url), 'utf8')
const viteSource = readFileSync(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const rendererHtml = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8')
const fileHandlerSource = readFileSync(new URL('../src/main/ipc/handlers/binary-preview-file.ts', import.meta.url), 'utf8')
const ipcSource = readFileSync(new URL('../src/main/ipc/handlers.ts', import.meta.url), 'utf8')
const preloadSource = readFileSync(new URL('../src/preload/adapters/projects-adapter.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
const ooxmlPackage = JSON.parse(readFileSync(new URL('../node_modules/@silurus/ooxml/package.json', import.meta.url), 'utf8')) as { version?: string; license?: string }

assert.equal(packageJson.dependencies?.['@silurus/ooxml'], '0.80.2', 'the renderer is pinned for reproducible OOXML behavior')
assert.equal(ooxmlPackage.license, 'MIT')
assert.equal(ooxmlPackage.version, '0.80.2')
assert.match(viewerSource, /import\('@silurus\/ooxml\/docx'\)/, 'DOCX code is loaded only when required')
assert.match(viewerSource, /import\('@silurus\/ooxml\/xlsx'\)/, 'XLSX code is loaded only when required')
assert.match(viewerSource, /import\('@silurus\/ooxml\/pptx'\)/, 'PPTX code is loaded only when required')
assert.equal((viewerSource.match(/mode: 'worker'/g) || []).length, 3, 'all Office formats parse and render off the UI thread')
assert.equal((viewerSource.match(/useGoogleFonts: false/g) || []).length, 3, 'Office previews do not contact Google Fonts')
assert.match(viewerSource, /enableTextSelection: true/, 'document text remains selectable')
assert.match(viewerSource, /enableElementSelection: true/, 'charts and drawings can be focused')
assert.match(contentSource, /viewer\?\.destroy\(\)/, 'viewer resources are released when the active preview changes')
assert.match(contentSource, /viewer\.findText\(normalizedQuery\)/, 'the preview offers model-level full-document search')
assert.match(contentSource, /window\.devscope\.readBinaryFile\(filePath\)/, 'Office previews use the bounded trusted-renderer binary bridge')
assert.match(contentSource, /viewer\.load\(fileResult\.data\)/, 'the renderer passes an ArrayBuffer rather than text or a public file URL')
assert.match(bodySource, /file\.type === 'docx'.+file\.type === 'xlsx'.+file\.type === 'pptx'/s)
assert.match(layoutSource, /isOfficeFile/, 'Office viewers receive a bounded full-height preview surface')
assert.match(viteSource, /exclude: \['@silurus\/ooxml'\]/, 'Vite does not prebundle the WASM-backed package')
assert.match(rendererHtml, /script-src 'self' 'wasm-unsafe-eval'/, 'the renderer allows local WASM compilation without general unsafe eval')
assert.match(rendererHtml, /worker-src 'self' blob:/, 'the renderer permits the package’s bounded local parser workers')
assert.match(rendererHtml, /font-src 'self' blob:/, 'embedded Office fonts may be loaded from package-owned blob URLs')
assert.match(fileHandlerSource, /BINARY_PREVIEW_MAX_BYTES = 128 \* 1024 \* 1024/, 'binary source reads have a fixed compressed-file ceiling')
assert.match(fileHandlerSource, /bytes\.buffer\.slice\(bytes\.byteOffset, bytes\.byteOffset \+ bytes\.byteLength\)/, 'IPC returns only the exact file bytes')
assert.match(ipcSource, /devscope:readBinaryFile/, 'the binary reader is registered in the main process')
assert.match(preloadSource, /readBinaryFile: \(filePath: string\)/, 'the binary reader is exposed through the typed preload boundary')

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'zyra-office-preview-'))
try {
    const fixturePath = join(fixtureDirectory, 'fixture.docx')
    const fixtureBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 17, 29, 255])
    await writeFile(fixturePath, fixtureBytes)
    const binaryResult = await readBinaryPreviewFile(fixturePath)
    assert.equal(binaryResult.success, true)
    if (binaryResult.success) {
        assert.deepEqual([...new Uint8Array(binaryResult.data)], [...fixtureBytes], 'binary IPC preserves every source byte')
        assert.equal(binaryResult.size, fixtureBytes.byteLength)
        assert.equal(typeof binaryResult.modifiedAt, 'number')
    }
} finally {
    await rm(fixtureDirectory, { recursive: true, force: true })
}

console.log('Office preview contract: ok')

import assert from 'node:assert/strict'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import {
    buildGoogleFontRows,
    filterInstalledFonts,
    formatFontBytes,
    getImportedFonts,
    getLocalFontPreviewStack,
    getManagedFontPreviewAlias,
    shouldLoadInstalledFonts
} from './font-manager-model'

function managedFont(id: string, family: string, source: 'google' | 'imported'): DevScopeManagedFont {
    return {
        id,
        family,
        source,
        installedAt: '2026-01-01T00:00:00.000Z',
        sizeBytes: 2048,
        faces: [{ fileName: 'font.woff2', weight: '400', style: 'normal', format: 'woff2', sizeBytes: 2048 }]
    }
}

const cachedInter = managedFont('google-inter-123', 'Inter', 'google')
const cachedCustom = managedFont('google-newsreader-123', 'Newsreader', 'google')
const importedAptos = managedFont('imported-aptos-123', 'Aptos', 'imported')

const matchingRows = buildGoogleFontRows('int', false, [cachedInter, cachedCustom, importedAptos])
assert.equal(matchingRows[0]?.family, 'Inter')
assert.equal(matchingRows[0]?.managedFont, cachedInter, 'cached Google fonts are attached to their catalog row')

const customRows = buildGoogleFontRows('Newsreader', false, [cachedCustom])
assert.deepEqual(customRows.map(row => row.family), ['Newsreader'])
assert.equal(customRows[0]?.custom, true, 'an exact typed family remains an explicit download action')
assert.equal(customRows[0]?.managedFont, cachedCustom)

const privateQueryRows = buildGoogleFontRows('quarterly private notes', false, [])
assert.equal(privateQueryRows[0]?.family, 'quarterly private notes')
assert.equal(privateQueryRows[0]?.managedFont, undefined, 'typed text never becomes a preview request')
assert.deepEqual(buildGoogleFontRows('quarterly private notes', true, []), [], 'the downloaded filter never invents remote rows')

assert.deepEqual(
    buildGoogleFontRows('', true, [importedAptos, cachedCustom, cachedInter]).map(row => row.family),
    ['Inter', 'Newsreader'],
    'the Google downloaded filter excludes imported files and stays sorted'
)
assert.deepEqual(getImportedFonts([cachedInter, importedAptos]).map(font => font.family), ['Aptos'])
assert.deepEqual(filterInstalledFonts(['Aptos', 'Consolas', 'Segoe UI'], 'segoe'), ['Segoe UI'])
assert.equal(shouldLoadInstalledFonts(true, 'installed', false), true, 'entering Installed starts its scan')
assert.equal(shouldLoadInstalledFonts(true, 'installed', true), false, 'rerenders do not restart the entry scan')
assert.equal(shouldLoadInstalledFonts(false, 'installed', false), false, 'a closed dialog never scans')
assert.equal(formatFontBytes(2048), '2 KB')
assert.equal(getLocalFontPreviewStack('Aptos";{}'), '"Aptos"')
assert.notEqual(getManagedFontPreviewAlias(cachedInter.id), getManagedFontPreviewAlias(cachedCustom.id))
assert.match(getManagedFontPreviewAlias(cachedInter.id), /^Zyra Preview /, 'preview aliases stay separate from persistent managed-font aliases')

console.log('Font manager model: source filtering, cached rows, private-query isolation, imported discovery and preview aliases: ok')

import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import { GoogleFontSource, InstalledFontSource, ManualFontSource } from './AppearanceFontManagerSources'
import { buildGoogleFontRows } from './font-manager-model'

const googleFont: DevScopeManagedFont = {
    id: 'google-inter-123',
    family: 'Inter',
    source: 'google',
    installedAt: '2026-01-01T00:00:00.000Z',
    sizeBytes: 2048,
    faces: [{ fileName: 'font.woff2', weight: '400', style: 'normal', format: 'woff2', sizeBytes: 2048 }]
}
const importedFont: DevScopeManagedFont = { ...googleFont, id: 'imported-newsreader-123', family: 'Newsreader', source: 'imported' }
const noOp = () => undefined
const actions = {
    target: 'ui' as const,
    busyKey: '',
    usedManagedFontIds: [importedFont.id],
    onUseManaged: noOp,
    onRemoveManaged: noOp
}

const googleMarkup = renderToStaticMarkup(
    <GoogleFontSource
        {...actions}
        rows={buildGoogleFontRows('Inter', false, [googleFont])}
        query="Inter"
        downloadedOnly={false}
        onQueryChange={noOp}
        onDownloadedOnlyChange={noOp}
        onDownload={noOp}
    />
)
assert.match(googleMarkup, /aria-pressed="false"/)
assert.match(googleMarkup, />Downloaded</)
assert.match(googleMarkup, /Loading preview/, 'cached Google fonts use the managed preview component')
assert.doesNotMatch(googleMarkup, /Browse installed|Downloaded source/)

const downloadedMarkup = renderToStaticMarkup(
    <GoogleFontSource
        {...actions}
        rows={buildGoogleFontRows('', true, [googleFont, importedFont])}
        query=""
        downloadedOnly
        onQueryChange={noOp}
        onDownloadedOnlyChange={noOp}
        onDownload={noOp}
    />
)
assert.match(downloadedMarkup, /aria-label="Remove Inter"/, 'downloaded Google fonts retain a removal path')
assert.doesNotMatch(downloadedMarkup, /Newsreader/, 'imported files do not leak into the Google filter')

const installedMarkup = renderToStaticMarkup(
    <InstalledFontSource
        fonts={['Aptos']}
        hasInstalledFonts
        query=""
        target="ui"
        busyKey=""
        onQueryChange={noOp}
        onRefresh={noOp}
        onUseLocal={noOp}
    />
)
assert.match(installedMarkup, /aria-label="Refresh installed fonts"/)
assert.match(installedMarkup, /font-family:&quot;Aptos&quot;/)
assert.doesNotMatch(installedMarkup, /Browse installed|load the font list/)

const manualMarkup = renderToStaticMarkup(
    <ManualFontSource
        {...actions}
        importedFonts={[importedFont]}
        manualFamily="Aptos"
        onManualFamilyChange={noOp}
        onImport={noOp}
        onUseLocal={noOp}
    />
)
assert.match(manualMarkup, />Choose file</)
assert.match(manualMarkup, /Installed family by name/)
assert.match(manualMarkup, /Imported fonts/)
assert.match(manualMarkup, /aria-label="Remove Newsreader"/, 'imported fonts remain discoverable and removable')
assert.match(manualMarkup, /disabled=""[^>]*aria-label="Remove Newsreader"/, 'fonts used by a theme keep their deletion guard')
assert.doesNotMatch(manualMarkup, /permission is declined|private font cache/, 'manual actions stay compact')

console.log('Font manager sources: Google filter, cached preview, installed refresh and compact manual/imported actions: ok')

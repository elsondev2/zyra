import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const desktopRoot = path.resolve(import.meta.dirname, '..', '..')
const repositoryRoot = path.resolve(desktopRoot, '..')
const noticePath = path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md')
const manifestPath = path.join(desktopRoot, 'src', 'renderer', 'src', 'assets', 'browser-backgrounds', 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const start = '<!-- browser-surface-third-party:start -->'
const end = '<!-- browser-surface-third-party:end -->'
const imageLines = manifest.assets.map((asset) => {
    const creator = asset.source.creator.name.replace(/\s+/g, ' ').trim()
    return `- [${asset.title}](${asset.source.pageUrl}) — ${creator}; [${asset.rights.name}](${asset.rights.url}); ${asset.modifications.join(', ').toLowerCase()}.`
})
const generated = `${start}
## Ghostery ad blocker

Zyra uses [Ghostery's embeddable ad blocker](https://github.com/ghostery/adblocker), including the Electron integration, to optionally apply EasyList/uBlock-compatible network, cosmetic, scriptlet, and annoyance rules inside Zyra Browser. Blocking is disabled by default. Ghostery Adblocker is copyright © 2017-present Ghostery GmbH and distributed under the [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/).

Filter data is fetched and cached at runtime from Ghostery's prebuilt subscriptions. Those lists retain their respective authorship and license terms; Zyra does not relicense them.

## CastLabs Electron for Content Security

Zyra uses [CastLabs Electron for Content Security](https://github.com/castlabs/electron-releases) as its Electron distribution so users can install Google Widevine through Chromium's component updater for protected media playback. CastLabs Electron is copyright © 2017-2025 castLabs GmbH and distributed under the MIT License.

Zyra does not bundle or redistribute the Widevine CDM. When protected-media support is available, the CDM is downloaded directly through Google's component service and remains subject to Google's terms. Production Windows and macOS packages require CastLabs EVS VMP signing.

## Bundled New Tab nature backgrounds

Zyra includes 45 separately licensed images sourced from Wikimedia Commons. The files were resized, converted to WebP, and stripped of metadata for the bundled background pack. The licenses below apply to the individual images, independently of Zyra's Apache-2.0 source-code license. Share-alike images remain available under the indicated Creative Commons license.

${imageLines.join('\n')}
${end}`

const current = await readFile(noticePath, 'utf8')
const startIndex = current.indexOf(start)
const endIndex = current.indexOf(end)
const next = startIndex >= 0 && endIndex > startIndex
    ? current.slice(0, startIndex) + generated + current.slice(endIndex + end.length)
    : current.trimEnd() + '\n\n' + generated + '\n'
await writeFile(noticePath, next, 'utf8')
console.log(`Updated ${path.relative(repositoryRoot, noticePath)} with ${manifest.assets.length} image notices.`)

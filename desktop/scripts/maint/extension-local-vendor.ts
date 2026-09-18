import { copyFile, cp, mkdir, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { Plugin } from 'vite'

export function isExtensionVendor(id: string): boolean {
    return id === 'mermaid' || id === 'monaco-editor' || /^@shikijs\/(langs|themes)(\/|$)/.test(id)
}

export function extensionVendorPath(id: string): string {
    if (id === 'mermaid') return '../vendor/mermaid/mermaid.esm.min.mjs'
    if (id === 'monaco-editor') return '../vendor/monaco/monaco.js'
    const match = /^@shikijs\/(langs|themes)(?:\/(.+))?$/.exec(id)
    if (!match) return id
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../node_modules/@shikijs', match[1], 'package.json'),'utf8'))
    const entry = manifest.exports[match[2] ? `./${match[2]}` : '.']
    if (typeof entry !== 'string' || !entry.startsWith('./dist/')) throw new Error(`Unsupported local vendor export: ${id}`)
    return `../vendor/shikijs/${match[1]}/${entry.slice(7)}`
}

/** Mermaid ships a self-contained browser ESM distribution. Keeping it intact
 * avoids re-parsing its large diagram engines in the application graph. */
export function extensionLocalVendor(): Plugin {
    let outputDirectory = ''
    let desktopRoot = ''
    return {
        name: 'zyra-extension-local-vendor',
        apply: 'build',
        configResolved(config) {
            desktopRoot = resolve(config.root, '../..')
            outputDirectory = resolve(config.root, config.build.outDir, 'vendor/mermaid')
        },
        transformIndexHtml() {
            return [{tag:'link', attrs:{rel:'stylesheet',href:'./vendor/monaco/monaco.css'},injectTo:'head'}]
        },
        async writeBundle() {
            const source = join(desktopRoot, 'node_modules/mermaid/dist')
            const chunkDirectory = 'chunks/mermaid.esm.min'
            await mkdir(join(outputDirectory, chunkDirectory), { recursive:true })
            await copyFile(join(source, 'mermaid.esm.min.mjs'), join(outputDirectory, 'mermaid.esm.min.mjs'))
            for (const name of await readdir(join(source, chunkDirectory))) {
                if (name.endsWith('.mjs')) await copyFile(join(source, chunkDirectory, name), join(outputDirectory, chunkDirectory, name))
            }
            const vendor = resolve(outputDirectory, '..')
            await cp(resolve(desktopRoot, '../extensions/zyra-browser-control/dist/browser-vendor/monaco'), join(vendor,'monaco'), {recursive:true})
            for (const group of ['langs','themes']) {
                const directory = join(desktopRoot,'node_modules/@shikijs',group,'dist')
                const destination = join(vendor,'shikijs',group)
                await mkdir(destination,{recursive:true})
                for (const file of await readdir(directory)) {
                    if (file.endsWith('.mjs')) await copyFile(join(directory,file),join(destination,file))
                }
            }
        }
    }
}

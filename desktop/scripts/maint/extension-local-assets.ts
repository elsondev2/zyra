import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** Ship the same file icons and fonts locally for Chrome's extension policy. */
export function extensionLocalAssets(): Plugin {
    let desktopRoot = ''
    let outputDirectory = ''
    return {
        name: 'zyra-extension-local-assets', enforce: 'pre', apply: 'build',
        configResolved(config) {
            desktopRoot = resolve(config.root, '../..')
            outputDirectory = resolve(config.root, config.build.outDir)
        },
        transform(code, id) {
            if (!id.replace(/\\/g, '/').endsWith('/src/renderer/src/index.css')) return
            return code.replace(/^@import url\('https:\/\/fonts\.googleapis\.com\/[^']+'\);\s*/, '')
        },
        transformIndexHtml() {
            return [{tag: 'link', attrs: {rel: 'stylesheet', href: '../fonts.css'}, injectTo: 'head'}]
        },
        async writeBundle() {
            await cp(resolve(desktopRoot, 'node_modules/material-icon-theme/icons'), resolve(outputDirectory, 'material-icons'), {recursive: true})
        }
    }
}

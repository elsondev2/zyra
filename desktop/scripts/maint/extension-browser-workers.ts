import { readFileSync } from 'node:fs'
import { access, cp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Plugin } from 'vite'

type WorkerSpec = {entry:string; import?:string}
/** Keep large worker graphs out of the main renderer build. Their exact source
 * entries are bundled serially before Vite starts, and copied into the package. */
export function extensionBrowserWorkers(): Plugin {
    let specs: Record<string,WorkerSpec> = {}
    let staging = ''
    let destination = ''
    const prefix = '\0zyra-extension-worker:'
    return {
        name:'zyra-extension-browser-workers', enforce:'pre', apply:'build',
        configResolved(config) {
            const extensionRoot = resolve(config.root, '../../../extensions/zyra-browser-control')
            specs = JSON.parse(readFileSync(join(extensionRoot, 'scripts/browser-workers.json'),'utf8'))
            staging = join(extensionRoot, 'dist/browser-workers')
            destination = resolve(config.root, config.build.outDir, 'workers')
        },
        resolveId(source) {
            if (!source.endsWith('?worker')) return
            const entry = source.slice(0,-7).replace(/\\/g,'/')
            const match = Object.entries(specs).find(([,spec]) => entry === spec.import || entry.endsWith(spec.entry))
            return match ? `${prefix}${match[0]}` : undefined
        },
        load(id) {
            if (!id.startsWith(prefix)) return
            const file = JSON.stringify(`../workers/${id.slice(prefix.length)}.js`)
            return `export default function(options) { const file = ${file}; return new Worker(new URL(/* @vite-ignore */ file, import.meta.url), {...options, type:'module'}); }`
        },
        async writeBundle() {
            for (const name of Object.keys(specs)) await access(join(staging, `${name}.js`))
            await cp(staging, destination, {recursive:true})
        }
    }
}

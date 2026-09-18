import { resolve } from 'node:path'
import { extensionLocalAssets } from './scripts/maint/extension-local-assets'
import { extensionBrowserWorkers } from './scripts/maint/extension-browser-workers'
import { extensionLocalVendor, isExtensionVendor, extensionVendorPath } from './scripts/maint/extension-local-vendor'
import { mergeConfig } from 'vite'
import browserConfig from './vite.browser.config'
export default mergeConfig(browserConfig, {
    plugins: [extensionBrowserWorkers(), extensionLocalVendor(), extensionLocalAssets()],
    build: {
        outDir: resolve(__dirname, '../extensions/zyra-browser-control/dist/unpacked/chat'),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'src/renderer/extension.html'),
            external: isExtensionVendor,
            output: { paths: extensionVendorPath }
        }
    }
})

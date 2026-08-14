import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { browserAssistantBridgeProxyPlugin } from './scripts/maint/browser-assistant-bridge-proxy'

const projectRoot = resolve(__dirname)
const rendererRoot = resolve(__dirname, 'src/renderer')
const desktopVersion = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version

export default defineConfig({
    main: {
        plugins: [
            externalizeDepsPlugin({
                include: ['node-pty']
            })
        ],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts')
                }
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts')
                }
            }
        }
    },
    renderer: {
        root: rendererRoot,
        define: {
            __ZYRA_DESKTOP_VERSION__: JSON.stringify(desktopVersion)
        },
        optimizeDeps: {
            include: ['@pierre/diffs', '@pierre/diffs/react', '@pierre/diffs/worker/worker.js']
        },
        worker: {
            format: 'es'
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(rendererRoot, 'index.html')
                }
            }
        },
        plugins: [react(), browserAssistantBridgeProxyPlugin()],
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src/renderer/src'),
                '@shared': resolve(__dirname, 'src/shared'),
                react: resolve(__dirname, 'node_modules/react'),
                'react-dom': resolve(__dirname, 'node_modules/react-dom'),
                'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
                'react/jsx-dev-runtime': resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js')
            }
        },
        server: {
            port: 5174,
            hmr: { clientPort: 5174 },
            fs: {
                allow: [
                    projectRoot
                ]
            }
        }
    }
})

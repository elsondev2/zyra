import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const desktop = resolve(import.meta.dirname, '..')
const seedPath = resolve(process.env.ZYRA_AGENT_DEMO_SEED || resolve(desktop, '../docs.local/reviews/agent-directory/seed.json'))
export default defineConfig({
    root: resolve(desktop, 'src/renderer'),
    cacheDir: resolve(desktop, 'node_modules/.cache/vite-agent-directory-review'),
    plugins: [react(), {
        name: 'private-agent-review-seed',
        configureServer(server) {
            server.middlewares.use('/__agent-review-seed', async (request, response) => {
                response.setHeader('Cache-Control', 'no-store')
                response.setHeader('Content-Type', 'application/json')
                if (request.method !== 'GET') { response.statusCode = 405; response.end(); return }
                try { response.end(await readFile(seedPath, 'utf8')) }
                catch { response.statusCode = 404; response.end(JSON.stringify({ error: 'Seed a local agent review snapshot first.' })) }
            })
        }
    }],
    define: { __ZYRA_DESKTOP_VERSION__: JSON.stringify('0.7.0-review') },
    resolve: { alias: { '@': resolve(desktop, 'src/renderer/src'), '@shared': resolve(desktop, 'src/shared') } },
    optimizeDeps: { entries: ['agents-review.html'], include: ['react', 'react-dom/client', 'lucide-react'] },
    css: { postcss: desktop },
    server: { host: '127.0.0.1', port: 5187, strictPort: true, fs: { allow: [desktop] } }
})

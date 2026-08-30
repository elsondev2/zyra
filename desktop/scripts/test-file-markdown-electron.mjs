import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import react from '@vitejs/plugin-react'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { createServer } from 'vite'
import tailwindConfig from '../tailwind.config.js'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))
const desktopDirectory = resolve(scriptsDirectory, '..')
const repositoryDirectory = resolve(desktopDirectory, '..')
const childScript = join(scriptsDirectory, 'test-file-markdown-electron-child.cjs')

const server = await createServer({
    root: desktopDirectory,
    configFile: false,
    logLevel: 'error',
    plugins: [react()],
    css: {
        postcss: {
            plugins: [
                tailwindcss({
                    ...tailwindConfig,
                    content: [
                        join(desktopDirectory, 'src/renderer/**/*.{js,ts,jsx,tsx,html}').replaceAll('\\', '/'),
                        join(desktopDirectory, 'scripts/fixtures/**/*.{tsx,html}').replaceAll('\\', '/')
                    ]
                }),
                autoprefixer()
            ]
        }
    },
    worker: { format: 'es' },
    resolve: {
        alias: {
            '@': join(desktopDirectory, 'src/renderer/src'),
            '@shared': join(desktopDirectory, 'src/shared'),
            react: join(desktopDirectory, 'node_modules/react'),
            'react-dom': join(desktopDirectory, 'node_modules/react-dom'),
            'react/jsx-runtime': join(desktopDirectory, 'node_modules/react/jsx-runtime.js'),
            'react/jsx-dev-runtime': join(desktopDirectory, 'node_modules/react/jsx-dev-runtime.js'),
            'decode-named-character-reference': join(desktopDirectory, 'node_modules/decode-named-character-reference/index.js')
        }
    },
    server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false
    }
})

function runElectron(testUrl) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(electronPath, [childScript], {
            cwd: desktopDirectory,
            env: {
                ...process.env,
                ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
                ZYRA_MARKDOWN_TEST_URL: testUrl
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
        child.stderr.on('data', (chunk) => {
            const value = chunk.toString()
            stderr += value
            if (process.env.ZYRA_MARKDOWN_TEST_DEBUG === '1') process.stderr.write(value)
        })
        const timeoutId = setTimeout(() => {
            child.kill()
            rejectPromise(new Error(`Electron Markdown regression timed out.\n${stderr}\n${stdout}`))
        }, 150_000)
        child.once('error', (error) => {
            clearTimeout(timeoutId)
            rejectPromise(error)
        })
        child.once('exit', (code) => {
            clearTimeout(timeoutId)
            if (code !== 0) {
                rejectPromise(new Error(`Electron Markdown regression failed (${code}).\n${stderr}\n${stdout}`))
                return
            }
            const jsonLine = stdout.trim().split(/\r?\n/).reverse().find((line) => line.startsWith('{'))
            if (!jsonLine) {
                rejectPromise(new Error(`Electron Markdown regression returned no result.\n${stderr}\n${stdout}`))
                return
            }
            resolvePromise(JSON.parse(jsonLine))
        })
    })
}

try {
    await server.listen()
    const address = server.resolvedUrls?.local?.[0]
    if (!address) throw new Error('The Markdown regression Vite server has no local URL.')
    const testUrl = new URL('scripts/fixtures/file-markdown-runtime.html', address).toString()
    if (process.env.ZYRA_MARKDOWN_TEST_DEBUG === '1') console.error(`markdown-test:url ${testUrl}`)
    const result = await runElectron(testUrl)
    if (process.env.ZYRA_MARKDOWN_TEST_DEBUG === '1') console.error(JSON.stringify(result, null, 2))
    const { initial, immediate, burst, settled, outlineNavigation, endBefore, endSettled, alternateDocument, restoredSourceLine, lateSectionOverlap } = result
    const expectedSourceCharacters = readFileSync(join(repositoryDirectory, 'AGENTS.md'), 'utf8').length

    assert.equal(initial.sourceCharacters, expectedSourceCharacters, 'the real repository AGENTS.md is the browser regression fixture')
    assert.equal(initial.workerFallbackSections, 0, 'the browser regression exercises rendered Markdown instead of source fallback')
    assert.ok(initial.scrollHeight > initial.clientHeight, 'the AGENTS.md preview has a real scroll range')
    assert.ok(immediate.scrollTop > initial.scrollTop, 'trusted wheel input moves the ordinary Markdown viewport promptly')
    assert.ok(burst.scrollTop > immediate.scrollTop, 'repeated wheel input continues moving instead of being swallowed')
    assert.ok(settled.scrollTop >= burst.scrollTop, 'the viewport does not jump backward after wheel input')
    assert.equal(settled.pendingAnimationFrames, 0, 'Markdown owns no persistent JavaScript animation loop after scrolling')
    assert.equal(settled.indexedSearchCalls, 0, 'automatic AGENTS.md references never start project-wide indexing')
    assert.ok(settled.getPathInfoCalls <= 16, 'automatic direct reference checks stay bounded')
    assert.ok(outlineNavigation, 'the rendered Validation heading exists in the browser fixture')
    assert.ok(Math.abs(outlineNavigation.targetOffset) <= 2, 'Outline navigation aligns the exact Markdown heading with the viewport')
    assert.ok(Math.abs(endSettled.scrollTop - endBefore.scrollTop) <= 1, 'wheel input at the end quiesces without a retained target')
    assert.equal(endSettled.pendingAnimationFrames, 0, 'a nonmoving edge viewport leaves no animation work behind')
    assert.equal(alternateDocument.activeDocumentPath.endsWith('/ALTERNATE.md'), true, 'the browser fixture switched to a different Markdown file')
    assert.equal(alternateDocument.scrollTop, 0, 'a different Markdown file opens from its own top')
    assert.ok(Math.abs(restoredSourceLine.sourceLineAtViewport - 50) <= 1, 'returning to rendered Markdown restores the corresponding source line')
    assert.equal(typeof lateSectionOverlap, 'number', 'the README regression locates the real Project Shape section boundary')
    assert.ok(lateSectionOverlap <= 0.5, 'late Markdown section growth cannot overlap the following section')
    assert.ok(Math.max(0, ...endSettled.longTasks) < 500, 'wheel handling creates no browser long task')

    console.log(JSON.stringify({
        sourceCharacters: settled.sourceCharacters,
        immediateScrollTop: immediate.scrollTop,
        settledScrollTop: settled.scrollTop,
        scrollEvents: settled.scrollEvents,
        getPathInfoCalls: settled.getPathInfoCalls,
        indexedSearchCalls: settled.indexedSearchCalls,
        maximumPendingAnimationFrames: settled.maximumPendingAnimationFrames,
        maximumLongTaskMs: Math.max(0, ...endSettled.longTasks)
    }, null, 2))
    console.log('Electron AGENTS.md Markdown wheel regression: ok')
} finally {
    await Promise.race([
        server.close(),
        new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000))
    ])
}

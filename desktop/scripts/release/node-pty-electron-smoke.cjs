'use strict'

const pty = require('node-pty')

if (!process.versions.electron) {
    throw new Error('node-pty ABI smoke must run under Electron')
}

const marker = `ZYRA_NODE_PTY_${process.pid}`
const windows = process.platform === 'win32'
const shell = windows ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/sh')
const args = windows
    ? ['/d', '/s', '/c', `echo ${marker}`]
    : ['-lc', `printf '%s\\n' '${marker}'`]

const terminal = pty.spawn(shell, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
    useConpty: windows
})

let output = ''
const timer = setTimeout(() => {
    try { terminal.kill() } catch {}
    process.stderr.write(`node-pty Electron smoke timed out; output=${JSON.stringify(output)}\n`)
    process.exit(1)
}, 15_000)

timer.unref?.()
terminal.onData((chunk) => {
    output += chunk
})
terminal.onExit(({ exitCode }) => {
    clearTimeout(timer)
    if (!output.includes(marker)) {
        process.stderr.write(`node-pty exited before producing its marker (exit ${exitCode}); output=${JSON.stringify(output)}\n`)
        process.exit(1)
    }
    process.stdout.write(JSON.stringify({
        electron: process.versions.electron,
        node: process.versions.node,
        modules: process.versions.modules,
        napi: process.versions.napi,
        platform: process.platform,
        arch: process.arch
    }) + '\n')
    process.exit(0)
})

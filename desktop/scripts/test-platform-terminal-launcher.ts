import assert from 'node:assert/strict'
import { buildLinuxTerminalLaunchCommands, buildMacTerminalScript } from '../src/main/ipc/handlers/platform-terminal-launcher'

const macScript = buildMacTerminalScript({
    cwd: "/Users/elson/Project's work",
    initialCommand: 'npm test',
    shellPath: '/bin/zsh'
})
assert.match(macScript, /^#!\/bin\/sh/m)
assert.match(macScript, /cd -- '\/Users\/elson\/Project'"'"'s work'/)
assert.match(macScript, /npm test/)
assert.match(macScript, /exec '\/bin\/zsh' -l/)
assert.equal(macScript.includes('powershell'), false)

const linux = buildLinuxTerminalLaunchCommands({
    cwd: '/home/elson/my project',
    initialCommand: 'bun test',
    shellPath: '/bin/bash'
})
assert.deepEqual(linux.map((entry) => entry.executable), [
    'x-terminal-emulator',
    'gnome-terminal',
    'konsole',
    'xterm'
])
for (const candidate of linux) {
    assert(candidate.args.some((argument) => argument.includes("cd -- '/home/elson/my project'")))
    assert(candidate.args.some((argument) => argument.includes('bun test')))
    assert(candidate.args.some((argument) => argument.includes("exec '/bin/bash' -l")))
}

const defaultShell = buildLinuxTerminalLaunchCommands({ cwd: '/tmp/project' })
assert(defaultShell[0].args.includes('/bin/bash'))

console.log('Platform terminal launcher: ok')

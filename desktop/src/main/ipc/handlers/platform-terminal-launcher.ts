export type TerminalLaunchCommand = {
    executable: string
    args: string[]
}

function quotePosix(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function buildMacTerminalScript(input: {
    cwd: string
    initialCommand: string
    shellPath?: string
}): string {
    const shellPath = input.shellPath?.trim() || '/bin/zsh'
    return [
        '#!/bin/sh',
        `cd -- ${quotePosix(input.cwd)}`,
        input.initialCommand.trim(),
        `exec ${quotePosix(shellPath)} -l`,
        ''
    ].join('\n')
}

export function buildLinuxTerminalLaunchCommands(input: {
    cwd: string
    initialCommand?: string
    shellPath?: string
}): TerminalLaunchCommand[] {
    const shellPath = input.shellPath?.trim() || '/bin/bash'
    const initialCommand = input.initialCommand?.trim()
    const sessionParts = [
        `cd -- ${quotePosix(input.cwd)}`,
        ...(initialCommand ? [initialCommand] : []),
        `exec ${quotePosix(shellPath)} -l`
    ]
    const sessionCommand = sessionParts.join('; ')

    return [
        { executable: 'x-terminal-emulator', args: ['-e', shellPath, '-lc', sessionCommand] },
        { executable: 'gnome-terminal', args: [`--working-directory=${input.cwd}`, '--', shellPath, '-lc', sessionCommand] },
        { executable: 'konsole', args: ['--workdir', input.cwd, '-e', shellPath, '-lc', sessionCommand] },
        { executable: 'xterm', args: ['-e', shellPath, '-lc', sessionCommand] }
    ]
}

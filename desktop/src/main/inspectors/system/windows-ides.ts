import { spawn } from 'child_process'
import { access, readdir, stat } from 'fs/promises'
import { join } from 'path'
import log from 'electron-log'
import type { DevScopeInstalledIde } from '../../../shared/contracts/devscope-api'

type IdeSearchSpec = {
    parents: string[]
    matchers: RegExp[]
    relativeExecutable: string
}

type IdeDefinition = DevScopeInstalledIde & {
    directCandidates: string[]
    searches?: IdeSearchSpec[]
    buildArgs?: (projectPath: string) => string[]
    launchInProjectDirectory?: boolean
}

type ResolvedIde = DevScopeInstalledIde & {
    executablePath: string
}

const LOCAL_APP_DATA = process.env.LOCALAPPDATA || ''
const PROGRAM_FILES = process.env.PROGRAMFILES || 'C:\\Program Files'
const PROGRAM_FILES_X86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
const JETBRAINS_TOOLBOX_SCRIPTS = join(LOCAL_APP_DATA, 'JetBrains', 'Toolbox', 'scripts')

function withToolboxScript(scriptName: string): string[] {
    return [join(JETBRAINS_TOOLBOX_SCRIPTS, scriptName)]
}

const IDE_DEFINITIONS: IdeDefinition[] = [
    {
        id: 'vscode',
        name: 'VS Code',
        icon: 'vscode',
        color: '#007ACC',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
            join(PROGRAM_FILES, 'Microsoft VS Code', 'Code.exe'),
            join(PROGRAM_FILES_X86, 'Microsoft VS Code', 'Code.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'kiro',
        name: 'Kiro',
        icon: 'kiro',
        color: '#49E6A1',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Kiro', 'bin', 'kiro.cmd'),
            join(LOCAL_APP_DATA, 'Programs', 'Kiro', 'Kiro.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'antigravity',
        name: 'Antigravity',
        icon: 'antigravity',
        color: '#7BF8B0',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Antigravity', 'bin', 'antigravity.cmd'),
            join(LOCAL_APP_DATA, 'Programs', 'Antigravity', 'Antigravity.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'vscode-insiders',
        name: 'VS Code Insiders',
        icon: 'vscode',
        color: '#24BFA5',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
            join(PROGRAM_FILES, 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
            join(PROGRAM_FILES_X86, 'Microsoft VS Code Insiders', 'Code - Insiders.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'cursor',
        name: 'Cursor',
        icon: 'cursor',
        color: '#FFFFFF',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'cursor', 'Cursor.exe'),
            join(PROGRAM_FILES, 'Cursor', 'Cursor.exe'),
            join(PROGRAM_FILES, 'cursor', 'Cursor.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'warp',
        name: 'Warp',
        icon: 'warp',
        color: '#01A4FF',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Warp', 'bin', 'warp.cmd'),
            join(LOCAL_APP_DATA, 'Programs', 'Warp', 'Warp.exe'),
            join(LOCAL_APP_DATA, 'Programs', 'warp', 'bin', 'warp.cmd'),
            join(LOCAL_APP_DATA, 'Programs', 'warp', 'Warp.exe')
        ],
        launchInProjectDirectory: true
    },
    {
        id: 'windsurf',
        name: 'Windsurf',
        icon: 'windsurf',
        color: '#09B6A2',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Windsurf', 'Windsurf.exe'),
            join(PROGRAM_FILES, 'Windsurf', 'Windsurf.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'trae',
        name: 'Trae',
        icon: 'trae',
        color: '#00E599',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Trae', 'Trae.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'vscodium',
        name: 'VSCodium',
        icon: 'vscodium',
        color: '#2F80ED',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'VSCodium', 'VSCodium.exe'),
            join(PROGRAM_FILES, 'VSCodium', 'VSCodium.exe'),
            join(PROGRAM_FILES_X86, 'VSCodium', 'VSCodium.exe')
        ],
        buildArgs: (projectPath) => ['--reuse-window', projectPath]
    },
    {
        id: 'zed',
        name: 'Zed',
        icon: 'zed',
        color: '#084CCF',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Zed', 'Zed.exe'),
            join(PROGRAM_FILES, 'Zed', 'Zed.exe')
        ]
    },
    {
        id: 'sublime-text',
        name: 'Sublime Text',
        icon: 'sublimetext',
        color: '#FF9800',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Sublime Text', 'sublime_text.exe'),
            join(PROGRAM_FILES, 'Sublime Text', 'sublime_text.exe'),
            join(PROGRAM_FILES_X86, 'Sublime Text', 'sublime_text.exe')
        ]
    },
    {
        id: 'fleet',
        name: 'JetBrains Fleet',
        icon: 'jetbrains',
        color: '#7F52FF',
        directCandidates: [
            ...withToolboxScript('fleet.cmd'),
            join(LOCAL_APP_DATA, 'Programs', 'Fleet', 'Fleet.exe'),
            join(PROGRAM_FILES, 'Fleet', 'Fleet.exe')
        ]
    },
    {
        id: 'webstorm',
        name: 'WebStorm',
        icon: 'webstorm',
        color: '#07C3F2',
        directCandidates: [
            ...withToolboxScript('webstorm.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^WebStorm/i],
                relativeExecutable: join('bin', 'webstorm64.exe')
            }
        ]
    },
    {
        id: 'intellij',
        name: 'IntelliJ IDEA',
        icon: 'intellijidea',
        color: '#F97A12',
        directCandidates: [
            ...withToolboxScript('idea.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^IntelliJ IDEA/i],
                relativeExecutable: join('bin', 'idea64.exe')
            }
        ]
    },
    {
        id: 'pycharm',
        name: 'PyCharm',
        icon: 'pycharm',
        color: '#21D789',
        directCandidates: [
            ...withToolboxScript('pycharm.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^PyCharm/i],
                relativeExecutable: join('bin', 'pycharm64.exe')
            }
        ]
    },
    {
        id: 'rider',
        name: 'Rider',
        icon: 'rider',
        color: '#FE2857',
        directCandidates: [
            ...withToolboxScript('rider.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^Rider/i],
                relativeExecutable: join('bin', 'rider64.exe')
            }
        ]
    },
    {
        id: 'clion',
        name: 'CLion',
        icon: 'clion',
        color: '#22D88F',
        directCandidates: [
            ...withToolboxScript('clion.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^CLion/i],
                relativeExecutable: join('bin', 'clion64.exe')
            }
        ]
    },
    {
        id: 'goland',
        name: 'GoLand',
        icon: 'goland',
        color: '#00ADD8',
        directCandidates: [
            ...withToolboxScript('goland.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^GoLand/i],
                relativeExecutable: join('bin', 'goland64.exe')
            }
        ]
    },
    {
        id: 'phpstorm',
        name: 'PhpStorm',
        icon: 'phpstorm',
        color: '#AF50FF',
        directCandidates: [
            ...withToolboxScript('phpstorm.cmd')
        ],
        searches: [
            {
                parents: [
                    join(LOCAL_APP_DATA, 'Programs'),
                    join(PROGRAM_FILES, 'JetBrains'),
                    PROGRAM_FILES,
                    join(PROGRAM_FILES_X86, 'JetBrains')
                ],
                matchers: [/^PhpStorm/i],
                relativeExecutable: join('bin', 'phpstorm64.exe')
            }
        ]
    },
    {
        id: 'android-studio',
        name: 'Android Studio',
        icon: 'androidstudio',
        color: '#3DDC84',
        directCandidates: [
            join(LOCAL_APP_DATA, 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
            join(PROGRAM_FILES, 'Android', 'Android Studio', 'bin', 'studio64.exe')
        ]
    }
]

async function pathExists(candidatePath: string): Promise<boolean> {
    if (!candidatePath) return false
    try {
        await access(candidatePath)
        return true
    } catch {
        return false
    }
}

async function findFirstExistingPath(paths: string[]): Promise<string | null> {
    for (const candidate of paths) {
        if (await pathExists(candidate)) {
            return candidate
        }
    }
    return null
}

async function findSearchMatch(search: IdeSearchSpec): Promise<string | null> {
    for (const parent of search.parents) {
        if (!parent || !(await pathExists(parent))) continue
        try {
            const directoryEntries = await readdir(parent, { withFileTypes: true })
            const matchingDirectories = directoryEntries
                .filter((entry) => entry.isDirectory() && search.matchers.some((matcher) => matcher.test(entry.name)))
                .map((entry) => entry.name)
                .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' }))

            for (const directoryName of matchingDirectories) {
                const executablePath = join(parent, directoryName, search.relativeExecutable)
                if (await pathExists(executablePath)) {
                    return executablePath
                }
            }
        } catch (err) {
            log.debug('IDE directory scan failed:', parent, err)
        }
    }
    return null
}

async function resolveIde(definition: IdeDefinition): Promise<ResolvedIde | null> {
    const directHit = await findFirstExistingPath(definition.directCandidates)
    if (directHit) {
        return { ...definition, executablePath: directHit }
    }

    for (const search of definition.searches || []) {
        const searchHit = await findSearchMatch(search)
        if (searchHit) {
            return { ...definition, executablePath: searchHit }
        }
    }

    return null
}

async function resolveInstalledIdes(): Promise<ResolvedIde[]> {
    if (process.platform !== 'win32') return []

    const resolved = await Promise.all(IDE_DEFINITIONS.map((definition) => resolveIde(definition)))
    return resolved
        .filter((ide): ide is ResolvedIde => Boolean(ide))
        .sort((left, right) => left.name.localeCompare(right.name))
}

function toPublicIde(ide: ResolvedIde): DevScopeInstalledIde {
    return {
        id: ide.id,
        name: ide.name,
        icon: ide.icon,
        color: ide.color
    }
}

function getLaunchCommand(executablePath: string, args: string[]): { command: string; args: string[] } {
    if (/\.(cmd|bat)$/i.test(executablePath)) {
        return {
            command: 'cmd.exe',
            args: ['/c', executablePath, ...args]
        }
    }

    return { command: executablePath, args }
}

export async function getInstalledIdes(): Promise<DevScopeInstalledIde[]> {
    const ides = await resolveInstalledIdes()
    return ides.map(toPublicIde)
}

export async function launchProjectInIde(projectPath: string, ideId: string) {
    if (process.platform !== 'win32') {
        return { success: false as const, error: 'IDE launching is currently available on Windows only.' }
    }

    const normalizedProjectPath = String(projectPath || '').trim()
    if (!normalizedProjectPath) {
        return { success: false as const, error: 'Project path is required.' }
    }

    try {
        const targetStats = await stat(normalizedProjectPath)
        if (!targetStats.isDirectory()) {
            return { success: false as const, error: 'Project path must be a directory.' }
        }
    } catch {
        return { success: false as const, error: 'Project path does not exist.' }
    }

    const ide = (await resolveInstalledIdes()).find((entry) => entry.id === ideId)
    if (!ide) {
        return { success: false as const, error: 'Selected IDE is not installed.' }
    }

    const definition = IDE_DEFINITIONS.find((entry) => entry.id === ideId)
    const launchArgs = definition?.buildArgs
        ? definition.buildArgs(normalizedProjectPath)
        : definition?.launchInProjectDirectory
            ? []
            : [normalizedProjectPath]
    const launchCommand = getLaunchCommand(ide.executablePath, launchArgs)

    return await new Promise<{ success: true; ide: DevScopeInstalledIde } | { success: false; error: string }>((resolve) => {
        const child = spawn(launchCommand.command, launchCommand.args, {
            cwd: definition?.launchInProjectDirectory ? normalizedProjectPath : undefined,
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
        })

        child.once('error', (err) => {
            log.error('Failed to launch IDE:', ide.name, err)
            resolve({ success: false, error: err?.message || `Failed to open ${ide.name}.` })
        })

        child.once('spawn', () => {
            child.unref()
            resolve({ success: true, ide: toPublicIde(ide) })
        })
    })
}

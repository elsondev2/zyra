import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

export function resolveDesktopAgentServerNamespace(userDataPath: string, options: { stateDirectory?: string; channel?: string } = {}) {
    return {
        stateDirectory: resolve(options.stateDirectory || join(userDataPath, 'assistant', 'agent-server')),
        channel: String(options.channel || 'desktop').trim().toLowerCase()
    }
}
export function desktopNamespaceId(userDataPath: string): string {
    const { stateDirectory, channel } = resolveDesktopAgentServerNamespace(userDataPath)
    return createHash('sha256').update(`${process.platform === 'win32' ? stateDirectory.toLowerCase() : stateDirectory}\0${channel}`).digest('hex').slice(0, 20)
}
let terminalEnvironment: Record<string, string> = {}
export function configureDesktopTerminalEnvironment(userDataPath: string): void {
    const namespace = resolveDesktopAgentServerNamespace(userDataPath)
    terminalEnvironment = { ZYRA_STATE_DIR: namespace.stateDirectory, ZYRA_AGENT_SERVER_CHANNEL: namespace.channel }
}
/** Discovery only. Never include Desktop authority secrets in a terminal environment. */
export function desktopTerminalEnvironment(): Record<string, string> { return { ...terminalEnvironment } }

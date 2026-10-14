import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildMetadata, isPreviewDistribution } from '../../shared/distribution-identity'

/** Apply before services/workers start so Preview cannot share stable memory or consent. */
export function configurePreviewDataEnvironment(userDataPath: string, env = process.env, metadata = buildMetadata): void {
    if (!isPreviewDistribution(metadata)) return
    env.ZYRA_DATA_ROOT = join(userDataPath, 'runtime-data')
    env.ZYRA_STATE_DIR = join(userDataPath, 'assistant', 'agent-server')
}

/** Match the agent-server data root, independently of the installed code location. */
export function resolveZyraDataRoot(): string {
    return resolve(process.env.ZYRA_DATA_ROOT || homedir())
}

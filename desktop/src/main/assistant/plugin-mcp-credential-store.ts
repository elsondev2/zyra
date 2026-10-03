import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { writeBytesAtomically } from '../setup/atomic-json'

export type PluginMcpCredentialRecord = {
    approvedDigest?: string
    descriptorDigest?: string
    gmailApiVerified?: boolean
    calendarApiVerified?: boolean
    driveApiVerified?: boolean
    issuers?: Record<string, { client?: unknown; tokens?: unknown }>
}

type Encryption = {
    isAvailable(): boolean
    encrypt(value: string): Buffer
    decrypt(value: Buffer): string
}

type StoreFile = { version: 1; records: Record<string, PluginMcpCredentialRecord> }

export function pluginMcpCredentialKey(pluginId: string, serverName: string, descriptor: unknown): string {
    if (!pluginId || !serverName) throw new Error('Plugin and MCP server identity are required.')
    return createHash('sha256').update(JSON.stringify([pluginId, serverName, descriptor])).digest('hex')
}

function parseStore(value: unknown): StoreFile {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MCP credential store is invalid.')
    const candidate = value as Partial<StoreFile>
    if (candidate.version !== 1 || !candidate.records || typeof candidate.records !== 'object' || Array.isArray(candidate.records)) {
        throw new Error('MCP credential store version is unsupported.')
    }
    return { version: 1, records: candidate.records }
}

/** Separate from Zyra's account keys; only encrypted bytes ever touch disk. */
export class PluginMcpCredentialStore {
    private readonly filePath: string
    private readonly encryption: Encryption
    private queue: Promise<unknown> = Promise.resolve()

    constructor(filePath: string, encryption: Encryption) {
        this.filePath = filePath
        this.encryption = encryption
    }

    private async read(): Promise<StoreFile> {
        if (!this.encryption.isAvailable()) throw new Error('OS-encrypted storage is unavailable for Plugin MCP sign-in.')
        try {
            const encrypted = await readFile(this.filePath)
            if (encrypted.length > 2 * 1024 * 1024) throw new Error('MCP credential store exceeds its limit.')
            return parseStore(JSON.parse(this.encryption.decrypt(encrypted)))
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { version: 1, records: {} }
            throw error
        }
    }

    async get(key: string): Promise<PluginMcpCredentialRecord | null> {
        // A rejected/cancelled update leaves the last atomic file intact.
        // Wait for it to settle, but do not poison all later credential reads.
        await this.queue.catch(() => undefined)
        return structuredClone((await this.read()).records[key] || null)
    }

    async update(key: string, change: (current: PluginMcpCredentialRecord) => PluginMcpCredentialRecord | null): Promise<void> {
        const operation = this.queue.catch(() => undefined).then(async () => {
            const store = await this.read()
            const next = change(structuredClone(store.records[key] || {}))
            if (next) store.records[key] = next
            else delete store.records[key]
            const plaintext = JSON.stringify(store)
            if (Buffer.byteLength(plaintext, 'utf8') > 2 * 1024 * 1024) throw new Error('MCP credential store exceeds its limit.')
            await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
            await writeBytesAtomically(this.filePath, this.encryption.encrypt(plaintext))
        })
        this.queue = operation
        await operation
    }

    async disconnect(key: string): Promise<void> { await this.update(key, () => null) }
}

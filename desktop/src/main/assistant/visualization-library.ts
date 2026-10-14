import { realpath } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { createVisualizationStore } from '../../../../src/visualizations/store.mjs'
import {
    extractLegacyVisualizationSources,
    parseVisualizationReferences,
    validateVisualizationSource,
    type VisualizationResource,
} from '../../../../src/visualizations/resources.mjs'

export type VisualizationMessageCandidate = {
    cursor: number
    id: string
    text: string
    createdAt: string
    turnId?: string | null
}
export type VisualizationLibraryContext = {
    cwd: string
    threadId: string
    canImport?: boolean
    readRoots?: string[]
}
export async function resolveVisualizationLibraryContext(
    input: VisualizationLibraryContext & {
        roots?: Array<{ path: string; access: string }>
    },
): Promise<VisualizationLibraryContext> {
    const actual = await realpath(input.cwd)
    let canImport = true
    for (const root of input.roots || []) {
        if (root.access !== 'read-only') continue
        // Fail closed if an associated read-only root cannot be resolved.
        const readonly = await realpath(root.path).catch(() => null)
        if (!readonly) {
            canImport = false
            continue
        }
        const within = relative(readonly, actual)
        if (
            !within ||
            (!isAbsolute(within) &&
                within !== '..' &&
                !within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
        )
            canImport = false
    }
    const readRoots = await Promise.all(
        (input.readRoots || []).slice(0, 20).map((root) => realpath(root).catch(() => null)),
    )
    return {
        cwd: actual,
        threadId: input.threadId,
        canImport,
        readRoots: [...new Set(readRoots.filter((root): root is string => Boolean(root)))],
    }
}
export type VisualizationCandidateReader = (
    after: number,
    limit: number,
) => Promise<VisualizationMessageCandidate[]>

/** Main-owned ingestion. A renderer supplies a known thread ID, never a filesystem path. */
export class VisualizationLibrary {
    private readonly scans = new Map<
        string,
        {
            cursor: number
            referenced: Set<string>
            skipped: Set<string>
            hasMore: boolean
            canImport: boolean
            pending?: Promise<void>
        }
    >()

    status(context: VisualizationLibraryContext) {
        const scan = this.scans.get(`${context.cwd}\u0000${context.threadId}`)
        return {
            skippedCount: scan?.skipped.size || 0,
            indexingOlder: scan?.hasMore || false,
            readOnly: context.canImport === false,
        }
    }

    async importMessage(
        context: VisualizationLibraryContext,
        message: {
            id: string
            text: string
            createdAt: string
            turnId?: string | null
        },
    ) {
        const skipped: string[] = []
        if (
            context.canImport === false ||
            (!message.text.includes('visualization') && !message.text.includes('mermaid'))
        )
            return skipped
        const store = createVisualizationStore(context)
        for (const block of extractLegacyVisualizationSources(message.text)) {
            try {
                validateVisualizationSource(block.kind, block.source, { legacy: true })
            } catch {
                skipped.push(`${message.id}:${block.offset}`)
                continue
            }
            await store.importLegacy({
                ...block,
                origin: {
                    threadId: context.threadId,
                    messageId: message.id,
                    offset: block.offset,
                    ...(message.turnId ? { turnId: message.turnId } : {}),
                },
                createdAt: message.createdAt,
            })
        }
        return skipped
    }

    async list(
        context: VisualizationLibraryContext,
        readCandidates: VisualizationCandidateReader,
        scope: 'thread' | 'project' = 'thread',
    ) {
        const key = `${context.cwd}\u0000${context.threadId}`
        let scan = this.scans.get(key)
        const canImport = context.canImport !== false
        if (scan && scan.canImport !== canImport) {
            await scan.pending
            scan = undefined
        }
        if (!scan) {
            scan = {
                cursor: 0,
                referenced: new Set(),
                skipped: new Set(),
                hasMore: false,
                canImport,
            }
            this.scans.set(key, scan)
            // Session switching must not retain an unbounded history cache.
            if (this.scans.size > 48) this.scans.delete(this.scans.keys().next().value!)
        }
        const state = scan
        if (!state.pending) {
            state.pending = (async () => {
                // Bounded batches yield between disk writes; later opens continue older indexing.
                for (let batch = 0; batch < 8; batch++) {
                    const candidates = await readCandidates(state.cursor, 80)
                    state.hasMore = candidates.length === 80
                    for (const message of candidates) {
                        const skipped = await this.importMessage(context, message)
                        skipped.forEach((id) => {
                            if (state.skipped.size < 500) state.skipped.add(id)
                        })
                        for (const part of parseVisualizationReferences(message.text)) {
                            if (part.kind === 'reference' && part.state === 'complete') {
                                state.referenced.delete(part.id)
                                state.referenced.add(part.id)
                                if (state.referenced.size > 500)
                                    state.referenced.delete(state.referenced.values().next().value!)
                            }
                        }
                        state.cursor = message.cursor
                    }
                    if (candidates.length < 80) break
                }
            })().finally(() => {
                state.pending = undefined
            })
        }
        await state.pending
        const resources = await createVisualizationStore(context).list({
            threadOnly: scope === 'thread',
            metadataOnly: true,
        })
        if (scope === 'thread') {
            const known = new Set(resources.map((resource) => resource.id))
            for (const id of state.referenced) {
                if (known.has(id)) continue
                try {
                    const resource = await this.findResource(context, id, true)
                    if (resource) {
                        resources.push(resource)
                        known.add(id)
                    }
                } catch {
                    /* An unavailable reference stays visible as an error in its original message. */
                }
            }
        }
        return resources.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }

    private async findResource(
        context: VisualizationLibraryContext,
        id: string,
        metadataOnly = false,
    ) {
        for (const cwd of [...new Set([context.cwd, ...(context.readRoots || [])])].slice(0, 20)) {
            const store = createVisualizationStore({ ...context, cwd })
            const resource = metadataOnly ? await store.getMetadata(id) : await store.get(id)
            if (resource) return resource
        }
        return null
    }

    async get(
        context: VisualizationLibraryContext,
        id: string,
        version?: number,
    ): Promise<VisualizationResource> {
        const resource = await this.findResource(context, id)
        if (!resource)
            throw new Error('This saved visualization is unavailable in this Project or workspace.')
        if (
            version !== undefined &&
            (!Number.isSafeInteger(version) ||
                !resource.versions.some((revision) => revision.version === version))
        ) {
            throw new Error('This visualization version is unavailable.')
        }
        return resource
    }
}

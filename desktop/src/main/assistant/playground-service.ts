import { access, mkdir, stat } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import type { AssistantPlaygroundLab } from '../../shared/assistant/contracts'
import { createGit } from '../inspectors/git/core'
import { createAssistantId, nowIso, sanitizeOptionalPath } from './utils'

function ensureNonEmptyPath(value: string | null | undefined, label: string): string {
    const normalized = sanitizeOptionalPath(value)
    if (!normalized) throw new Error(`${label} is required.`)
    return resolve(normalized)
}

function sanitizeLabSlug(input: string): string {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'lab'
}

function sanitizeLabTitle(input?: string | null): string {
    const collapsed = String(input || '').trim().replace(/\s+/g, ' ').slice(0, 120)
    if (!collapsed) return ''
    return /[a-z0-9]/i.test(collapsed) ? collapsed : ''
}

function formatGeneratedLabTitle(folderName: string): string {
    const normalized = String(folderName || '')
        .trim()
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')

    if (!normalized) return 'Untitled Lab'

    return normalized.replace(/\b[a-z]/g, (match) => match.toUpperCase())
}

function isPathInside(parentPath: string, childPath: string): boolean {
    const relativePath = relative(parentPath, childPath)
    return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.includes(':'))
}

async function ensureDirectoryExists(directoryPath: string): Promise<void> {
    await mkdir(directoryPath, { recursive: true })
    const details = await stat(directoryPath)
    if (!details.isDirectory()) {
        throw new Error(`Expected a directory at ${directoryPath}.`)
    }
}

async function ensurePathExists(directoryPath: string): Promise<void> {
    await access(directoryPath)
}

async function ensureExistingDirectory(directoryPath: string): Promise<void> {
    await ensurePathExists(directoryPath)
    const details = await stat(directoryPath)
    if (!details.isDirectory()) {
        throw new Error(`Expected a directory at ${directoryPath}.`)
    }
}

async function chooseUniqueChildFolder(rootPath: string, preferredName: string): Promise<string> {
    const normalizedRoot = resolve(rootPath)
    const baseSlug = sanitizeLabSlug(preferredName)

    for (let index = 0; index < 1000; index += 1) {
        const suffix = index === 0 ? '' : `-${index + 1}`
        const candidate = join(normalizedRoot, `${baseSlug}${suffix}`)
        try {
            await access(candidate)
        } catch {
            return candidate
        }
    }

    throw new Error('Could not find an available folder name for the new Playground lab.')
}

export function derivePlaygroundLabTitle(input?: string | null, repoUrl?: string | null, existingFolderPath?: string | null): string {
    const explicit = sanitizeLabTitle(input)
    if (explicit) return explicit
    const repoCandidate = String(repoUrl || '').trim()
    if (repoCandidate) {
        const normalized = repoCandidate.replace(/\/+$/, '')
        const name = normalized.split('/').pop()?.replace(/\.git$/i, '').trim()
        if (name) return name
    }
    const existingFolderName = String(existingFolderPath || '').trim()
    if (existingFolderName) {
        const name = basename(existingFolderName)
        if (name) return name
    }
    return 'Untitled Lab'
}

export async function createPlaygroundLabRecord(params: {
    rootPath: string
    title?: string
    source: AssistantPlaygroundLab['source']
    repoUrl?: string
    existingFolderPath?: string
}): Promise<AssistantPlaygroundLab> {
    const rootPath = ensureNonEmptyPath(params.rootPath, 'Playground root')
    await ensureDirectoryExists(rootPath)

    const createdAt = nowIso()
    const derivedTitle = derivePlaygroundLabTitle(params.title, params.repoUrl, params.existingFolderPath)

    if (params.source === 'existing-folder') {
        const existingFolderPath = ensureNonEmptyPath(params.existingFolderPath, 'Existing folder')
        await ensureExistingDirectory(existingFolderPath)
        if (resolve(existingFolderPath) === rootPath) {
            throw new Error('Choose a folder inside the Playground root, not the Playground root itself.')
        }
        if (!isPathInside(rootPath, existingFolderPath)) {
            throw new Error('Existing folder must be inside the Playground root.')
        }
        return {
            id: createAssistantId('assistant-playground-lab'),
            title: derivedTitle,
            rootPath: existingFolderPath,
            source: params.source,
            repoUrl: null,
            createdAt,
            updatedAt: createdAt
        }
    }

    const labFolderPath = await chooseUniqueChildFolder(rootPath, derivedTitle)
    await mkdir(labFolderPath, { recursive: true })
    const hasExplicitSourceTitle = Boolean(String(params.title || '').trim() || String(params.repoUrl || '').trim())
    const title = hasExplicitSourceTitle
        ? derivedTitle
        : formatGeneratedLabTitle(basename(labFolderPath))

    if (params.source === 'git-clone') {
        const repoUrl = String(params.repoUrl || '').trim()
        if (!repoUrl) throw new Error('Repository URL is required to clone a Playground lab.')
        await createGit(rootPath).clone(repoUrl, labFolderPath)
        return {
            id: createAssistantId('assistant-playground-lab'),
            title,
            rootPath: labFolderPath,
            source: params.source,
            repoUrl,
            createdAt,
            updatedAt: createdAt
        }
    }

    return {
        id: createAssistantId('assistant-playground-lab'),
        title,
        rootPath: labFolderPath,
        source: 'empty',
        repoUrl: null,
        createdAt,
        updatedAt: createdAt
    }
}

export function ensurePlaygroundLabExists(labs: AssistantPlaygroundLab[], labId: string): AssistantPlaygroundLab {
    const lab = labs.find((entry) => entry.id === labId) || null
    if (!lab) throw new Error('Playground lab not found.')
    return lab
}

import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { DevScopeManagedFont, DevScopeManagedFontFace } from '../../shared/contracts/font-contracts'

const REGISTRY_VERSION = 1
const MAX_FONT_FILE_BYTES = 25 * 1024 * 1024
const MAX_GOOGLE_DOWNLOAD_BYTES = 30 * 1024 * 1024
const GOOGLE_CSS_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
const execFileAsync = promisify(execFile)

type FontRegistry = {
    version: number
    fonts: DevScopeManagedFont[]
}

type GoogleFaceSource = {
    url: string
    weight: string
    style: 'normal' | 'italic'
    format: DevScopeManagedFontFace['format']
    unicodeRange?: string
}

function fontRoot(): string {
    return join(app.getPath('userData'), 'fonts')
}

function registryPath(): string {
    return join(fontRoot(), 'registry.json')
}

function registryBackupPath(): string {
    return join(fontRoot(), 'registry.backup.json')
}

let fontStoreQueue: Promise<void> = Promise.resolve()

function withFontStoreLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = fontStoreQueue.then(operation, operation)
    fontStoreQueue = result.then(() => undefined, () => undefined)
    return result
}

function safeSlug(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 48) || 'font'
}

function sanitizeGoogleFamily(value: unknown): string {
    const family = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
    if (!family || family.length > 80 || !/^[\p{L}\p{N} .&'_-]+$/u.test(family)) {
        throw new Error('Enter a valid Google Fonts family name.')
    }
    return family
}

function isManagedFontFace(value: unknown): value is DevScopeManagedFontFace {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Partial<DevScopeManagedFontFace>
    return typeof candidate.fileName === 'string'
        && /^[a-zA-Z0-9._-]{1,128}$/.test(candidate.fileName)
        && !candidate.fileName.includes('..')
        && typeof candidate.weight === 'string'
        && /^\d{3}(?:\s+\d{3})?$/.test(candidate.weight)
        && (candidate.style === 'normal' || candidate.style === 'italic')
        && (candidate.format === 'woff2' || candidate.format === 'woff' || candidate.format === 'truetype' || candidate.format === 'opentype')
        && (candidate.unicodeRange === undefined || (typeof candidate.unicodeRange === 'string' && candidate.unicodeRange.length <= 512))
        && typeof candidate.sizeBytes === 'number'
        && candidate.sizeBytes > 0
        && candidate.sizeBytes <= MAX_FONT_FILE_BYTES
}

function isManagedFont(value: unknown): value is DevScopeManagedFont {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Partial<DevScopeManagedFont>
    return typeof candidate.id === 'string'
        && /^[a-z0-9-]{3,96}$/.test(candidate.id)
        && typeof candidate.family === 'string'
        && candidate.family.length > 0
        && candidate.family.length <= 96
        && (candidate.source === 'google' || candidate.source === 'imported')
        && typeof candidate.installedAt === 'string'
        && typeof candidate.sizeBytes === 'number'
        && candidate.sizeBytes > 0
        && candidate.sizeBytes <= MAX_GOOGLE_DOWNLOAD_BYTES
        && Array.isArray(candidate.faces)
        && candidate.faces.length > 0
        && candidate.faces.length <= 256
        && candidate.faces.every(isManagedFontFace)
}

type RegistryReadResult =
    | { status: 'valid'; registry: FontRegistry }
    | { status: 'missing' }
    | { status: 'invalid' }

async function parseRegistryFile(path: string): Promise<RegistryReadResult> {
    let source = ''
    try {
        source = await readFile(path, 'utf8')
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { status: 'missing' } : { status: 'invalid' }
    }
    try {
        const parsed = JSON.parse(source) as Partial<FontRegistry>
        if (parsed.version !== REGISTRY_VERSION || !Array.isArray(parsed.fonts) || !parsed.fonts.every(isManagedFont)) return { status: 'invalid' }
        return {
            status: 'valid',
            registry: { version: REGISTRY_VERSION, fonts: parsed.fonts }
        }
    } catch {
        return { status: 'invalid' }
    }
}

async function readRegistry(): Promise<FontRegistry> {
    const primary = await parseRegistryFile(registryPath())
    if (primary.status === 'valid') return primary.registry
    const backup = await parseRegistryFile(registryBackupPath())
    if (backup.status === 'valid') return backup.registry
    if (primary.status === 'missing' && backup.status === 'missing') return { version: REGISTRY_VERSION, fonts: [] }
    throw new Error('Zyra’s font registry is unreadable. The existing cache was preserved; restart or repair the font cache before making changes.')
}

async function writeRegistry(fonts: DevScopeManagedFont[]): Promise<void> {
    await mkdir(fontRoot(), { recursive: true })
    const destination = registryPath()
    const backup = registryBackupPath()
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify({ version: REGISTRY_VERSION, fonts }, null, 2), 'utf8')
    try {
        const current = await parseRegistryFile(destination)
        if (current.status === 'valid') await copyFile(destination, backup)
        await copyFile(temporary, destination)
    } finally {
        await rm(temporary, { force: true }).catch(() => undefined)
    }
}

async function fetchBounded(
    url: string,
    init: RequestInit | undefined,
    maxBytes: number,
    timeoutMs = 20_000
): Promise<{ ok: boolean; status: number; body: Buffer }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, { ...init, signal: controller.signal })
        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined)
            return { ok: false, status: response.status, body: Buffer.alloc(0) }
        }
        const declaredLength = Number(response.headers.get('content-length') || 0)
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
            controller.abort()
            throw new Error('The remote font response exceeded Zyra’s size limit.')
        }
        if (!response.body) return { ok: true, status: response.status, body: Buffer.alloc(0) }

        const reader = response.body.getReader()
        const chunks: Buffer[] = []
        let totalBytes = 0
        while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            totalBytes += chunk.value.byteLength
            if (totalBytes > maxBytes) {
                controller.abort()
                throw new Error('The remote font response exceeded Zyra’s size limit.')
            }
            chunks.push(Buffer.from(chunk.value))
        }
        return { ok: true, status: response.status, body: Buffer.concat(chunks, totalBytes) }
    } finally {
        clearTimeout(timeout)
    }
}

function resolveFontFormat(value: string): DevScopeManagedFontFace['format'] {
    const normalized = value.toLowerCase()
    if (normalized.includes('truetype')) return 'truetype'
    if (normalized.includes('opentype')) return 'opentype'
    if (normalized.includes('woff2')) return 'woff2'
    return 'woff'
}

function parseGoogleFontCss(css: string): GoogleFaceSource[] {
    const faces: GoogleFaceSource[] = []
    for (const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
        const body = match[1] || ''
        const urlMatch = body.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?([^'")]+)['"]?\)/i)
        if (!urlMatch) continue
        const url = urlMatch[1].trim().replace(/^['"]|['"]$/g, '')
        if (!url.startsWith('https://fonts.gstatic.com/')) continue
        const requestedWeight = body.match(/font-weight:\s*([^;]+);/i)?.[1]?.trim() || '400'
        const weight = /^\d{3}(?:\s+\d{3})?$/.test(requestedWeight) ? requestedWeight : '400'
        const style = body.match(/font-style:\s*([^;]+);/i)?.[1]?.trim() === 'italic' ? 'italic' : 'normal'
        const requestedUnicodeRange = body.match(/unicode-range:\s*([^;]+);/i)?.[1]?.trim()
        const unicodeRange = requestedUnicodeRange && requestedUnicodeRange.length <= 512 ? requestedUnicodeRange : undefined
        faces.push({
            url,
            weight,
            style,
            format: resolveFontFormat(urlMatch[2]),
            unicodeRange
        })
    }
    if (faces.length === 0) throw new Error('Google Fonts did not return a downloadable font for that family.')
    return faces
}

async function requestGoogleFontCss(family: string): Promise<string> {
    const encodedFamily = encodeURIComponent(family).replace(/%20/g, '+')
    const weightedUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@400;500;600;700&display=swap`
    const fallbackUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`
    const headers = { 'User-Agent': GOOGLE_CSS_USER_AGENT, Accept: 'text/css,*/*;q=0.1' }
    let response = await fetchBounded(weightedUrl, { headers }, 1_000_000)
    if (!response.ok) response = await fetchBounded(fallbackUrl, { headers }, 1_000_000)
    if (!response.ok) throw new Error(`Google Fonts returned ${response.status} for “${family}”.`)
    return response.body.toString('utf8')
}

async function listManagedFontsUnlocked(): Promise<DevScopeManagedFont[]> {
    const registry = await readRegistry()
    const validFonts: DevScopeManagedFont[] = []
    const invalidFonts: DevScopeManagedFont[] = []
    for (const font of registry.fonts) {
        if (await validateManagedFontFiles(font)) validFonts.push(font)
        else invalidFonts.push(font)
    }
    if (invalidFonts.length > 0) {
        await writeRegistry(validFonts)
        await Promise.all(invalidFonts.map((font) => rm(join(fontRoot(), font.id), { recursive: true, force: true }).catch(() => undefined)))
    }
    return validFonts.sort((left, right) => left.family.localeCompare(right.family))
}

function normalizeWindowsFontFamily(value: string): string {
    return value
        .replace(/^@/, '')
        .replace(/\s+\((?:TrueType|OpenType|All Res)\)$/i, '')
        .replace(/\s+(?:Regular|Roman|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|Black|Light|ExtraLight|Thin|Italic|Oblique)(?:\s+(?:Italic|Oblique))?$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
}

async function validateManagedFontFiles(font: DevScopeManagedFont): Promise<boolean> {
    let totalBytes = 0
    try {
        for (const face of font.faces) {
            const fileStats = await stat(join(fontRoot(), font.id, face.fileName))
            if (!fileStats.isFile() || fileStats.size !== face.sizeBytes || fileStats.size > MAX_FONT_FILE_BYTES) return false
            totalBytes += fileStats.size
            if (totalBytes > MAX_GOOGLE_DOWNLOAD_BYTES) return false
        }
        return totalBytes === font.sizeBytes
    } catch {
        return false
    }
}

async function readLocalFileBounded(filePath: string): Promise<Buffer> {
    const handle = await open(filePath, 'r')
    try {
        const fileStats = await handle.stat()
        if (!fileStats.isFile() || fileStats.size <= 0 || fileStats.size > MAX_FONT_FILE_BYTES) {
            throw new Error('The selected font file is empty or too large.')
        }
        const data = Buffer.alloc(fileStats.size)
        let offset = 0
        while (offset < data.byteLength) {
            const result = await handle.read(data, offset, data.byteLength - offset, offset)
            if (result.bytesRead === 0) throw new Error('The selected font file changed while Zyra was reading it.')
            offset += result.bytesRead
        }
        return data
    } finally {
        await handle.close()
    }
}

export async function listSystemFonts(): Promise<string[]> {
    if (process.platform !== 'win32') return []
    const regCommand = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe')
    const registryKeys = [
        'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    ]
    const families = new Set<string>()
    let successfulQueries = 0
    for (const key of registryKeys) {
        try {
            const { stdout } = await execFileAsync(regCommand, ['query', key], {
                encoding: 'utf8',
                windowsHide: true,
                maxBuffer: 4 * 1024 * 1024
            })
            successfulQueries += 1
            for (const line of String(stdout || '').split(/\r?\n/)) {
                const match = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+.+$/i)
                if (!match) continue
                const family = normalizeWindowsFontFamily(match[1])
                if (family && family.toLowerCase() !== '(default)' && family.length <= 96) families.add(family)
            }
        } catch {
            // A missing per-user registry key is expected on some Windows installs.
        }
    }
    if (successfulQueries === 0) throw new Error('Windows did not allow Zyra to read the installed-font registry.')
    return [...families].sort((left, right) => left.localeCompare(right)).slice(0, 1_500)
}

async function downloadGoogleFontUnlocked(familyValue: unknown): Promise<DevScopeManagedFont> {
    const family = sanitizeGoogleFamily(familyValue)
    const registry = await readRegistry()
    const existing = registry.fonts.find((font) => font.source === 'google' && font.family.toLowerCase() === family.toLowerCase())
    if (existing && await validateManagedFontFiles(existing)) return existing

    const css = await requestGoogleFontCss(family)
    const sources = parseGoogleFontCss(css)
    if (sources.length > 256) throw new Error('This Google Font contains too many subsets for Zyra to cache safely.')
    const hash = createHash('sha256').update(family.toLowerCase()).digest('hex').slice(0, 10)
    const id = `google-${safeSlug(family)}-${hash}`
    const directory = join(fontRoot(), id)
    const temporaryDirectory = `${directory}.tmp`
    await rm(temporaryDirectory, { recursive: true, force: true })
    await mkdir(temporaryDirectory, { recursive: true })

    let totalSize = 0
    const faces: DevScopeManagedFontFace[] = []
    try {
        for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index]
            const remainingBytes = Math.min(MAX_FONT_FILE_BYTES, MAX_GOOGLE_DOWNLOAD_BYTES - totalSize)
            const response = await fetchBounded(source.url, { headers: { 'User-Agent': GOOGLE_CSS_USER_AGENT } }, remainingBytes)
            if (!response.ok) throw new Error(`Failed to download a ${family} font face.`)
            const data = response.body
            totalSize += data.byteLength
            if (data.byteLength === 0 || data.byteLength > MAX_FONT_FILE_BYTES || totalSize > MAX_GOOGLE_DOWNLOAD_BYTES) {
                throw new Error('The downloaded font exceeded Zyra’s size limit.')
            }
            const extension = source.format === 'truetype' ? 'ttf' : source.format === 'opentype' ? 'otf' : source.format
            const fileName = `face-${String(index + 1).padStart(2, '0')}.${extension}`
            await writeFile(join(temporaryDirectory, fileName), data)
            faces.push({
                fileName,
                weight: source.weight,
                style: source.style,
                format: source.format,
                sizeBytes: data.byteLength,
                ...(source.unicodeRange ? { unicodeRange: source.unicodeRange } : {})
            })
        }
        await rm(directory, { recursive: true, force: true })
        await rename(temporaryDirectory, directory)
    } catch (error) {
        await rm(temporaryDirectory, { recursive: true, force: true })
        throw error
    }

    const font: DevScopeManagedFont = {
        id,
        family,
        source: 'google',
        faces,
        installedAt: new Date().toISOString(),
        sizeBytes: totalSize
    }
    try {
        await writeRegistry([...registry.fonts.filter((entry) => entry.id !== id), font])
        return font
    } catch (error) {
        await rm(directory, { recursive: true, force: true })
        throw error
    }
}

async function importManagedFontFileUnlocked(filePath: string): Promise<DevScopeManagedFont> {
    const extension = extname(filePath).slice(1).toLowerCase()
    const format: DevScopeManagedFontFace['format'] = extension === 'ttf'
        ? 'truetype'
        : extension === 'otf'
            ? 'opentype'
            : extension === 'woff2' ? 'woff2' : 'woff'
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(extension)) throw new Error('Choose a .ttf, .otf, .woff, or .woff2 font file.')
    const data = await readLocalFileBounded(filePath)
    const rawName = basename(filePath, extname(filePath)).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    const family = rawName.slice(0, 80) || 'Imported font'
    const contentHash = createHash('sha256').update(data).digest('hex').slice(0, 10)
    const id = `imported-${safeSlug(family)}-${contentHash}`
    const directory = join(fontRoot(), id)
    const fileName = `font.${extension}`
    const registry = await readRegistry()
    const existing = registry.fonts.find((font) => font.id === id)
    if (existing && await validateManagedFontFiles(existing)) return existing
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, fileName), data)

    const font: DevScopeManagedFont = {
        id,
        family,
        source: 'imported',
        faces: [{ fileName, weight: '400', style: 'normal', format, sizeBytes: data.byteLength }],
        installedAt: new Date().toISOString(),
        sizeBytes: data.byteLength
    }
    try {
        await writeRegistry([...registry.fonts.filter((entry) => entry.id !== id), font])
        return font
    } catch (error) {
        await rm(directory, { recursive: true, force: true })
        throw error
    }
}

async function removeManagedFontUnlocked(fontId: string): Promise<boolean> {
    const registry = await readRegistry()
    const font = registry.fonts.find((entry) => entry.id === fontId)
    if (!font) return false
    await writeRegistry(registry.fonts.filter((entry) => entry.id !== font.id))
    await rm(join(fontRoot(), font.id), { recursive: true, force: true }).catch(() => undefined)
    return true
}

async function readManagedFontUnlocked(fontId: string): Promise<{ font: DevScopeManagedFont; faces: Array<{ weight: string; style: 'normal' | 'italic'; format: DevScopeManagedFontFace['format']; unicodeRange?: string; data: Uint8Array }> }> {
    const registry = await readRegistry()
    const font = registry.fonts.find((entry) => entry.id === fontId)
    if (!font) throw new Error('The managed font is no longer installed.')
    const faces: Array<{ weight: string; style: 'normal' | 'italic'; format: DevScopeManagedFontFace['format']; unicodeRange?: string; data: Uint8Array }> = []
    let totalBytes = 0
    for (const face of font.faces) {
        const path = join(fontRoot(), font.id, face.fileName)
        const data = await readLocalFileBounded(path)
        if (data.byteLength !== face.sizeBytes) throw new Error(`The cached ${font.family} font data is incomplete.`)
        totalBytes += data.byteLength
        if (totalBytes > MAX_GOOGLE_DOWNLOAD_BYTES) throw new Error('The cached font exceeded Zyra’s size limit.')
        faces.push({
            weight: face.weight,
            style: face.style,
            format: face.format,
            ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
            data: new Uint8Array(data)
        })
    }
    if (totalBytes !== font.sizeBytes) throw new Error(`The cached ${font.family} font metadata is inconsistent.`)
    return { font, faces }
}

export function listManagedFonts(): Promise<DevScopeManagedFont[]> {
    return withFontStoreLock(listManagedFontsUnlocked)
}

export function downloadGoogleFont(familyValue: unknown): Promise<DevScopeManagedFont> {
    return withFontStoreLock(() => downloadGoogleFontUnlocked(familyValue))
}

export function importManagedFontFile(filePath: string): Promise<DevScopeManagedFont> {
    return withFontStoreLock(() => importManagedFontFileUnlocked(filePath))
}

export function removeManagedFont(fontId: string): Promise<boolean> {
    return withFontStoreLock(() => removeManagedFontUnlocked(fontId))
}

export function readManagedFont(fontId: string): ReturnType<typeof readManagedFontUnlocked> {
    return withFontStoreLock(() => readManagedFontUnlocked(fontId))
}

import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { nativeImage } from 'electron'
import { resolveProjectIconPath } from './services/project-icon-resolver'
import { detectFrameworksFromPackageJson, detectProjectTypeFromMarkers } from './ipc/project-detection'
import brands from '../shared/project-brand-icons.json'

export interface MobileProjectPresentation { project: string; name: string; projectId?: string; preferred?: boolean; icon?: string; iconMime?: string; iconSlug?: string; framework?: string; color?: string }
interface SavedProject { id: string; name: string; homePath: string; folders: { path: string }[]; archived?: boolean }
const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Small, lazy presentation metadata. Uses the same icon resolver as Desktop;
 * no dependency walks, thumbnails of arbitrary files, or network requests. */
export class MobileProjectPresentations {
    constructor(private readonly overrides: () => Promise<Record<string, string>> = async () => ({}),
        private readonly projects: () => Promise<SavedProject[]> = async () => []) {}
    private catalog: { at: number; value: Promise<SavedProject[]> } | undefined
    private savedProjects() {
        if (!this.catalog || Date.now() - this.catalog.at >= 300000)
            this.catalog = { at: Date.now(), value: this.projects().catch(() => []) }
        return this.catalog.value
    }
    private cache = new Map<string, { at: number; value: Promise<MobileProjectPresentation> }>()
    get(project: string): Promise<MobileProjectPresentation> {
        const cached = this.cache.get(project)
        if (cached && Date.now() - cached.at < 300000) return cached.value
        const value = this.load(project)
        this.cache.delete(project)
        this.cache.set(project, { at: Date.now(), value })
        while (this.cache.size > 96) this.cache.delete(this.cache.keys().next().value!)
        return value
    }
    clear() { this.cache.clear(); this.catalog = undefined }
    private async load(project: string): Promise<MobileProjectPresentation> {
        const folderName = basename(project)
        const result: MobileProjectPresentation = { project, name: /^project_[a-f0-9-]+$/i.test(folderName) ? 'Saved project' : folderName }
        const saved = (await this.savedProjects()).find(item => !item.archived && normalize(item.homePath) === normalize(project))
            || (await this.savedProjects()).find(item => !item.archived && item.folders.some(folder => normalize(folder.path) === normalize(project)))
        if (saved) { result.name = saved.name; result.projectId = saved.id; result.preferred = normalize(saved.homePath) === normalize(project) }
        try {
            const entries = await readdir(project)
            const packagePath = join(project, 'package.json')
            const pkg = entries.includes('package.json') && (await stat(packagePath)).size <= 262144
                ? JSON.parse(await readFile(packagePath, 'utf8')) : null
            const framework = pkg ? detectFrameworksFromPackageJson(pkg, entries)[0] : undefined
            const type = framework || detectProjectTypeFromMarkers(entries)
            result.framework = type?.displayName; result.color = type?.themeColor
            const brand = type ? (brands as Record<string, { slug: string; color: string }>)[type.id] : undefined
            result.iconSlug = brand?.slug; result.color = brand?.color || result.color
            const override = Object.entries(await this.overrides()).find(([candidate]) => normalize(candidate) === normalize(project))?.[1]
            const iconPath = override || await resolveProjectIconPath(project, entries, pkg)
            if (iconPath && extname(iconPath).toLowerCase() === '.svg' && (await stat(iconPath)).size <= 16384) {
                const bytes = await readFile(iconPath)
                if (bytes.length <= 16384) { result.icon = bytes.toString('base64'); result.iconMime = 'image/svg+xml' }
            }
            if (iconPath && ['.png', '.jpg', '.jpeg', '.ico'].includes(extname(iconPath).toLowerCase()) && (await stat(iconPath)).size <= 262144) {
                const image = nativeImage.createFromPath(iconPath)
                if (!image.isEmpty()) {
                    const bytes = image.resize({ width: 64, height: 64, quality: 'good' }).toPNG()
                    if (bytes.length <= 16384) result.icon = bytes.toString('base64')
                }
            }
        } catch { /* Missing or changing project: retain the folder fallback. */ }
        return result
    }
}

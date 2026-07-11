import type { NavigateFunction } from 'react-router-dom'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import type { UseFilePreviewReturn } from '@/components/ui/file-preview/useFilePreview'
import { isWindowsPathHref, resolveMarkdownLinkTarget } from '@/components/ui/markdown/linkNavigation'

function normalizePath(pathValue: string): string {
    return pathValue.replace(/\\/g, '/')
}

function isAbsolutePath(pathValue: string): boolean {
    return isWindowsPathHref(pathValue)
}

function splitFileNameAndExtension(targetPath: string): { name: string; extension: string } {
    const normalizedPath = targetPath.replace(/\\/g, '/')
    const name = normalizedPath.split('/').pop() || targetPath
    const dotIndex = name.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === name.length - 1) {
        return { name, extension: '' }
    }

    return {
        name,
        extension: name.slice(dotIndex + 1).toLowerCase()
    }
}

export function getAssistantLinkBaseFilePath(projectPath?: string | null): string | undefined {
    const normalizedProjectPath = String(projectPath || '').trim()
    if (!normalizedProjectPath) return undefined

    const separator = normalizedProjectPath.includes('\\') ? '\\' : '/'
    return `${normalizedProjectPath.replace(/[\\/]+$/, '')}${separator}__assistant__.md`
}

export function getAssistantRelativeFilePath(targetPath: string, projectPath?: string | null): string {
    const normalizedTargetPath = normalizePath(String(targetPath || '').trim())
    const normalizedProjectPath = normalizePath(String(projectPath || '').trim()).replace(/\/+$/, '')
    if (!normalizedTargetPath) return ''
    if (!normalizedProjectPath) return normalizedTargetPath

    const lowerTarget = normalizedTargetPath.toLowerCase()
    const lowerProject = normalizedProjectPath.toLowerCase()
    if (lowerTarget === lowerProject) return '/'
    if (!lowerTarget.startsWith(`${lowerProject}/`)) return normalizedTargetPath

    return `/${normalizedTargetPath.slice(normalizedProjectPath.length + 1)}`
}

export async function openAssistantFileTarget(options: {
    target: string
    projectPath?: string | null
    navigate: NavigateFunction
    openPreview: UseFilePreviewReturn['openPreview']
    previewOptions?: PreviewOpenOptions
}): Promise<boolean> {
    const normalizedTarget = String(options.target || '').trim()
    if (!normalizedTarget) return false

    const baseFilePath = getAssistantLinkBaseFilePath(options.projectPath)
    const resolvedTarget = resolveMarkdownLinkTarget(normalizedTarget, baseFilePath)
    const targetPath = resolvedTarget?.path || (isAbsolutePath(normalizedTarget) ? normalizedTarget : '')
    if (!targetPath) return false

    const pathInfo = await window.devscope.getPathInfo(targetPath)
    if (!pathInfo.success || !pathInfo.exists) return false

    if (pathInfo.type === 'directory') {
        options.navigate(`/folder-browse/${encodeURIComponent(pathInfo.path)}`)
        return true
    }

    const { extension, name } = splitFileNameAndExtension(pathInfo.path)
    await options.openPreview({ name, path: pathInfo.path }, extension, {
        ...options.previewOptions,
        focusLine: options.previewOptions?.focusLine ?? resolvedTarget?.focusLine
    })
    return true
}

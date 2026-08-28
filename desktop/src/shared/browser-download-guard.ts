import { extname } from 'node:path'

import type { BrowserDownloadRisk } from './browser-downloads'

const EXECUTABLE_EXTENSIONS = new Set([
    '.appref-ms',
    '.appx',
    '.appxbundle',
    '.bat',
    '.cmd',
    '.com',
    '.cpl',
    '.exe',
    '.hta',
    '.jar',
    '.js',
    '.jse',
    '.lnk',
    '.msi',
    '.msix',
    '.msixbundle',
    '.ps1',
    '.reg',
    '.scr',
    '.vbe',
    '.vbs',
    '.wsf',
    '.wsh'
])

const ARCHIVE_EXTENSIONS = new Set(['.7z', '.cab', '.img', '.iso', '.rar', '.zip'])

export function isLocalBrowserDownloadOrigin(sourceOrigin: string): boolean {
    try {
        const url = new URL(sourceOrigin)
        const hostname = url.hostname.toLowerCase()
        return (url.protocol === 'http:' || url.protocol === 'https:') && (
            hostname === 'localhost'
            || hostname.endsWith('.localhost')
            || hostname === '::1'
            || hostname === '[::1]'
            || /^127(?:\.\d{1,3}){3}$/.test(hostname)
        )
    } catch {
        return false
    }
}

export function classifyBrowserDownload(filename: string, sourceOrigin: string): BrowserDownloadRisk {
    if (isLocalBrowserDownloadOrigin(sourceOrigin)) return 'normal'
    const extension = extname(filename).toLowerCase()
    if (EXECUTABLE_EXTENSIONS.has(extension)) return 'dangerous'
    if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive'
    return 'normal'
}

export function browserDownloadNeedsInternetZone(sourceOrigin: string): boolean {
    return !isLocalBrowserDownloadOrigin(sourceOrigin)
}

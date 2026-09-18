import type { AssistantPendingApproval } from '@shared/assistant/contracts'

export interface ApprovalPathPresentation {
    path: string
    name: string
    directory: string
}

function pathIdentity(path: string): string {
    const normalized = path.trim().replace(/\\/g, '/')
    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

function presentPath(path: string): ApprovalPathPresentation {
    if (/^(?:[a-z]:[\\/]|[\\/])$/i.test(path)) return { path, name: path, directory: '' }
    const trimmedEnd = path.replace(/[\\/]+$/, '') || path
    const index = Math.max(trimmedEnd.lastIndexOf('/'), trimmedEnd.lastIndexOf('\\'))
    if (index < 0) return { path, name: trimmedEnd, directory: '' }
    const rootBoundary = index === 0 || index === 2 && /^[a-z]:/i.test(trimmedEnd)
    return {
        path,
        name: trimmedEnd.slice(index + 1) || path,
        directory: trimmedEnd.slice(0, index + (rootBoundary ? 1 : 0))
    }
}

export function compactApprovalGrantLabel(label: string): string {
    if (/\buntil (?:this )?chat reconnects\.?$/i.test(label)) return 'Until reconnect'
    if (/\bfor (?:this )?chat\.?$/i.test(label)) return 'For this chat'
    if (/\bfor (?:this )?session\.?$/i.test(label)) return 'For this session'
    return label
}

export function getApprovalPresentation(approval: AssistantPendingApproval) {
    const seen = new Set<string>()
    const paths = (approval.paths || []).filter(path => {
        if (!path.trim()) return false
        const identity = pathIdentity(path)
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
    }).map(presentPath)
    const command = approval.command?.trim() ? approval.command : null
    let detail = approval.detail?.trim() ? approval.detail : null
    if (detail) {
        const lines = new Set(detail.split(/\r?\n/).map(pathIdentity).filter(Boolean))
        const repeatsPaths = paths.length > 0 && lines.size === seen.size && [...lines].every(line => seen.has(line))
        if (repeatsPaths || command && detail.trim() === command.trim()) detail = null
    }
    const scope = approval.requestType === 'file-change' ? 'file changes' : approval.requestType === 'file-read' ? 'file reads' : 'commands'
    return {
        title: approval.title || 'Approval required',
        command,
        detail: detail || (!command && paths.length === 0 ? 'No additional details were supplied.' : null),
        paths,
        grantLabel: approval.grantLabel || `Allow ${scope} for this chat`
    }
}

import type { GitCommit } from '../types'

export interface PushRangeSummary {
    selectedCommit: GitCommit
    newerLocalCommits: GitCommit[]
    commitsToPush: GitCommit[]
}

export type PushRangePreviewProps = {
    summary: PushRangeSummary
    compact?: boolean
    className?: string
    showCloudBoundary?: boolean
    remoteName?: string | null
}

export type PushRangeSelectorProps = {
    commits: GitCommit[]
    activeCommitHash: string | null
    onActiveCommitChange: (commitHash: string) => void
    onCommitClick?: (commit: GitCommit) => void
    className?: string
    remoteName?: string | null
}

export type PushRangeConfirmModalProps = {
    isOpen: boolean
    summary: PushRangeSummary | null
    isPushing?: boolean
    dontShowAgain: boolean
    setDontShowAgain: (value: boolean) => void
    remoteName?: string | null
    onCancel: () => void
    onConfirm: () => void
}

export type PreviewRow =
    | { kind: 'collapsed-local'; count: number }
    | { kind: 'collapsed-push'; count: number }
    | { kind: 'commit'; commit: GitCommit; role: 'retained' | 'selected' | 'included' }
    | { kind: 'cloud-boundary' }

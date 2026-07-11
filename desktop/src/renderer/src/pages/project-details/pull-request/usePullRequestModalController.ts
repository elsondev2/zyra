import { useEffect, useMemo, useState } from 'react'
import type { DevScopePullRequestSummary } from '@shared/contracts/devscope-api'
import {
    getProjectPullRequestConfig,
    mergeProjectPullRequestConfig,
    resolvePreferredPullRequestProvider,
    resolvePullRequestGuideText
} from '@/lib/pullRequestWorkflow'
import type {
    PullRequestGuideMode,
    PullRequestGuideSource
} from '@/lib/settings'
import { type PullRequestModalProps, type StatusMessage } from './types'

export function usePullRequestModalController(props: PullRequestModalProps) {
    const {
        isOpen,
        projectName,
        projectPath,
        currentBranch,
        branches,
        unstagedFiles,
        stagedFiles,
        settings,
        updateSettings,
        showToast,
        githubPublishContext,
        initialPullRequest,
        onPullRequestResolved
    } = props

    const projectDefaults = useMemo(
        () => getProjectPullRequestConfig(settings, projectPath),
        [projectPath, settings]
    )

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
    const [guideSource, setGuideSource] = useState<PullRequestGuideSource>(projectDefaults.guideSource)
    const [guideMode, setGuideMode] = useState<PullRequestGuideMode>(projectDefaults.guide.mode)
    const [guideText, setGuideText] = useState(projectDefaults.guide.text)
    const [guideFilePath, setGuideFilePath] = useState(projectDefaults.guide.filePath)
    const [targetBranch, setTargetBranch] = useState(projectDefaults.targetBranch)
    const [draftMode, setDraftMode] = useState(projectDefaults.draft)
    const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
    const [isExecuting, setIsExecuting] = useState(false)
    const [isLoadingPullRequest, setIsLoadingPullRequest] = useState(false)
    const [existingPullRequest, setExistingPullRequest] = useState<DevScopePullRequestSummary | null>(initialPullRequest || null)

    useEffect(() => {
        if (!isOpen) return
        const nextDefaults = getProjectPullRequestConfig(settings, projectPath)
        setIsAdvancedOpen(false)
        setGuideSource(nextDefaults.guideSource)
        setGuideMode(nextDefaults.guide.mode)
        setGuideText(nextDefaults.guide.text)
        setGuideFilePath(nextDefaults.guide.filePath)
        setTargetBranch(nextDefaults.targetBranch)
        setDraftMode(nextDefaults.draft)
        setStatusMessage(null)
        setExistingPullRequest(initialPullRequest || null)
    }, [initialPullRequest, isOpen, projectPath, settings])

    useEffect(() => {
        if (!isOpen) return
        setExistingPullRequest(initialPullRequest || null)
    }, [initialPullRequest, isOpen])

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        let cancelled = false

        async function loadCurrentPullRequest() {
            setIsLoadingPullRequest(true)
            try {
                const result = await window.devscope.getCurrentBranchPullRequest(projectPath)
                if (cancelled) return
                if (!result?.success) {
                    if (!initialPullRequest) {
                        setExistingPullRequest(null)
                    }
                    return
                }
                const nextPullRequest = result.pullRequest ?? null
                setExistingPullRequest(nextPullRequest)
                onPullRequestResolved?.(nextPullRequest)
                if (nextPullRequest?.state === 'open') {
                    setStatusMessage({
                        tone: 'info',
                        text: `Open PR #${nextPullRequest.number} already exists for this branch.`
                    })
                } else if (nextPullRequest?.state === 'merged') {
                    setStatusMessage({
                        tone: 'info',
                        text: `Latest PR #${nextPullRequest.number} is already merged. Creating a new PR will open a fresh one for this branch.`
                    })
                } else if (nextPullRequest?.state === 'closed') {
                    setStatusMessage({
                        tone: 'info',
                        text: `Latest PR #${nextPullRequest.number} is closed. Creating a new PR will open a fresh one for this branch.`
                    })
                }
            } catch {
                if (!cancelled) {
                    if (!initialPullRequest) {
                        setExistingPullRequest(null)
                        onPullRequestResolved?.(null)
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingPullRequest(false)
                }
            }
        }

        void loadCurrentPullRequest()
        return () => {
            cancelled = true
        }
    }, [initialPullRequest, isOpen, onPullRequestResolved, projectPath])

    const projectGuideConfig = useMemo(
        () => ({ mode: guideMode, text: guideText, filePath: guideFilePath }),
        [guideFilePath, guideMode, guideText]
    )

    const targetBranchOptions = useMemo(() => {
        const names = branches.filter((branch) => branch.name).map((branch) => branch.name)
        return [...new Set([targetBranch, 'main', 'dev', ...names].map((name) => String(name || '').trim()).filter(Boolean))].map((name) => ({
            value: name,
            label: name
        }))
    }, [branches, targetBranch])

    const hasGitHubRemote = Boolean(githubPublishContext?.canOpenPullRequest)
    const hasWorkingTreeChanges = unstagedFiles.length > 0 || stagedFiles.length > 0
    const isDetachedHead = !currentBranch || currentBranch === 'HEAD'
    const normalizedTargetBranch = String(targetBranch || '').trim()
    const targetMatchesCurrentBranch = Boolean(
        normalizedTargetBranch
        && currentBranch
        && currentBranch !== 'HEAD'
        && normalizedTargetBranch === currentBranch
    )
    const validationError = !hasGitHubRemote
        ? 'Add a GitHub remote before creating a PR.'
        : isDetachedHead
            ? 'Detached HEAD: checkout a branch before creating a PR.'
            : targetMatchesCurrentBranch
                ? 'Choose a target branch that is different from the current branch.'
            : hasWorkingTreeChanges
                ? 'Commit local changes before creating a PR.'
                : ''

    const primaryActionLabel = isLoadingPullRequest && !existingPullRequest
        ? 'Checking PR...'
        : existingPullRequest?.state === 'open'
            ? 'View PR'
            : 'Create PR'
    const isPrimaryActionDisabled = isExecuting
        || (!existingPullRequest && (isLoadingPullRequest || Boolean(validationError)))

    function persistProjectConfig() {
        updateSettings({
            gitProjectPullRequestConfigs: mergeProjectPullRequestConfig(settings, projectPath, {
                guideSource,
                guide: projectGuideConfig,
                targetBranch,
                draft: draftMode
            })
        })
    }

    async function handlePickGuideFile() {
        const result = await window.devscope.selectMarkdownFile()
        if (!result?.success) {
            if (result?.error) showToast(result.error, undefined, undefined, 'error')
            return
        }
        if (!result.filePath) return
        setGuideMode('file')
        setGuideFilePath(result.filePath)
        setStatusMessage({
            tone: 'info',
            text: `Using ${result.filePath.split(/[/\\]/).pop() || result.filePath} as the project PR guide.`
        })
    }

    async function openOrCreatePullRequest() {
        if (existingPullRequest?.state === 'open') {
            persistProjectConfig()
            window.open(existingPullRequest.url, '_blank', 'noopener,noreferrer')
            showToast(`Opened PR #${existingPullRequest.number}.`)
            props.onClose()
            return
        }

        if (validationError) {
            setStatusMessage({ tone: 'error', text: validationError })
            return
        }

        setIsExecuting(true)
        setStatusMessage(null)
        try {
            persistProjectConfig()
            const guideTextValue = await resolvePullRequestGuideText(settings, projectPath, guideSource, projectGuideConfig)
            const provider = resolvePreferredPullRequestProvider(settings)
            const result = await window.devscope.createOrOpenPullRequest(projectPath, {
                projectName,
                targetBranch,
                draft: draftMode,
                guideText: guideTextValue,
                provider: provider?.provider,
                apiKey: provider?.apiKey,
                model: provider?.model
            })

            if (!result?.success) {
                throw new Error(result?.error || 'Failed to create the pull request.')
            }

            setExistingPullRequest(result.pullRequest)
            onPullRequestResolved?.(result.pullRequest)
            const prNumberLabel = result.pullRequest.number > 0 ? ` #${result.pullRequest.number}` : ''
            const statusText = result.status === 'opened_existing'
                ? `Opened existing PR${prNumberLabel}.`
                : result.draftSource === 'ai' && result.provider
                    ? `Created PR${prNumberLabel} with ${result.provider === 'groq' ? 'Groq' : result.provider === 'gemini' ? 'Gemini' : 'Codex'} draft content.`
                    : result.draftSource === 'fallback'
                        ? `Created PR${prNumberLabel} with the built-in draft template.`
                        : `Created PR${prNumberLabel}.`

            setStatusMessage({ tone: 'success', text: statusText })
            window.open(result.pullRequest.url, '_blank', 'noopener,noreferrer')
            showToast(statusText)
            props.onClose()
        } catch (err: any) {
            const message = err?.message || 'Failed to create the pull request.'
            setStatusMessage({ tone: 'error', text: message })
            showToast(message, undefined, undefined, 'error')
        } finally {
            setIsExecuting(false)
        }
    }

    return {
        isAdvancedOpen,
        guideSource,
        guideMode,
        guideText,
        guideFilePath,
        targetBranch,
        draftMode,
        statusMessage,
        isExecuting,
        isLoadingPullRequest,
        existingPullRequest,
        hasGitHubRemote,
        validationError,
        targetBranchOptions,
        primaryActionLabel,
        isPrimaryActionDisabled,
        setIsAdvancedOpen,
        setGuideSource,
        setGuideMode,
        setGuideText,
        setGuideFilePath,
        setTargetBranch,
        setDraftMode,
        persistProjectConfig,
        handlePickGuideFile,
        openOrCreatePullRequest
    }
}

import { createPortal } from 'react-dom'
import { type ReactNode, useCallback, useEffect } from 'react'
import { ArrowUpRight, GitPullRequest, Loader2, Settings2, X } from 'lucide-react'
import { Checkbox, Select, Textarea } from '@/components/ui/FormControls'
import type { PullRequestModalProps } from './pull-request/types'
import { usePullRequestModalController } from './pull-request/usePullRequestModalController'
import { GUIDE_SOURCE_OPTIONS } from './pull-request/utils'
import { Field, InlineHint, StatusBanner } from './pull-request/ui'

type OverlayProps = {
    children: ReactNode
    zIndexClass: string
    onClose: () => void
}

function TopLevelOverlay({ children, zIndexClass, onClose }: OverlayProps) {
    if (typeof document === 'undefined') return null

    return createPortal(
        <div
            className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn`}
            onClick={onClose}
        >
            {children}
        </div>,
        document.body
    )
}

export function PullRequestModal(props: PullRequestModalProps) {
    const controller = usePullRequestModalController(props)

    const handleClose = useCallback(() => {
        controller.persistProjectConfig()
        props.onClose()
    }, [controller, props])

    useEffect(() => {
        if (!props.isOpen) return

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !controller.isAdvancedOpen) {
                handleClose()
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [props.isOpen, controller.isAdvancedOpen, handleClose])

    if (!props.isOpen || typeof document === 'undefined') {
        return null
    }

    return (
        <>
            {createPortal(
                <div
                    className="fixed inset-0 z-[145] flex items-center justify-center bg-black/65 backdrop-blur-md animate-fadeIn"
                    onClick={handleClose}
                >
                    <div
                        className="relative m-4 flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Pull Request</p>
                                    <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                                        <GitPullRequest size={18} className="text-[var(--accent-primary)]" />
                                        <span className="truncate">{props.projectName}</span>
                                    </div>
                                    <p className="mt-2 text-sm text-white/58">
                                        Zyra checks the live branch state, publishes the branch if needed, then creates or reopens the pull request.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-white/65 transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                                    aria-label="Close pull request modal"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            <div className="space-y-4">
                                <Field label="Target branch">
                                    <Select
                                        value={controller.targetBranch}
                                        onChange={controller.setTargetBranch}
                                        options={controller.targetBranchOptions}
                                    />
                                </Field>

                                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                    <Checkbox
                                        checked={controller.draftMode}
                                        onChange={controller.setDraftMode}
                                        label={controller.draftMode ? 'Create as draft pull request' : 'Create ready for review'}
                                        description="Zyra uses GitHub CLI to open or create the PR for the current branch."
                                        size="sm"
                                    />
                                </div>

                                {controller.existingPullRequest?.state === 'open' ? (
                                    <StatusBanner tone="info">
                                        Open PR #{controller.existingPullRequest.number}: {controller.existingPullRequest.title}
                                    </StatusBanner>
                                ) : null}

                                {controller.validationError && controller.existingPullRequest?.state !== 'open' ? (
                                    <StatusBanner tone="error">
                                        {controller.validationError}
                                    </StatusBanner>
                                ) : null}

                                {!controller.hasGitHubRemote ? (
                                    <InlineHint>
                                        Add a GitHub remote before using the built-in PR flow.
                                    </InlineHint>
                                ) : null}

                                {controller.statusMessage ? (
                                    <StatusBanner tone={controller.statusMessage.tone}>
                                        {controller.statusMessage.text}
                                    </StatusBanner>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02] px-5 py-4">
                            <button
                                type="button"
                                onClick={() => controller.setIsAdvancedOpen(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                            >
                                <Settings2 size={15} />
                                Advanced
                            </button>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { void controller.openOrCreatePullRequest() }}
                                    disabled={controller.isPrimaryActionDisabled}
                                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/14 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--accent-primary)]/22 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    {controller.isExecuting || controller.isLoadingPullRequest
                                        ? <Loader2 size={15} className="animate-spin" />
                                        : <ArrowUpRight size={15} />}
                                    {controller.primaryActionLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {controller.isAdvancedOpen && (
                <TopLevelOverlay zIndexClass="z-[146]" onClose={() => controller.setIsAdvancedOpen(false)}>
                    <div
                        className="m-4 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Advanced PR Settings</p>
                                    <h3 className="mt-1 text-base font-semibold text-white">Guide configuration</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => controller.setIsAdvancedOpen(false)}
                                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-white/65 transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                                    aria-label="Close advanced settings"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            <div className="space-y-4">
                                <Field label="Guide source">
                                    <Select
                                        value={controller.guideSource}
                                        onChange={(value) => controller.setGuideSource(value as typeof controller.guideSource)}
                                        options={GUIDE_SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                                    />
                                </Field>
                                {controller.guideSource === 'project' && (
                                    <>
                                        <Field label="Project guide mode">
                                            <Select
                                                value={controller.guideMode}
                                                onChange={(value) => controller.setGuideMode(value as typeof controller.guideMode)}
                                                options={[
                                                    { value: 'text', label: 'Custom note' },
                                                    { value: 'file', label: 'Markdown file' }
                                                ]}
                                            />
                                        </Field>
                                        {controller.guideMode === 'text' ? (
                                            <Field label="Project guide note">
                                                <Textarea
                                                    value={controller.guideText}
                                                    onChange={controller.setGuideText}
                                                    rows={6}
                                                    placeholder="Describe the PR structure this project expects."
                                                />
                                            </Field>
                                        ) : (
                                            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                                                <p className="text-sm text-white/80">
                                                    {controller.guideFilePath || 'No guide file selected'}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { void controller.handlePickGuideFile() }}
                                                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                                                    >
                                                        Choose .md
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => controller.setGuideFilePath('')}
                                                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {controller.guideSource !== 'project' && (
                                    <InlineHint>
                                        {controller.guideSource === 'global'
                                            ? 'Using the global Git settings PR guide.'
                                            : controller.guideSource === 'repo-template'
                                                ? "GitHub CLI creation will use Zyra generated content informed by the repo template when one exists."
                                                : 'This project will use the built-in draft structure when AI content is unavailable.'}
                                    </InlineHint>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end border-t border-white/10 bg-white/[0.02] px-5 py-4">
                            <button
                                type="button"
                                onClick={() => controller.setIsAdvancedOpen(false)}
                                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </TopLevelOverlay>
            )}
        </>
    )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, GitBranch, GitPullRequest, RefreshCw, Sparkles, UserRound } from 'lucide-react'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/FormControls'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { SettingsBetaBadge } from './SettingsBetaBadge'

type GitSettingsTab = 'pull-requests' | 'workflow' | 'defaults' | 'identity'

const TABS: Array<{ id: GitSettingsTab; label: string }> = [
    { id: 'pull-requests', label: 'Pull Requests' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'defaults', label: 'Defaults' },
    { id: 'identity', label: 'Identity' }
]

export default function GitSettings() {
    const { settings, updateSettings } = useSettings()
    const [activeTab, setActiveTab] = useState<GitSettingsTab>('pull-requests')
    const [globalAuthorDraft, setGlobalAuthorDraft] = useState({ name: '', email: '' })
    const [savedGlobalAuthor, setSavedGlobalAuthor] = useState({ name: '', email: '' })
    const [globalAuthorMessage, setGlobalAuthorMessage] = useState('')
    const [globalAuthorLoading, setGlobalAuthorLoading] = useState(false)

    useEffect(() => {
        let cancelled = false
        setGlobalAuthorLoading(true)

        void window.devscope.getGlobalGitUser()
            .then((result) => {
                if (cancelled) return
                const nextAuthor = result?.success && result.user
                    ? { name: String(result.user.name || ''), email: String(result.user.email || '') }
                    : { name: '', email: '' }

                setGlobalAuthorDraft(nextAuthor)
                setSavedGlobalAuthor(nextAuthor)
                setGlobalAuthorMessage(result?.success ? '' : (result?.error || 'Failed to read global Git author.'))
            })
            .catch((err: any) => {
                if (!cancelled) {
                    setGlobalAuthorMessage(err?.message || 'Failed to read global Git author.')
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setGlobalAuthorLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    const globalAuthorDirty = useMemo(
        () => globalAuthorDraft.name.trim() !== savedGlobalAuthor.name.trim() || globalAuthorDraft.email.trim() !== savedGlobalAuthor.email.trim(),
        [globalAuthorDraft.email, globalAuthorDraft.name, savedGlobalAuthor.email, savedGlobalAuthor.name]
    )

    const saveGlobalAuthor = async () => {
        const name = globalAuthorDraft.name.trim()
        const email = globalAuthorDraft.email.trim()
        if (!name || !email) {
            setGlobalAuthorMessage('Name and email are both required.')
            return
        }

        setGlobalAuthorLoading(true)
        try {
            const result = await window.devscope.setGlobalGitUser({ name, email })
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to save global Git author.')
            }
            setSavedGlobalAuthor({ name, email })
            setGlobalAuthorMessage('Global Git author updated.')
        } catch (err: any) {
            setGlobalAuthorMessage(err?.message || 'Failed to save global Git author.')
        } finally {
            setGlobalAuthorLoading(false)
        }
    }

    const chooseGlobalGuideFile = async () => {
        const result = await window.devscope.selectMarkdownFile()
        if (!result?.success || result.cancelled || !result.filePath) return
        updateSettings({
            gitPullRequestGlobalGuide: {
                ...settings.gitPullRequestGlobalGuide,
                mode: 'file',
                filePath: result.filePath
            }
        })
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-orange-500/10 p-2">
                        <GitBranch className="text-orange-400" size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-semibold text-sparkle-text">Git</h1>
                            <SettingsBetaBadge compact />
                        </div>
                        <p className="text-sm text-sparkle-text-secondary">Branch defaults, PR flow, and machine-wide Git identity.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        to="/settings/ai"
                        className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-white/[0.04] px-4 py-2 text-sm text-sparkle-text transition-all hover:bg-white/[0.07] hover:text-white"
                    >
                        <Sparkles size={16} />
                        Git AI
                    </Link>
                    <Link
                        to="/settings"
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                    >
                        <ArrowLeft size={16} />
                        Back to Settings
                    </Link>
                </div>
            </div>

            <div className="mb-6 inline-flex items-center rounded-lg border border-white/10 bg-sparkle-card p-1">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'rounded-md px-3 py-1.5 text-xs transition-colors',
                            activeTab === tab.id
                                ? 'bg-[var(--accent-primary)] text-white'
                                : 'text-sparkle-text-secondary hover:bg-white/[0.03] hover:text-sparkle-text'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'pull-requests' ? (
                <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
                    <Section title="PR defaults" description="Used unless a project stores its own PR settings.">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Default guide source">
                                <Select
                                    value={settings.gitPullRequestDefaultGuideSource}
                                    onChange={(value) => updateSettings({ gitPullRequestDefaultGuideSource: value as typeof settings.gitPullRequestDefaultGuideSource })}
                                    options={[
                                        { value: 'global', label: 'Global guide' },
                                        { value: 'repo-template', label: 'Repo template' },
                                        { value: 'none', label: 'None' }
                                    ]}
                                />
                            </Field>
                            <Field label="Default target branch">
                                <Input
                                    value={settings.gitPullRequestDefaultTargetBranch}
                                    onChange={(value) => updateSettings({ gitPullRequestDefaultTargetBranch: value.trim() || 'main' })}
                                />
                            </Field>
                        </div>

                        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                            <Checkbox
                                checked={settings.gitPullRequestDefaultDraft}
                                onChange={(checked) => updateSettings({ gitPullRequestDefaultDraft: checked })}
                                label={settings.gitPullRequestDefaultDraft ? 'Create draft PRs by default' : 'Open PRs ready for review by default'}
                                description="Project-specific PR flows can still override this."
                                size="sm"
                            />
                        </div>
                    </Section>

                    <Section title="Global PR guide" description="Fallback instructions for PR bodies when a project does not override them.">
                        <div className="space-y-4">
                            <Field label="Guide mode">
                                <Select
                                    value={settings.gitPullRequestGlobalGuide.mode}
                                    onChange={(value) => updateSettings({
                                        gitPullRequestGlobalGuide: {
                                            ...settings.gitPullRequestGlobalGuide,
                                            mode: value as typeof settings.gitPullRequestGlobalGuide.mode
                                        }
                                    })}
                                    options={[
                                        { value: 'text', label: 'Write here' },
                                        { value: 'file', label: 'Use markdown file' }
                                    ]}
                                />
                            </Field>

                            {settings.gitPullRequestGlobalGuide.mode === 'text' ? (
                                <Field label="Guide text">
                                    <Textarea
                                        value={settings.gitPullRequestGlobalGuide.text}
                                        onChange={(value) => updateSettings({
                                            gitPullRequestGlobalGuide: {
                                                ...settings.gitPullRequestGlobalGuide,
                                                text: value
                                            }
                                        })}
                                        rows={10}
                                        placeholder="Describe the PR structure, checklist, and tone you want."
                                    />
                                </Field>
                            ) : (
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white/82">
                                                {settings.gitPullRequestGlobalGuide.filePath ? tail(settings.gitPullRequestGlobalGuide.filePath) : 'No guide file selected'}
                                            </p>
                                            <p className="mt-1 truncate text-xs text-white/45">
                                                {settings.gitPullRequestGlobalGuide.filePath || 'Choose a markdown file to use as the global PR guide.'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { void chooseGlobalGuideFile() }}
                                                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/75 transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                                            >
                                                Choose .md
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateSettings({
                                                    gitPullRequestGlobalGuide: {
                                                        ...settings.gitPullRequestGlobalGuide,
                                                        filePath: ''
                                                    }
                                                })}
                                                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/55 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>
                </div>
            ) : null}

            {activeTab === 'workflow' ? (
                <div className="grid gap-4 xl:grid-cols-2">
                    <Section title="Refresh behavior" description="How aggressively Zyra keeps Git data current.">
                        <ToggleRow
                            title="Auto-refresh Git on project open"
                            description="Refresh status, history, remotes, and branches when a project opens."
                            checked={settings.gitAutoRefreshOnProjectOpen}
                            onChange={(checked) => updateSettings({ gitAutoRefreshOnProjectOpen: checked })}
                        />
                    </Section>

                    <Section title="Safety checks" description="Guardrails that stop confusing or destructive Git actions.">
                        <div className="space-y-4">
                            <ToggleRow
                                title="Warn on author mismatch"
                                description="Confirm before committing when the repo owner and configured Git author do not line up."
                                checked={settings.gitWarnOnAuthorMismatch}
                                onChange={(checked) => updateSettings({ gitWarnOnAuthorMismatch: checked })}
                            />
                            <ToggleRow
                                title="Confirm partial push range"
                                description="Show the local-only push approval modal before pushing only part of the commit chain."
                                checked={settings.gitConfirmPartialPushRange}
                                onChange={(checked) => updateSettings({ gitConfirmPartialPushRange: checked })}
                            />
                        </div>
                    </Section>

                    <Section title="Branch automation" description="Optional helpers for the stacked commit, push, and PR flow.">
                        <ToggleRow
                            title="Auto-create branch when target matches current branch"
                            description="If you are on the target branch, Zyra creates a new branch automatically before running the stacked PR flow."
                            checked={settings.gitAutoCreateBranchWhenTargetMatches}
                            onChange={(checked) => updateSettings({ gitAutoCreateBranchWhenTargetMatches: checked })}
                        />
                    </Section>

                    <Section title="PR flow runtime" description="How the built-in PR action behaves.">
                        <Notice>
                            Zyra pushes the current branch when needed, reuses an existing open PR when one already exists, and creates a new GitHub PR when it does not.
                        </Notice>
                        <Notice className="mt-3">
                            GitHub CLI (`gh`) still needs to be installed and authenticated on this machine.
                        </Notice>
                    </Section>
                </div>
            ) : null}

            {activeTab === 'defaults' ? (
                <div className="grid gap-4 xl:grid-cols-2">
                    <Section title="Repository init" description="Defaults used when you initialize Git inside project details.">
                        <Field label="Default initial branch">
                            <Input
                                value={settings.gitInitDefaultBranch}
                                onChange={(value) => updateSettings({ gitInitDefaultBranch: value.trim() || 'main' })}
                            />
                        </Field>

                        <div className="mt-4 space-y-4">
                            <ToggleRow
                                title="Create .gitignore by default"
                                description="Preselect .gitignore generation when starting a new repository."
                                checked={settings.gitInitCreateGitignore}
                                onChange={(checked) => updateSettings({ gitInitCreateGitignore: checked })}
                            />
                            <ToggleRow
                                title="Create initial commit by default"
                                description="Preselect the first commit step in the init flow."
                                checked={settings.gitInitCreateInitialCommit}
                                onChange={(checked) => updateSettings({ gitInitCreateInitialCommit: checked })}
                            />
                        </div>
                    </Section>

                    <Section title="Bulk action scope" description="Used by stage-all and unstage-all actions.">
                        <div className="grid gap-3">
                            <ChoiceCard
                                active={settings.gitBulkActionScope === 'project'}
                                title="Project only"
                                description="Affects files inside the current project folder only."
                                onClick={() => updateSettings({ gitBulkActionScope: 'project' })}
                            />
                            <ChoiceCard
                                active={settings.gitBulkActionScope === 'repo'}
                                title="Whole repository"
                                description="Affects the full repo, even when the project lives in a subfolder."
                                onClick={() => updateSettings({ gitBulkActionScope: 'repo' })}
                            />
                        </div>
                    </Section>
                </div>
            ) : null}

            {activeTab === 'identity' ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
                    <Section title="Global Git author" description="Sets the machine-wide `user.name` and `user.email` used by Git.">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Name">
                                <Input
                                    value={globalAuthorDraft.name}
                                    onChange={(value) => setGlobalAuthorDraft((prev) => ({ ...prev, name: value }))}
                                    placeholder="Jane Doe"
                                />
                            </Field>
                            <Field label="Email">
                                <Input
                                    value={globalAuthorDraft.email}
                                    onChange={(value) => setGlobalAuthorDraft((prev) => ({ ...prev, email: value }))}
                                    placeholder="jane@example.com"
                                    type="email"
                                />
                            </Field>
                        </div>

                        {globalAuthorMessage ? <Notice className="mt-4">{globalAuthorMessage}</Notice> : null}

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => { void saveGlobalAuthor() }}
                                disabled={globalAuthorLoading || !globalAuthorDirty}
                                className={cn(
                                    'rounded-xl border px-4 py-2.5 text-sm transition-all',
                                    globalAuthorLoading || !globalAuthorDirty
                                        ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/35'
                                        : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                                )}
                            >
                                {globalAuthorLoading ? 'Saving...' : 'Save global author'}
                            </button>
                        </div>
                    </Section>

                    <Section title="Auth note" description="Git identity and GitHub PR auth are separate layers.">
                        <div className="space-y-4 text-sm text-sparkle-text-secondary">
                            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                <UserRound size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                                <span>
                                    This page changes Git&apos;s global author. It does not sign you into GitHub or change push credentials.
                                </span>
                            </div>
                            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                <GitPullRequest size={16} className="mt-0.5 shrink-0 text-violet-300" />
                                <span>
                                    PR creation still depends on your Git remote access plus an authenticated `gh` session.
                                </span>
                            </div>
                            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                <RefreshCw size={16} className="mt-0.5 shrink-0 text-sky-300" />
                                <span>
                                    Changing the author here affects future commits created by Git on this machine.
                                </span>
                            </div>
                        </div>
                    </Section>
                </div>
            ) : null}
        </div>
    )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-white/10 bg-sparkle-card p-5">
            <h2 className="font-semibold text-sparkle-text">{title}</h2>
            <p className="mt-1 text-sm text-sparkle-text-secondary">{description}</p>
            <div className="mt-4">{children}</div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</p>
            {children}
        </div>
    )
}

function ToggleRow({
    title,
    description,
    checked,
    onChange
}: {
    title: string
    description: string
    checked: boolean
    onChange: (checked: boolean) => void
}) {
    return (
        <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div>
                <div className="text-sm font-medium text-sparkle-text">{title}</div>
                <div className="mt-1 text-xs text-sparkle-text-muted">{description}</div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={(event) => {
                    event.preventDefault()
                    onChange(!checked)
                }}
                className={cn(
                    'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
                    checked ? 'border-[var(--accent-primary)]/60 bg-[var(--accent-primary)]/30' : 'border-white/10 bg-white/5'
                )}
            >
                <span className={cn('inline-block h-4 w-4 translate-x-1 rounded-full bg-white transition-transform', checked && 'translate-x-6')} />
            </button>
        </label>
    )
}

function ChoiceCard({
    active,
    title,
    description,
    onClick
}: {
    active: boolean
    title: string
    description: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-xl border px-4 py-3 text-left transition-all',
                active ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]'
            )}
        >
            <div className="text-sm font-medium text-sparkle-text">{title}</div>
            <div className="mt-1 text-xs text-sparkle-text-muted">{description}</div>
        </button>
    )
}

function Notice({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-sparkle-text-secondary', className)}>{children}</div>
}

function tail(path: string): string {
    const normalized = String(path || '').trim().replace(/[\\/]+$/, '')
    if (!normalized) return ''
    const parts = normalized.split(/[/\\]/)
    return parts[parts.length - 1] || normalized
}

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { ONBOARDING_STEPS, getPreviousOnboardingStep, type OnboardingStep } from '@shared/onboarding/contracts'
import { useSettings } from '@/lib/settings'
import { useOnboarding } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import { OnboardingChrome } from './OnboardingChrome'
import {
    AppearanceStep,
    ConnectOpenAiStep,
    ProjectsStep,
    ReviewStep,
    WebAccessStep,
    WelcomeStep,
    createAppearanceSelection,
    createProjectsSelection,
    createWebSelection,
    useOpenAiStatus
} from './OnboardingSteps'

const STEP_LABELS: Record<OnboardingStep, string> = {
    welcome: 'Welcome',
    'connect-openai': 'Connect OpenAI',
    appearance: 'Appearance',
    'web-access': 'Web access',
    projects: 'Projects',
    review: 'Review'
}

export function OnboardingFlow() {
    const { settings } = useSettings()
    const onboarding = useOnboarding()
    const record = onboarding.snapshot?.record
    if (!record) return null

    const [appearance, setAppearance] = useState(() => createAppearanceSelection(settings, record))
    const [web, setWeb] = useState(() => createWebSelection(settings, record))
    const [projects, setProjects] = useState(() => createProjectsSelection(settings, record))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const auth = useOpenAiStatus(onboarding.getAuthStatus, record.currentStep === 'connect-openai')

    useEffect(() => {
        if (record.data.appearance) setAppearance(record.data.appearance)
        if (record.data.web) setWeb(record.data.web)
        if (record.data.projects) setProjects(record.data.projects)
    }, [record.data.appearance, record.data.projects, record.data.web])

    const runAuth = async (
        activity: 'chatgpt' | 'api-key',
        work: () => ReturnType<typeof onboarding.connectChatGpt>
    ) => {
        auth.setLoading(true)
        auth.setActivity(activity)
        auth.setError(null)
        try {
            auth.setStatus(await work())
        } catch (authError) {
            auth.setError(authError instanceof Error ? authError.message : 'Could not connect OpenAI.')
        } finally {
            auth.setLoading(false)
            auth.setActivity(null)
        }
    }

    const continueStep = async () => {
        setSaving(true)
        setError(null)
        try {
            const expectedRevision = record.revision
            switch (record.currentStep) {
                case 'welcome':
                    await onboarding.commitStep({ expectedRevision, step: 'welcome' })
                    break
                case 'connect-openai':
                    await onboarding.commitStep({ expectedRevision, step: 'connect-openai' })
                    break
                case 'appearance':
                    await onboarding.commitStep({ expectedRevision, step: 'appearance', selection: appearance })
                    break
                case 'web-access':
                    await onboarding.commitStep({ expectedRevision, step: 'web-access', selection: web })
                    break
                case 'projects':
                    await onboarding.commitStep({ expectedRevision, step: 'projects', selection: projects })
                    break
                case 'review':
                    await onboarding.commitStep({ expectedRevision, step: 'review' })
                    break
            }
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Could not save setup.')
        } finally {
            setSaving(false)
        }
    }

    const goBack = async () => {
        const previous = getPreviousOnboardingStep(record.currentStep)
        if (!previous) return
        setSaving(true)
        setError(null)
        try {
            await onboarding.navigate({ expectedRevision: record.revision, step: previous })
        } catch (navigationError) {
            setError(navigationError instanceof Error ? navigationError.message : 'Could not go back.')
        } finally {
            setSaving(false)
        }
    }

    const goToCompletedStep = async (step: OnboardingStep) => {
        if (saving || step === record.currentStep || !record.completedSteps.includes(step)) return
        if (ONBOARDING_STEPS.indexOf(step) >= ONBOARDING_STEPS.indexOf(record.currentStep)) return
        setSaving(true)
        setError(null)
        try {
            await onboarding.navigate({ expectedRevision: record.revision, step })
        } catch (navigationError) {
            setError(navigationError instanceof Error ? navigationError.message : 'Could not open that setup step.')
        } finally {
            setSaving(false)
        }
    }

    const exitReview = async () => {
        setSaving(true)
        setError(null)
        try {
            await onboarding.cancelReview({ expectedRevision: record.revision })
        } catch (exitError) {
            setError(exitError instanceof Error ? exitError.message : 'Could not exit setup review.')
        } finally {
            setSaving(false)
        }
    }

    const canContinue = record.currentStep !== 'connect-openai' || auth.status?.verified === true
    const projectReady = record.currentStep !== 'projects' || Boolean(projects.projectsFolder.trim())
    const currentIndex = ONBOARDING_STEPS.indexOf(record.currentStep)
    const continueLabel = record.currentStep === 'review'
        ? record.reviewActive ? 'Save setup' : 'Open Zyra'
        : record.currentStep === 'welcome' ? 'Begin setup' : 'Continue'

    return (
        <div className="h-screen overflow-hidden bg-sparkle-bg text-sparkle-text">
            <OnboardingChrome reviewActive={record.reviewActive} onExitReview={record.reviewActive ? () => void exitReview() : undefined} />
            <div className="flex h-full min-h-0 pt-[34px]">
                <aside className="hidden w-[246px] shrink-0 border-r border-[var(--surface-panel-divider)] bg-[var(--surface-sidebar)] px-7 py-10 md:flex md:flex-col">
                    <p className="text-[11px] font-semibold text-sparkle-text-secondary">Device setup</p>
                    <ol className="mt-7 space-y-1">
                        {ONBOARDING_STEPS.map((step, index) => {
                            const complete = record.completedSteps.includes(step)
                            const current = step === record.currentStep
                            const canOpen = complete && index < currentIndex
                            return (
                                <li key={step}>
                                    <button
                                        type="button"
                                        disabled={!canOpen || saving}
                                        onClick={() => void goToCompletedStep(step)}
                                        aria-current={current ? 'step' : undefined}
                                        className={cn(
                                            'grid w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2.5 py-2 text-left text-[12px]',
                                            current ? 'font-semibold text-sparkle-text' : complete ? 'text-sparkle-text-secondary' : 'text-sparkle-text-muted',
                                            canOpen && 'hover:text-sparkle-text',
                                            !canOpen && !current && 'cursor-default'
                                        )}
                                    >
                                        <span className={cn('inline-flex size-4 items-center justify-center rounded-full border text-[9px]', current ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : complete ? 'border-[var(--status-success)] bg-[var(--status-success)] text-black' : 'border-[var(--surface-divider)]')}>
                                            {complete && !current ? <Check size={9} strokeWidth={2.5} /> : index + 1}
                                        </span>
                                        <span>{STEP_LABELS[step]}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ol>
                    <div className="mt-auto border-t border-[var(--surface-divider)] pt-5 text-[10px] leading-4 text-sparkle-text-muted">
                        Progress is saved after every Continue.
                    </div>
                </aside>

                <main className="flex min-w-0 flex-1 flex-col">
                    <div className="border-b border-[var(--surface-divider)] px-6 py-3 md:hidden">
                        <div className="flex items-center justify-between text-[10px] font-medium text-sparkle-text-muted"><span>{STEP_LABELS[record.currentStep]}</span><span>{currentIndex + 1} / {ONBOARDING_STEPS.length}</span></div>
                        <div className="mt-2 h-0.5 bg-[var(--surface-divider)]"><div className="h-full bg-[var(--accent-primary)]" style={{ width: `${((currentIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }} /></div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10 md:px-14 md:py-12">
                        <div className="mx-auto min-h-full w-full max-w-[760px]">
                            {onboarding.snapshot?.recovery ? (
                                <div role="status" className="mb-6 border-l-2 border-[var(--status-warning)] pl-3 text-[11px] leading-5 text-sparkle-text-secondary">
                                    Zyra could not safely read the previous setup checkpoint. The original file was backed up and setup restarted from Welcome.
                                </div>
                            ) : null}
                            {record.currentStep === 'welcome' ? <WelcomeStep /> : null}
                            {record.currentStep === 'connect-openai' ? (
                                <ConnectOpenAiStep
                                    status={auth.status}
                                    loading={auth.loading}
                                    activity={auth.activity}
                                    error={auth.error}
                                    onRefresh={auth.refresh}
                                    onConnectChatGpt={() => runAuth('chatgpt', onboarding.connectChatGpt)}
                                    onConnectApiKey={(apiKey) => runAuth('api-key', () => onboarding.connectApiKey(apiKey))}
                                />
                            ) : null}
                            {record.currentStep === 'appearance' ? <AppearanceStep settings={settings} selection={appearance} onChange={setAppearance} /> : null}
                            {record.currentStep === 'web-access' ? <WebAccessStep selection={web} onChange={setWeb} /> : null}
                            {record.currentStep === 'projects' ? <ProjectsStep selection={projects} onChange={setProjects} /> : null}
                            {record.currentStep === 'review' ? <ReviewStep record={record} /> : null}
                        </div>
                    </div>
                    <footer className="shrink-0 border-t border-[var(--surface-divider)] bg-[var(--surface-chrome)] px-6 py-3 sm:px-10 md:px-14">
                        <div className="mx-auto flex min-h-9 w-full max-w-[760px] items-center gap-3">
                            <button type="button" disabled={saving || currentIndex === 0} onClick={() => void goBack()} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:invisible"><ArrowLeft size={13} />Back</button>
                            <div className="min-w-0 flex-1 text-right text-[11px] text-[var(--status-danger)]">{error}</div>
                            <button type="button" disabled={saving || !canContinue || !projectReady} onClick={() => void continueStep()} className="inline-flex h-9 min-w-[108px] items-center justify-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3.5 text-[12px] font-semibold text-[var(--accent-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">
                                {saving ? 'Saving…' : continueLabel}{!saving && record.currentStep !== 'review' ? <ArrowRight size={13} /> : null}
                            </button>
                        </div>
                    </footer>
                </main>
            </div>
        </div>
    )
}

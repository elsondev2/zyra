import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Puzzle, X } from 'lucide-react'
import type { AssistantActivity } from '@shared/assistant/contracts'
import { NativeOverlayPortal, addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import { cn } from '@/lib/utils'
import { AssistantTimelineActionShell } from './AssistantTimelineActionShell'
import {
    getAssistantActionTarget,
    getAssistantActionTitle,
    getAssistantCapturedRead,
    getAssistantSkillName
} from './assistant-action-presentation'
import { parseAssistantSkillSnapshot } from './assistant-skill-snapshot'
import { getActivityElapsed, getActivityStatus } from './assistant-timeline-helpers'
import { useAssistantHydratedActivity } from './useAssistantHydratedActivity'

function withoutDuplicateSkillHeading(body: string, name: string): string {
    const match = body.match(/^#\s+(.+?)\s*(?:\n+|$)/)
    if (!match || match[1]?.trim().toLowerCase() !== name.trim().toLowerCase()) return body
    return body.slice(match[0].length).replace(/^\n+/, '')
}

export function AssistantSkillSnapshotPreview(props: {
    activity: AssistantActivity
    projectRootPath?: string | null
    onClose: () => void
}) {
    const captured = getAssistantCapturedRead(props.activity)
    const snapshot = parseAssistantSkillSnapshot(captured?.content || '')
    const name = snapshot.name || getAssistantSkillName(props.activity) || 'Skill'
    const body = useMemo(() => withoutDuplicateSkillHeading(snapshot.body, name), [name, snapshot.body])
    const [showSource, setShowSource] = useState(false)
    const capturedPath = captured?.path || `${name}/SKILL.md`
    const dialog = useRef<HTMLDialogElement>(null)
    const titleId = useId()
    const readyDialog = useRef<HTMLDialogElement | null>(null)
    useEffect(() => () => { readyDialog.current?.close() }, [])
    useEffect(() => addOverlayEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || dialog.current?.open) return
        event.preventDefault()
        props.onClose()
    }, true), [props.onClose])
    const content = (
            <dialog
                ref={dialog}
                aria-labelledby={titleId}
                className="m-auto h-[min(780px,calc(100dvh-48px))] w-[min(980px,calc(100vw-48px))] max-h-none max-w-none overflow-hidden rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-0 text-sparkle-text shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop:bg-black/65 open:flex open:flex-col"
                onCancel={(event) => { event.preventDefault(); props.onClose() }}
                onClick={(event) => {
                    if (event.target !== event.currentTarget) return
                    const bounds = event.currentTarget.getBoundingClientRect()
                    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) props.onClose()
                }}
            >
                <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center border-b border-[var(--surface-divider)] px-4">
                    <div aria-hidden="true" />
                    <h1 id={titleId} className="flex min-w-0 items-center justify-center gap-2 text-center text-[15px] font-semibold text-sparkle-text">
                        <Puzzle size={16} className="shrink-0 text-[var(--accent-primary)]" />
                        <span className="truncate" title={name}>{name}</span>
                    </h1>
                    <div className="flex items-center justify-end gap-2">
                        <div role="group" aria-label="Skill view" className="inline-flex rounded-md border border-[var(--surface-divider)] p-0.5 text-[11px]">
                            <button type="button" onClick={() => setShowSource(false)} aria-pressed={!showSource} className={cn('rounded px-2 py-1 transition-colors', !showSource ? 'bg-[var(--surface-active)] text-sparkle-text' : 'text-sparkle-text-muted hover:text-sparkle-text')}>Preview</button>
                            <button type="button" onClick={() => setShowSource(true)} aria-pressed={showSource} className={cn('rounded px-2 py-1 transition-colors', showSource ? 'bg-[var(--surface-active)] text-sparkle-text' : 'text-sparkle-text-muted hover:text-sparkle-text')}>Source</button>
                        </div>
                        <button type="button" onClick={props.onClose} aria-label="Close skill" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><X size={17} /></button>
                    </div>
                </header>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" data-assistant-skill-frontmatter="structured">
                    <article className="mx-auto w-full max-w-3xl px-8 py-8">
                        {showSource ? (
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-sparkle-text-secondary">{captured?.content || 'No captured skill source is available.'}</pre>
                        ) : <>
                            {snapshot.description ? <section aria-label="Description" className="border-b border-[var(--surface-divider)] pb-7"><p className="whitespace-pre-wrap text-[14px] leading-7 text-sparkle-text-secondary">{snapshot.description}</p></section> : null}
                            <section aria-label="Skill instructions" className={cn(snapshot.description && 'pt-7')}>
                                {body ? <MarkdownRenderer content={body} cacheKey={`skill-snapshot:${props.activity.id}:${body.length}`} filePath={capturedPath} linkSearchRoot={props.projectRootPath || undefined} className="text-[13px] leading-6 text-sparkle-text-secondary [&_h1]:text-xl [&_h2]:mt-7 [&_h2]:text-base [&_h3]:text-sm [&_pre]:text-[11px]" /> : <p className="text-[12px] text-sparkle-text-muted">No captured skill instructions are available.</p>}
                            </section>
                        </>}
                    </article>
                </div>
            </dialog>
    )
    if (typeof document === 'undefined') return content
    return <NativeOverlayPortal autoFocus={false} onReady={() => { readyDialog.current = dialog.current; if (dialog.current && !dialog.current.open) dialog.current.showModal() }}>{content}</NativeOverlayPortal>
}

export function AssistantTimelineSkillAction(props: {
    activity: AssistantActivity
    projectRootPath?: string | null
}) {
    const hydrated = useAssistantHydratedActivity(props.activity)
    const [previewActivity, setPreviewActivity] = useState<AssistantActivity | null>(null)
    const name = getAssistantSkillName(hydrated.activity) || 'skill'
    const status = getActivityStatus(hydrated.activity)
    const open = async () => setPreviewActivity(await hydrated.hydrate())
    return (
        <>
            <AssistantTimelineActionShell
                activityId={props.activity.id}
                icon={hydrated.loading ? <Loader2 size={13} className="animate-spin" /> : <Puzzle size={13} />}
                title={getAssistantActionTitle(hydrated.activity, props.projectRootPath)}
                target={getAssistantActionTarget(hydrated.activity, props.projectRootPath) || name}
                createdAt={props.activity.createdAt}
                elapsed={getActivityElapsed(hydrated.activity)}
                status={status}
                onToggle={() => { void open() }}
            />
            {hydrated.error ? <p className="pl-6 text-[10px] text-[color-mix(in_srgb,var(--status-danger)_68%,var(--color-text))]">{hydrated.error}</p> : null}
            {previewActivity ? <AssistantSkillSnapshotPreview activity={previewActivity} projectRootPath={props.projectRootPath} onClose={() => setPreviewActivity(null)} /> : null}
        </>
    )
}

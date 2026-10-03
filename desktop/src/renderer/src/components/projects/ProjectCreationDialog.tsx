import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { NativeOverlayPortal, addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { FolderOpen, Loader2, X } from 'lucide-react'
import type { AssistantProject } from '@shared/assistant/contracts'
import type { ProjectCreationOptions } from '@/lib/projects/project-creation-draft'
import { resolveDroppedProjectFolders } from '@/lib/projects/project-creation-drop'
import { useProjectCreationForm } from '@/lib/projects/useProjectCreationForm'
import './project-creation.css'

export function ProjectCreationDialog({ options, onCreated, onClose }: {
    options: ProjectCreationOptions
    onCreated: (project: AssistantProject) => void
    onClose: () => void
}) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const nameRef = useRef<HTMLInputElement>(null)
    const titleId = useId()
    const nameId = useId()
    const errorId = useId()
    const [dragActive, setDragActive] = useState(false)
    const form = useProjectCreationForm(options, onCreated)
    const busy = form.busy !== null

    const readyDialogRef = useRef<HTMLDialogElement | null>(null)
    useEffect(() => () => { readyDialogRef.current?.close() }, [])
    useEffect(() => addOverlayEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || busy || dialogRef.current?.open) return
        event.preventDefault()
        onClose()
    }, true), [busy, onClose])

    const handleFolderDrop = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setDragActive(false)
        if (busy) return
        form.setError(null)
        try {
            const folders = await resolveDroppedProjectFolders(
                Array.from(event.dataTransfer.items),
                file => window.devscope.assistant.getPathForFile(file)
            )
            form.addFolders(folders)
        } catch (error) {
            form.setError(error instanceof Error ? error.message : 'Could not add that folder.')
        }
    }

    return <NativeOverlayPortal autoFocus={false} onReady={() => { readyDialogRef.current = dialogRef.current; if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal(); nameRef.current?.focus(); nameRef.current?.select() }}><dialog
            ref={dialogRef}
            className="project-creation-dialog"
            aria-labelledby={titleId}
            aria-busy={busy}
            onKeyDown={(event) => event.stopPropagation()}
            onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
            onClick={(event) => {
                if (event.target !== event.currentTarget || busy) return
                const bounds = event.currentTarget.getBoundingClientRect()
                if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
            }}
        >
            <form onSubmit={(event) => { event.preventDefault(); void form.submit() }}>
                <header className="project-creation-header">
                    <h2 id={titleId}>Create a project</h2>
                    <button type="button" className="project-creation-icon" onClick={onClose} disabled={busy} aria-label="Close project setup"><X size={18} /></button>
                </header>
                <div className="project-creation-body custom-scrollbar">
                    <label htmlFor={nameId}>Project name</label>
                    <input ref={nameRef} id={nameId} autoFocus value={form.name} onChange={(event) => form.setName(event.target.value)} maxLength={120} disabled={busy} placeholder="Name your project" autoComplete="off" />
                    <div className="project-creation-folder-heading"><h3>Project folders</h3><span>Optional</span></div>
                    <div
                        className={`project-creation-dropzone${dragActive ? ' is-drag-active' : ''}`}
                        role="button"
                        tabIndex={busy ? -1 : 0}
                        aria-label="Choose or drop project folders"
                        aria-disabled={busy}
                        onClick={() => { if (!busy) void form.browse() }}
                        onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !busy) {
                                event.preventDefault()
                                void form.browse()
                            }
                        }}
                        onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
                        onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
                        onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
                        }}
                        onDrop={(event) => void handleFolderDrop(event)}
                    >
                        {form.busy === 'browse' ? <Loader2 size={21} className="animate-spin" aria-hidden="true" /> : <FolderOpen size={22} aria-hidden="true" />}
                        <strong>Drop folders here</strong>
                        <span>or click to choose from your computer</span>
                    </div>
                    {form.folders.length > 0 ? (
                        <ul className="project-creation-folders custom-scrollbar" aria-label="Included folders">
                            {form.folders.map((path) => (
                                <li key={path}>
                                    <FolderOpen size={16} aria-hidden="true" />
                                    <span title={path}>{path}</span>
                                    <button type="button" className="project-creation-icon" aria-label={`Remove ${path}`} disabled={busy} onClick={() => form.removeFolder(path)}><X size={15} /></button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {form.error ? <p id={errorId} role="alert" className="project-creation-error">{form.error}</p> : null}
                </div>
                <footer className="project-creation-footer">
                    <button type="button" className="project-creation-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="submit" className="project-creation-primary" disabled={busy || !form.name.trim()} aria-describedby={form.error ? errorId : undefined}>
                        {form.busy === 'create' ? <><Loader2 size={14} className="animate-spin" />Creating...</> : 'Create project'}
                    </button>
                </footer>
            </form>
        </dialog></NativeOverlayPortal>
}

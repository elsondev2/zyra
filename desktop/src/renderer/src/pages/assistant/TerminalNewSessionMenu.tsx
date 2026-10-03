import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderOpen, Plus } from 'lucide-react'
import type { Shell } from '@/lib/settings'

type Props = {
    defaultShell: Shell
    defaultDirectory: string
    creating: boolean
    onCreate: (shell: Shell, directory: string) => void
    shortcutTitle: string
}

export function TerminalNewSessionMenu({ defaultShell, defaultDirectory, creating, onCreate, shortcutTitle }: Props) {
    const [open, setOpen] = useState(false)
    const [shell, setShell] = useState<Shell>(defaultShell)
    const [directory, setDirectory] = useState(defaultDirectory)
    const [choosing, setChoosing] = useState(false)
    const [error, setError] = useState('')
    const menuRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!open) return
        const dismiss = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
        }
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', dismiss, true)
        document.addEventListener('keydown', escape)
        return () => {
            document.removeEventListener('pointerdown', dismiss, true)
            document.removeEventListener('keydown', escape)
        }
    }, [open])

    const toggle = () => {
        if (!open) {
            setShell(defaultShell)
            setDirectory(defaultDirectory)
            setError('')
        }
        setOpen((current) => !current)
    }

    const chooseFolder = async () => {
        if (choosing) return
        setChoosing(true)
        try {
            const result = await window.devscope.selectFolder()
            if (result.success && result.folderPath) setDirectory(result.folderPath)
            else if (!result.success) setError(result.error || 'Could not choose a folder.')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not choose a folder.')
        } finally {
            setChoosing(false)
        }
    }

    return <div ref={menuRef} className="relative flex shrink-0">
        <button type="button" onClick={() => onCreate(defaultShell, defaultDirectory)} disabled={creating} title={shortcutTitle} className="inline-flex h-7 items-center gap-1 border border-[var(--surface-divider)] bg-white/[0.04] px-2 text-[10px] font-medium text-sparkle-text hover:bg-white/[0.08] disabled:opacity-35"><Plus size={12} />New session</button>
        <button type="button" onClick={toggle} disabled={creating} aria-label="New session options" aria-haspopup="menu" aria-expanded={open} className="inline-flex size-7 items-center justify-center border border-l-0 border-[var(--surface-divider)] bg-white/[0.04] text-sparkle-text-secondary hover:bg-white/[0.08] disabled:opacity-35"><ChevronDown size={12} /></button>
        {open ? <div role="menu" aria-label="New session options" className="absolute left-0 top-[30px] z-30 w-[260px] border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-2 shadow-xl">
            <div className="mb-1 text-[10px] font-medium text-sparkle-text-secondary">Terminal</div>
            {(['powershell', 'cmd'] as const).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={shell === option} onClick={() => setShell(option)} className="flex h-7 w-full items-center justify-between px-2 text-left text-[11px] text-sparkle-text hover:bg-white/[0.06]"><span>{option === 'cmd' ? 'CMD' : 'PowerShell'}</span>{shell === option ? <Check size={12} /> : null}</button>)}
            <div className="mb-1 mt-2 text-[10px] font-medium text-sparkle-text-secondary">Open in</div>
            <button type="button" role="menuitemradio" aria-checked={directory === defaultDirectory} onClick={() => setDirectory(defaultDirectory)} className="flex h-7 w-full items-center justify-between gap-2 px-2 text-left text-[11px] text-sparkle-text hover:bg-white/[0.06]"><span className="min-w-0 flex-1 truncate" title={defaultDirectory || 'User home'}>{defaultDirectory || 'User home'}</span>{directory === defaultDirectory ? <Check size={12} className="shrink-0" /> : null}</button>
            <button type="button" role="menuitem" onClick={() => void chooseFolder()} disabled={choosing} className="flex h-7 w-full items-center gap-2 px-2 text-left text-[11px] text-sparkle-text hover:bg-white/[0.06] disabled:opacity-40"><FolderOpen size={12} />Choose folder…</button>
            {directory !== defaultDirectory ? <div className="truncate px-2 py-1 text-[10px] text-sparkle-text-muted" title={directory}>{directory}</div> : null}
            {error ? <div role="alert" className="px-2 py-1 text-[10px] text-red-300">{error}</div> : null}
            <button type="button" role="menuitem" onClick={() => { onCreate(shell, directory); setOpen(false) }} disabled={creating || choosing} className="mt-2 h-7 w-full bg-[var(--accent-primary)]/15 px-2 text-left text-[11px] font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/25 disabled:opacity-40">Create session</button>
        </div> : null}
    </div>
}

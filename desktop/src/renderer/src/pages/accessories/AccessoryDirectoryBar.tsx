import type { CSSProperties } from 'react'
import { FolderOpen, LoaderCircle } from 'lucide-react'
import { AccessoryHeaderPortal } from './AccessoryHeaderContext'

type DirectoryControlsProps = { path: string; disabled?: boolean; busy?: boolean; onChoose: () => void }

export function AccessoryDirectoryBar(props: DirectoryControlsProps) {
    return <AccessoryHeaderPortal><AccessoryDirectoryControls {...props} /></AccessoryHeaderPortal>
}

export function AccessoryDirectoryControls({ path, disabled = false, busy = false, onChoose }: DirectoryControlsProps) {
    return <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        <span className="min-w-0 select-text truncate text-[11px] text-sparkle-text-secondary" title={path} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>{path}</span>
        <button type="button" disabled={disabled || busy} onClick={onChoose} aria-label="Choose folder" aria-busy={busy || undefined} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            title={disabled ? 'Close the file preview before changing folders' : 'Choose folder'}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] disabled:opacity-40">
            {busy ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <FolderOpen size={14} />}
        </button>
        <span aria-hidden="true" data-accessory-drag-region="true" className="min-w-2 flex-1 self-stretch" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
    </div>
}

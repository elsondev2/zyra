import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

export interface FileTypePreset {
    id: string
    label: string
    extension: string
    description: string
}

const FILE_TYPE_PRESETS: FileTypePreset[] = [
    { id: 'markdown', label: 'Markdown', extension: 'md', description: 'Notes and docs' },
    { id: 'json', label: 'JSON', extension: 'json', description: 'Structured data' },
    { id: 'typescript', label: 'TypeScript', extension: 'ts', description: 'Typed JS source' },
    { id: 'javascript', label: 'JavaScript', extension: 'js', description: 'JS source file' },
    { id: 'tsx', label: 'TSX', extension: 'tsx', description: 'React TypeScript component' },
    { id: 'jsx', label: 'JSX', extension: 'jsx', description: 'React JavaScript component' },
    { id: 'python', label: 'Python', extension: 'py', description: 'Python source' },
    { id: 'java', label: 'Java', extension: 'java', description: 'Java source' },
    { id: 'csharp', label: 'C#', extension: 'cs', description: '.NET source' },
    { id: 'go', label: 'Go', extension: 'go', description: 'Go source' },
    { id: 'rust', label: 'Rust', extension: 'rs', description: 'Rust source' },
    { id: 'php', label: 'PHP', extension: 'php', description: 'PHP source' },
    { id: 'ruby', label: 'Ruby', extension: 'rb', description: 'Ruby source' },
    { id: 'sql', label: 'SQL', extension: 'sql', description: 'Database query file' },
    { id: 'shell', label: 'Shell Script', extension: 'sh', description: 'Shell script' },
    { id: 'powershell', label: 'PowerShell', extension: 'ps1', description: 'PowerShell script' },
    { id: 'text', label: 'Text', extension: 'txt', description: 'Plain text' },
    { id: 'log', label: 'Log', extension: 'log', description: 'Log file' },
    { id: 'yaml', label: 'YAML', extension: 'yml', description: 'Config and manifests' },
    { id: 'toml', label: 'TOML', extension: 'toml', description: 'Configuration file' },
    { id: 'ini', label: 'INI', extension: 'ini', description: 'INI config file' },
    { id: 'xml', label: 'XML', extension: 'xml', description: 'Structured markup' },
    { id: 'csv', label: 'CSV', extension: 'csv', description: 'Spreadsheet data' },
    { id: 'env', label: 'ENV', extension: 'env', description: 'Environment variables' },
    { id: 'gitignore', label: 'Git Ignore', extension: 'gitignore', description: 'Git ignore rules' },
    { id: 'dockerfile', label: 'Dockerfile', extension: 'dockerfile', description: 'Container build file' },
    { id: 'css', label: 'CSS', extension: 'css', description: 'Stylesheet' },
    { id: 'scss', label: 'SCSS', extension: 'scss', description: 'Sass stylesheet' },
    { id: 'html', label: 'HTML', extension: 'html', description: 'Web document' }
]

interface CreateFileTypeModalProps {
    isOpen: boolean
    destinationDirectory: string
    initialExtension?: string
    errorMessage?: string | null
    onCreate: (fileName: string) => void | Promise<void>
    onCancel: () => void
}

function extractExtension(value: string): string {
    const trimmed = String(value || '').trim()
    if (!trimmed || trimmed.endsWith('.')) return ''
    const idx = trimmed.lastIndexOf('.')
    if (idx <= 0 || idx === trimmed.length - 1) return ''
    return trimmed.slice(idx + 1).toLowerCase()
}

function normalizeTypeInput(value: string): string {
    return String(value || '').trim().toLowerCase()
}

function getExtensionCandidate(value: string): string {
    const normalized = normalizeTypeInput(value)
    if (!normalized) return ''
    const withoutDot = normalized.startsWith('.') ? normalized.slice(1) : normalized
    const lastSegment = withoutDot.includes('.') ? withoutDot.split('.').pop() || '' : withoutDot
    return lastSegment.replace(/[^\w-]/g, '')
}

export function CreateFileTypeModal({
    isOpen,
    destinationDirectory,
    initialExtension,
    errorMessage,
    onCreate,
    onCancel
}: CreateFileTypeModalProps) {
    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const iconPathOverrides: Record<string, string> = {
        env: '.env',
        gitignore: '.gitignore',
        dockerfile: 'Dockerfile'
    }
    const normalizedInitialExtension = String(initialExtension || '').trim().replace(/^\./, '').toLowerCase()
    const initialPreset = useMemo(
        () => FILE_TYPE_PRESETS.find((preset) => preset.extension === normalizedInitialExtension),
        [normalizedInitialExtension]
    )
    const [nameInput, setNameInput] = useState('')
    const [selectedExtension, setSelectedExtension] = useState(initialPreset?.extension || 'txt')
    const [typeSearchInput, setTypeSearchInput] = useState(initialPreset?.label || normalizedInitialExtension || 'txt')
    const [internalError, setInternalError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        setNameInput('')
        setSelectedExtension(initialPreset?.extension || 'txt')
        setTypeSearchInput(initialPreset?.label || normalizedInitialExtension || 'txt')
        setInternalError(null)
    }, [isOpen, initialPreset, normalizedInitialExtension])

    const normalizedTypeSearchInput = normalizeTypeInput(typeSearchInput)
    const matchingPresets = FILE_TYPE_PRESETS.filter((preset) => {
        if (!normalizedTypeSearchInput) return true
        return (
            preset.label.toLowerCase().includes(normalizedTypeSearchInput)
            || preset.extension.toLowerCase().includes(normalizedTypeSearchInput)
            || preset.description.toLowerCase().includes(normalizedTypeSearchInput)
        )
    })
    const exactPreset = matchingPresets.find((preset) => (
        preset.extension.toLowerCase() === normalizedTypeSearchInput
        || preset.label.toLowerCase() === normalizedTypeSearchInput
    ))
    const manuallySelectedPreset = FILE_TYPE_PRESETS.find((preset) => preset.extension === selectedExtension)
    const selectedPreset = exactPreset
        || (normalizedTypeSearchInput ? (matchingPresets[0] || null) : null)
        || manuallySelectedPreset
        || null
    const finalExtension = selectedPreset?.extension || getExtensionCandidate(typeSearchInput)
    const normalizedBaseName = nameInput.trim()
    const hasExplicitExt = Boolean(extractExtension(normalizedBaseName))
    const previewName = normalizedBaseName
        ? (hasExplicitExt ? normalizedBaseName : `${normalizedBaseName}.${finalExtension}`)
        : ''
    const canCreate = normalizedBaseName.length > 0
    const renderPresetIcon = (extension: string) => (
        <VscodeEntryIcon
            pathValue={iconPathOverrides[extension] ?? `file.${extension || 'txt'}`}
            kind="file"
            theme={iconTheme}
            className="size-4 shrink-0"
        />
    )

    if (!isOpen || typeof document === 'undefined') return null

    return createPortal(
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 backdrop-blur-md animate-fadeIn px-4"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-3xl max-h-[95vh] rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl overflow-hidden flex flex-col"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="border-b border-white/10 px-5 py-4 flex-shrink-0">
                    <h3 className="text-base font-semibold text-white/90">Create New File</h3>
                    <p className="mt-1 text-xs text-white/45 truncate" title={destinationDirectory}>
                        Destination: {destinationDirectory}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[1.3fr_1fr] overflow-y-auto flex-1">
                    <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-wide text-white/40">File Types</p>
                            <span className="text-[11px] text-white/40">{matchingPresets.length} matches</span>
                        </div>
                        <div className="relative mb-2">
                            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                            <input
                                value={typeSearchInput}
                                onChange={(event) => {
                                    setTypeSearchInput(event.target.value)
                                    if (internalError) setInternalError(null)
                                }}
                                placeholder="Search type or extension (e.g. markdown, md, ts)"
                                className="w-full rounded-lg border border-white/15 bg-black/35 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[var(--accent-primary)]/50"
                            />
                        </div>
                        <div className="max-h-[310px] overflow-y-auto pr-1 custom-scrollbar">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {matchingPresets.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedExtension(preset.extension)
                                            setTypeSearchInput(preset.label)
                                            if (internalError) setInternalError(null)
                                        }}
                                        className={cn(
                                            'rounded-lg border px-3 py-2 text-left transition-all',
                                            selectedPreset?.extension === preset.extension
                                                ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/15 text-white'
                                                : 'border-white/10 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10'
                                        )}
                                    >
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            {renderPresetIcon(preset.extension)}
                                            {preset.label}
                                            <span className="text-[10px] text-white/45">.{preset.extension}</span>
                                        </div>
                                        <p className="mt-1 text-[11px] text-white/45">{preset.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {matchingPresets.length === 0 && (
                            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                                No preset match. You can still create with custom extension: <span className="font-mono">.{finalExtension || 'ext'}</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-3">
                        <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">File name</label>
                            <input
                                value={nameInput}
                                onChange={(event) => {
                                    setNameInput(event.target.value)
                                    if (internalError) setInternalError(null)
                                }}
                                placeholder="example"
                                className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent-primary)]/50"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">Selected type</label>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85">
                                {selectedPreset
                                    ? `${selectedPreset.label} (.${selectedPreset.extension})`
                                    : `Custom (.${finalExtension || 'ext'})`}
                            </div>
                        </div>

                        {previewName && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                                Will create: <span className="font-mono">{previewName}</span>
                            </div>
                        )}
                    </div>
                </div>

                {(errorMessage || internalError) && (
                    <div className="px-5 pb-2 text-sm text-red-300">
                        {errorMessage || internalError}
                    </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canCreate}
                        onClick={() => {
                            const baseName = nameInput.trim()
                            const resolvedExtension = String(finalExtension || '').replace(/^\./, '').trim()
                            if (!baseName) {
                                setInternalError('File name is required.')
                                return
                            }
                            if (!resolvedExtension && !extractExtension(baseName)) {
                                setInternalError('Please choose or enter a file extension.')
                                return
                            }
                            const fileName = extractExtension(baseName)
                                ? baseName
                                : `${baseName}.${resolvedExtension}`
                            void onCreate(fileName)
                        }}
                        className={cn(
                            'rounded-lg border px-3 py-1.5 text-sm',
                            canCreate
                                ? 'border-emerald-500/35 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                                : 'cursor-not-allowed border-white/10 bg-white/5 text-white/35'
                        )}
                    >
                        Create File
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

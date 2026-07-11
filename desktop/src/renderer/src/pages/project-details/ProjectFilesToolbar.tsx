import { startTransition, type ReactNode } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Plus, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileActionsMenu } from '@/components/ui/FileActionsMenu'

type ProjectFilesToolbarProps = {
    fileSearch: string
    setFileSearch: (value: string) => void
    refreshFileTree?: () => Promise<unknown> | void
    loadingFiles: boolean
    onToggleAllFolders?: () => Promise<void> | void
    setIsExpandingFolders: (value: boolean) => void
    expandedFolders: Set<string>
    setExpandedFolders: (value: Set<string>) => void
    allFolderPathsSet: Set<string>
    isExpandingFolders: boolean
    showHidden: boolean
    setShowHidden: (value: boolean) => void
    onFileTreeCreateFile: (node?: any, presetExtension?: string) => void
    onFileTreeCreateFolder: (node?: any) => void
    renderEntryIcon: (pathValue: string, kind: 'file' | 'directory') => ReactNode
    fileTreeCount: number
}

const EMPTY_SET = new Set<string>()

export function ProjectFilesToolbar({
    fileSearch,
    setFileSearch,
    refreshFileTree,
    loadingFiles,
    onToggleAllFolders,
    setIsExpandingFolders,
    expandedFolders,
    setExpandedFolders,
    allFolderPathsSet,
    isExpandingFolders,
    showHidden,
    setShowHidden,
    onFileTreeCreateFile,
    onFileTreeCreateFolder,
    renderEntryIcon,
    fileTreeCount
}: ProjectFilesToolbarProps) {
    return (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                    type="text"
                    value={fileSearch}
                    onChange={(event) => setFileSearch(event.target.value)}
                    placeholder="Search files..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all"
                />
            </div>

            <button
                onClick={() => { void refreshFileTree?.() }}
                disabled={loadingFiles}
                className={cn(
                    'p-2 rounded-lg transition-all',
                    loadingFiles
                        ? 'opacity-50 cursor-not-allowed text-white/30'
                        : 'text-white/40 hover:text-white hover:bg-white/5'
                )}
                title="Refresh files"
            >
                <RefreshCw size={16} className={cn(loadingFiles && 'animate-spin')} />
            </button>

            <button
                onClick={() => {
                    if (onToggleAllFolders) {
                        void onToggleAllFolders()
                        return
                    }
                    setIsExpandingFolders(true)
                    startTransition(() => {
                        if (expandedFolders.size > 0) {
                            setExpandedFolders(EMPTY_SET)
                        } else {
                            setExpandedFolders(allFolderPathsSet)
                        }
                        setTimeout(() => setIsExpandingFolders(false), 300)
                    })
                }}
                disabled={isExpandingFolders}
                className={cn(
                    'p-2 rounded-lg transition-all',
                    isExpandingFolders && 'opacity-50 cursor-not-allowed',
                    expandedFolders.size > 0
                        ? 'text-white/60 hover:text-white hover:bg-white/5'
                        : 'text-white/40 hover:text-white hover:bg-white/5'
                )}
                title={isExpandingFolders ? 'Loading...' : expandedFolders.size > 0 ? 'Collapse all folders' : 'Expand all folders'}
            >
                {isExpandingFolders ? (
                    <RefreshCw size={16} className="animate-spin" />
                ) : expandedFolders.size > 0 ? (
                    <ChevronsDownUp size={16} />
                ) : (
                    <ChevronsUpDown size={16} />
                )}
            </button>

            <button
                onClick={() => setShowHidden(!showHidden)}
                className={cn(
                    'p-2 rounded-lg transition-all',
                    showHidden ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
                )}
                title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            >
                {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            <FileActionsMenu
                title="Create"
                buttonClassName="!h-auto !w-auto !rounded-lg !border-transparent !bg-transparent !p-2 text-white/40 hover:text-white hover:!bg-white/5"
                triggerIcon={<Plus size={16} className="mx-auto" />}
                items={[
                    {
                        id: 'new-file-type',
                        label: 'New File (Choose Type...)',
                        icon: renderEntryIcon('file', 'file'),
                        onSelect: () => onFileTreeCreateFile()
                    },
                    {
                        id: 'new-md-file',
                        label: 'Markdown (.md)',
                        icon: renderEntryIcon('file.md', 'file'),
                        onSelect: () => onFileTreeCreateFile(undefined, 'md')
                    },
                    {
                        id: 'new-json-file',
                        label: 'JSON (.json)',
                        icon: renderEntryIcon('file.json', 'file'),
                        onSelect: () => onFileTreeCreateFile(undefined, 'json')
                    },
                    {
                        id: 'new-ts-file',
                        label: 'TypeScript (.ts)',
                        icon: renderEntryIcon('file.ts', 'file'),
                        onSelect: () => onFileTreeCreateFile(undefined, 'ts')
                    },
                    {
                        id: 'new-txt-file',
                        label: 'Text (.txt)',
                        icon: renderEntryIcon('file.txt', 'file'),
                        onSelect: () => onFileTreeCreateFile(undefined, 'txt')
                    },
                    {
                        id: 'new-folder',
                        label: 'New Folder',
                        icon: renderEntryIcon('folder', 'directory'),
                        onSelect: () => onFileTreeCreateFolder()
                    }
                ]}
            />

            <span className="text-xs text-white/40 whitespace-nowrap">
                {fileTreeCount} items
            </span>
        </div>
    )
}

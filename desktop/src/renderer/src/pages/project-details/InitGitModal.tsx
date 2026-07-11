import { useDeferredValue } from 'react'
import { GitBranch, GitPullRequest, RefreshCw, Search, X } from 'lucide-react'
import { Checkbox, Input, Radio, Select } from '@/components/ui/FormControls'

interface GitignorePattern {
    id: string
    category: string
    label: string
    description: string
}

export function InitGitModal({
    isOpen,
    onClose,
    step,
    branchName,
    setBranchName,
    customBranchName,
    setCustomBranchName,
    createGitignore,
    setCreateGitignore,
    gitignoreTemplate,
    setGitignoreTemplate,
    availableTemplates,
    availablePatterns,
    selectedPatterns,
    setSelectedPatterns,
    patternSearch,
    setPatternSearch,
    createInitialCommit,
    setCreateInitialCommit,
    initialCommitMessage,
    setInitialCommitMessage,
    isInitializing,
    onInit,
    remoteUrl,
    setRemoteUrl,
    isAddingRemote,
    onAddRemote,
    onSkipRemote
}: {
    isOpen: boolean
    onClose: () => void
    step: 'config' | 'remote'
    branchName: 'main' | 'master' | 'custom'
    setBranchName: (value: 'main' | 'master' | 'custom') => void
    customBranchName: string
    setCustomBranchName: (value: string) => void
    createGitignore: boolean
    setCreateGitignore: (value: boolean) => void
    gitignoreTemplate: string
    setGitignoreTemplate: (value: string) => void
    availableTemplates: string[]
    availablePatterns: GitignorePattern[]
    selectedPatterns: Set<string>
    setSelectedPatterns: (value: Set<string>) => void
    patternSearch: string
    setPatternSearch: (value: string) => void
    createInitialCommit: boolean
    setCreateInitialCommit: (value: boolean) => void
    initialCommitMessage: string
    setInitialCommitMessage: (value: string) => void
    isInitializing: boolean
    onInit: () => void
    remoteUrl: string
    setRemoteUrl: (value: string) => void
    isAddingRemote: boolean
    onAddRemote: () => void
    onSkipRemote: () => void
}) {
    const deferredPatternSearch = useDeferredValue(patternSearch)
    const patternSearchValue = deferredPatternSearch.toLowerCase()

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn" onClick={step === 'config' ? onClose : undefined}>
            <div
                className="bg-sparkle-card border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col m-4 overflow-hidden"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <GitBranch size={20} className="text-[var(--accent-primary)]" />
                        {step === 'config' ? 'Initialize Git Repository' : 'Add Remote Repository'}
                    </h3>
                    {step === 'config' && (
                        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar flex-1 space-y-6">
                    {step === 'config' ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-3">Default Branch Name</label>
                                <div className="space-y-2">
                                    <div className="p-3 rounded-lg hover:bg-white/5 transition-colors">
                                        <Radio
                                            checked={branchName === 'main'}
                                            onChange={() => setBranchName('main')}
                                            label="main"
                                            description="Recommended default branch name"
                                        />
                                    </div>
                                    <div className="p-3 rounded-lg hover:bg-white/5 transition-colors">
                                        <Radio
                                            checked={branchName === 'master'}
                                            onChange={() => setBranchName('master')}
                                            label="master"
                                            description="Traditional default branch name"
                                        />
                                    </div>
                                    <div className="p-3 rounded-lg hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Radio
                                                checked={branchName === 'custom'}
                                                onChange={() => setBranchName('custom')}
                                                label="Custom"
                                                description="Enter your own branch name"
                                            />
                                        </div>
                                        {branchName === 'custom' && (
                                            <div className="mt-3 ml-8">
                                                <Input
                                                    value={customBranchName}
                                                    onChange={setCustomBranchName}
                                                    placeholder="branch-name"
                                                    size="sm"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Checkbox
                                    checked={createGitignore}
                                    onChange={setCreateGitignore}
                                    label="Create .gitignore file"
                                    description="Automatically ignore common files and directories"
                                    className="mb-4"
                                />
                                {createGitignore && (
                                    <div className="space-y-3 ml-8">
                                        <div>
                                            <label className="block text-xs font-medium text-white/60 mb-2">Template</label>
                                            <Select
                                                value={gitignoreTemplate}
                                                onChange={setGitignoreTemplate}
                                                options={availableTemplates.map((template) => ({ value: template, label: template }))}
                                                size="sm"
                                            />
                                        </div>

                                        {gitignoreTemplate === 'Custom' && (
                                            <div className="bg-black/30 rounded-xl border border-white/5 p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-medium text-white/80">Select Patterns to Ignore</h4>
                                                    <span className="text-xs text-white/40">{selectedPatterns.size} selected</span>
                                                </div>

                                                <div className="relative mb-3">
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                                                    <Input
                                                        value={patternSearch}
                                                        onChange={setPatternSearch}
                                                        placeholder="Search patterns..."
                                                        size="sm"
                                                        className="pl-9"
                                                    />
                                                </div>

                                                <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-3">
                                                    {['dependencies', 'build', 'environment', 'ide', 'os', 'logs', 'cache', 'testing'].map((category) => {
                                                        const categoryPatterns = availablePatterns.filter((pattern) =>
                                                            pattern.category === category &&
                                                            (!patternSearchValue ||
                                                                pattern.label.toLowerCase().includes(patternSearchValue) ||
                                                                pattern.description.toLowerCase().includes(patternSearchValue))
                                                        )
                                                        if (categoryPatterns.length === 0) return null

                                                        const categoryNames: Record<string, string> = {
                                                            dependencies: 'Dependencies',
                                                            build: 'Build Outputs',
                                                            environment: 'Environment',
                                                            ide: 'IDE & Editors',
                                                            os: 'Operating System',
                                                            logs: 'Logs',
                                                            cache: 'Cache & Temp',
                                                            testing: 'Testing'
                                                        }

                                                        return (
                                                            <div key={category}>
                                                                <div className="text-[10px] uppercase font-bold text-white/40 mb-2 px-1 tracking-wider">
                                                                    {categoryNames[category]}
                                                                </div>
                                                                <div className="space-y-1">
                                                                    {categoryPatterns.map((pattern) => (
                                                                        <div key={pattern.id} className="rounded-lg hover:bg-white/5 transition-colors">
                                                                            <Checkbox
                                                                                checked={selectedPatterns.has(pattern.id)}
                                                                                onChange={(checked) => {
                                                                                    const newSelected = new Set(selectedPatterns)
                                                                                    if (checked) {
                                                                                        newSelected.add(pattern.id)
                                                                                    } else {
                                                                                        newSelected.delete(pattern.id)
                                                                                    }
                                                                                    setSelectedPatterns(newSelected)
                                                                                }}
                                                                                label={pattern.label}
                                                                                description={pattern.description}
                                                                                size="sm"
                                                                                className="p-2"
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>

                                                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                                                    <button
                                                        onClick={() => setSelectedPatterns(new Set(availablePatterns.map((pattern) => pattern.id)))}
                                                        className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/10 hover:border-white/20"
                                                    >
                                                        Select All
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedPatterns(new Set())}
                                                        className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/10 hover:border-white/20"
                                                    >
                                                        Clear All
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <Checkbox
                                    checked={createInitialCommit}
                                    onChange={setCreateInitialCommit}
                                    label="Create initial commit"
                                    description="Stage all files and create the first commit (optional)"
                                    className="mb-4"
                                />
                                {createInitialCommit && (
                                    <div className="ml-8">
                                        <label className="block text-xs font-medium text-white/60 mb-2">Commit Message</label>
                                        <Input
                                            value={initialCommitMessage}
                                            onChange={setInitialCommitMessage}
                                            placeholder="Initial commit"
                                            size="sm"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                                <p className="text-xs text-blue-400">
                                    This will initialize a new Git repository in your project directory. After initialization, you&apos;ll be prompted to add a remote repository (optional).
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-3">Remote Repository URL</label>
                                <Input
                                    value={remoteUrl}
                                    onChange={setRemoteUrl}
                                    placeholder="https://github.com/username/repo.git"
                                    type="url"
                                />
                                <p className="text-xs text-white/40 mt-2">
                                    Enter the URL of your remote repository (GitHub, GitLab, etc.)
                                </p>
                            </div>

                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                <p className="text-xs text-green-400">
                                    Git repository initialized successfully. You can now add a remote repository to push your code, or skip this step and add it later.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3 p-5 border-t border-white/5 bg-black/20">
                    {step === 'config' ? (
                        <>
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-lg transition-all border border-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onInit}
                                disabled={isInitializing || (branchName === 'custom' && !customBranchName.trim())}
                                className="flex-1 px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                {isInitializing ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Initializing...
                                    </>
                                ) : (
                                    <>
                                        <GitBranch size={16} />
                                        Initialize Repository
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onSkipRemote}
                                disabled={isAddingRemote}
                                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-lg transition-all border border-white/10 disabled:opacity-50"
                            >
                                Skip for Now
                            </button>
                            <button
                                onClick={onAddRemote}
                                disabled={isAddingRemote || !remoteUrl.trim()}
                                className="flex-1 px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                {isAddingRemote ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Adding Remote...
                                    </>
                                ) : (
                                    <>
                                        <GitPullRequest size={16} />
                                        Add Remote
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

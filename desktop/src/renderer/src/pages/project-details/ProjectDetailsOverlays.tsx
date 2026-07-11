import { CommitDiffModal } from './CommitDiffModal'
import { InitGitModal } from './InitGitModal'
import { AuthorMismatchModal, DependenciesModal, ScriptCatalogModal } from './ProjectDetailsModals'

export interface ProjectDetailsOverlaysProps {
    [key: string]: any
}

export function ProjectDetailsOverlays(props: ProjectDetailsOverlaysProps) {
    const {
        project,
        showScriptsModal,
        setShowScriptsModal,
        showDependenciesModal,
        setShowDependenciesModal,
        onDependenciesUpdated,
        onRunScript,
        scriptPredictions,
        selectedCommit,
        commitDiff,
        loadingDiff,
        setSelectedCommit,
        setCommitDiff,
        showAuthorMismatch,
        gitUser,
        repoOwner,
        handleAuthorMismatchConfirm,
        setShowAuthorMismatch,
        dontShowAuthorWarning,
        setDontShowAuthorWarning,
        showInitModal,
        setShowInitModal,
        setInitStep,
        initStep,
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
        handleInitGit,
        remoteUrl,
        setRemoteUrl,
        isAddingRemote,
        handleAddRemote,
        handleSkipRemote
    } = props

    return (
        <>
            {showScriptsModal && project.scripts && Object.keys(project.scripts).length > 0 && (
                <ScriptCatalogModal
                    projectName={project.displayName || project.name}
                    scripts={project.scripts}
                    scriptPredictions={scriptPredictions}
                    onRunScript={onRunScript}
                    onClose={() => setShowScriptsModal(false)}
                />
            )}

            {showDependenciesModal && (project.dependencies || project.devDependencies) && (
                <DependenciesModal
                    projectName={project.displayName || project.name}
                    projectPath={project.path}
                    dependencies={project.dependencies}
                    devDependencies={project.devDependencies}
                    dependencyInstallStatus={project.dependencyInstallStatus}
                    onDependenciesUpdated={onDependenciesUpdated}
                    onClose={() => setShowDependenciesModal(false)}
                />
            )}

            {selectedCommit && (
                <CommitDiffModal
                    commit={selectedCommit}
                    diff={commitDiff}
                    loading={loadingDiff}
                    onClose={() => {
                        setSelectedCommit(null)
                        setCommitDiff('')
                    }}
                />
            )}

            {showAuthorMismatch && gitUser && repoOwner && (
                <AuthorMismatchModal
                    gitUser={gitUser}
                    repoOwner={repoOwner}
                    onConfirm={handleAuthorMismatchConfirm}
                    onCancel={() => setShowAuthorMismatch(false)}
                    dontShowAgain={dontShowAuthorWarning}
                    setDontShowAgain={setDontShowAuthorWarning}
                />
            )}

            <InitGitModal
                isOpen={showInitModal}
                onClose={() => {
                    setShowInitModal(false)
                    setInitStep('config')
                }}
                step={initStep}
                branchName={branchName}
                setBranchName={setBranchName}
                customBranchName={customBranchName}
                setCustomBranchName={setCustomBranchName}
                createGitignore={createGitignore}
                setCreateGitignore={setCreateGitignore}
                gitignoreTemplate={gitignoreTemplate}
                setGitignoreTemplate={setGitignoreTemplate}
                availableTemplates={availableTemplates}
                availablePatterns={availablePatterns}
                selectedPatterns={selectedPatterns}
                setSelectedPatterns={setSelectedPatterns}
                patternSearch={patternSearch}
                setPatternSearch={setPatternSearch}
                createInitialCommit={createInitialCommit}
                setCreateInitialCommit={setCreateInitialCommit}
                initialCommitMessage={initialCommitMessage}
                setInitialCommitMessage={setInitialCommitMessage}
                isInitializing={isInitializing}
                onInit={handleInitGit}
                remoteUrl={remoteUrl}
                setRemoteUrl={setRemoteUrl}
                isAddingRemote={isAddingRemote}
                onAddRemote={handleAddRemote}
                onSkipRemote={handleSkipRemote}
            />
        </>
    )
}

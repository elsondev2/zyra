export type {
    GitFileStatus,
    GitStatusDetail,
    GitStatusMap,
    ProjectGitOverview,
    GitBranchSummary,
    GitRemoteSummary,
    GitTagSummary,
    CheckoutBranchOptions,
    CheckoutBranchResult,
    GitCommit,
    GitHistoryCountResult,
    GitHistoryResult,
    GitignorePattern,
    GitSyncStatus
} from './git/types'

export {
    getGitStatus,
    getGitStatusDetailed,
    getGitStatusEntryStats,
    getGitHistory,
    getGitHistoryCount,
    getGitCommitStats,
    getCommitDiff,
    getWorkingDiff,
    getWorkingChangesForAI,
    hasRemoteOrigin,
    getGitSyncStatus,
    getIncomingCommits,
    getUnpushedCommits,
    getGitUser,
    getGlobalGitUser,
    getRepoOwner,
    checkIsGitRepo,
    getProjectGitOverview,
    getProjectsGitOverview
} from './git/read'

export {
    addRemote,
    stageFiles,
    setGlobalGitUser,
    createCommit,
    pushCommits,
    pushSingleCommit,
    initGitRepo,
    createInitialCommit,
    addRemoteOrigin,
    unstageFiles,
    discardChanges,
    fetchUpdates,
    pullUpdates,
    listBranches,
    createBranch,
    checkoutBranch,
    deleteBranch,
    listRemotes,
    setRemoteUrl,
    removeRemote,
    listTags,
    createTag,
    deleteTag,
    listStashes,
    createStash,
    applyStash,
    dropStash
} from './git/write'

export {
    getGitignoreTemplates,
    getGitignorePatterns,
    generateGitignoreContent,
    generateCustomGitignoreContent
} from './git/gitignore'

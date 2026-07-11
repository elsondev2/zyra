import { invalidateProjectGitOverview } from '@/lib/projectGitOverview'
import type { GitActionParams } from './gitActionTypes'
import { refreshGitInBackground } from './gitActionRefresh'

export function createGitProjectSetupActions(params: GitActionParams) {
    return {
        handleInitGit: async () => {
            if (!params.decodedPath) return

            params.setIsInitializing(true)
            try {
                let gitignoreContent: string | undefined
                if (params.createGitignore && params.gitignoreTemplate) {
                    if (params.gitignoreTemplate === 'Custom') {
                        const result = await window.devscope.generateCustomGitignoreContent(Array.from(params.selectedPatterns))
                        if (result.success) {
                            gitignoreContent = result.content
                        }
                    } else {
                        const result = await window.devscope.generateGitignoreContent(params.gitignoreTemplate)
                        if (result.success) {
                            gitignoreContent = result.content
                        }
                    }
                }

                const finalBranchName = params.branchName === 'custom' ? params.customBranchName : params.branchName
                const initResult = await window.devscope.initGitRepo(
                    params.decodedPath,
                    finalBranchName,
                    params.createGitignore,
                    gitignoreContent
                )

                if (!initResult.success) {
                    params.showToast(`Failed to initialize git: ${initResult.error}`, undefined, undefined, 'error')
                    params.setIsInitializing(false)
                    return
                }

                params.setIsGitRepo(true)
                if (params.createInitialCommit) {
                    const commitResult = await window.devscope.createInitialCommit(params.decodedPath, params.initialCommitMessage)
                    if (!commitResult.success) {
                        params.showToast(
                            `Git initialized but failed to create initial commit: ${commitResult.error}`,
                            undefined,
                            undefined,
                            'error'
                        )
                    }
                }

                invalidateProjectGitOverview(params.decodedPath)
                params.setInitStep('remote')
                params.setIsInitializing(false)
                refreshGitInBackground(params, true, 'full')
            } catch (err: any) {
                params.showToast(`Failed to initialize git: ${err.message}`, undefined, undefined, 'error')
            } finally {
                params.setIsInitializing(false)
            }
        },
        handleAddRemote: async () => {
            if (!params.decodedPath || !params.remoteUrl.trim()) return

            params.setIsAddingRemote(true)
            try {
                const result = await window.devscope.addRemoteOrigin(params.decodedPath, params.remoteUrl)
                if (!result.success) {
                    params.showToast(`Failed to add remote: ${result.error}`, undefined, undefined, 'error')
                    params.setIsAddingRemote(false)
                    return
                }

                params.setShowInitModal(false)
                params.setInitStep('config')
                params.setRemoteUrl('')
                params.setIsGitRepo(true)
                params.setHasRemote(true)
                invalidateProjectGitOverview(params.decodedPath)
                params.setIsAddingRemote(false)
                refreshGitInBackground(params, true, 'full')
            } catch (err: any) {
                params.showToast(`Failed to add remote: ${err.message}`, undefined, undefined, 'error')
            } finally {
                params.setIsAddingRemote(false)
            }
        },
        handleSkipRemote: async () => {
            params.setShowInitModal(false)
            params.setInitStep('config')
            params.setRemoteUrl('')
            params.setIsGitRepo(true)
            params.setHasRemote(false)
            invalidateProjectGitOverview(params.decodedPath)
            refreshGitInBackground(params, true, 'full')
        },
        handleOpenInExplorer: async () => {
            if (params.projectPath) {
                try {
                    const result = await window.devscope.openInExplorer?.(params.projectPath)
                    if (result && !result.success) {
                        params.showToast(`Failed to open folder: ${result.error}`, undefined, undefined, 'error')
                    }
                } catch (err) {
                    params.showToast(`Failed to invoke openInExplorer: ${err}`, undefined, undefined, 'error')
                }
            }
        }
    }
}

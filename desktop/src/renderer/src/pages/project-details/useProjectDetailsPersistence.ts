import { useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
    readStoredProjectActiveTab,
    readStoredProjectGitActivity,
    readStoredProjectGitView,
    resolveBranchState,
    writeStoredProjectActiveTab,
    writeStoredProjectGitActivity,
    writeStoredProjectGitView
} from './projectDetailsPageHelpers'

type UseProjectDetailsPersistenceParams = {
    decodedPath: string
    activeTab: 'readme' | 'files' | 'git'
    setActiveTab: Dispatch<SetStateAction<'readme' | 'files' | 'git'>>
    gitView: 'changes' | 'history' | 'unpushed' | 'pulls' | 'manage'
    setGitView: Dispatch<SetStateAction<'changes' | 'history' | 'unpushed' | 'pulls' | 'manage'>>
    lastFetched?: number
    setLastFetched: Dispatch<SetStateAction<number | undefined>>
    lastPulled?: number
    setLastPulled: Dispatch<SetStateAction<number | undefined>>
    setPullsPage: Dispatch<SetStateAction<number>>
    historyChunkSize: number
    setHistoryLimit: Dispatch<SetStateAction<number>>
    setLoadingMoreHistory: Dispatch<SetStateAction<boolean>>
    incomingCommitCount: number
    itemsPerPage: number
    gitActivityHydratedPathRef: MutableRefObject<string | null>
    showInitModal: boolean
    settings: any
    setBranchName: Dispatch<SetStateAction<'main' | 'master' | 'custom'>>
    setCustomBranchName: Dispatch<SetStateAction<string>>
    setCreateGitignore: Dispatch<SetStateAction<boolean>>
    setCreateInitialCommit: Dispatch<SetStateAction<boolean>>
}

export function useProjectDetailsPersistence({
    decodedPath,
    activeTab,
    setActiveTab,
    gitView,
    setGitView,
    lastFetched,
    setLastFetched,
    lastPulled,
    setLastPulled,
    setPullsPage,
    historyChunkSize,
    setHistoryLimit,
    setLoadingMoreHistory,
    incomingCommitCount,
    itemsPerPage,
    gitActivityHydratedPathRef,
    showInitModal,
    settings,
    setBranchName,
    setCustomBranchName,
    setCreateGitignore,
    setCreateInitialCommit
}: UseProjectDetailsPersistenceParams) {
    const skipNextGitActivityWriteRef = useRef(false)

    useEffect(() => {
        if (!decodedPath) return
        const storedTab = readStoredProjectActiveTab(decodedPath)
        const storedGitView = readStoredProjectGitView(decodedPath)
        const storedGitActivity = readStoredProjectGitActivity(decodedPath)
        skipNextGitActivityWriteRef.current = true
        setActiveTab(storedTab || 'readme')
        setGitView(storedGitView || 'manage')
        setLastFetched(storedGitActivity.lastFetched)
        setLastPulled(storedGitActivity.lastPulled)
        setPullsPage(1)
        setHistoryLimit(historyChunkSize)
        setLoadingMoreHistory(false)
        gitActivityHydratedPathRef.current = decodedPath
    }, [
        decodedPath,
        gitActivityHydratedPathRef,
        historyChunkSize,
        setActiveTab,
        setGitView,
        setHistoryLimit,
        setLastFetched,
        setLastPulled,
        setLoadingMoreHistory,
        setPullsPage
    ])

    useEffect(() => {
        if (!decodedPath || gitActivityHydratedPathRef.current !== decodedPath) return
        if (skipNextGitActivityWriteRef.current) {
            skipNextGitActivityWriteRef.current = false
            return
        }
        writeStoredProjectGitActivity(decodedPath, { lastFetched, lastPulled })
    }, [decodedPath, gitActivityHydratedPathRef, lastFetched, lastPulled])

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(incomingCommitCount / itemsPerPage))
        setPullsPage((prev) => Math.min(prev, totalPages))
    }, [incomingCommitCount, itemsPerPage, setPullsPage])

    useEffect(() => {
        if (!showInitModal) return
        const nextBranchState = resolveBranchState(settings.gitInitDefaultBranch)
        setBranchName(nextBranchState.branchName)
        setCustomBranchName(nextBranchState.customBranchName)
        setCreateGitignore(settings.gitInitCreateGitignore)
        setCreateInitialCommit(settings.gitInitCreateInitialCommit)
    }, [
        settings.gitInitCreateGitignore,
        settings.gitInitCreateInitialCommit,
        settings.gitInitDefaultBranch,
        setBranchName,
        setCreateGitignore,
        setCreateInitialCommit,
        setCustomBranchName,
        showInitModal
    ])

    useEffect(() => {
        if (!decodedPath) return
        writeStoredProjectActiveTab(decodedPath, activeTab)
    }, [activeTab, decodedPath])

    useEffect(() => {
        if (!decodedPath) return
        writeStoredProjectGitView(decodedPath, gitView)
    }, [decodedPath, gitView])
}

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DevScopeGitBranchSummary } from '@shared/contracts/devscope-api'
import { readProjectGitOverview } from '@/lib/projectGitOverview'
import { getCachedProjectGitSnapshot } from '@/lib/projectViewCache'
import {
    getOrCreateMentionIndex,
    searchMentionIndex,
    type MentionCandidate
} from './assistant-composer-mentions'
import { normalizeMentionLookupPath } from './assistant-composer-inline-mentions'

type ChangedState = Record<string, 'staged' | 'unstaged' | 'both'>

export function useAssistantComposerProjectData(args: {
    projectPath?: string | null
    refreshToken?: number
    mentionActive: boolean
    projectNodes: MentionCandidate[]
    mentionChangedStateByPath: ChangedState
    setIsGitRepo: Dispatch<SetStateAction<boolean>>
    setBranches: Dispatch<SetStateAction<DevScopeGitBranchSummary[]>>
    setBranchesLoading: Dispatch<SetStateAction<boolean>>
    setProjectNodes: Dispatch<SetStateAction<MentionCandidate[]>>
    setMentionLoading: Dispatch<SetStateAction<boolean>>
    setMentionChangedStateByPath: Dispatch<SetStateAction<ChangedState>>
    setMentionRecentModifiedAtByPath: Dispatch<SetStateAction<Record<string, number>>>
}) {
    const { projectPath, refreshToken = 0, mentionActive, projectNodes, mentionChangedStateByPath, setIsGitRepo, setBranches, setBranchesLoading, setProjectNodes, setMentionLoading, setMentionChangedStateByPath, setMentionRecentModifiedAtByPath } = args

    useEffect(() => {
        const trimmedPath = String(projectPath || '').trim()
        if (!trimmedPath) {
            setIsGitRepo(false)
            setBranches([])
            setBranchesLoading(false)
            return
        }
        let cancelled = false
        const loadBranchState = async () => {
            setBranchesLoading(true)
            try {
                const overview = await readProjectGitOverview(trimmedPath)
                if (cancelled) return
                if (!overview?.isGitRepo) {
                    setIsGitRepo(false)
                    setBranches([])
                    return
                }
                setIsGitRepo(true)
                const branchResult = await window.devscope.listBranches(trimmedPath)
                if (!cancelled) setBranches(branchResult?.success ? (branchResult.branches || []) : [])
            } catch {
                if (!cancelled) {
                    setIsGitRepo(false)
                    setBranches([])
                }
            } finally {
                if (!cancelled) setBranchesLoading(false)
            }
        }
        void loadBranchState()
        return () => { cancelled = true }
    }, [projectPath, refreshToken, setBranches, setBranchesLoading, setIsGitRepo])

    useEffect(() => {
        const trimmedPath = String(projectPath || '').trim()
        if (!trimmedPath || !mentionActive) {
            setProjectNodes([])
            setMentionLoading(false)
            return
        }
        let cancelled = false
        setMentionLoading(true)
        void getOrCreateMentionIndex(trimmedPath).then((entries) => {
            if (!cancelled) setProjectNodes(entries)
        }).catch(() => {
            if (!cancelled) setProjectNodes([])
        }).finally(() => {
            if (!cancelled) setMentionLoading(false)
        })
        return () => { cancelled = true }
    }, [mentionActive, projectPath, refreshToken, setMentionLoading, setProjectNodes])

    useEffect(() => {
        const trimmedPath = String(projectPath || '').trim()
        if (!trimmedPath || !mentionActive) {
            setMentionChangedStateByPath({})
            return
        }
        let cancelled = false
        const loadChangedMentionFiles = async () => {
            try {
                const overview = await readProjectGitOverview(trimmedPath)
                if (cancelled || !overview?.isGitRepo) {
                    if (!cancelled) setMentionChangedStateByPath({})
                    return
                }
                if (overview.changedCount <= 0) {
                    if (!cancelled) setMentionChangedStateByPath({})
                    return
                }

                const cachedGitSnapshot = getCachedProjectGitSnapshot(trimmedPath)
                const cachedStatusEntries = Array.isArray(cachedGitSnapshot?.gitStatusDetails)
                    ? cachedGitSnapshot.gitStatusDetails
                    : []
                if (cachedGitSnapshot?.isGitRepo === true && cachedStatusEntries.length === overview.changedCount) {
                    const nextChangedStateByPath: ChangedState = {}
                    for (const entry of cachedStatusEntries) {
                        const relativeKey = normalizeMentionLookupPath(entry.path || '')
                        if (!relativeKey) continue
                        const hasStaged = Boolean(entry.staged)
                        const hasUnstaged = Boolean(entry.unstaged)
                        nextChangedStateByPath[relativeKey] = hasStaged && hasUnstaged ? 'both' : hasStaged ? 'staged' : 'unstaged'
                    }
                    if (!cancelled) setMentionChangedStateByPath(nextChangedStateByPath)
                    return
                }

                const statusResult = await window.devscope.getGitStatusDetailed(trimmedPath, { includeStats: false })
                if (cancelled || !statusResult?.success) {
                    if (!cancelled) setMentionChangedStateByPath({})
                    return
                }
                const nextChangedStateByPath: ChangedState = {}
                for (const entry of statusResult.entries || []) {
                    const relativeKey = normalizeMentionLookupPath(entry.path || '')
                    if (!relativeKey) continue
                    const hasStaged = Boolean(entry.staged)
                    const hasUnstaged = Boolean(entry.unstaged)
                    nextChangedStateByPath[relativeKey] = hasStaged && hasUnstaged ? 'both' : hasStaged ? 'staged' : 'unstaged'
                }
                if (!cancelled) setMentionChangedStateByPath(nextChangedStateByPath)
            } catch {
                if (!cancelled) setMentionChangedStateByPath({})
            }
        }
        void loadChangedMentionFiles()
        return () => { cancelled = true }
    }, [mentionActive, projectPath, refreshToken, setMentionChangedStateByPath])

    useEffect(() => {
        const trimmedPath = String(projectPath || '').trim()
        if (!trimmedPath || !mentionActive || projectNodes.length === 0) {
            setMentionRecentModifiedAtByPath({})
            return
        }
        const candidatesByKey = new Map<string, MentionCandidate>()
        for (const candidate of projectNodes) {
            if (candidate.type === 'file') candidatesByKey.set(normalizeMentionLookupPath(candidate.relativePath || candidate.path), candidate)
        }
        const seedCandidates = [
            ...Object.keys(mentionChangedStateByPath).map((key) => candidatesByKey.get(key)).filter((candidate): candidate is MentionCandidate => Boolean(candidate)),
            ...searchMentionIndex(projectNodes, '', 24)
        ]
        const nextRecentModifiedAtByPath: Record<string, number> = {}
        const seen = new Set<string>()
        for (const candidate of seedCandidates) {
            if (candidate.type !== 'file') continue
            const key = normalizeMentionLookupPath(candidate.relativePath || candidate.path)
            if (seen.has(key)) continue
            seen.add(key)
            if (typeof candidate.modifiedAt === 'number') nextRecentModifiedAtByPath[key] = candidate.modifiedAt
            if (seen.size >= 18) break
        }
        setMentionRecentModifiedAtByPath(nextRecentModifiedAtByPath)
    }, [mentionActive, mentionChangedStateByPath, projectNodes, projectPath, refreshToken, setMentionRecentModifiedAtByPath])
}

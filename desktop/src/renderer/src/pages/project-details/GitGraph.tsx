import { useMemo } from 'react'
import { Calendar, Cloud, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitCommit } from './types'
import { DiffStats } from './DiffStats'

const BRANCH_COLORS = [
    '#22c55e',
    '#3b82f6',
    '#f97316',
    '#a855f7',
    '#06b6d4',
    '#ec4899'
]

const LOCAL_STREAM_COLOR = '#f59e0b'
const REMOTE_HEAD_COLOR = '#22c55e'

export function GitGraph({
    commits,
    laneSourceCommits,
    onCommitClick,
    localOnlyCommitHashes,
    hasRemote,
    remoteHeadCommitHash
}: {
    commits: GitCommit[]
    laneSourceCommits?: GitCommit[]
    onCommitClick?: (commit: GitCommit) => void
    localOnlyCommitHashes?: Set<string>
    hasRemote?: boolean | null
    remoteHeadCommitHash?: string | null
}) {
    const graphSource = laneSourceCommits && laneSourceCommits.length > 0 ? laneSourceCommits : commits
    const commitIndexByHash = useMemo(() => {
        const indexMap = new Map<string, number>()
        commits.forEach((commit, index) => {
            indexMap.set(commit.hash, index)
        })
        return indexMap
    }, [commits])

    const lanes = useMemo(() => {
        const laneMap = new Map<string, number>()
        const activeLanes: (string | null)[] = []

        graphSource.forEach((commit) => {
            let assignedLane = -1
            for (let i = 0; i < activeLanes.length; i++) {
                if (activeLanes[i] === commit.hash) {
                    assignedLane = i
                    break
                }
            }

            if (assignedLane === -1) {
                assignedLane = 0
                if (activeLanes[0] !== null && activeLanes[0] !== commit.hash) {
                    const emptyLane = activeLanes.findIndex((lane) => lane === null)
                    assignedLane = emptyLane === -1 ? activeLanes.length : emptyLane
                }
            }

            laneMap.set(commit.hash, assignedLane)

            if (commit.parents.length > 0) {
                activeLanes[assignedLane] = commit.parents[0]
                for (let i = 1; i < commit.parents.length; i++) {
                    const parentHash = commit.parents[i]
                    if (!laneMap.has(parentHash)) {
                        const emptyLane = activeLanes.findIndex((lane, idx) => lane === null && idx !== assignedLane)
                        const newLane = emptyLane === -1 ? activeLanes.length : emptyLane
                        activeLanes[newLane] = parentHash
                    }
                }
            } else {
                activeLanes[assignedLane] = null
            }
        })

        return laneMap
    }, [graphSource])

    const maxLanes = Math.max(1, ...Array.from(lanes.values(), (lane) => lane + 1))
    const laneWidth = maxLanes > 10 ? 16 : maxLanes > 6 ? 20 : 24
    const nodeSize = 10
    const rowCardHeight = maxLanes > 8 ? 68 : 72
    const rowGap = 10
    const rowStep = rowCardHeight + rowGap
    const graphHeight = commits.length > 0 ? (commits.length * rowStep) - rowGap : 0

    return (
        <div className="relative overflow-x-auto">
            <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={maxLanes * laneWidth + 20}
                height={graphHeight}
                style={{ minWidth: maxLanes * laneWidth + 20 }}
            >
                {commits.map((commit, idx) => {
                    const lane = lanes.get(commit.hash) || 0
                    const x = lane * laneWidth + laneWidth / 2 + 8
                    const y = idx * rowStep + rowCardHeight / 2
                    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length]
                    const isLocalOnly = localOnlyCommitHashes?.has(commit.hash) === true
                    const nextCommit = idx < commits.length - 1 ? commits[idx + 1] : null
                    const nextIsLocalOnly = nextCommit ? localOnlyCommitHashes?.has(nextCommit.hash) === true : false
                    const lineStroke = isLocalOnly || nextIsLocalOnly ? LOCAL_STREAM_COLOR : color
                    const lineOpacity = isLocalOnly || nextIsLocalOnly ? 0.98 : 0.6
                    const lineWidth = isLocalOnly || nextIsLocalOnly ? 3 : 2

                    return (
                        <g key={`lines-${commit.hash}`}>
                            {nextCommit && (
                                <line
                                    x1={x}
                                    y1={y + nodeSize / 2}
                                    x2={x}
                                    y2={(idx + 1) * rowStep + rowCardHeight / 2 - nodeSize / 2}
                                    stroke={lineStroke}
                                    strokeWidth={lineWidth}
                                    opacity={lineOpacity}
                                />
                            )}

                            {commit.parents.slice(1).map((parentHash) => {
                                const parentIdx = commitIndexByHash.get(parentHash)
                                if (parentIdx == null) return null

                                const parentLane = lanes.get(parentHash) || 0
                                const parentX = parentLane * laneWidth + laneWidth / 2 + 8
                                const parentY = parentIdx * rowStep + rowCardHeight / 2
                                const parentColor = BRANCH_COLORS[parentLane % BRANCH_COLORS.length]
                                const midY = (y + parentY) / 2
                                const mergeIsLocalOnly = isLocalOnly || (localOnlyCommitHashes?.has(parentHash) === true)
                                const mergeStroke = mergeIsLocalOnly ? LOCAL_STREAM_COLOR : parentColor

                                return (
                                    <path
                                        key={`merge-${commit.hash}-${parentHash}`}
                                        d={`M ${parentX} ${parentY + nodeSize / 2} C ${parentX} ${midY}, ${x} ${midY}, ${x} ${y - nodeSize / 2}`}
                                        stroke={mergeStroke}
                                        strokeWidth={mergeIsLocalOnly ? 3 : 2}
                                        fill="none"
                                        opacity={mergeIsLocalOnly ? 0.95 : 0.6}
                                    />
                                )
                            })}
                        </g>
                    )
                })}

                {commits.map((commit, idx) => {
                    const lane = lanes.get(commit.hash) || 0
                    const x = lane * laneWidth + laneWidth / 2 + 8
                    const y = idx * rowStep + rowCardHeight / 2
                    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length]
                    const isMerge = commit.parents.length > 1
                    const isLocalOnly = localOnlyCommitHashes?.has(commit.hash) === true
                    const isRemoteHead = remoteHeadCommitHash === commit.hash
                    const nodeStroke = isLocalOnly ? LOCAL_STREAM_COLOR : isRemoteHead ? REMOTE_HEAD_COLOR : color
                    const nodeFill = isLocalOnly ? `${LOCAL_STREAM_COLOR}22` : isRemoteHead ? '#052e16' : '#09090b'

                    return (
                        <g key={`node-${commit.hash}`}>
                            <circle
                                cx={x}
                                cy={y}
                                r={isMerge ? nodeSize / 2 + 2 : nodeSize / 2}
                                fill={nodeFill}
                                stroke={nodeStroke}
                                strokeWidth={isLocalOnly ? (isMerge ? 4 : 3) : isRemoteHead ? 4 : (isMerge ? 3 : 2)}
                            />
                            {isMerge && <circle cx={x} cy={y} r={3} fill={nodeStroke} />}
                        </g>
                    )
                })}
            </svg>

            <div style={{ marginLeft: maxLanes * laneWidth + 20 }}>
                {commits.map((commit, idx) => {
                    const isMerge = commit.parents.length > 1
                    const lane = lanes.get(commit.hash) || 0
                    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length]
                    const isLocalOnly = localOnlyCommitHashes?.has(commit.hash) === true
                    const isRemoteHead = remoteHeadCommitHash === commit.hash

                    return (
                        <div
                            key={commit.hash}
                            className={cn(
                                'group -ml-2 flex cursor-pointer items-center rounded-xl pl-3 pr-2 transition-colors',
                                isLocalOnly
                                    ? 'border border-amber-400/15 bg-amber-400/6 hover:bg-amber-400/10'
                                    : isRemoteHead
                                        ? 'border border-emerald-400/15 bg-emerald-400/5 hover:bg-emerald-400/10'
                                    : 'hover:bg-white/5'
                            )}
                            style={{
                                height: rowCardHeight,
                                marginBottom: idx === commits.length - 1 ? 0 : rowGap
                            }}
                            onClick={() => onCommitClick?.(commit)}
                        >
                            <div className="flex-1 min-w-0 pr-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-sm font-medium text-white truncate">{commit.message}</span>
                                        {isLocalOnly ? (
                                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-200 bg-amber-400/15 border border-amber-400/20">
                                                Local only
                                            </span>
                                        ) : isRemoteHead && hasRemote ? (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-emerald-100 bg-emerald-400/15 border border-emerald-400/30 shadow-[0_0_0_1px_rgba(34,197,94,0.08)]">
                                                <Cloud size={10} />
                                                On origin
                                            </span>
                                        ) : null}
                                        {isMerge && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: `${color}20`, color }}>
                                                Merge
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-white/40">
                                        <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-white/50">{commit.shortHash}</span>
                                        <span className="flex items-center gap-1">
                                            <User size={10} /> {commit.author}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Calendar size={10} /> {new Date(commit.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    <DiffStats
                                        additions={commit.additions}
                                        deletions={commit.deletions}
                                        compact
                                        loading={commit.statsLoaded === false}
                                    />
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

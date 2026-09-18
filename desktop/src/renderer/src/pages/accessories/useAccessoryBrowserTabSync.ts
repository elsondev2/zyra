import { useCallback, useEffect, useRef, useState } from 'react'
import type { AccessoryBrowserTab, AccessoryBrowserTabsInput, AccessoryWindowState } from '@shared/accessories'
import type { BrowserSessionMode } from '@shared/browser-view'
import type { AssistantBrowserWorkspaceController } from '../assistant/AssistantBrowserWorkspace'
import {
    createAssistantBrowserTab,
    createAssistantBrowserWorkspaceState,
    type AssistantBrowserWorkspaceState
} from '../assistant/assistant-browser-workspace-state'

type BrowserSnapshot = AccessoryBrowserTabsInput
type PendingPublish = {
    baseline: BrowserSnapshot
    desired: BrowserSnapshot
    externalRemote: BrowserSnapshot | null
}
type RemoteApplication = {
    target: BrowserSnapshot
    publishAfterApply: boolean
}

function copySnapshot(snapshot: BrowserSnapshot): BrowserSnapshot {
    return { ...snapshot, tabs: snapshot.tabs.map((tab) => ({ ...tab })) }
}

function snapshotFromWindowState(state: AccessoryWindowState): BrowserSnapshot {
    return {
        workspaceId: state.id,
        activeTabId: state.activeBrowserTabId,
        tabs: state.browserTabs.map((tab) => ({ ...tab }))
    }
}

function snapshotFromWorkspace(workspaceId: string, state: AssistantBrowserWorkspaceState): BrowserSnapshot {
    return {
        workspaceId,
        activeTabId: state.activeTabId,
        tabs: state.tabs.map((tab) => ({
            id: tab.id,
            sessionMode: tab.sessionMode,
            url: tab.url,
            title: tab.title,
            faviconUrl: tab.faviconUrl
        }))
    }
}

function workspaceFromSnapshot(snapshot: BrowserSnapshot, fallbackTabId: string, sessionMode: BrowserSessionMode): AssistantBrowserWorkspaceState {
    const tabs = snapshot.tabs.map((tab) => ({
        ...createAssistantBrowserTab(tab.id, tab.url, tab.sessionMode),
        title: tab.title || (tab.url ? 'Browser' : 'New tab'),
        faviconUrl: tab.faviconUrl
    }))
    if (tabs.length === 0) return createAssistantBrowserWorkspaceState(fallbackTabId, sessionMode)
    return {
        version: 1,
        activeTabId: tabs.some((tab) => tab.id === snapshot.activeTabId) ? snapshot.activeTabId! : tabs[0].id,
        splitTabId: null,
        tabs
    }
}

function sameTab(left: AccessoryBrowserTab, right: AccessoryBrowserTab): boolean {
    return left.id === right.id
        && left.sessionMode === right.sessionMode
        && left.url === right.url
        && left.title === right.title
        && left.faviconUrl === right.faviconUrl
}

function sameSnapshot(left: BrowserSnapshot | null, right: BrowserSnapshot | null): boolean {
    return Boolean(left && right
        && left.workspaceId === right.workspaceId
        && left.activeTabId === right.activeTabId
        && left.tabs.length === right.tabs.length
        && left.tabs.every((tab, index) => sameTab(tab, right.tabs[index])))
}

function sameTopology(left: BrowserSnapshot, right: BrowserSnapshot): boolean {
    if (left.activeTabId !== right.activeTabId || left.tabs.length !== right.tabs.length) return false
    return left.tabs.every((tab, index) => right.tabs[index]?.id === tab.id && right.tabs[index]?.sessionMode === tab.sessionMode)
}

function mergeConcurrentRemote(baseline: BrowserSnapshot, local: BrowserSnapshot, remote: BrowserSnapshot): BrowserSnapshot {
    const baselineIds = new Set(baseline.tabs.map((tab) => tab.id))
    const localIds = new Set(local.tabs.map((tab) => tab.id))
    const locallyRemoved = new Set(baseline.tabs.filter((tab) => !localIds.has(tab.id)).map((tab) => tab.id))
    const tabs = remote.tabs.filter((tab) => !locallyRemoved.has(tab.id)).map((tab) => ({ ...tab }))
    const mergedIds = new Set(tabs.map((tab) => tab.id))
    for (const localTab of local.tabs) {
        if (!baselineIds.has(localTab.id) && !mergedIds.has(localTab.id)) {
            tabs.push({ ...localTab })
            mergedIds.add(localTab.id)
        }
    }
    const localChangedActive = local.activeTabId !== baseline.activeTabId
    const activeTabId = localChangedActive && local.activeTabId && mergedIds.has(local.activeTabId)
        ? local.activeTabId
        : remote.activeTabId && mergedIds.has(remote.activeTabId)
            ? remote.activeTabId
            : tabs[0]?.id || null
    return { workspaceId: remote.workspaceId, activeTabId, tabs }
}

export function useAccessoryBrowserTabSync({
    workspaceId,
    sessionMode,
    fallbackTabId,
    onError
}: {
    workspaceId: string
    sessionMode: BrowserSessionMode
    fallbackTabId: string
    onError: (error: string) => void
}) {
    const [rootPath, setRootPath] = useState<string | null>(null)
    const [initialized, setInitialized] = useState(false)
    const [controller, setController] = useState<AssistantBrowserWorkspaceController | null>(null)
    const [selectedTabId, setSelectedTabId] = useState(fallbackTabId)
    const [workspaceState, setWorkspaceState] = useState<AssistantBrowserWorkspaceState>(() => (
        createAssistantBrowserWorkspaceState(fallbackTabId, sessionMode)
    ))
    const [applicationVersion, setApplicationVersion] = useState(0)
    const onErrorRef = useRef(onError)
    const initializedRef = useRef(false)
    const localStateRef = useRef<AssistantBrowserWorkspaceState | null>(null)
    const confirmedRemoteRef = useRef<BrowserSnapshot | null>(null)
    const pendingPublishRef = useRef<PendingPublish | null>(null)
    const queuedPublishRef = useRef<BrowserSnapshot | null>(null)
    const staleRemoteSnapshotsRef = useRef<BrowserSnapshot[]>([])
    const applyingRemoteRef = useRef<RemoteApplication | null>(null)
    const publishRef = useRef<(snapshot: BrowserSnapshot, force?: boolean) => void>(() => undefined)
    const receiveRemoteRef = useRef<(state: AccessoryWindowState, source: 'event' | 'response' | 'initial') => void>(() => undefined)
    onErrorRef.current = onError

    const applyRemote = useCallback((snapshot: BrowserSnapshot, publishAfterApply: boolean) => {
        const target = copySnapshot(snapshot)
        const projected = workspaceFromSnapshot(target, fallbackTabId, sessionMode)
        const local = localStateRef.current
        if (local && sameTopology(snapshotFromWorkspace(workspaceId, local), target)) {
            applyingRemoteRef.current = null
            setWorkspaceState(projected)
            setSelectedTabId(projected.activeTabId)
            return
        }
        applyingRemoteRef.current = { target, publishAfterApply }
        setWorkspaceState(projected)
        setSelectedTabId(projected.activeTabId)
        setApplicationVersion((version) => version + 1)
    }, [fallbackTabId, sessionMode, workspaceId])

    receiveRemoteRef.current = (state, source) => {
        if (state.id !== workspaceId || state.kind !== 'browser') return
        const remote = snapshotFromWindowState(state)
        setRootPath(state.rootPath)
        if (!initializedRef.current) {
            initializedRef.current = true
            confirmedRemoteRef.current = remote
            applyRemote(remote, true)
            setInitialized(true)
            return
        }
        const pending = pendingPublishRef.current
        if (pending) {
            if (sameSnapshot(remote, pending.desired)) {
                confirmedRemoteRef.current = remote
                return
            }
            if (source === 'event' && sameSnapshot(remote, pending.baseline)) return
            if (source === 'event') {
                pending.externalRemote = remote
                confirmedRemoteRef.current = remote
                const merged = mergeConcurrentRemote(pending.baseline, pending.desired, remote)
                queuedPublishRef.current = merged
                applyRemote(merged, true)
                return
            }
        }
        if (source === 'event' && staleRemoteSnapshotsRef.current.some((snapshot) => sameSnapshot(snapshot, remote))) return
        if (sameSnapshot(remote, confirmedRemoteRef.current)) return
        confirmedRemoteRef.current = remote
        applyRemote(remote, true)
    }

    publishRef.current = (snapshot, force = false) => {
        const desired = copySnapshot(snapshot)
        const pending = pendingPublishRef.current
        if (pending) {
            if (!sameSnapshot(desired, pending.desired)) queuedPublishRef.current = desired
            return
        }
        const baseline = confirmedRemoteRef.current
        if (!force && sameSnapshot(desired, baseline)) return
        const nextPending: PendingPublish = {
            baseline: copySnapshot(baseline || desired),
            desired,
            externalRemote: null
        }
        pendingPublishRef.current = nextPending
        void window.devscope.accessories.syncBrowserTabs(desired).then((result) => {
            if (pendingPublishRef.current !== nextPending) return
            pendingPublishRef.current = null
            if (!result.success) {
                onErrorRef.current(result.error)
            } else {
                const response = result.state
                const responseSnapshot = snapshotFromWindowState(response)
                if (!sameSnapshot(nextPending.baseline, nextPending.desired)) {
                    staleRemoteSnapshotsRef.current = [...staleRemoteSnapshotsRef.current.slice(-7), nextPending.baseline]
                }
                if (!nextPending.externalRemote || !sameSnapshot(responseSnapshot, nextPending.desired)) {
                    receiveRemoteRef.current(response, 'response')
                }
            }
            const queued = queuedPublishRef.current
            queuedPublishRef.current = null
            if (queued && !sameSnapshot(queued, confirmedRemoteRef.current)) publishRef.current(queued)
        }).catch((error: unknown) => {
            if (pendingPublishRef.current === nextPending) pendingPublishRef.current = null
            onErrorRef.current(error instanceof Error ? error.message : 'Browser tabs could not be synchronized.')
            const queued = queuedPublishRef.current
            queuedPublishRef.current = null
            if (queued) publishRef.current(queued)
        })
    }

    const onTabsChange = useCallback((state: AssistantBrowserWorkspaceState) => {
        localStateRef.current = state
        const snapshot = snapshotFromWorkspace(workspaceId, state)
        setWorkspaceState((current) => sameSnapshot(snapshotFromWorkspace(workspaceId, current), snapshot) ? current : state)
        setSelectedTabId((current) => current === state.activeTabId ? current : state.activeTabId)
        const application = applyingRemoteRef.current
        if (application) {
            if (!sameTopology(snapshot, application.target)) return
            applyingRemoteRef.current = null
            if (application.publishAfterApply) publishRef.current(application.target, true)
            return
        }
        publishRef.current(snapshot)
    }, [workspaceId])

    useEffect(() => {
        let cancelled = false
        let changedBeforeGet = false
        const api = window.devscope.accessories
        const unsubscribe = api.onChanged((state) => {
            if (cancelled) return
            changedBeforeGet = true
            receiveRemoteRef.current(state, 'event')
        })
        void api.getState().then((result) => {
            if (cancelled || changedBeforeGet) return
            if (result.success) receiveRemoteRef.current(result.state, 'initial')
            else onErrorRef.current(result.error)
        }).catch((error: unknown) => {
            if (!cancelled && !changedBeforeGet) onErrorRef.current(error instanceof Error ? error.message : 'The Browser accessory could not read its window state.')
        })
        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [workspaceId])

    useEffect(() => {
        const application = applyingRemoteRef.current
        const local = localStateRef.current
        if (!controller || !application || !local) return
        const targetIds = new Set(application.target.tabs.map((tab) => tab.id))
        const localIds = new Set(local.tabs.map((tab) => tab.id))
        for (const tab of application.target.tabs) {
            if (!localIds.has(tab.id)) controller.createTab(tab.url, {
                activate: false,
                tabId: tab.id,
                sessionMode: tab.sessionMode
            })
        }
        let replacementState: AssistantBrowserWorkspaceState | null = null
        for (const tab of local.tabs) {
            if (!targetIds.has(tab.id)) replacementState = controller.closeTab(tab.id, { transferred: true })
        }
        if (application.target.tabs.length === 0 && replacementState?.tabs.length) {
            const replacement = snapshotFromWorkspace(workspaceId, replacementState)
            applyingRemoteRef.current = { target: replacement, publishAfterApply: true }
            return
        }
        controller.reorderTabs(application.target.tabs.map(tab => tab.id))
        if (application.target.activeTabId && targetIds.has(application.target.activeTabId)) {
            controller.activateTab(application.target.activeTabId)
        }
    }, [applicationVersion, controller, workspaceId])

    return {
        rootPath,
        initialized,
        workspaceState,
        selectedTabId,
        setSelectedTabId,
        controller,
        setController,
        onTabsChange
    }
}

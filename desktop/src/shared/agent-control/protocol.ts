import type {
    ControlActionRequest,
    ControlCapability,
    ControlPrincipal,
    ControlSideEffectClass,
    DelegatedControlLeaseRequest
} from './contracts'

export const AGENT_CONTROL_IPC = {
    getState: 'zyra:agent-control:get-state',
    bindBrowserTab: 'zyra:agent-control:bind-browser-tab',
    requestGrant: 'zyra:agent-control:request-grant',
    approveGrant: 'zyra:agent-control:approve-grant',
    rejectGrant: 'zyra:agent-control:reject-grant',
    revokeGrant: 'zyra:agent-control:revoke-grant',
    emergencyStop: 'zyra:agent-control:emergency-stop',
    clearAudit: 'zyra:agent-control:clear-audit',
    startChromePairing: 'zyra:agent-control:start-chrome-pairing',
    stopChromePairing: 'zyra:agent-control:stop-chrome-pairing',
    listWindows: 'zyra:agent-control:list-windows',
    selectWindow: 'zyra:agent-control:select-window',
    acknowledgeBrowserSurfaceRequest: 'zyra:agent-control:acknowledge-browser-surface-request',
    completeBrowserSurfaceRequest: 'zyra:agent-control:complete-browser-surface-request',
    claimBrowserSurfaceRequest: 'zyra:agent-control:claim-browser-surface-request',
    updateWorkspaceState: 'zyra:agent-control:update-workspace-state',
    browserSurfaceRequested: 'zyra:agent-control:browser-surface-requested',
    browserSurfaceCancelled: 'zyra:agent-control:browser-surface-cancelled',
    stateChanged: 'zyra:agent-control:state-changed'
} as const

export type BrowserSurfaceOpenRequest = {
    version: 1
    requestId: string
    threadId: string
    mode?: 'open' | 'reveal' | 'layout' | 'close' | 'refresh' | 'external'
    tabId: string
    targetId?: string
    secondaryTabId?: string
    secondaryTargetId?: string
    url?: string
    reveal: boolean
    requestedBy: ControlPrincipal
}

export type BrowserSurfaceOpenAcknowledgement = Pick<BrowserSurfaceOpenRequest, 'requestId' | 'threadId' | 'tabId'>
export type BrowserSurfaceClaim = BrowserSurfaceOpenAcknowledgement

export type BrowserSurfaceOpenCompletion = BrowserSurfaceOpenAcknowledgement & (
    | { success: true; targetId: string }
    | { success: false; error: string }
)

export type RendererControlGrantInput = {
    targetId: string
    capabilities: ControlCapability[]
    durationMs: number
    maxActions: number
    allowedOrigins?: string[]
    allowedExecutableIdentities?: string[]
    pendingRequestId?: string
}

export type AgentControlBridgeOperation =
    | { operation: 'list_targets'; targetKind?: 'zyra-browser' | 'chrome-tab' }
    | { operation: 'open_tab'; reveal?: boolean }
    | { operation: 'reveal_tab'; targetId: string }
    | { operation: 'close_tab'; targetId: string; grantId: string }
    | { operation: 'refresh_tab'; targetId: string; grantId: string }
    | { operation: 'open_external'; targetId: string; grantId: string; url?: string }
    | { operation: 'set_tab_layout'; primaryTargetId: string; secondaryTargetId?: string }
    | { operation: 'list_windows' }
    | {
        operation: 'request_grant'
        targetId: string
        capabilities: ControlCapability[]
        durationMs?: number
        maxActions?: number
        allowedOrigins?: string[]
        allowedExecutableIdentities?: string[]
    }
    | { operation: 'observe'; grantId: string; targetId: string; includeScreenshot?: boolean }
    | ({ operation: 'act' } & ControlActionRequest)
    | ({ operation: 'delegate_lease' } & Omit<DelegatedControlLeaseRequest, 'parentPrincipal'>)
    | { operation: 'revoke_current_principal'; reason?: string }
    | { operation: 'release'; grantId: string }

export type AgentControlBridgeRequest = {
    type: 'control.request'
    requestId: string
    operation: AgentControlBridgeOperation
}

export type AgentControlBridgeResponse = {
    type: 'control.response'
    requestId: string
    ok: boolean
    result?: Record<string, unknown>
    error?: { code: string; message: string; retryable: boolean; freshRevision?: number }
}

export type AgentControlToolContext = {
    principal: ControlPrincipal
    sideEffect?: ControlSideEffectClass
}

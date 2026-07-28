import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import {
    AGENT_CONTROL_IPC,
    type BrowserSurfaceClaim,
    type BrowserSurfaceOpenAcknowledgement,
    type BrowserSurfaceOpenCompletion,
    type RendererControlGrantInput
} from '../../../shared/agent-control/protocol'
import { AgentControlError } from '../../agent-control/control-errors'
import { bindTrustedBrowserTarget, getAgentControlBroker } from '../../agent-control'
import { BrowserSurfaceHost } from '../../agent-control/browser-surface-host'

function assertTrustedRenderer(event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (!senderWindow || senderWindow.id !== mainWindow.id || senderWindow.isDestroyed()) {
        throw new AgentControlError('CONTROL_SCOPE_DENIED', 'Control Center requests must come from the owning Zyra window.')
    }
}

async function result<T>(operation: () => T | Promise<T>) {
    try {
        return { success: true as const, ...(await operation() as object) } as { success: true } & T
    } catch (error) {
        return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Control request failed.',
            code: error instanceof AgentControlError ? error.code : 'CONTROL_ERROR'
        }
    }
}

export function createAgentControlHandlers(mainWindow: BrowserWindow) {
    const broker = getAgentControlBroker()
    const browserSurface = new BrowserSurfaceHost({
        send: (request) => {
            if (mainWindow.isDestroyed()) throw new Error('The Zyra window is closed.')
            mainWindow.webContents.send(AGENT_CONTROL_IPC.browserSurfaceRequested, request)
        },
        cancel: (requestId) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send(AGENT_CONTROL_IPC.browserSurfaceCancelled, requestId)
        },
        resolveTarget: (targetId) => broker.targets.get(targetId).target
    })
    broker.setBrowserSurfaceController(browserSurface)
    const broadcast = () => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send(AGENT_CONTROL_IPC.stateChanged, broker.state())
    }
    const broadcastCursor = (cursor: unknown) => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send(AGENT_CONTROL_IPC.cursorChanged, cursor)
    }
    broker.on('changed', broadcast)
    broker.on('cursor', broadcastCursor)
    mainWindow.once('closed', () => {
        broker.removeListener('changed', broadcast)
        broker.removeListener('cursor', broadcastCursor)
        browserSurface.dispose()
        broker.setBrowserSurfaceController(null)
    })

    return {
        getState: (event: IpcMainInvokeEvent) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            return { state: broker.state() }
        }),
        bindBrowserTab: (event: IpcMainInvokeEvent, input: { guestWebContentsId?: number; tabId?: string; threadId?: string }) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            const guestWebContentsId = Number(input?.guestWebContentsId)
            if (!Number.isInteger(guestWebContentsId) || guestWebContentsId < 1) throw new Error('Browser guest identity is invalid.')
            const target = bindTrustedBrowserTarget(event.sender.id, guestWebContentsId, String(input?.tabId || ''), String(input?.threadId || ''))
            browserSurface.completeRegisteredTarget(target)
            return { target }
        }),
        acknowledgeBrowserSurfaceRequest: (event: IpcMainInvokeEvent, input: BrowserSurfaceOpenAcknowledgement) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            return { accepted: browserSurface.acknowledge(input) }
        }),
        completeBrowserSurfaceRequest: (event: IpcMainInvokeEvent, input: BrowserSurfaceOpenCompletion) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            return { completed: browserSurface.complete(input) }
        }),
        claimBrowserSurfaceRequest: (event: IpcMainInvokeEvent, input: BrowserSurfaceClaim) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            return { claimed: browserSurface.claim(input) }
        }),
        updateWorkspaceState: (event: IpcMainInvokeEvent, input: unknown) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            return { workspace: broker.updateWorkspaceState(input) }
        }),
        approveGrant: (event: IpcMainInvokeEvent, input: RendererControlGrantInput) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            return { grant: broker.approvePendingGrant(input) }
        }),
        rejectGrant: (event: IpcMainInvokeEvent, requestId: string) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            broker.rejectPendingGrant(requestId)
            return { rejected: true }
        }),
        revokeGrant: (event: IpcMainInvokeEvent, grantId: string) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            broker.revokeGrant(grantId)
            return { revoked: true }
        }),
        emergencyStop: (event: IpcMainInvokeEvent) => result(async () => {
            assertTrustedRenderer(event, mainWindow)
            await broker.emergencyStop()
            return { stopped: true }
        }),
        clearAudit: (event: IpcMainInvokeEvent) => result(() => {
            assertTrustedRenderer(event, mainWindow)
            broker.clearAudit()
            return { cleared: true }
        }),
        startChromePairing: (event: IpcMainInvokeEvent) => result(async () => {
            assertTrustedRenderer(event, mainWindow)
            return { pairing: await broker.startChromePairing() }
        }),
        stopChromePairing: (event: IpcMainInvokeEvent) => result(async () => {
            assertTrustedRenderer(event, mainWindow)
            await broker.stopChromePairing()
            return { pairing: broker.state().pairing }
        }),
        listWindows: (event: IpcMainInvokeEvent) => result(async () => {
            assertTrustedRenderer(event, mainWindow)
            return { windows: await broker.listWindows() }
        }),
        selectWindow: (event: IpcMainInvokeEvent, windowToken: string) => result(async () => {
            assertTrustedRenderer(event, mainWindow)
            return { target: await broker.selectWindow(windowToken) }
        })
    }
}

import { app, type WebContents } from 'electron'
import { rmSync } from 'fs'
import { join } from 'path'
import { AgentControlBroker } from './agent-control-broker'
import { ChromePairingServer } from './chrome-pairing-server'
import { ChromeExtensionDriver } from './drivers/chrome-extension-driver'
import { WindowsDesktopDriver } from './drivers/windows-desktop-driver'
import { ZyraBrowserDriver } from './drivers/zyra-browser-driver'
import { trustedBrowserGuests } from './trusted-guest-registry'

let broker: AgentControlBroker | null = null
let chromeDriver: ChromeExtensionDriver | null = null
let browserDriver: ZyraBrowserDriver | null = null
let trustedGuestUnsubscribe: (() => void) | null = null
const browserTargetByGuestIdentity = new Map<string, string>()

export function getAgentControlBroker(): AgentControlBroker {
    if (broker) return broker
    const userData = app.getPath('userData')
    const artifactRoot = join(userData, 'agent-control', 'artifacts')
    rmSync(artifactRoot, { recursive: true, force: true })
    const pairing = new ChromePairingServer()
    browserDriver = new ZyraBrowserDriver(join(artifactRoot, 'browser'))
    chromeDriver = new ChromeExtensionDriver(pairing, join(artifactRoot, 'chrome'))
    const windowsDriver = new WindowsDesktopDriver(join(userData, 'agent-control', 'artifacts', 'windows'))
    broker = new AgentControlBroker({ userDataPath: userData, drivers: [browserDriver, chromeDriver, windowsDriver], pairing })
    chromeDriver.setRegistrationHandlers({
        register: ({ target, trustedIdentity }) => {
            const targetId = broker!.targets.createTargetId('chrome-tab')
            broker!.registerTarget({ target: { ...target, targetId }, driver: chromeDriver!, trustedIdentity })
            return targetId
        },
        remove: (targetId, reason) => broker!.removeTarget(targetId, reason)
    })
    trustedGuestUnsubscribe = trustedBrowserGuests.onRemoved((entry) => {
        const targetId = browserTargetByGuestIdentity.get(entry.guestIdentity)
        if (targetId) broker?.removeTarget(targetId, 'Integrated Browser tab closed.')
        browserTargetByGuestIdentity.delete(entry.guestIdentity)
    })
    return broker
}

export function bindTrustedBrowserTarget(ownerWebContentsId: number, guestWebContentsId: number, tabId: string) {
    const controlBroker = getAgentControlBroker()
    const guestEntry = trustedBrowserGuests.bind(ownerWebContentsId, guestWebContentsId, tabId)
    const existingTargetId = browserTargetByGuestIdentity.get(guestEntry.guestIdentity)
    if (existingTargetId) return controlBroker.targets.get(existingTargetId).target
    if (!browserDriver) throw new Error('Integrated Browser control driver is unavailable.')
    const targetId = controlBroker.targets.createTargetId('zyra-browser')
    const url = guestEntry.guest.getURL()
    const origin = /^https?:/.test(url) ? new URL(url).origin : null
    const target = controlBroker.registerTarget({
        target: { kind: 'zyra-browser', targetId, tabId, guestIdentity: guestEntry.guestIdentity, origin },
        driver: browserDriver,
        trustedIdentity: guestEntry.guest,
        ownerWebContentsId
    })
    browserTargetByGuestIdentity.set(guestEntry.guestIdentity, targetId)
    installGuestLifecycle(guestEntry.guest, targetId, controlBroker)
    return target
}

function installGuestLifecycle(guest: WebContents, targetId: string, controlBroker: AgentControlBroker): void {
    const navigation = (_event: unknown, url: string, _isInPlace?: boolean, isMainFrame?: boolean) => {
        if (isMainFrame === false || !/^https?:\/\//.test(url)) return
        controlBroker.handleTargetNavigation(targetId, url)
    }
    guest.on('did-start-navigation', navigation)
    guest.once('destroyed', () => {
        guest.removeListener('did-start-navigation', navigation)
    })
}

export async function disposeAgentControlBroker(): Promise<void> {
    trustedGuestUnsubscribe?.()
    trustedGuestUnsubscribe = null
    browserTargetByGuestIdentity.clear()
    const current = broker
    broker = null
    chromeDriver = null
    browserDriver = null
    await current?.dispose()
}

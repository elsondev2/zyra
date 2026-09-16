import type { MobileAccessState } from './mobile-access'

export function mobilePairingCompleted(previous: MobileAccessState['devices'], current: MobileAccessState['devices']): boolean {
    const known = new Map(previous.map(device => [device.id, device.lastPairedAt || device.createdAt]))
    return current.some(device => !known.has(device.id) || (device.lastPairedAt || device.createdAt) > known.get(device.id)!)
}

export function preferredMobileAddress(addresses: MobileAccessState['addresses'], saved = ''): string {
    if (addresses.some(entry => entry.address === saved)) return saved
    const physical = addresses.filter(entry => !/virtual|vethernet|vpn|wsl|docker|tailscale|zerotier|loopback/i.test(entry.name))
    return (physical.find(entry => /wi.?fi|wireless|wlan/i.test(entry.name)) || physical[0] || addresses[0])?.address || ''
}

export function mobileAccessError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error)
    return text.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').replace(/^Error:\s*/, '')
}

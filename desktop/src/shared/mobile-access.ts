import type { RuntimeActivationStatus } from './runtime-activation'
export const MOBILE_ACCESS_IPC = 'zyra:mobile-access'
export interface MobileAccessConfig { hiddenProjects?: string[]; enabled: boolean; address: string; projects: string[]; port?: number }
export interface MobileAccessState {
    defaultProject?: string
    config: MobileAccessConfig
    /** Listener availability, independent of upstream agent-server health. */
    running: boolean
    runtimeStatus?: RuntimeActivationStatus
    origin?: string
    addresses: { name: string; address: string }[]
    devices: MobileDevice[]
    error?: string
}
export interface MobileDevice { id: string; name: string; createdAt: number; lastPairedAt?: number; connected?: boolean; hiddenProjects?: string[] }
export interface MobilePairing { link: string; image: string; expiresAt: number }
export interface MobileProjectChoice { name: string; paths: string[] }
export interface MobileAccessApi {
    setDeviceAccess(id: string, access: { hiddenProjects: string[] }): Promise<MobileAccessState>
    getProjects(): Promise<MobileProjectChoice[]>
    getState(): Promise<MobileAccessState>
    configure(config: MobileAccessConfig): Promise<MobileAccessState>
    pair(): Promise<MobilePairing>
    revoke(id: string): Promise<MobileAccessState>
}

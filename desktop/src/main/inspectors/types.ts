/**
 * Zyra - Type Definitions
 * Normalized capability schema for system inspection
 */

// ============================================================================
// System Health Types
// ============================================================================

export interface CpuInfo {
    model: string
    cores: number
    threads: number
    speed?: number
    usage?: number
}

export interface GpuInfo {
    model: string
    vram?: string
    driver?: string
    vendor?: string
}

export interface MemoryInfo {
    total: number
    available: number
    used: number
    type?: string
}

export interface DiskInfo {
    name: string
    size: number
    available: number
    type?: string
    path?: string
}

export interface OsInfo {
    name: string
    version: string
    build?: string
    arch: string
    hostname: string
    username: string
}

export interface SystemHealth {
    os: OsInfo
    cpu: CpuInfo
    memory: MemoryInfo
    disks: DiskInfo[]
    gpus: GpuInfo[]
    timestamp: number
}

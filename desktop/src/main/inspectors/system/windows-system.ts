/**
 * Zyra - Windows System Inspector
 * Optimized with two-tier caching for fast performance
 */

import { getOptimizedSystemInfo, getInstantSystemInfo, invalidateStaticCache } from './system-cache'
import type { SystemHealth } from '../types'

/**
 * Get comprehensive system information (optimized)
 */
export async function getSystemInfo(): Promise<SystemHealth> {
    return getOptimizedSystemInfo()
}

/**
 * Get instant basic system info (for immediate display)
 */
export function getSystemInfoInstant(): Partial<SystemHealth> {
    return getInstantSystemInfo()
}

/**
 * Invalidate system cache (call on manual refresh)
 */
export function refreshSystemCache(): void {
    invalidateStaticCache()
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0 || !bytes) return '0 GB'
    const gb = bytes / 1024 / 1024 / 1024
    return `${gb.toFixed(2)} GB`
}

/**
 * Get username
 */
export function getUserName(): string {
    const instant = getInstantSystemInfo()
    return instant.os?.username || 'Unknown'
}

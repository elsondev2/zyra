/**
 * Zyra - Inspectors Index
 * Re-exports all inspection modules
 */

export * from './types'
export { getSystemInfo, formatBytes, getUserName } from './system/windows-system'
export { getTerminalManager, cleanupTerminalManager, detectTerminalCapabilities } from './terminal'

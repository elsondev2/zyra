/**
 * Zyra - System Information Cache
 * Two-tier caching: static hardware info + dynamic metrics
 */

import os from 'os'
import si from 'systeminformation'
import log from 'electron-log'
import type { SystemHealth, CpuInfo, GpuInfo, MemoryInfo, DiskInfo, OsInfo } from '../types'
import { cacheManager, CacheManager } from '../cache-manager'

/**
 * Static system info (cached indefinitely)
 */
interface StaticSystemInfo {
  cpu: CpuInfo
  gpus: GpuInfo[]
  os: OsInfo
  totalMemory: number
  memoryType: string
  disks: Array<{ name: string; size: number; type: string }>
}

/**
 * Get static system information (cached indefinitely)
 */
async function getStaticSystemInfo(): Promise<StaticSystemInfo> {
  const cacheKey = 'system:static'

  // Check cache first
  const cached = cacheManager.get<StaticSystemInfo>(cacheKey)
  if (cached) {
    return cached
  }

  log.info('Fetching static system information...')
  const startTime = Date.now()

  try {
    const [cpuData, graphicsData, osInfo, memLayout, diskLayout] = await Promise.all([
      si.cpu(),
      si.graphics(),
      si.osInfo(),
      si.memLayout(),
      si.diskLayout()
    ])

    // CPU Information
    const cpu: CpuInfo = {
      model: cpuData.brand || cpuData.manufacturer || 'Unknown CPU',
      cores: cpuData.cores || os.cpus().length,
      threads: cpuData.cores || os.cpus().length,
      speed: cpuData.speed
    }

    // GPU Information
    const gpus: GpuInfo[] = []
    if (graphicsData.controllers && graphicsData.controllers.length > 0) {
      for (const controller of graphicsData.controllers) {
        gpus.push({
          model: controller.model || 'Unknown GPU',
          vram: controller.vram ? `${Math.round(controller.vram / 1024)} GB` : 'Unknown',
          vendor: controller.vendor,
          driver: controller.driverVersion
        })
      }
    }

    if (gpus.length === 0) {
      gpus.push({ model: 'No GPU detected', vram: 'N/A' })
    }

    // OS Information
    const osData: OsInfo = {
      name: osInfo.distro || 'Windows',
      version: osInfo.release || 'Unknown',
      build: osInfo.build,
      arch: osInfo.arch || os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username
    }

    // Memory type
    const memoryType = memLayout.length > 0 ? memLayout[0].type : 'Unknown'

    // Disk information (static parts only)
    const disks = diskLayout.map(disk => ({
      name: disk.name || 'Unknown Disk',
      size: disk.size || 0,
      type: disk.type || 'Unknown'
    }))

    const staticInfo: StaticSystemInfo = {
      cpu,
      gpus,
      os: osData,
      totalMemory: os.totalmem(),
      memoryType,
      disks: disks.length > 0 ? disks : [{ name: 'Unknown Disk', size: 0, type: 'Unknown' }]
    }

    const duration = Date.now() - startTime
    log.info(`Static system info fetched in ${duration}ms`)

    // Cache indefinitely (hardware doesn't change)
    cacheManager.set(cacheKey, staticInfo, CacheManager.INFINITE)

    return staticInfo
  } catch (error) {
    log.error('Failed to get static system info:', error)
    throw error
  }
}

/**
 * Get dynamic system metrics (always fresh)
 */
async function getDynamicSystemMetrics(): Promise<{ memory: MemoryInfo; disks: DiskInfo[] }> {
  try {
    // Use fast os module for memory (instant)
    const memInfo = {
      total: os.totalmem(),
      available: os.freemem(),
      used: os.totalmem() - os.freemem(),
      type: 'Unknown' // Will be filled from static info
    }

    // Get disk space (can be slow, but necessary for dynamic data)
    const fsSize = await si.fsSize()
    const disks: DiskInfo[] = fsSize.map(fs => ({
      name: fs.fs || 'Unknown',
      size: fs.size || 0,
      available: fs.available || 0,
      type: fs.type || 'Unknown'
    }))

    return {
      memory: memInfo,
      disks: disks.length > 0 ? disks : [{ name: 'Unknown Disk', size: 0, available: 0 }]
    }
  } catch (error) {
    log.error('Failed to get dynamic metrics:', error)

    // Fallback to os module
    return {
      memory: {
        total: os.totalmem(),
        available: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      disks: [{ name: 'Unknown Disk', size: 0, available: 0 }]
    }
  }
}

/**
 * Get complete system information (optimized with caching)
 */
export async function getOptimizedSystemInfo(): Promise<SystemHealth> {
  const startTime = Date.now()

  // Get static info (cached) and dynamic metrics (fresh) in parallel
  const [staticInfo, dynamicMetrics] = await Promise.all([
    getStaticSystemInfo(),
    getDynamicSystemMetrics()
  ])

  // Merge static and dynamic data
  const memory: MemoryInfo = {
    ...dynamicMetrics.memory,
    type: staticInfo.memoryType
  }

  // Merge disk info (static specs + dynamic space)
  const disks: DiskInfo[] = staticInfo.disks.map((staticDisk, index) => {
    const dynamicDisk = dynamicMetrics.disks[index]
    return {
      name: staticDisk.name,
      size: staticDisk.size,
      available: dynamicDisk?.available || 0,
      type: staticDisk.type
    }
  })

  const duration = Date.now() - startTime
  log.info(`Complete system info retrieved in ${duration}ms`)

  return {
    os: staticInfo.os,
    cpu: staticInfo.cpu,
    memory,
    disks,
    gpus: staticInfo.gpus,
    timestamp: Date.now()
  }
}

/**
 * Get instant basic system info (for immediate display)
 */
export function getInstantSystemInfo(): Partial<SystemHealth> {
  return {
    os: {
      name: os.platform(),
      version: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username
    },
    cpu: {
      model: os.cpus()[0]?.model || 'Unknown',
      cores: os.cpus().length,
      threads: os.cpus().length
    },
    memory: {
      total: os.totalmem(),
      available: os.freemem(),
      used: os.totalmem() - os.freemem()
    },
    timestamp: Date.now()
  }
}

/**
 * Invalidate static cache (call when hardware changes detected)
 */
export function invalidateStaticCache(): void {
  cacheManager.invalidate('system:static')
  log.info('Static system cache invalidated')
}

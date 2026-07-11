/**
 * Zyra - Cache Manager
 * Intelligent caching for system info and tool detection
 */

import log from 'electron-log'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

export class CacheManager {
  private static instance: CacheManager
  private cache = new Map<string, CacheEntry<any>>()

  // Cache TTL constants
  static readonly INFINITE = Infinity
  static readonly FIVE_MINUTES = 5 * 60 * 1000
  static readonly ONE_MINUTE = 60 * 1000
  static readonly THIRTY_SECONDS = 30 * 1000

  private constructor() {}

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
  }

  /**
   * Get cached value if valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const age = Date.now() - entry.timestamp
    if (age > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    log.debug(`Cache hit: ${key} (age: ${Math.round(age / 1000)}s)`)
    return entry.data
  }

  /**
   * Set cache value with TTL
   */
  set<T>(key: string, data: T, ttl: number = CacheManager.FIVE_MINUTES): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl })
    log.debug(`Cache set: ${key} (ttl: ${ttl === Infinity ? 'infinite' : Math.round(ttl / 1000) + 's'})`)
  }

  /**
   * Check if cache has valid entry
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key)
    log.debug(`Cache invalidated: ${key}`)
  }

  /**
   * Invalidate all cache entries matching pattern
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        count++
      }
    }
    log.debug(`Cache invalidated: ${count} entries matching ${pattern}`)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    log.info(`Cache cleared: ${size} entries`)
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }
}

// Singleton instance
export const cacheManager = CacheManager.getInstance()

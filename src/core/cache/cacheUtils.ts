/**
 * Cache Utilities
 *
 * Shared utility functions for cache implementations.
 * These functions replace the AbstractCacheManager base class with
 * simple, composable utilities that can be used by any cache.
 *
 * SECURITY: TTL jitter prevents timing-based cache enumeration attacks.
 */

/**
 * Configuration for cache behavior
 */
export interface CacheConfig {
    /** Time-to-live in milliseconds */
    ttlMs: number;
    /** Optional jitter percentage (0-100) to randomize TTL */
    jitterPercent?: number;
}

/**
 * Cache entry with expiration tracking
 */
export interface CacheEntry<V> {
    value: V;
    expiresAt: number;
}

/**
 * Add random jitter to TTL to prevent timing-based cache enumeration attacks.
 * SECURITY: Randomizes cache expiry by +/-jitterPercent to make timing attacks infeasible.
 *
 * @param baseTTL - Base TTL in milliseconds
 * @param jitterPercent - Jitter percentage (default: 10 for +/-10%)
 * @returns TTL with random jitter applied
 *
 * @example
 * ```typescript
 * // Add +/-10% jitter to 5-minute TTL
 * const jitteredTTL = getCacheTTLWithJitter(5 * 60 * 1000); // 270000-330000ms
 *
 * // Add +/-5% jitter
 * const jitteredTTL = getCacheTTLWithJitter(1000, 5); // 950-1050ms
 *
 * // No jitter
 * const exactTTL = getCacheTTLWithJitter(1000, 0); // 1000ms
 * ```
 */
export function getCacheTTLWithJitter(baseTTL: number, jitterPercent: number = 10): number {
    if (jitterPercent === 0) return baseTTL;

    const jitter = jitterPercent / 100; // Convert percentage to decimal
    const min = Math.floor(baseTTL * (1 - jitter));
    const max = Math.floor(baseTTL * (1 + jitter));
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if a cache entry has expired
 *
 * @param entry - Cache entry to check
 * @returns true if expired (expiresAt <= now), false otherwise
 *
 * @example
 * ```typescript
 * const entry = createCacheEntry('value', 5000);
 *
 * isExpired(entry); // false (just created)
 *
 * // After 5+ seconds...
 * isExpired(entry); // true
 * ```
 */
export function isExpired<V>(entry: CacheEntry<V>): boolean {
    return Date.now() >= entry.expiresAt;
}

/**
 * Create a new cache entry with TTL
 *
 * @param value - Value to cache
 * @param ttlMs - Time-to-live in milliseconds
 * @returns Cache entry with value and expiration timestamp
 *
 * @example
 * ```typescript
 * const entry = createCacheEntry({ id: 'user1', name: 'Alice' }, 60000);
 * // entry.value = { id: 'user1', name: 'Alice' }
 * // entry.expiresAt = Date.now() + 60000
 * ```
 */
export function createCacheEntry<V>(value: V, ttlMs: number): CacheEntry<V> {
    return {
        value,
        expiresAt: Date.now() + ttlMs,
    };
}

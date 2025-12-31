/**
 * Core Cache Infrastructure
 *
 * Provides shared cache utilities for TTL-based caching with jitter.
 *
 * @example
 * ```typescript
 * import { getCacheTTLWithJitter, isExpired, createCacheEntry } from '@/core/cache';
 *
 * // Create a cache entry with jittered TTL
 * const ttl = getCacheTTLWithJitter(300000, 10); // 5 min with +/-10% jitter
 * const entry = createCacheEntry(value, ttl);
 *
 * // Check if expired
 * if (isExpired(entry)) {
 *     // Refresh cache
 * }
 * ```
 */

export {
    getCacheTTLWithJitter,
    isExpired,
    createCacheEntry,
    type CacheEntry,
    type CacheConfig,
} from './cacheUtils';

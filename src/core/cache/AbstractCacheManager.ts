/**
 * AbstractCacheManager
 *
 * Base class for cache managers with TTL and jitter support.
 * Provides a standard interface for caching with automatic expiration.
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
 * Add random jitter to TTL to prevent timing-based cache enumeration attacks.
 * SECURITY: Randomizes cache expiry by ±jitterPercent to make timing attacks infeasible.
 *
 * @param baseTTL - Base TTL in milliseconds
 * @param jitterPercent - Jitter percentage (default: 10 for ±10%)
 * @returns TTL with random jitter applied
 *
 * @example
 * ```typescript
 * // Add ±10% jitter to 5-minute TTL
 * const jitteredTTL = getCacheTTLWithJitter(5 * 60 * 1000); // 270000-330000ms
 *
 * // Add ±5% jitter
 * const jitteredTTL = getCacheTTLWithJitter(1000, 5); // 950-1050ms
 * ```
 */
export function getCacheTTLWithJitter(baseTTL: number, jitterPercent: number = 10): number {
    const jitter = jitterPercent / 100; // Convert percentage to decimal
    const min = Math.floor(baseTTL * (1 - jitter));
    const max = Math.floor(baseTTL * (1 + jitter));
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Internal cache entry with expiration tracking
 */
interface CacheEntry<V> {
    value: V;
    expiresAt: number;
}

/**
 * Abstract base class for cache managers.
 * Subclasses must implement getKey() to transform input keys.
 *
 * @template K - Key type
 * @template V - Value type
 */
export abstract class AbstractCacheManager<K, V> {
    private cache: Map<string, CacheEntry<V>> = new Map();
    private readonly ttlMs: number;
    private readonly jitterPercent: number;

    constructor(config: CacheConfig) {
        this.ttlMs = config.ttlMs;
        this.jitterPercent = config.jitterPercent ?? 0;
    }

    /**
     * Transform input key to cache key string.
     * Subclasses implement this to define key serialization.
     */
    protected abstract getKey(key: K): string;

    /**
     * Calculate TTL with optional jitter
     */
    private calculateTTL(): number {
        if (this.jitterPercent === 0) {
            return this.ttlMs;
        }

        return getCacheTTLWithJitter(this.ttlMs, this.jitterPercent);
    }

    /**
     * Store a value in the cache
     */
    set(key: K, value: V): void {
        const cacheKey = this.getKey(key);
        const ttl = this.calculateTTL();
        this.cache.set(cacheKey, {
            value,
            expiresAt: Date.now() + ttl,
        });
    }

    /**
     * Retrieve a value from the cache
     * Returns undefined if not found or expired
     */
    get(key: K): V | undefined {
        const cacheKey = this.getKey(key);
        const entry = this.cache.get(cacheKey);

        if (!entry) {
            return undefined;
        }

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(cacheKey);
            return undefined;
        }

        return entry.value;
    }

    /**
     * Check if a key exists and is not expired
     */
    has(key: K): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Delete an entry from the cache
     */
    delete(key: K): void {
        const cacheKey = this.getKey(key);
        this.cache.delete(cacheKey);
    }

    /**
     * Clear all entries from the cache
     */
    clear(): void {
        this.cache.clear();
    }
}

/**
 * Cache Utilities Tests
 *
 * Tests for shared cache utility functions.
 * These utilities provide TTL calculation with jitter, expiration checking,
 * and cache entry creation without requiring class inheritance.
 */

import {
    getCacheTTLWithJitter,
    isExpired,
    createCacheEntry,
    type CacheEntry,
    type CacheConfig,
} from '@/core/cache/cacheUtils';

describe('Cache Utilities', () => {
    describe('getCacheTTLWithJitter', () => {
        it('should return base TTL when jitter is 0', () => {
            expect(getCacheTTLWithJitter(300000, 0)).toBe(300000);
        });

        it('should add jitter within expected range', () => {
            const baseTTL = 300000; // 5 minutes
            const jitterPercent = 10;

            // Run multiple times to verify randomness
            const results = Array.from({ length: 100 }, () =>
                getCacheTTLWithJitter(baseTTL, jitterPercent)
            );

            // All results should be within +/-10% of base
            const min = baseTTL * 0.9; // 270000
            const max = baseTTL * 1.1; // 330000
            expect(results.every(r => r >= min && r <= max)).toBe(true);
        });

        it('should produce variation across calls', () => {
            const baseTTL = 300000;
            const jitterPercent = 10;

            const results = Array.from({ length: 50 }, () =>
                getCacheTTLWithJitter(baseTTL, jitterPercent)
            );

            // Should have variation (not all same value)
            const unique = new Set(results);
            expect(unique.size).toBeGreaterThan(1);
        });

        it('should use default jitter of 10% when not specified', () => {
            const baseTTL = 100000;

            // Mock Math.random to return 0 (minimum)
            const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

            const result = getCacheTTLWithJitter(baseTTL);

            // With 10% jitter and random=0, should be at minimum (90%)
            expect(result).toBe(Math.floor(baseTTL * 0.9));

            randomSpy.mockRestore();
        });

        it('should handle edge case of 100% jitter', () => {
            const baseTTL = 1000;
            const jitterPercent = 100;

            const results = Array.from({ length: 50 }, () =>
                getCacheTTLWithJitter(baseTTL, jitterPercent)
            );

            // All results should be between 0 and 2000 (0% to 200%)
            expect(results.every(r => r >= 0 && r <= 2000)).toBe(true);
        });
    });

    describe('isExpired', () => {
        it('should return false for future expiry', () => {
            const entry: CacheEntry<string> = {
                value: 'test',
                expiresAt: Date.now() + 10000,
            };
            expect(isExpired(entry)).toBe(false);
        });

        it('should return true for past expiry', () => {
            const entry: CacheEntry<string> = {
                value: 'test',
                expiresAt: Date.now() - 1,
            };
            expect(isExpired(entry)).toBe(true);
        });

        it('should return true for exactly now (edge case)', () => {
            const now = Date.now();
            const entry: CacheEntry<string> = {
                value: 'test',
                expiresAt: now,
            };
            // When expiresAt equals now, entry is considered expired
            expect(isExpired(entry)).toBe(true);
        });

        it('should work with complex value types', () => {
            interface ComplexValue {
                id: string;
                data: number[];
            }

            const entry: CacheEntry<ComplexValue> = {
                value: { id: 'test', data: [1, 2, 3] },
                expiresAt: Date.now() + 5000,
            };

            expect(isExpired(entry)).toBe(false);
        });
    });

    describe('createCacheEntry', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should create entry with correct expiry time', () => {
            const value = 'test-value';
            const ttl = 5000;

            const entry = createCacheEntry(value, ttl);

            expect(entry.value).toBe(value);
            expect(entry.expiresAt).toBe(Date.now() + ttl);
        });

        it('should preserve value reference for objects', () => {
            const value = { id: 'test', data: [1, 2, 3] };
            const ttl = 10000;

            const entry = createCacheEntry(value, ttl);

            expect(entry.value).toBe(value); // Same reference
            expect(entry.value.id).toBe('test');
        });

        it('should work with zero TTL', () => {
            const entry = createCacheEntry('value', 0);

            expect(entry.expiresAt).toBe(Date.now());
            // Should be immediately expired
            expect(isExpired(entry)).toBe(true);
        });

        it('should work with large TTL values', () => {
            const oneYear = 365 * 24 * 60 * 60 * 1000;
            const entry = createCacheEntry('value', oneYear);

            expect(entry.expiresAt).toBe(Date.now() + oneYear);
        });
    });

    describe('CacheConfig type', () => {
        it('should allow minimal config with just ttlMs', () => {
            const config: CacheConfig = {
                ttlMs: 60000,
            };

            expect(config.ttlMs).toBe(60000);
            expect(config.jitterPercent).toBeUndefined();
        });

        it('should allow config with jitterPercent', () => {
            const config: CacheConfig = {
                ttlMs: 60000,
                jitterPercent: 10,
            };

            expect(config.ttlMs).toBe(60000);
            expect(config.jitterPercent).toBe(10);
        });
    });

    describe('integration: using utilities together', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should create and check expiry correctly', () => {
            const ttl = getCacheTTLWithJitter(5000, 0);
            const entry = createCacheEntry('value', ttl);

            // Should not be expired initially
            expect(isExpired(entry)).toBe(false);

            // Advance time past expiry
            jest.advanceTimersByTime(5001);

            // Should now be expired
            expect(isExpired(entry)).toBe(true);
        });

        it('should work with jittered TTL', () => {
            // Mock random to return 0.5 (middle of range)
            const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

            const ttl = getCacheTTLWithJitter(10000, 10);
            const entry = createCacheEntry('value', ttl);

            // With random=0.5 and 10% jitter, TTL should be exactly 10000
            expect(isExpired(entry)).toBe(false);

            jest.advanceTimersByTime(9999);
            expect(isExpired(entry)).toBe(false);

            jest.advanceTimersByTime(2);
            expect(isExpired(entry)).toBe(true);

            randomSpy.mockRestore();
        });
    });
});

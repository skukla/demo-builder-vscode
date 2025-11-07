import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import type { PrerequisiteStatus } from '@/features/prerequisites/services/types';

/**
 * PrerequisitesCacheManager Test Suite
 *
 * Tests in-memory caching for prerequisite check results:
 * - Cache operations (get/set)
 * - TTL expiration with jitter
 * - Separate entries for perNodeVersion prerequisites
 * - Cache size limits and LRU eviction
 * - Cache invalidation (single and all)
 * - Statistics tracking
 * - Security features (cache key validation, jitter)
 *
 * Total tests: 25
 */

// Mock dependencies
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    CACHE_TTL: {
        PREREQUISITE_CHECK: 300000, // 5 minutes
    },
}));

describe('PrerequisitesCacheManager', () => {
    let cacheManager: PrerequisitesCacheManager;

    // Helper to create complete PrerequisiteStatus objects
    const createMockStatus = (overrides: Partial<PrerequisiteStatus> = {}): PrerequisiteStatus => ({
        id: 'test-prereq',
        name: 'Test Prerequisite',
        description: 'Test description',
        installed: true,
        optional: false,
        canInstall: true,
        version: '1.0.0',
        ...overrides,
    });

    beforeEach(() => {
        cacheManager = new PrerequisitesCacheManager();
        jest.clearAllMocks();
    });

    describe('basic cache operations', () => {
        it('should cache and retrieve prerequisite result', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeDefined();
            expect(cached?.data).toEqual(result);
        });

        it('should return undefined for non-existent cache entry', () => {
            const cached = cacheManager.getCachedResult('nonexistent');

            expect(cached).toBeUndefined();
        });

        it('should cache separate entries for perNodeVersion prerequisites', () => {
            const result1 = createMockStatus({ installed: true, version: '1.0.0' });
            const result2 = createMockStatus({ installed: false });

            cacheManager.setCachedResult('aio-cli', result1, 300000, '20');
            cacheManager.setCachedResult('aio-cli', result2, 300000, '18');

            const cached1 = cacheManager.getCachedResult('aio-cli', '20');
            const cached2 = cacheManager.getCachedResult('aio-cli', '18');

            expect(cached1?.data).toEqual(result1);
            expect(cached2?.data).toEqual(result2);
        });

        it('should overwrite existing cache entry', () => {
            const result1 = createMockStatus({ installed: true, version: '1.0.0' });
            const result2 = createMockStatus({ installed: false });

            cacheManager.setCachedResult('node', result1);
            cacheManager.setCachedResult('node', result2);

            const cached = cacheManager.getCachedResult('node');

            expect(cached?.data).toEqual(result2);
        });

        it('should handle caching installed=false status', () => {
            const result = createMockStatus({ installed: false });

            cacheManager.setCachedResult('missing-tool', result);
            const cached = cacheManager.getCachedResult('missing-tool');

            expect(cached?.data).toEqual(result);
            expect(cached?.data.installed).toBe(false);
        });
    });

    describe('TTL expiration', () => {
        it('should expire cache after TTL', () => {
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result, 10000); // 10 second TTL

            // Fast-forward time beyond TTL
            mockTime += 15000; // 15 seconds

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeUndefined();

            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should not expire cache before TTL', () => {
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result, 10000); // 10 second TTL

            // Fast-forward time but stay within TTL
            mockTime += 5000; // 5 seconds

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeDefined();
            expect(cached?.data).toEqual(result);

            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should use custom TTL when provided', () => {
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result, 60000); // 1 minute TTL

            // Fast-forward 30 seconds (should still be cached)
            mockTime += 30000;

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeDefined();

            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should apply jitter to TTL', () => {
            const originalNow = Date.now;
            jest.spyOn(Date, 'now').mockImplementation(() => 1000000);

            const baseTTL = 10000; // 10 seconds
            const samples: number[] = [];

            // Collect multiple samples
            for (let i = 0; i < 20; i++) {
                const manager = new PrerequisitesCacheManager();
                const result = createMockStatus({ installed: true, version: '1.0.0' });

                manager.setCachedResult('node', result, baseTTL);

                // Access private field (for testing only)
                const cache = (manager as any).cache.get('node');
                const actualTTL = cache.expiry - 1000000;
                samples.push(actualTTL);
            }

            // Jitter should be ±10%
            const minExpected = baseTTL * 0.9;
            const maxExpected = baseTTL * 1.1;

            // All samples should be within jitter range
            samples.forEach(sample => {
                expect(sample).toBeGreaterThanOrEqual(minExpected);
                expect(sample).toBeLessThanOrEqual(maxExpected);
            });

            // Should have some variation
            const uniqueValues = new Set(samples);
            expect(uniqueValues.size).toBeGreaterThan(1);

            jest.spyOn(Date, 'now').mockRestore();
        });
    });

    describe('cache invalidation', () => {
        it('should invalidate single prerequisite', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            cacheManager.invalidate('node');

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeUndefined();
        });

        it('should invalidate all versions of perNodeVersion prerequisite', () => {
            const result1 = createMockStatus({ installed: true, version: '1.0.0' });
            const result2 = createMockStatus({ installed: false });

            cacheManager.setCachedResult('aio-cli', result1, 300000, '20');
            cacheManager.setCachedResult('aio-cli', result2, 300000, '18');

            cacheManager.invalidate('aio-cli');

            const cached1 = cacheManager.getCachedResult('aio-cli', '20');
            const cached2 = cacheManager.getCachedResult('aio-cli', '18');

            expect(cached1).toBeUndefined();
            expect(cached2).toBeUndefined();
        });

        it('should not affect other cache entries when invalidating', () => {
            const result1 = createMockStatus({ installed: true, version: '1.0.0' });
            const result2 = createMockStatus({ installed: true, version: '2.0.0' });

            cacheManager.setCachedResult('node', result1);
            cacheManager.setCachedResult('npm', result2);

            cacheManager.invalidate('node');

            expect(cacheManager.getCachedResult('node')).toBeUndefined();
            expect(cacheManager.getCachedResult('npm')).toBeDefined();
        });

        it('should clear all caches', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            cacheManager.setCachedResult('npm', result);
            cacheManager.setCachedResult('aio-cli', result, 300000, '20');

            cacheManager.clearAll();

            expect(cacheManager.getCachedResult('node')).toBeUndefined();
            expect(cacheManager.getCachedResult('npm')).toBeUndefined();
            expect(cacheManager.getCachedResult('aio-cli', '20')).toBeUndefined();
        });

        it('should handle invalidation of non-existent entry', () => {
            expect(() => {
                cacheManager.invalidate('nonexistent');
            }).not.toThrow();
        });
    });

    describe('cache size limits and LRU eviction', () => {
        it('should enforce max cache size', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            // Fill cache beyond max size (100)
            for (let i = 0; i < 105; i++) {
                cacheManager.setCachedResult(`prereq-${i}`, result);
            }

            const stats = cacheManager.getStats();

            expect(stats.size).toBeLessThanOrEqual(100);
        });

        it('should evict oldest entry when cache is full', () => {
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            // Mock Math.random to return consistent jitter (0.5 = middle of range)
            const originalRandom = Math.random;
            Math.random = jest.fn(() => 0.5);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            // Fill cache to max size
            for (let i = 0; i < 100; i++) {
                mockTime += 100; // Each entry has slightly different expiry
                cacheManager.setCachedResult(`prereq-${i}`, result);
            }

            // Add one more entry (should evict oldest)
            mockTime += 100;
            cacheManager.setCachedResult('new-prereq', result);

            // First entry should be evicted
            expect(cacheManager.getCachedResult('prereq-0')).toBeUndefined();
            expect(cacheManager.getCachedResult('new-prereq')).toBeDefined();

            jest.spyOn(Date, 'now').mockRestore();
            Math.random = originalRandom;
        });

        it('should not evict when updating existing entry', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            // Fill cache to max size
            for (let i = 0; i < 100; i++) {
                cacheManager.setCachedResult(`prereq-${i}`, result);
            }

            // Update existing entry (should not trigger eviction)
            cacheManager.setCachedResult('prereq-50', createMockStatus({ installed: false }));

            const stats = cacheManager.getStats();
            expect(stats.size).toBe(100);
        });
    });

    describe('statistics tracking', () => {
        it('should track cache hits', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            cacheManager.getCachedResult('node');
            cacheManager.getCachedResult('node');

            const stats = cacheManager.getStats();

            expect(stats.hits).toBe(2);
        });

        it('should track cache misses', () => {
            cacheManager.getCachedResult('nonexistent');
            cacheManager.getCachedResult('also-nonexistent');

            const stats = cacheManager.getStats();

            expect(stats.misses).toBe(2);
        });

        it('should track cache sets', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            cacheManager.setCachedResult('npm', result);

            const stats = cacheManager.getStats();

            expect(stats.sets).toBe(2);
        });

        it('should track invalidations', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            cacheManager.setCachedResult('npm', result);
            cacheManager.setCachedResult('aio-cli', result, 300000, '20');
            cacheManager.setCachedResult('aio-cli', result, 300000, '18');

            cacheManager.invalidate('node');
            cacheManager.invalidate('aio-cli'); // Should count as 2 invalidations

            const stats = cacheManager.getStats();

            expect(stats.invalidations).toBe(3);
        });

        it('should calculate hit rate', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);

            // 3 hits, 2 misses = 60% hit rate
            cacheManager.getCachedResult('node');
            cacheManager.getCachedResult('node');
            cacheManager.getCachedResult('node');
            cacheManager.getCachedResult('nonexistent');
            cacheManager.getCachedResult('also-nonexistent');

            const stats = cacheManager.getStats();

            expect(stats.hitRate).toBe(60);
        });

        it('should return 0 hit rate when no accesses', () => {
            const stats = cacheManager.getStats();

            expect(stats.hitRate).toBe(0);
        });

        it('should report current cache size', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result);
            cacheManager.setCachedResult('npm', result);

            const stats = cacheManager.getStats();

            expect(stats.size).toBe(2);
        });
    });

    describe('cache key security', () => {
        it('should reject prereqId with ## separator', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            expect(() => {
                cacheManager.setCachedResult('bad##id', result);
            }).toThrow('Invalid prereqId');
        });

        it('should reject prereqId with ## in getCachedResult', () => {
            expect(() => {
                cacheManager.getCachedResult('bad##id');
            }).toThrow('Invalid prereqId');
        });

        it('should allow valid prereqIds with colon', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            expect(() => {
                cacheManager.setCachedResult('aio:cli', result);
            }).not.toThrow();

            const cached = cacheManager.getCachedResult('aio:cli');
            expect(cached).toBeDefined();
        });

        it('should handle node versions without collision', () => {
            const result1 = createMockStatus({ installed: true, version: '1.0.0' });
            const result2 = createMockStatus({ installed: false });

            // These should not collide
            cacheManager.setCachedResult('aio', result1, 300000, 'cli');
            cacheManager.setCachedResult('aio:cli', result2);

            const cached1 = cacheManager.getCachedResult('aio', 'cli');
            const cached2 = cacheManager.getCachedResult('aio:cli');

            expect(cached1?.data).toEqual(result1);
            expect(cached2?.data).toEqual(result2);
        });
    });
});

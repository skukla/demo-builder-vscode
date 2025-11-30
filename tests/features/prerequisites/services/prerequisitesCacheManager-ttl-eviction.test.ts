import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { createMockStatus, setupMockTime, setupMockRandom } from './prerequisitesCacheManager.testUtils';

/**
 * PrerequisitesCacheManager TTL & Eviction Test Suite
 *
 * Tests TTL expiration with jitter and LRU eviction:
 * - TTL expiration mechanics
 * - Custom TTL support
 * - Jitter application (±10%)
 * - Cache size limits (max 100 entries)
 * - LRU eviction when full
 *
 * Total tests: 7
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

describe('PrerequisitesCacheManager - TTL & Eviction', () => {
    let cacheManager: PrerequisitesCacheManager;

    beforeEach(() => {
        cacheManager = new PrerequisitesCacheManager();
        jest.clearAllMocks();
    });

    describe('TTL expiration', () => {
        it('should expire cache after TTL', () => {
            const mockTime = setupMockTime(1000000);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result, 10000); // 10 second TTL

            // Fast-forward time beyond TTL
            mockTime.advance(15000); // 15 seconds

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeUndefined();

            mockTime.restore();
        });

        it('should not expire cache before TTL', () => {
            const mockTime = setupMockTime(1000000);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result, 10000); // 10 second TTL

            // Fast-forward time but stay within TTL
            mockTime.advance(5000); // 5 seconds

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeDefined();
            expect(cached?.data).toEqual(result);

            mockTime.restore();
        });

        it('should use custom TTL when provided', () => {
            const mockTime = setupMockTime(1000000);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('node', result, 60000); // 1 minute TTL

            // Fast-forward 30 seconds (should still be cached)
            mockTime.advance(30000);

            const cached = cacheManager.getCachedResult('node');

            expect(cached).toBeDefined();

            mockTime.restore();
        });

        it('should apply jitter to TTL', () => {
            const mockTime = setupMockTime(1000000);

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

            mockTime.restore();
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
            const mockTime = setupMockTime(1000000);
            const mockRandom = setupMockRandom(0.5);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            // Fill cache to max size
            for (let i = 0; i < 100; i++) {
                mockTime.advance(100); // Each entry has slightly different expiry
                cacheManager.setCachedResult(`prereq-${i}`, result);
            }

            // Add one more entry (should evict oldest)
            mockTime.advance(100);
            cacheManager.setCachedResult('new-prereq', result);

            // First entry should be evicted
            expect(cacheManager.getCachedResult('prereq-0')).toBeUndefined();
            expect(cacheManager.getCachedResult('new-prereq')).toBeDefined();

            mockTime.restore();
            mockRandom.restore();
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
});

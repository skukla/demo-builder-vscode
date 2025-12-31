import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { createMockStatus, setupMockTime } from './prerequisitesCacheManager.testUtils';

/**
 * PrerequisitesCacheManager Statistics & Versions Test Suite
 *
 * Tests statistics tracking and per-version result retrieval:
 * - Hit/miss tracking
 * - Set and invalidation counting
 * - Hit rate calculation
 * - Cache size reporting
 * - Per-version results retrieval
 * - Expired result filtering
 *
 * Total tests: 12
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
        MEDIUM: 300000, // 5 minutes - semantic category (replaces PREREQUISITE_CHECK)
    },
}));

describe('PrerequisitesCacheManager - Statistics & Versions', () => {
    let cacheManager: PrerequisitesCacheManager;

    beforeEach(() => {
        cacheManager = new PrerequisitesCacheManager();
        jest.clearAllMocks();
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

    describe('getPerVersionResults', () => {
        it('should return all cached per-version results for a prerequisite', () => {
            const result1 = createMockStatus({ installed: true, version: '1.0.0' });
            const result2 = createMockStatus({ installed: false });
            const result3 = createMockStatus({ installed: true, version: '2.0.0' });

            cacheManager.setCachedResult('aio-cli', result1, 300000, '20');
            cacheManager.setCachedResult('aio-cli', result2, 300000, '18');
            cacheManager.setCachedResult('aio-cli', result3, 300000, '22');

            const results = cacheManager.getPerVersionResults('aio-cli');

            expect(results).toHaveLength(3);
            expect(results).toEqual(
                expect.arrayContaining([
                    { version: 'Node 20', major: '20', component: '', installed: true },
                    { version: 'Node 18', major: '18', component: '', installed: false },
                    { version: 'Node 22', major: '22', component: '', installed: true },
                ]),
            );
        });

        it('should filter out expired results', () => {
            const mockTime = setupMockTime(1000000);

            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('aio-cli', result, 10000, '20'); // 10 second TTL
            cacheManager.setCachedResult('aio-cli', result, 10000, '18'); // 10 second TTL

            // Fast-forward time to expire first entry only
            mockTime.advance(11000);

            // Add fresh entry
            cacheManager.setCachedResult('aio-cli', result, 10000, '22');

            const results = cacheManager.getPerVersionResults('aio-cli');

            // Should only return the fresh entry (others expired)
            expect(results).toHaveLength(1);
            expect(results[0].major).toBe('22');

            mockTime.restore();
        });

        it('should return empty array when no results cached', () => {
            const results = cacheManager.getPerVersionResults('nonexistent');

            expect(results).toEqual([]);
        });

        it('should return results with major field', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            cacheManager.setCachedResult('aio-cli', result, 300000, '20');

            const results = cacheManager.getPerVersionResults('aio-cli');

            expect(results).toHaveLength(1);
            expect(results[0]).toHaveProperty('major');
            expect(results[0].major).toBe('20');
            expect(results[0]).toHaveProperty('version');
            expect(results[0].version).toBe('Node 20');
        });

        it('should use stored nodeVersion instead of parsing key', () => {
            const result = createMockStatus({ installed: true, version: '1.0.0' });

            // Set with nodeVersion stored in cache data
            cacheManager.setCachedResult('aio-cli', result, 300000, '20');

            const results = cacheManager.getPerVersionResults('aio-cli');

            // Verify major is retrieved from stored nodeVersion field
            expect(results[0].major).toBe('20');

            // Access private cache to verify nodeVersion is stored
            const cache = (cacheManager as any).cache;
            const cachedEntry = cache.get('aio-cli##20');
            expect(cachedEntry.nodeVersion).toBe('20');
        });
    });
});

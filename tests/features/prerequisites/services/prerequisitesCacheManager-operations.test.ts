import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { createMockStatus } from './prerequisitesCacheManager.testUtils';

/**
 * PrerequisitesCacheManager Operations Test Suite
 *
 * Tests basic cache operations, invalidation, and security:
 * - Basic get/set operations
 * - Separate entries for perNodeVersion prerequisites
 * - Cache invalidation (single and all)
 * - Cache key validation and security
 *
 * Total tests: 14
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

describe('PrerequisitesCacheManager - Operations', () => {
    let cacheManager: PrerequisitesCacheManager;

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

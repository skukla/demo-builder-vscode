import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import {
    mockLogger,
    createMockOrg,
    createMockOrg2,
    createMockConsoleWhere,
    mockTime,
} from './authCacheManager.testUtils';

/**
 * AuthCacheManager TTL & Expiry Test Suite
 *
 * Tests TTL expiration and security features:
 * - Auth status TTL expiration
 * - Validation cache TTL expiration
 * - Org list TTL expiration
 * - Console.where TTL expiration
 * - TTL jitter (security feature)
 *
 * Total tests: 6
 */

// Mock getLogger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('AuthCacheManager - TTL & Expiry', () => {
    let cacheManager: AuthCacheManager;

    beforeEach(() => {
        cacheManager = new AuthCacheManager();
        jest.clearAllMocks();
    });

    describe('auth status TTL expiration', () => {
        it('should expire auth status cache after TTL', () => {
            const time = mockTime();

            const shortTTL = 100; // 100ms
            cacheManager.setCachedAuthStatus(true, shortTTL);

            // Verify cache is valid immediately
            let result = cacheManager.getCachedAuthStatus();
            expect(result.isExpired).toBe(false);
            expect(result.isAuthenticated).toBe(true);

            // Fast-forward time beyond TTL (including max jitter of 10%)
            time.advance(shortTTL * 1.1 + 10); // TTL + max jitter + buffer

            // Cache should now be expired
            result = cacheManager.getCachedAuthStatus();
            expect(result.isExpired).toBe(true);
            expect(result.isAuthenticated).toBeUndefined();

            time.restore();
        });
    });

    describe('validation cache TTL expiration', () => {
        it('should expire validation cache after TTL', () => {
            const time = mockTime();

            cacheManager.setValidationCache('org123', true);

            // Fast-forward time beyond TTL (validation cache uses CACHE_TTL.VALIDATION)
            time.advance(10 * 60 * 1000 + 1000); // 10 minutes + 1 second (beyond max jitter)

            const result = cacheManager.getValidationCache();
            expect(result).toBeUndefined();

            time.restore();
        });
    });

    describe('org list TTL expiration', () => {
        it('should expire org list cache after TTL', () => {
            const mockOrg = createMockOrg();
            const mockOrg2 = createMockOrg2();
            const mockOrgList = [mockOrg, mockOrg2];

            const time = mockTime();

            cacheManager.setCachedOrgList(mockOrgList);

            // Fast-forward time beyond TTL
            time.advance(10 * 60 * 1000 + 1000); // 10 minutes + 1 second

            const result = cacheManager.getCachedOrgList();
            expect(result).toBeUndefined();

            time.restore();
        });
    });

    describe('console.where TTL expiration', () => {
        it('should expire console.where cache after TTL', () => {
            const mockConsoleWhere = createMockConsoleWhere();
            const time = mockTime();

            cacheManager.setCachedConsoleWhere(mockConsoleWhere);

            // Fast-forward time beyond TTL
            time.advance(10 * 60 * 1000 + 1000); // 10 minutes + 1 second

            const result = cacheManager.getCachedConsoleWhere();
            expect(result).toBeUndefined();

            time.restore();
        });
    });

    describe('TTL jitter (security)', () => {
        it('should apply jitter to auth status TTL', () => {
            const baseTTL = 10000; // 10 seconds
            const samples: number[] = [];

            const time = mockTime();

            // Collect multiple samples
            for (let i = 0; i < 20; i++) {
                const manager = new AuthCacheManager();
                manager.setCachedAuthStatus(true, baseTTL);

                // Access private field via type assertion (for testing only)
                const expiry = (manager as any).authCacheExpiry;
                const actualTTL = expiry - time.current;
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

            // Should have some variation (not all the same)
            const uniqueValues = new Set(samples);
            expect(uniqueValues.size).toBeGreaterThan(1);

            time.restore();
        });

        it('should apply jitter to validation cache TTL', () => {
            const samples: number[] = [];
            const time = mockTime();

            // Collect multiple samples
            for (let i = 0; i < 20; i++) {
                const manager = new AuthCacheManager();
                manager.setValidationCache('org123', true);

                const cache = (manager as any).validationCache;
                const actualTTL = cache.expiry - time.current;
                samples.push(actualTTL);
            }

            // Should have variation due to jitter
            const uniqueValues = new Set(samples);
            expect(uniqueValues.size).toBeGreaterThan(1);

            time.restore();
        });
    });
});

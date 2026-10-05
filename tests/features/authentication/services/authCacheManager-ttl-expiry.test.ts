import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { mockTime } from './authCacheManager.testUtils';

/**
 * AuthCacheManager TTL & Expiry Test Suite
 *
 * Tests TTL expiration and security features:
 * - Auth status TTL expiration
 * - TTL jitter (security feature)
 *
 * The validation, org-list and console.where expiries are pinned at the exact
 * instant in authCacheManager-boundaries.test.ts (PL-42 removed the weaker
 * "advance well past the TTL" copies here).
 *
 * Total tests: 3
 */

// Mock getLogger

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

    describe('TTL jitter (security)', () => {
        it('should apply jitter to auth status TTL', () => {
            const baseTTL = 10000; // 10 seconds
            const samples: number[] = [];

            const time = mockTime();

            // Collect multiple samples
            for (let i = 0; i < 20; i++) {
                const manager = new AuthCacheManager();
                manager.setCachedAuthStatus(true, baseTTL);

                // Private field, read through its declared shape (for testing only)
                const expiry = (manager as unknown as { authCacheExpiry: number }).authCacheExpiry;
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

                const cache = (manager as unknown as { validationCache: { expiry: number } })
                    .validationCache;
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

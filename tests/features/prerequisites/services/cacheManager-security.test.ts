/**
 * Unit Tests for PrerequisitesCacheManager - Security Features
 *
 * Tests cache size limits, LRU eviction, and TTL jitter for security.
 */

import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { createMockPrerequisiteStatus } from './cacheManager.testUtils';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('PrerequisitesCacheManager - Security', () => {
    let cacheManager: PrerequisitesCacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = new PrerequisitesCacheManager();
    });

    describe('Cache Size Limit (DoS Prevention)', () => {
        it('should enforce maximum cache size with LRU eviction', () => {
            const mockResult = createMockPrerequisiteStatus({
                id: 'test',
                name: 'Test',
                description: 'Test prerequisite',
            });

            // Fill cache to max size (100 entries)
            for (let i = 0; i < 100; i++) {
                cacheManager.setCachedResult(`prereq-${i}`, mockResult);
            }

            // Verify cache is at max size
            const stats = cacheManager.getStats();
            expect(stats.size).toBe(100);

            // Add one more entry - should evict oldest
            cacheManager.setCachedResult('prereq-new', mockResult);

            // Cache should still be at max size
            const statsAfter = cacheManager.getStats();
            expect(statsAfter.size).toBe(100);

            // New entry should be present
            expect(cacheManager.getCachedResult('prereq-new')).toBeDefined();
        });

        it('should evict entries with earliest expiry (oldest first)', () => {
            const mockResult = createMockPrerequisiteStatus({
                id: 'test',
                name: 'Test',
                description: 'Test prerequisite',
            });

            // Fill cache to max size with different TTLs
            // Use large TTL spread (3000ms per entry) to ensure jitter (±10%) doesn't affect ordering
            // With ±10% jitter, we need >20% gap between entries to prevent overlap
            for (let i = 0; i < 100; i++) {
                // Earlier entries have shorter TTL (will expire first)
                // 10s, 13s, 16s, etc. - jitter of ±10% can't change ordering
                const ttl = 10000 + (i * 3000);
                cacheManager.setCachedResult(`prereq-${i}`, mockResult, ttl);
            }

            // First entry (prereq-0) should have earliest expiry
            const firstEntry = cacheManager.getCachedResult('prereq-0');
            expect(firstEntry).toBeDefined();

            // Add one more entry - should evict prereq-0 (earliest expiry)
            cacheManager.setCachedResult('prereq-new', mockResult);

            // First entry should be evicted
            expect(cacheManager.getCachedResult('prereq-0')).toBeUndefined();

            // New entry should be present
            expect(cacheManager.getCachedResult('prereq-new')).toBeDefined();
        });

        it('should allow updating existing entries without triggering eviction', () => {
            const mockResult = createMockPrerequisiteStatus({
                id: 'test',
                name: 'Test',
                description: 'Test prerequisite',
            });

            // Fill cache to max size
            for (let i = 0; i < 100; i++) {
                cacheManager.setCachedResult(`prereq-${i}`, mockResult);
            }

            // Update existing entry (should not trigger eviction)
            const updatedResult = createMockPrerequisiteStatus({
                id: 'test',
                name: 'Test',
                description: 'Test prerequisite',
                installed: false,
            });
            cacheManager.setCachedResult('prereq-50', updatedResult);

            // Cache size should remain the same
            expect(cacheManager.getStats().size).toBe(100);

            // Updated entry should have new value
            expect(cacheManager.getCachedResult('prereq-50')?.data.installed).toBe(false);

            // All other entries should still be present
            expect(cacheManager.getCachedResult('prereq-0')).toBeDefined();
            expect(cacheManager.getCachedResult('prereq-99')).toBeDefined();
        });
    });

    describe('TTL Jitter (Timing Attack Prevention)', () => {
        it('should apply random jitter to TTL', () => {
            const mockResult = createMockPrerequisiteStatus();

            const baseTTL = 10000; // 10 seconds
            const expiries: number[] = [];

            // Store multiple entries to see jitter variance
            for (let i = 0; i < 10; i++) {
                const manager = new PrerequisitesCacheManager();
                manager.setCachedResult(`node-${i}`, mockResult, baseTTL);
                const cached = manager.getCachedResult(`node-${i}`);
                if (cached) {
                    expiries.push(cached.expiry - Date.now());
                }
            }

            // All expiries should be within ±10% of baseTTL
            expiries.forEach(expiry => {
                expect(expiry).toBeGreaterThanOrEqual(baseTTL * 0.9);
                expect(expiry).toBeLessThanOrEqual(baseTTL * 1.1);
            });

            // At least some variance (not all identical)
            const uniqueExpiries = new Set(expiries);
            expect(uniqueExpiries.size).toBeGreaterThan(1);
        });
    });
});

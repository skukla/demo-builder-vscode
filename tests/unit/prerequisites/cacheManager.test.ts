/**
 * Unit Tests for PrerequisitesCacheManager
 *
 * Tests the in-memory caching system for prerequisite check results
 * following the AuthCacheManager pattern.
 */

import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { PrerequisiteStatus } from '@/features/prerequisites/services/types';
import { CACHE_TTL } from '@/utils/timeoutConfig';

// Mock logger
jest.mock('@/shared/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('PrerequisitesCacheManager', () => {
    let cacheManager: PrerequisitesCacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = new PrerequisitesCacheManager();
    });

    describe('Happy Path Tests', () => {
        describe('1. Cache stores prerequisite check result with TTL', () => {
            it('should store prerequisite result with default TTL', () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    version: '20.0.0',
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', mockResult);
                const cached = cacheManager.getCachedResult('node');

                expect(cached).toBeDefined();
                expect(cached?.data).toEqual(mockResult);
                expect(cached?.expiry).toBeGreaterThan(Date.now());
            });

            it('should store prerequisite result with custom TTL', () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'npm',
                    name: 'npm',
                    description: 'Package manager',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                const customTTL = 1000; // 1 second
                cacheManager.setCachedResult('npm', mockResult, customTTL);
                const cached = cacheManager.getCachedResult('npm');

                expect(cached).toBeDefined();
                expect(cached?.expiry).toBeLessThanOrEqual(Date.now() + customTTL * 1.1); // Account for jitter
            });

            it('should store different results for different prerequisites', () => {
                const nodeResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                const npmResult: PrerequisiteStatus = {
                    id: 'npm',
                    name: 'npm',
                    description: 'Package manager',
                    installed: false,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', nodeResult);
                cacheManager.setCachedResult('npm', npmResult);

                expect(cacheManager.getCachedResult('node')?.data).toEqual(nodeResult);
                expect(cacheManager.getCachedResult('npm')?.data).toEqual(npmResult);
            });
        });

        describe('2. Cache hit returns result instantly (<10ms)', () => {
            it('should return cached result very quickly', () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', mockResult);

                const startTime = Date.now();
                const cached = cacheManager.getCachedResult('node');
                const duration = Date.now() - startTime;

                expect(cached?.data).toEqual(mockResult);
                expect(duration).toBeLessThan(10); // Must complete in <10ms
            });

            it('should return undefined for cache miss', () => {
                const cached = cacheManager.getCachedResult('non-existent');
                expect(cached).toBeUndefined();
            });
        });

        describe('3. Cache miss triggers full check and caches result', () => {
            // This test is more of an integration test, but we can verify the cache behavior
            it('should return undefined on cache miss allowing full check', () => {
                const cached = cacheManager.getCachedResult('node');
                expect(cached).toBeUndefined();
            });
        });
    });

    describe('Edge Case Tests', () => {
        describe('4. Cache expiry triggers re-check after TTL', () => {
            it('should return undefined after TTL expires', async () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                const shortTTL = 50; // 50ms
                cacheManager.setCachedResult('node', mockResult, shortTTL);

                // Should be cached immediately
                expect(cacheManager.getCachedResult('node')).toBeDefined();

                // Wait for TTL to expire
                await new Promise(resolve => setTimeout(resolve, 100));

                // Should be expired now
                expect(cacheManager.getCachedResult('node')).toBeUndefined();
            });

            it('should handle expiry check without throwing', async () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', mockResult, 50);
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(() => cacheManager.getCachedResult('node')).not.toThrow();
            });
        });

        describe('5. perNodeVersion prerequisites cached separately per version', () => {
            it('should cache results separately for each Node version', () => {
                const result18: PrerequisiteStatus = {
                    id: 'aio-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe I/O CLI',
                    installed: true,
                    version: '10.0.0',
                    optional: false,
                    canInstall: true,
                };

                const result20: PrerequisiteStatus = {
                    id: 'aio-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe I/O CLI',
                    installed: false,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('aio-cli', result18, undefined, '18');
                cacheManager.setCachedResult('aio-cli', result20, undefined, '20');

                const cached18 = cacheManager.getCachedResult('aio-cli', '18');
                const cached20 = cacheManager.getCachedResult('aio-cli', '20');

                expect(cached18?.data.installed).toBe(true);
                expect(cached20?.data.installed).toBe(false);
            });

            it('should not return result when Node version differs', () => {
                const result18: PrerequisiteStatus = {
                    id: 'aio-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe I/O CLI',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('aio-cli', result18, undefined, '18');

                // Querying for different Node version should return undefined
                expect(cacheManager.getCachedResult('aio-cli', '20')).toBeUndefined();
            });

            it('should cache non-perNodeVersion prerequisites without version key', () => {
                const nodeResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', nodeResult);

                // Should work without version
                expect(cacheManager.getCachedResult('node')).toBeDefined();

                // Should also work with undefined version
                expect(cacheManager.getCachedResult('node', undefined)).toBeDefined();
            });
        });

        describe('6. Cache invalidation on "Recheck" button click', () => {
            it('should clear specific prerequisite cache', () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', mockResult);
                expect(cacheManager.getCachedResult('node')).toBeDefined();

                cacheManager.invalidate('node');
                expect(cacheManager.getCachedResult('node')).toBeUndefined();
            });

            it('should clear all caches with clearAll', () => {
                const nodeResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                const npmResult: PrerequisiteStatus = {
                    id: 'npm',
                    name: 'npm',
                    description: 'Package manager',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', nodeResult);
                cacheManager.setCachedResult('npm', npmResult);

                cacheManager.clearAll();

                expect(cacheManager.getCachedResult('node')).toBeUndefined();
                expect(cacheManager.getCachedResult('npm')).toBeUndefined();
            });

            it('should invalidate all versions of perNodeVersion prerequisites', () => {
                const result18: PrerequisiteStatus = {
                    id: 'aio-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe I/O CLI',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                const result20: PrerequisiteStatus = {
                    id: 'aio-cli',
                    name: 'Adobe I/O CLI',
                    description: 'Adobe I/O CLI',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('aio-cli', result18, undefined, '18');
                cacheManager.setCachedResult('aio-cli', result20, undefined, '20');

                cacheManager.invalidate('aio-cli');

                expect(cacheManager.getCachedResult('aio-cli', '18')).toBeUndefined();
                expect(cacheManager.getCachedResult('aio-cli', '20')).toBeUndefined();
            });
        });

        describe('7. Cache invalidation on prerequisite installation', () => {
            it('should invalidate cache after installation', () => {
                const beforeInstall: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: false,
                    optional: false,
                    canInstall: true,
                };

                cacheManager.setCachedResult('node', beforeInstall);
                expect(cacheManager.getCachedResult('node')?.data.installed).toBe(false);

                // Simulate installation
                cacheManager.invalidate('node');

                expect(cacheManager.getCachedResult('node')).toBeUndefined();
            });
        });
    });

    describe('Error Condition Tests', () => {
        describe('8. Cache cleared on extension reload (no persistence)', () => {
            it('should start with empty cache', () => {
                const newCacheManager = new PrerequisitesCacheManager();

                expect(newCacheManager.getCachedResult('node')).toBeUndefined();
                expect(newCacheManager.getCachedResult('npm')).toBeUndefined();
            });

            it('should not persist cache between instances', () => {
                const manager1 = new PrerequisitesCacheManager();
                const mockResult: PrerequisiteStatus = {
                    id: 'node',
                    name: 'Node.js',
                    description: 'JavaScript runtime',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                manager1.setCachedResult('node', mockResult);
                expect(manager1.getCachedResult('node')).toBeDefined();

                // New instance should have empty cache
                const manager2 = new PrerequisitesCacheManager();
                expect(manager2.getCachedResult('node')).toBeUndefined();
            });
        });

        describe('9. Cache operations don\'t throw on empty state', () => {
            it('should not throw when getting from empty cache', () => {
                expect(() => cacheManager.getCachedResult('node')).not.toThrow();
            });

            it('should not throw when invalidating non-existent cache', () => {
                expect(() => cacheManager.invalidate('non-existent')).not.toThrow();
            });

            it('should not throw when clearing empty cache', () => {
                expect(() => cacheManager.clearAll()).not.toThrow();
            });

            it('should handle getCachedResult with undefined nodeVersion', () => {
                expect(() => cacheManager.getCachedResult('node', undefined)).not.toThrow();
            });
        });
    });

    describe('Security Tests', () => {
        describe('Cache Size Limit (DoS Prevention)', () => {
            it('should enforce maximum cache size with LRU eviction', () => {
                const mockResult: PrerequisiteStatus = {
                    id: 'test',
                    name: 'Test',
                    description: 'Test prerequisite',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

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
                const mockResult: PrerequisiteStatus = {
                    id: 'test',
                    name: 'Test',
                    description: 'Test prerequisite',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                // Fill cache to max size with different TTLs
                for (let i = 0; i < 100; i++) {
                    // Earlier entries have shorter TTL (will expire first)
                    const ttl = 1000 + (i * 100); // 1s, 1.1s, 1.2s, etc.
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
                const mockResult: PrerequisiteStatus = {
                    id: 'test',
                    name: 'Test',
                    description: 'Test prerequisite',
                    installed: true,
                    optional: false,
                    canInstall: true,
                };

                // Fill cache to max size
                for (let i = 0; i < 100; i++) {
                    cacheManager.setCachedResult(`prereq-${i}`, mockResult);
                }

                // Update existing entry (should not trigger eviction)
                const updatedResult: PrerequisiteStatus = {
                    ...mockResult,
                    installed: false,
                };
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
            const mockResult: PrerequisiteStatus = {
                id: 'node',
                name: 'Node.js',
                description: 'JavaScript runtime',
                installed: true,
                optional: false,
                canInstall: true,
            };

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

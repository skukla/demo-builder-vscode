/**
 * Unit Tests for PrerequisitesCacheManager - Basic Operations
 *
 * Tests basic cache operations including storing, retrieving, and handling empty states.
 */

import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { PrerequisiteStatus } from '@/features/prerequisites/services/types';
import {
    createMockPrerequisiteStatus,
    createNpmStatus,
} from './cacheManager.testUtils';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('PrerequisitesCacheManager - Basic Operations', () => {
    let cacheManager: PrerequisitesCacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = new PrerequisitesCacheManager();
    });

    describe('Cache Storage', () => {
        describe('1. Cache stores prerequisite check result with TTL', () => {
            it('should store prerequisite result with default TTL', () => {
                const mockResult = createMockPrerequisiteStatus();

                cacheManager.setCachedResult('node', mockResult);
                const cached = cacheManager.getCachedResult('node');

                expect(cached).toBeDefined();
                expect(cached?.data).toEqual(mockResult);
                expect(cached?.expiry).toBeGreaterThan(Date.now());
            });

            it('should store prerequisite result with custom TTL', () => {
                const mockResult = createNpmStatus();

                const customTTL = 1000; // 1 second
                cacheManager.setCachedResult('npm', mockResult, customTTL);
                const cached = cacheManager.getCachedResult('npm');

                expect(cached).toBeDefined();
                expect(cached?.expiry).toBeLessThanOrEqual(Date.now() + customTTL * 1.1); // Account for jitter
            });

            it('should store different results for different prerequisites', () => {
                const nodeResult = createMockPrerequisiteStatus();
                const npmResult = createNpmStatus(false);

                cacheManager.setCachedResult('node', nodeResult);
                cacheManager.setCachedResult('npm', npmResult);

                expect(cacheManager.getCachedResult('node')?.data).toEqual(nodeResult);
                expect(cacheManager.getCachedResult('npm')?.data).toEqual(npmResult);
            });
        });

        describe('2. Cache hit returns result instantly (<10ms)', () => {
            it('should return cached result very quickly', () => {
                const mockResult = createMockPrerequisiteStatus();

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

    describe('Per-Node-Version Caching', () => {
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
                const nodeResult = createMockPrerequisiteStatus();

                cacheManager.setCachedResult('node', nodeResult);

                // Should work without version
                expect(cacheManager.getCachedResult('node')).toBeDefined();

                // Should also work with undefined version
                expect(cacheManager.getCachedResult('node', undefined)).toBeDefined();
            });
        });
    });

    describe('Error Handling', () => {
        describe('8. Cache cleared on extension reload (no persistence)', () => {
            it('should start with empty cache', () => {
                const newCacheManager = new PrerequisitesCacheManager();

                expect(newCacheManager.getCachedResult('node')).toBeUndefined();
                expect(newCacheManager.getCachedResult('npm')).toBeUndefined();
            });

            it('should not persist cache between instances', () => {
                const manager1 = new PrerequisitesCacheManager();
                const mockResult = createMockPrerequisiteStatus();

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
});

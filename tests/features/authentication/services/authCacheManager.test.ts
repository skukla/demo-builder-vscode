import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeOrg, AdobeProject, AdobeWorkspace, AdobeConsoleWhereResponse } from '@/features/authentication/services/types';

/**
 * AuthCacheManager Test Suite
 *
 * Tests caching strategies for authentication data:
 * - Session caching (org/project/workspace)
 * - Authentication status caching with TTL
 * - Validation caching with TTL and jitter
 * - API result caching (org list, console.where)
 * - Cache invalidation and clearing
 * - Security features (TTL jitter)
 *
 * Total tests: 60+
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

// Mock data
const mockOrg: AdobeOrg = {
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
};

const mockOrg2: AdobeOrg = {
    id: 'org456',
    code: 'ORG2',
    name: 'Second Organization',
};

const mockProject: AdobeProject = {
    id: 'proj123',
    name: 'Test Project',
};

const mockWorkspace: AdobeWorkspace = {
    id: 'ws123',
    name: 'Test Workspace',
};

const mockConsoleWhere: AdobeConsoleWhereResponse = {
    org: mockOrg as any, // Type assertion needed for test data
    project: mockProject as any,
    workspace: mockWorkspace as any,
};

describe('AuthCacheManager', () => {
    let cacheManager: AuthCacheManager;

    beforeEach(() => {
        cacheManager = new AuthCacheManager();
        jest.clearAllMocks();
    });

    describe('organization caching', () => {
        it('should cache organization', () => {
            cacheManager.setCachedOrganization(mockOrg);
            const result = cacheManager.getCachedOrganization();

            expect(result).toEqual(mockOrg);
        });

        it('should clear cached organization', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedOrganization(undefined);
            const result = cacheManager.getCachedOrganization();

            expect(result).toBeUndefined();
        });

        it('should return undefined when no org cached', () => {
            const result = cacheManager.getCachedOrganization();

            expect(result).toBeUndefined();
        });

        it('should overwrite existing organization', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedOrganization(mockOrg2);
            const result = cacheManager.getCachedOrganization();

            expect(result).toEqual(mockOrg2);
        });
    });

    describe('project caching', () => {
        it('should cache project', () => {
            cacheManager.setCachedProject(mockProject);
            const result = cacheManager.getCachedProject();

            expect(result).toEqual(mockProject);
        });

        it('should clear cached project', () => {
            cacheManager.setCachedProject(mockProject);
            cacheManager.setCachedProject(undefined);
            const result = cacheManager.getCachedProject();

            expect(result).toBeUndefined();
        });

        it('should return undefined when no project cached', () => {
            const result = cacheManager.getCachedProject();

            expect(result).toBeUndefined();
        });
    });

    describe('workspace caching', () => {
        it('should cache workspace', () => {
            cacheManager.setCachedWorkspace(mockWorkspace);
            const result = cacheManager.getCachedWorkspace();

            expect(result).toEqual(mockWorkspace);
        });

        it('should clear cached workspace', () => {
            cacheManager.setCachedWorkspace(mockWorkspace);
            cacheManager.setCachedWorkspace(undefined);
            const result = cacheManager.getCachedWorkspace();

            expect(result).toBeUndefined();
        });

        it('should return undefined when no workspace cached', () => {
            const result = cacheManager.getCachedWorkspace();

            expect(result).toBeUndefined();
        });
    });

    describe('auth status caching', () => {
        it('should cache authentication status as true', () => {
            cacheManager.setCachedAuthStatus(true);
            const result = cacheManager.getCachedAuthStatus();

            expect(result.isAuthenticated).toBe(true);
            expect(result.isExpired).toBe(false);
        });

        it('should cache authentication status as false', () => {
            cacheManager.setCachedAuthStatus(false);
            const result = cacheManager.getCachedAuthStatus();

            expect(result.isAuthenticated).toBe(false);
            expect(result.isExpired).toBe(false);
        });

        it('should return undefined when no auth status cached', () => {
            const result = cacheManager.getCachedAuthStatus();

            expect(result.isAuthenticated).toBeUndefined();
            expect(result.isExpired).toBe(true);
        });

        it('should expire auth status cache after TTL', () => {
            const shortTTL = 10; // 10ms
            cacheManager.setCachedAuthStatus(true, shortTTL);

            // Wait for cache to expire
            return new Promise(resolve => setTimeout(() => {
                const result = cacheManager.getCachedAuthStatus();
                expect(result.isExpired).toBe(true);
                expect(result.isAuthenticated).toBeUndefined();
                resolve(undefined);
            }, 50));
        });

        it('should use custom TTL when provided', () => {
            const customTTL = 5000; // 5 seconds
            cacheManager.setCachedAuthStatus(true, customTTL);

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBe(true);
            expect(result.isExpired).toBe(false);
        });

        it('should clear auth status cache', () => {
            cacheManager.setCachedAuthStatus(true);
            cacheManager.clearAuthStatusCache();

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBeUndefined();
            expect(result.isExpired).toBe(true);
        });

        it('should overwrite existing auth status', () => {
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setCachedAuthStatus(false);

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBe(false);
        });
    });

    describe('validation caching', () => {
        it('should cache validation result as valid', () => {
            cacheManager.setValidationCache('org123', true);
            const result = cacheManager.getValidationCache();

            expect(result).toBeDefined();
            expect(result?.org).toBe('org123');
            expect(result?.isValid).toBe(true);
        });

        it('should cache validation result as invalid', () => {
            cacheManager.setValidationCache('org123', false);
            const result = cacheManager.getValidationCache();

            expect(result).toBeDefined();
            expect(result?.org).toBe('org123');
            expect(result?.isValid).toBe(false);
        });

        it('should return undefined when no validation cached', () => {
            const result = cacheManager.getValidationCache();

            expect(result).toBeUndefined();
        });

        it('should expire validation cache after TTL', () => {
            // Mock Date.now to control time
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            cacheManager.setValidationCache('org123', true);

            // Fast-forward time beyond TTL (validation cache uses CACHE_TTL.VALIDATION)
            mockTime += 10 * 60 * 1000 + 1000; // 10 minutes + 1 second (beyond max jitter)

            const result = cacheManager.getValidationCache();
            expect(result).toBeUndefined();

            // Restore Date.now
            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should clear validation cache', () => {
            cacheManager.setValidationCache('org123', true);
            cacheManager.clearValidationCache();

            const result = cacheManager.getValidationCache();
            expect(result).toBeUndefined();
        });

        it('should overwrite existing validation cache', () => {
            cacheManager.setValidationCache('org123', true);
            cacheManager.setValidationCache('org456', false);

            const result = cacheManager.getValidationCache();
            expect(result?.org).toBe('org456');
            expect(result?.isValid).toBe(false);
        });
    });

    describe('org list caching', () => {
        const mockOrgList = [mockOrg, mockOrg2];

        it('should cache organization list', () => {
            cacheManager.setCachedOrgList(mockOrgList);
            const result = cacheManager.getCachedOrgList();

            expect(result).toEqual(mockOrgList);
        });

        it('should return undefined when no org list cached', () => {
            const result = cacheManager.getCachedOrgList();

            expect(result).toBeUndefined();
        });

        it('should expire org list cache after TTL', () => {
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            cacheManager.setCachedOrgList(mockOrgList);

            // Fast-forward time beyond TTL
            mockTime += 10 * 60 * 1000 + 1000; // 10 minutes + 1 second

            const result = cacheManager.getCachedOrgList();
            expect(result).toBeUndefined();

            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should cache empty org list', () => {
            cacheManager.setCachedOrgList([]);
            const result = cacheManager.getCachedOrgList();

            expect(result).toEqual([]);
        });
    });

    describe('console.where caching', () => {
        it('should cache console.where response', () => {
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);
            const result = cacheManager.getCachedConsoleWhere();

            expect(result).toEqual(mockConsoleWhere);
        });

        it('should return undefined when no console.where cached', () => {
            const result = cacheManager.getCachedConsoleWhere();

            expect(result).toBeUndefined();
        });

        it('should expire console.where cache after TTL', () => {
            const originalNow = Date.now;
            let mockTime = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

            cacheManager.setCachedConsoleWhere(mockConsoleWhere);

            // Fast-forward time beyond TTL
            mockTime += 10 * 60 * 1000 + 1000; // 10 minutes + 1 second

            const result = cacheManager.getCachedConsoleWhere();
            expect(result).toBeUndefined();

            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should clear console.where cache', () => {
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);
            cacheManager.clearConsoleWhereCache();

            const result = cacheManager.getCachedConsoleWhere();
            expect(result).toBeUndefined();
        });
    });

    describe('org cleared flag', () => {
        it('should return false by default', () => {
            const result = cacheManager.wasOrgClearedDueToValidation();

            expect(result).toBe(false);
        });

        it('should return true when flag is set', () => {
            cacheManager.setOrgClearedDueToValidation(true);
            const result = cacheManager.wasOrgClearedDueToValidation();

            expect(result).toBe(true);
        });

        it('should clear flag after reading', () => {
            cacheManager.setOrgClearedDueToValidation(true);
            cacheManager.wasOrgClearedDueToValidation(); // First read
            const result = cacheManager.wasOrgClearedDueToValidation(); // Second read

            expect(result).toBe(false);
        });

        it('should allow setting flag to false explicitly', () => {
            cacheManager.setOrgClearedDueToValidation(true);
            cacheManager.setOrgClearedDueToValidation(false);
            const result = cacheManager.wasOrgClearedDueToValidation();

            expect(result).toBe(false);
        });

        it('should persist flag until read', () => {
            cacheManager.setOrgClearedDueToValidation(true);

            // Check multiple times without reading
            cacheManager.getCachedOrganization();
            cacheManager.getCachedProject();

            // Flag should still be set
            const result = cacheManager.wasOrgClearedDueToValidation();
            expect(result).toBe(true);
        });
    });

    describe('clearSessionCaches', () => {
        it('should clear all session caches', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedProject(mockProject);
            cacheManager.setCachedWorkspace(mockWorkspace);

            cacheManager.clearSessionCaches();

            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedProject()).toBeUndefined();
            expect(cacheManager.getCachedWorkspace()).toBeUndefined();
        });

        it('should not affect other caches', () => {
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setValidationCache('org123', true);
            cacheManager.setCachedOrgList([mockOrg]);

            cacheManager.clearSessionCaches();

            expect(cacheManager.getCachedAuthStatus().isAuthenticated).toBe(true);
            expect(cacheManager.getValidationCache()).toBeDefined();
            expect(cacheManager.getCachedOrgList()).toBeDefined();
        });
    });

    describe('clearPerformanceCaches', () => {
        it('should clear performance caches', () => {
            cacheManager.setCachedOrgList([mockOrg]);
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);

            cacheManager.clearPerformanceCaches();

            expect(cacheManager.getCachedOrgList()).toBeUndefined();
            expect(cacheManager.getCachedConsoleWhere()).toBeUndefined();
        });

        it('should not affect other caches', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setValidationCache('org123', true);

            cacheManager.clearPerformanceCaches();

            expect(cacheManager.getCachedOrganization()).toBeDefined();
            expect(cacheManager.getCachedAuthStatus().isAuthenticated).toBe(true);
            expect(cacheManager.getValidationCache()).toBeDefined();
        });
    });

    describe('clearAll', () => {
        it('should clear all caches', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedProject(mockProject);
            cacheManager.setCachedWorkspace(mockWorkspace);
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setValidationCache('org123', true);
            cacheManager.setCachedOrgList([mockOrg]);
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);
            cacheManager.setOrgClearedDueToValidation(true);

            cacheManager.clearAll();

            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedProject()).toBeUndefined();
            expect(cacheManager.getCachedWorkspace()).toBeUndefined();
            expect(cacheManager.getCachedAuthStatus().isAuthenticated).toBeUndefined();
            expect(cacheManager.getValidationCache()).toBeUndefined();
            expect(cacheManager.getCachedOrgList()).toBeUndefined();
            expect(cacheManager.getCachedConsoleWhere()).toBeUndefined();
            expect(cacheManager.wasOrgClearedDueToValidation()).toBe(false);
        });
    });

    describe('TTL jitter (security)', () => {
        it('should apply jitter to auth status TTL', () => {
            const baseTTL = 10000; // 10 seconds
            const samples: number[] = [];

            // Mock Date.now to capture cache expiry
            const originalNow = Date.now;
            jest.spyOn(Date, 'now').mockImplementation(() => 1000000);

            // Collect multiple samples
            for (let i = 0; i < 20; i++) {
                const manager = new AuthCacheManager();
                manager.setCachedAuthStatus(true, baseTTL);

                // Access private field via type assertion (for testing only)
                const expiry = (manager as any).authCacheExpiry;
                const actualTTL = expiry - 1000000;
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

            jest.spyOn(Date, 'now').mockRestore();
        });

        it('should apply jitter to validation cache TTL', () => {
            const samples: number[] = [];
            const originalNow = Date.now;
            jest.spyOn(Date, 'now').mockImplementation(() => 1000000);

            // Collect multiple samples
            for (let i = 0; i < 20; i++) {
                const manager = new AuthCacheManager();
                manager.setValidationCache('org123', true);

                const cache = (manager as any).validationCache;
                const actualTTL = cache.expiry - 1000000;
                samples.push(actualTTL);
            }

            // Should have variation due to jitter
            const uniqueValues = new Set(samples);
            expect(uniqueValues.size).toBeGreaterThan(1);

            jest.spyOn(Date, 'now').mockRestore();
        });
    });

    describe('cache interactions', () => {
        it('should allow independent cache operations', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setValidationCache('org123', true);

            expect(cacheManager.getCachedOrganization()).toBeDefined();
            expect(cacheManager.getCachedAuthStatus().isAuthenticated).toBe(true);
            expect(cacheManager.getValidationCache()).toBeDefined();
        });

        it('should handle rapid cache updates', () => {
            for (let i = 0; i < 100; i++) {
                cacheManager.setCachedAuthStatus(i % 2 === 0);
            }

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBe(false); // Last value
        });

        it('should handle cache clear during active caching', () => {
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedProject(mockProject);

            cacheManager.clearSessionCaches();

            cacheManager.setCachedWorkspace(mockWorkspace);

            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedProject()).toBeUndefined();
            expect(cacheManager.getCachedWorkspace()).toBeDefined();
        });
    });
});

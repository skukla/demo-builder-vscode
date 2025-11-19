import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import {
    mockLogger,
    createMockOrg,
    createMockProject,
    createMockWorkspace,
    createMockConsoleWhere,
} from './authCacheManager.testUtils';

/**
 * AuthCacheManager Invalidation Test Suite
 *
 * Tests cache invalidation and clearing operations:
 * - Auth status cache clearing
 * - Validation cache clearing
 * - Console.where cache clearing
 * - Session cache clearing
 * - Performance cache clearing
 * - Clear all caches
 * - Org cleared flag management
 *
 * Total tests: 14
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

describe('AuthCacheManager - Invalidation Operations', () => {
    let cacheManager: AuthCacheManager;

    beforeEach(() => {
        cacheManager = new AuthCacheManager();
        jest.clearAllMocks();
    });

    describe('auth status cache clearing', () => {
        it('should clear auth status cache', () => {
            cacheManager.setCachedAuthStatus(true);
            cacheManager.clearAuthStatusCache();

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBeUndefined();
            expect(result.isExpired).toBe(true);
        });
    });

    describe('validation cache clearing', () => {
        it('should clear validation cache', () => {
            cacheManager.setValidationCache('org123', true);
            cacheManager.clearValidationCache();

            const result = cacheManager.getValidationCache();
            expect(result).toBeUndefined();
        });
    });

    describe('console.where cache clearing', () => {
        it('should clear console.where cache', () => {
            const mockConsoleWhere = createMockConsoleWhere();
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);
            cacheManager.clearConsoleWhereCache();

            const result = cacheManager.getCachedConsoleWhere();
            expect(result).toBeUndefined();
        });
    });

    describe('clearSessionCaches', () => {
        it('should clear all session caches', () => {
            const mockOrg = createMockOrg();
            const mockProject = createMockProject();
            const mockWorkspace = createMockWorkspace();

            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedProject(mockProject);
            cacheManager.setCachedWorkspace(mockWorkspace);

            cacheManager.clearSessionCaches();

            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedProject()).toBeUndefined();
            expect(cacheManager.getCachedWorkspace()).toBeUndefined();
        });

        it('should not affect other caches', () => {
            const mockOrg = createMockOrg();
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
            const mockOrg = createMockOrg();
            const mockConsoleWhere = createMockConsoleWhere();

            cacheManager.setCachedOrgList([mockOrg]);
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);

            cacheManager.clearPerformanceCaches();

            expect(cacheManager.getCachedOrgList()).toBeUndefined();
            expect(cacheManager.getCachedConsoleWhere()).toBeUndefined();
        });

        it('should not affect other caches', () => {
            const mockOrg = createMockOrg();
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
            const mockOrg = createMockOrg();
            const mockProject = createMockProject();
            const mockWorkspace = createMockWorkspace();
            const mockConsoleWhere = createMockConsoleWhere();

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
});

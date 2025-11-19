import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import {
    mockLogger,
    createMockOrg,
    createMockOrg2,
    createMockProject,
    createMockWorkspace,
    createMockConsoleWhere,
} from './authCacheManager.testUtils';

/**
 * AuthCacheManager Read/Write Test Suite
 *
 * Tests basic cache read and write operations:
 * - Organization caching
 * - Project caching
 * - Workspace caching
 * - Auth status caching
 * - Validation caching
 * - Org list caching
 * - Console.where caching
 *
 * Total tests: 28
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

describe('AuthCacheManager - Read/Write Operations', () => {
    let cacheManager: AuthCacheManager;

    beforeEach(() => {
        cacheManager = new AuthCacheManager();
        jest.clearAllMocks();
    });

    describe('organization caching', () => {
        it('should cache organization', () => {
            const mockOrg = createMockOrg();
            cacheManager.setCachedOrganization(mockOrg);
            const result = cacheManager.getCachedOrganization();

            expect(result).toEqual(mockOrg);
        });

        it('should clear cached organization', () => {
            const mockOrg = createMockOrg();
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
            const mockOrg = createMockOrg();
            const mockOrg2 = createMockOrg2();
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedOrganization(mockOrg2);
            const result = cacheManager.getCachedOrganization();

            expect(result).toEqual(mockOrg2);
        });
    });

    describe('project caching', () => {
        it('should cache project', () => {
            const mockProject = createMockProject();
            cacheManager.setCachedProject(mockProject);
            const result = cacheManager.getCachedProject();

            expect(result).toEqual(mockProject);
        });

        it('should clear cached project', () => {
            const mockProject = createMockProject();
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
            const mockWorkspace = createMockWorkspace();
            cacheManager.setCachedWorkspace(mockWorkspace);
            const result = cacheManager.getCachedWorkspace();

            expect(result).toEqual(mockWorkspace);
        });

        it('should clear cached workspace', () => {
            const mockWorkspace = createMockWorkspace();
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

        it('should use custom TTL when provided', () => {
            const customTTL = 5000; // 5 seconds
            cacheManager.setCachedAuthStatus(true, customTTL);

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBe(true);
            expect(result.isExpired).toBe(false);
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

        it('should overwrite existing validation cache', () => {
            cacheManager.setValidationCache('org123', true);
            cacheManager.setValidationCache('org456', false);

            const result = cacheManager.getValidationCache();
            expect(result?.org).toBe('org456');
            expect(result?.isValid).toBe(false);
        });
    });

    describe('org list caching', () => {
        it('should cache organization list', () => {
            const mockOrg = createMockOrg();
            const mockOrg2 = createMockOrg2();
            const mockOrgList = [mockOrg, mockOrg2];

            cacheManager.setCachedOrgList(mockOrgList);
            const result = cacheManager.getCachedOrgList();

            expect(result).toEqual(mockOrgList);
        });

        it('should return undefined when no org list cached', () => {
            const result = cacheManager.getCachedOrgList();

            expect(result).toBeUndefined();
        });

        it('should cache empty org list', () => {
            cacheManager.setCachedOrgList([]);
            const result = cacheManager.getCachedOrgList();

            expect(result).toEqual([]);
        });
    });

    describe('console.where caching', () => {
        it('should cache console.where response', () => {
            const mockConsoleWhere = createMockConsoleWhere();
            cacheManager.setCachedConsoleWhere(mockConsoleWhere);
            const result = cacheManager.getCachedConsoleWhere();

            expect(result).toEqual(mockConsoleWhere);
        });

        it('should return undefined when no console.where cached', () => {
            const result = cacheManager.getCachedConsoleWhere();

            expect(result).toBeUndefined();
        });
    });
});

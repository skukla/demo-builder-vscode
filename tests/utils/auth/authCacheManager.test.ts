import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    CACHE_TTL: {
        AUTH_STATUS: 60000,
        VALIDATION: 180000,
        ORG_LIST: 60000,
        CONSOLE_WHERE: 180000
    }
}));

describe('AuthCacheManager', () => {
    let cacheManager: AuthCacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = new AuthCacheManager();
    });

    describe('Session caching (org/project/workspace)', () => {
        it('should cache and retrieve organization', () => {
            const org: AdobeOrg = { id: 'org1', name: 'Test Org', code: 'ORG1' };

            cacheManager.setCachedOrganization(org);
            const result = cacheManager.getCachedOrganization();

            expect(result).toEqual(org);
        });

        it('should cache and retrieve project', () => {
            const project: AdobeProject = { id: 'proj1', name: 'Test Project', title: 'Test Project', org_id: '1' };

            cacheManager.setCachedProject(project);
            const result = cacheManager.getCachedProject();

            expect(result).toEqual(project);
        });

        it('should cache and retrieve workspace', () => {
            const workspace: AdobeWorkspace = { id: 'ws1', name: 'Test Workspace', title: 'Test Workspace' };

            cacheManager.setCachedWorkspace(workspace);
            const result = cacheManager.getCachedWorkspace();

            expect(result).toEqual(workspace);
        });

        it('should clear session caches', () => {
            const org: AdobeOrg = { id: 'org1', name: 'Test Org', code: 'ORG1' };
            const project: AdobeProject = { id: 'proj1', name: 'Test Project', title: 'Test Project', org_id: '1' };
            const workspace: AdobeWorkspace = { id: 'ws1', name: 'Test Workspace', title: 'Test Workspace' };

            cacheManager.setCachedOrganization(org);
            cacheManager.setCachedProject(project);
            cacheManager.setCachedWorkspace(workspace);

            cacheManager.clearSessionCaches();

            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedProject()).toBeUndefined();
            expect(cacheManager.getCachedWorkspace()).toBeUndefined();
        });
    });

    describe('Authentication status caching', () => {
        it('should cache and retrieve auth status', () => {
            cacheManager.setCachedAuthStatus(true);
            const result = cacheManager.getCachedAuthStatus();

            expect(result.isAuthenticated).toBe(true);
            expect(result.isExpired).toBe(false);
        });

        it('should expire auth status after TTL', async () => {
            const shortTTL = 100; // 100ms
            cacheManager.setCachedAuthStatus(true, shortTTL);

            // Should be valid initially
            let result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBe(true);
            expect(result.isExpired).toBe(false);

            // Wait for expiry using real setTimeout
            await new Promise(resolve => setTimeout(resolve, 150));

            result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBeUndefined();
            expect(result.isExpired).toBe(true);
        });

        it('should clear auth status cache', () => {
            cacheManager.setCachedAuthStatus(true);
            cacheManager.clearAuthStatusCache();

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBeUndefined();
        });

        it('should cache failed auth status', () => {
            cacheManager.setCachedAuthStatus(false);
            const result = cacheManager.getCachedAuthStatus();

            expect(result.isAuthenticated).toBe(false);
            expect(result.isExpired).toBe(false);
        });
    });

    describe('Validation caching', () => {
        it('should cache and retrieve validation result', () => {
            cacheManager.setValidationCache('org1', true);
            const result = cacheManager.getValidationCache();

            expect(result).toBeDefined();
            expect(result?.org).toBe('org1');
            expect(result?.isValid).toBe(true);
        });

        it('should expire validation cache after TTL', () => {
            // Use a shorter TTL that is already expired
            const pastTime = Date.now() - 1000;
            jest.spyOn(Date, 'now').mockReturnValueOnce(pastTime);

            cacheManager.setValidationCache('org1', true);

            // Restore Date.now and check if expired
            jest.spyOn(Date, 'now').mockReturnValue(pastTime + 200000);

            const result = cacheManager.getValidationCache();
            expect(result).toBeUndefined();

            jest.restoreAllMocks();
        });

        it('should clear validation cache', () => {
            cacheManager.setValidationCache('org1', true);
            cacheManager.clearValidationCache();

            const result = cacheManager.getValidationCache();
            expect(result).toBeUndefined();
        });

        it('should cache failed validation', () => {
            cacheManager.setValidationCache('org1', false);
            const result = cacheManager.getValidationCache();

            expect(result?.isValid).toBe(false);
        });
    });

    describe('Organization list caching', () => {
        it('should cache and retrieve organization list', () => {
            const orgs: AdobeOrg[] = [
                { id: 'org1', name: 'Org 1', code: 'ORG1' },
                { id: 'org2', name: 'Org 2', code: 'ORG2' }
            ];

            cacheManager.setCachedOrgList(orgs);
            const result = cacheManager.getCachedOrgList();

            expect(result).toEqual(orgs);
        });

        it('should expire org list after TTL', () => {
            const orgs: AdobeOrg[] = [
                { id: 'org1', name: 'Org 1', code: 'ORG1' }
            ];

            const pastTime = Date.now() - 1000;
            jest.spyOn(Date, 'now').mockReturnValueOnce(pastTime);

            cacheManager.setCachedOrgList(orgs);

            // Restore time and check if expired (70000ms past TTL)
            jest.spyOn(Date, 'now').mockReturnValue(pastTime + 70000);

            const result = cacheManager.getCachedOrgList();
            expect(result).toBeUndefined();

            jest.restoreAllMocks();
        });
    });

    describe('Console.where caching', () => {
        it('should cache and retrieve console.where result', () => {
            const context = { org: 'org1', project: 'proj1', workspace: 'ws1' };

            cacheManager.setCachedConsoleWhere(context);
            const result = cacheManager.getCachedConsoleWhere();

            expect(result).toEqual(context);
        });

        it('should expire console.where cache after TTL', () => {
            const context = { org: 'org1' };

            const pastTime = Date.now() - 1000;
            jest.spyOn(Date, 'now').mockReturnValueOnce(pastTime);

            cacheManager.setCachedConsoleWhere(context);

            // Restore time and check if expired (200000ms past TTL)
            jest.spyOn(Date, 'now').mockReturnValue(pastTime + 200000);

            const result = cacheManager.getCachedConsoleWhere();
            expect(result).toBeUndefined();

            jest.restoreAllMocks();
        });

        it('should clear console.where cache', () => {
            const context = { org: 'org1' };

            cacheManager.setCachedConsoleWhere(context);
            cacheManager.clearConsoleWhereCache();

            const result = cacheManager.getCachedConsoleWhere();
            expect(result).toBeUndefined();
        });
    });

    describe('Organization validation flag', () => {
        it('should set and read org cleared flag', () => {
            cacheManager.setOrgClearedDueToValidation(true);
            const result = cacheManager.wasOrgClearedDueToValidation();

            expect(result).toBe(true);
        });

        it('should reset flag after reading', () => {
            cacheManager.setOrgClearedDueToValidation(true);

            // First read
            const firstResult = cacheManager.wasOrgClearedDueToValidation();
            expect(firstResult).toBe(true);

            // Second read should be false (flag was reset)
            const secondResult = cacheManager.wasOrgClearedDueToValidation();
            expect(secondResult).toBe(false);
        });

        it('should handle false flag', () => {
            cacheManager.setOrgClearedDueToValidation(false);
            const result = cacheManager.wasOrgClearedDueToValidation();

            expect(result).toBe(false);
        });
    });

    describe('Clear all caches', () => {
        it('should clear all cache types', () => {
            // Set all cache types
            const org: AdobeOrg = { id: 'org1', name: 'Test Org', code: 'ORG1' };
            cacheManager.setCachedOrganization(org);
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setValidationCache('org1', true);
            cacheManager.setCachedOrgList([org]);
            cacheManager.setCachedConsoleWhere({ org: 'org1' });
            cacheManager.setOrgClearedDueToValidation(true);

            // Clear all
            cacheManager.clearAll();

            // Verify all cleared
            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedAuthStatus().isAuthenticated).toBeUndefined();
            expect(cacheManager.getValidationCache()).toBeUndefined();
            expect(cacheManager.getCachedOrgList()).toBeUndefined();
            expect(cacheManager.getCachedConsoleWhere()).toBeUndefined();
            expect(cacheManager.wasOrgClearedDueToValidation()).toBe(false);
        });
    });

    describe('Performance caches', () => {
        it('should clear performance caches only', () => {
            const org: AdobeOrg = { id: 'org1', name: 'Test Org', code: 'ORG1' };

            // Set both session and performance caches
            cacheManager.setCachedOrganization(org);
            cacheManager.setCachedOrgList([org]);
            cacheManager.setCachedConsoleWhere({ org: 'org1' });

            // Clear only performance caches
            cacheManager.clearPerformanceCaches();

            // Session cache should remain
            expect(cacheManager.getCachedOrganization()).toEqual(org);

            // Performance caches should be cleared
            expect(cacheManager.getCachedOrgList()).toBeUndefined();
            expect(cacheManager.getCachedConsoleWhere()).toBeUndefined();
        });
    });
});

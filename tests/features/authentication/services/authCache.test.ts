/**
 * AuthCache - Simplified Tests
 *
 * Tests for the new simplified auth cache that replaces AuthCacheManager.
 * The new cache has:
 * - Simpler API focused on org/project/workspace caching
 * - TTL-based expiration with jitter
 * - Clear invalidation semantics
 *
 * Note: Most AuthCacheManager functionality is preserved,
 * this is a refactoring for API simplicity, not behavior change.
 */

import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';

// Mock getCacheTTLWithJitter to be deterministic
jest.mock('@/core/cache/cacheUtils', () => ({
    getCacheTTLWithJitter: jest.fn((ttl: number, _jitter?: number) => ttl),
}));

import { AuthCache } from '@/features/authentication/services/authCache';

describe('AuthCache - Simplified', () => {
    let cache: AuthCache;

    const mockOrg: AdobeOrg = {
        id: 'org1',
        code: 'ORG1@AdobeOrg',
        name: 'Test Organization',
    };

    const mockOrg2: AdobeOrg = {
        id: 'org2',
        code: 'ORG2@AdobeOrg',
        name: 'Second Organization',
    };

    const mockProject: AdobeProject = {
        id: 'proj1',
        name: 'project-1',
        title: 'Test Project',
        org_id: 'org1',
    };

    const mockWorkspace: AdobeWorkspace = {
        id: 'ws1',
        name: 'Production',
        title: 'Production Workspace',
    };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));

        cache = new AuthCache({ ttlMs: 300000, jitterPercent: 0 });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('organizations cache', () => {
        it('should cache organizations list', () => {
            const orgs = [mockOrg, mockOrg2];
            cache.setOrganizations(orgs);

            expect(cache.getOrganizations()).toEqual(orgs);
        });

        it('should return undefined when no orgs cached', () => {
            expect(cache.getOrganizations()).toBeUndefined();
        });

        it('should expire organizations cache after TTL', () => {
            cache.setOrganizations([mockOrg]);

            // Advance time past TTL
            jest.advanceTimersByTime(300001);

            expect(cache.getOrganizations()).toBeUndefined();
        });
    });

    describe('current organization cache', () => {
        it('should cache current organization', () => {
            cache.setCurrentOrganization(mockOrg);

            expect(cache.getCurrentOrganization()).toEqual(mockOrg);
        });

        it('should clear current organization', () => {
            cache.setCurrentOrganization(mockOrg);
            cache.setCurrentOrganization(undefined);

            expect(cache.getCurrentOrganization()).toBeUndefined();
        });
    });

    describe('projects cache by org', () => {
        it('should cache projects by org ID', () => {
            const projects = [mockProject];
            cache.setProjects('org1', projects);

            expect(cache.getProjects('org1')).toEqual(projects);
            expect(cache.getProjects('org2')).toBeUndefined();
        });

        it('should expire projects cache after TTL', () => {
            cache.setProjects('org1', [mockProject]);

            // Advance time past TTL
            jest.advanceTimersByTime(300001);

            expect(cache.getProjects('org1')).toBeUndefined();
        });
    });

    describe('current project cache', () => {
        it('should cache current project', () => {
            cache.setCurrentProject(mockProject);

            expect(cache.getCurrentProject()).toEqual(mockProject);
        });

        it('should clear current project', () => {
            cache.setCurrentProject(mockProject);
            cache.setCurrentProject(undefined);

            expect(cache.getCurrentProject()).toBeUndefined();
        });
    });

    describe('workspaces cache by org:project', () => {
        it('should cache workspaces by org and project ID', () => {
            const workspaces = [mockWorkspace];
            cache.setWorkspaces('org1', 'proj1', workspaces);

            expect(cache.getWorkspaces('org1', 'proj1')).toEqual(workspaces);
            expect(cache.getWorkspaces('org1', 'proj2')).toBeUndefined();
            expect(cache.getWorkspaces('org2', 'proj1')).toBeUndefined();
        });

        it('should expire workspaces cache after TTL', () => {
            cache.setWorkspaces('org1', 'proj1', [mockWorkspace]);

            // Advance time past TTL
            jest.advanceTimersByTime(300001);

            expect(cache.getWorkspaces('org1', 'proj1')).toBeUndefined();
        });
    });

    describe('current workspace cache', () => {
        it('should cache current workspace', () => {
            cache.setCurrentWorkspace(mockWorkspace);

            expect(cache.getCurrentWorkspace()).toEqual(mockWorkspace);
        });

        it('should clear current workspace', () => {
            cache.setCurrentWorkspace(mockWorkspace);
            cache.setCurrentWorkspace(undefined);

            expect(cache.getCurrentWorkspace()).toBeUndefined();
        });
    });

    describe('invalidation', () => {
        it('should invalidate all caches for org', () => {
            cache.setOrganizations([mockOrg, mockOrg2]);
            cache.setProjects('org1', [mockProject]);
            cache.setWorkspaces('org1', 'proj1', [mockWorkspace]);

            cache.invalidateForOrg('org1');

            // Projects and workspaces for org1 should be cleared
            expect(cache.getProjects('org1')).toBeUndefined();
            expect(cache.getWorkspaces('org1', 'proj1')).toBeUndefined();
            // Organizations list should NOT be cleared (user might switch orgs)
            expect(cache.getOrganizations()).toBeDefined();
        });

        it('should invalidate workspaces for project', () => {
            cache.setProjects('org1', [mockProject]);
            cache.setWorkspaces('org1', 'proj1', [mockWorkspace]);

            cache.invalidateForProject('org1', 'proj1');

            // Workspaces should be cleared
            expect(cache.getWorkspaces('org1', 'proj1')).toBeUndefined();
            // Projects should NOT be cleared
            expect(cache.getProjects('org1')).toBeDefined();
        });

        it('should clear all caches', () => {
            cache.setOrganizations([mockOrg]);
            cache.setCurrentOrganization(mockOrg);
            cache.setProjects('org1', [mockProject]);
            cache.setCurrentProject(mockProject);
            cache.setWorkspaces('org1', 'proj1', [mockWorkspace]);
            cache.setCurrentWorkspace(mockWorkspace);

            cache.clear();

            expect(cache.getOrganizations()).toBeUndefined();
            expect(cache.getCurrentOrganization()).toBeUndefined();
            expect(cache.getProjects('org1')).toBeUndefined();
            expect(cache.getCurrentProject()).toBeUndefined();
            expect(cache.getWorkspaces('org1', 'proj1')).toBeUndefined();
            expect(cache.getCurrentWorkspace()).toBeUndefined();
        });
    });

    describe('auth status cache', () => {
        it('should cache authentication status', () => {
            cache.setAuthStatus(true);

            const status = cache.getAuthStatus();
            expect(status.isAuthenticated).toBe(true);
            expect(status.isExpired).toBe(false);
        });

        it('should expire auth status cache', () => {
            cache.setAuthStatus(true, 5000); // 5 second TTL

            // Advance time past TTL
            jest.advanceTimersByTime(5001);

            const status = cache.getAuthStatus();
            expect(status.isAuthenticated).toBeUndefined();
            expect(status.isExpired).toBe(true);
        });

        it('should clear auth status cache', () => {
            cache.setAuthStatus(true);
            cache.clearAuthStatus();

            const status = cache.getAuthStatus();
            expect(status.isAuthenticated).toBeUndefined();
        });
    });

    describe('console where cache', () => {
        it('should cache console where response', () => {
            const context = {
                org: mockOrg,
                project: mockProject,
                workspace: mockWorkspace,
            };
            cache.setConsoleWhere(context as any);

            expect(cache.getConsoleWhere()).toEqual(context);
        });

        it('should expire console where cache', () => {
            cache.setConsoleWhere({ org: mockOrg } as any);

            // Advance time past TTL
            jest.advanceTimersByTime(300001);

            expect(cache.getConsoleWhere()).toBeUndefined();
        });

        it('should clear console where cache', () => {
            cache.setConsoleWhere({ org: mockOrg } as any);
            cache.clearConsoleWhere();

            expect(cache.getConsoleWhere()).toBeUndefined();
        });
    });

    describe('token inspection cache', () => {
        it('should cache token inspection result', () => {
            const inspection = { valid: true, expiresIn: 60, token: 'abc123' };
            cache.setTokenInspection(inspection);

            expect(cache.getTokenInspection()).toEqual(inspection);
        });

        it('should expire token inspection cache', () => {
            cache.setTokenInspection({ valid: true, expiresIn: 60 });

            // Advance time past TTL
            jest.advanceTimersByTime(300001);

            expect(cache.getTokenInspection()).toBeUndefined();
        });

        it('should clear token inspection cache', () => {
            cache.setTokenInspection({ valid: true, expiresIn: 60 });
            cache.clearTokenInspection();

            expect(cache.getTokenInspection()).toBeUndefined();
        });
    });

    describe('validation cache', () => {
        it('should cache validation result', () => {
            cache.setValidation('ORG1@AdobeOrg', true);

            const validation = cache.getValidation();
            expect(validation).toBeDefined();
            expect(validation?.org).toBe('ORG1@AdobeOrg');
            expect(validation?.isValid).toBe(true);
        });

        it('should expire validation cache', () => {
            cache.setValidation('ORG1@AdobeOrg', true);

            // Advance time past TTL
            jest.advanceTimersByTime(300001);

            expect(cache.getValidation()).toBeUndefined();
        });

        it('should clear validation cache', () => {
            cache.setValidation('ORG1@AdobeOrg', true);
            cache.clearValidation();

            expect(cache.getValidation()).toBeUndefined();
        });
    });

    describe('org rejected flag', () => {
        it('should track org cleared due to validation', () => {
            expect(cache.wasOrgClearedDueToValidation()).toBe(false);

            cache.setOrgClearedDueToValidation(true);

            // First read returns true and clears flag
            expect(cache.wasOrgClearedDueToValidation()).toBe(true);

            // Second read returns false (one-time flag)
            expect(cache.wasOrgClearedDueToValidation()).toBe(false);
        });
    });
});

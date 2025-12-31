/**
 * OrganizationService - Simplified Tests
 *
 * Tests for the new simplified organization service that replaces:
 * - adobeEntityFetcher (getOrganizations)
 * - adobeEntitySelector (selectOrganization, autoSelectOrganizationIfNeeded)
 * - adobeContextResolver (getCurrentOrganization)
 * - organizationOperations (all org operations)
 *
 * Target: Single service with direct CLI calls and caching
 */

import type { CommandExecutor } from '@/core/shell';
import type { AdobeOrg } from '@/features/authentication/services/types';

// Mock dependencies before importing the service
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    })),
    StepLogger: {
        create: jest.fn().mockResolvedValue({
            logTemplate: jest.fn(),
        }),
    },
}));

// Import after mocks
import { OrganizationService } from '@/features/authentication/services/organizationService';
import { AuthCache } from '@/features/authentication/services/authCache';

describe('OrganizationService - Simplified', () => {
    let orgService: OrganizationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let authCache: AuthCache;

    const mockOrgs: AdobeOrg[] = [
        { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
        { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Organization 2' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        authCache = new AuthCache({ ttlMs: 300000, jitterPercent: 0 });

        orgService = new OrganizationService(mockCommandExecutor, authCache);
    });

    describe('getOrganizations', () => {
        it('should fetch organizations directly via CLI', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockOrgs),
                stderr: '',
                code: 0,
            });

            const orgs = await orgService.getOrganizations();

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.objectContaining({ encoding: 'utf8' }),
            );
            expect(orgs).toHaveLength(2);
            expect(orgs[0].id).toBe('org1');
            expect(orgs[0].name).toBe('Organization 1');
        });

        it('should use cache when available', async () => {
            // First call - populates cache
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockOrgs),
                stderr: '',
                code: 0,
            });

            await orgService.getOrganizations();

            // Second call - should use cache
            const orgs = await orgService.getOrganizations();

            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(1);
            expect(orgs).toHaveLength(2);
        });

        it('should return empty array when CLI returns empty list', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '[]',
                stderr: '',
                code: 0,
            });

            const orgs = await orgService.getOrganizations();

            expect(orgs).toHaveLength(0);
        });

        it('should throw error when CLI command fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Authentication required',
                code: 1,
            });

            await expect(orgService.getOrganizations()).rejects.toThrow(
                'Failed to get organizations: Authentication required',
            );
        });

        it('should handle invalid JSON response', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'not valid json',
                stderr: '',
                code: 0,
            });

            await expect(orgService.getOrganizations()).rejects.toThrow(
                'Invalid organizations response format',
            );
        });
    });

    describe('selectOrganization', () => {
        it('should select organization via CLI', async () => {
            // Pre-populate org cache so getOrganizations() doesn't need to fetch
            authCache.setOrganizations(mockOrgs);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Selected organization: org1',
                stderr: '',
                code: 0,
            });

            const result = await orgService.selectOrganization('org1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org select org1',
                expect.objectContaining({ encoding: 'utf8' }),
            );
        });

        it('should invalidate downstream caches on org change', async () => {
            // Setup: populate caches
            authCache.setOrganizations(mockOrgs);
            authCache.setProjects('org1', [{ id: 'proj1', name: 'Project 1' }]);
            authCache.setWorkspaces('org1', 'proj1', [{ id: 'ws1', name: 'Workspace 1' }]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Selected organization: org1',
                stderr: '',
                code: 0,
            });

            await orgService.selectOrganization('org1');

            // Verify caches were invalidated
            expect(authCache.getProjects('org1')).toBeUndefined();
            expect(authCache.getWorkspaces('org1', 'proj1')).toBeUndefined();
        });

        it('should return false when CLI command fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Organization not found',
                code: 1,
            });

            const result = await orgService.selectOrganization('invalid-org');

            expect(result).toBe(false);
        });

        it('should validate orgId to prevent command injection', async () => {
            // Org IDs with malicious characters should be rejected
            await expect(orgService.selectOrganization('org1; rm -rf /')).rejects.toThrow();
        });
    });

    describe('getCurrentOrganization', () => {
        it('should return undefined when no org selected', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
            });

            const org = await orgService.getCurrentOrganization();

            expect(org).toBeUndefined();
        });

        it('should return org from console where context', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                }),
                stderr: '',
                code: 0,
            });

            const org = await orgService.getCurrentOrganization();

            expect(org).toBeDefined();
            expect(org?.id).toBe('org1');
            expect(org?.name).toBe('Organization 1');
        });

        it('should use cached org when available', async () => {
            // Pre-populate cache
            const cachedOrg = { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Cached Org' };
            authCache.setCurrentOrganization(cachedOrg);

            const org = await orgService.getCurrentOrganization();

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(org).toEqual(cachedOrg);
        });
    });

    describe('validateOrganization', () => {
        it('should validate org exists and is accessible', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockOrgs),
                stderr: '',
                code: 0,
            });

            const result = await orgService.validateOrganization('org1');

            expect(result.valid).toBe(true);
            expect(result.organization).toBeDefined();
            expect(result.organization?.id).toBe('org1');
        });

        it('should return invalid when org not found', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockOrgs),
                stderr: '',
                code: 0,
            });

            const result = await orgService.validateOrganization('non-existent-org');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('autoSelectOrganizationIfNeeded', () => {
        it('should auto-select when only one org available', async () => {
            const singleOrg = [mockOrgs[0]];

            // Mock getOrganizations
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // console where - no current org
                    stdout: JSON.stringify({}),
                    stderr: '',
                    code: 0,
                })
                .mockResolvedValueOnce({
                    // org list
                    stdout: JSON.stringify(singleOrg),
                    stderr: '',
                    code: 0,
                })
                .mockResolvedValueOnce({
                    // org select
                    stdout: 'Selected organization: org1',
                    stderr: '',
                    code: 0,
                });

            const org = await orgService.autoSelectOrganizationIfNeeded();

            expect(org).toBeDefined();
            expect(org?.id).toBe('org1');
        });

        it('should return undefined when multiple orgs available', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // console where - no current org
                    stdout: JSON.stringify({}),
                    stderr: '',
                    code: 0,
                })
                .mockResolvedValueOnce({
                    // org list - multiple orgs
                    stdout: JSON.stringify(mockOrgs),
                    stderr: '',
                    code: 0,
                });

            const org = await orgService.autoSelectOrganizationIfNeeded();

            expect(org).toBeUndefined();
        });

        it('should return current org if already selected', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: mockOrgs[0],
                }),
                stderr: '',
                code: 0,
            });

            const org = await orgService.autoSelectOrganizationIfNeeded();

            expect(org).toBeDefined();
            expect(org?.id).toBe('org1');
        });
    });
});

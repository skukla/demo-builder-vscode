/**
 * Unit Tests: CleanupService — Configuration Service deletion and failure shapes
 *
 * The Configuration Service step is the one cleanup operation whose behaviour
 * depends on whether a collaborator was injected at all, so it needs both
 * constructions of the subject. Split from `cleanupService.test.ts` for size;
 * both suites share `cleanupService.testUtils.ts`.
 */

import {
    setupCleanupHarness,
    type CleanupHarness,
    type EdsMetadata,
} from './cleanupService.testUtils';

describe('CleanupService', () => {
    let harness: CleanupHarness;
    let cleanupService: CleanupHarness['cleanupService'];
    let mockGitHubRepoOps: CleanupHarness['githubRepoOps'];
    let mockDaLiveOrgOps: CleanupHarness['daLiveOrgOps'];
    let mockToolManager: CleanupHarness['toolManager'];
    let mockConfigurationService: CleanupHarness['configurationService'];
    let withConfigService: CleanupHarness['withConfigService'];

    // Track operation order for verifying cleanup sequence
    let operationOrder: string[];

    beforeEach(() => {
        jest.clearAllMocks();
        harness = setupCleanupHarness();
        cleanupService = harness.cleanupService;
        mockGitHubRepoOps = harness.githubRepoOps;
        mockDaLiveOrgOps = harness.daLiveOrgOps;
        mockToolManager = harness.toolManager;
        mockConfigurationService = harness.configurationService;
        withConfigService = harness.withConfigService;
        operationOrder = harness.operationOrder;
    });

    // ==========================================================
    // Configuration Service Deletion
    // ==========================================================
    describe('Configuration Service Deletion', () => {
        const repoMetadata: EdsMetadata = { githubRepo: 'testuser/my-site' };

        it('should delete the site config for the repo owner and name', async () => {
            // Given: A ConfigurationService and a well-formed repo name
            const service = withConfigService();

            // When: Deleting the config service entry
            const result = await service.cleanupEdsResources(repoMetadata, {
                deleteConfigService: true,
            });

            // Then: The owner and repo are split apart and passed as separate arguments
            expect(mockConfigurationService.deleteSiteConfig).toHaveBeenCalledWith(
                'testuser',
                'my-site',
            );
            expect(result.configService).toEqual({ success: true, skipped: false });
        });

        it('should not touch the config service when deleteConfigService is not requested', async () => {
            // Given: A ConfigurationService is available but the option is off
            const service = withConfigService();

            // When: Running a GitHub-only cleanup
            const result = await service.cleanupEdsResources(repoMetadata, { deleteGitHub: true });

            // Then: Nothing is deleted from the Configuration Service
            expect(mockConfigurationService.deleteSiteConfig).not.toHaveBeenCalled();
            expect(result.configService).toEqual({ success: false, skipped: true });
        });

        it('should skip when the repo is unknown even though the option is on', async () => {
            // Given: No GitHub repo, so there is no org/site to address
            const service = withConfigService();

            // When: Requesting config service deletion
            const result = await service.cleanupEdsResources({}, { deleteConfigService: true });

            // Then: Skipped without calling the service
            expect(mockConfigurationService.deleteSiteConfig).not.toHaveBeenCalled();
            expect(result.configService).toEqual({ success: false, skipped: true });
        });

        it('should skip when no ConfigurationService was injected', async () => {
            // Given: The service was constructed without a ConfigurationService

            // When: Requesting config service deletion
            const result = await cleanupService.cleanupEdsResources(repoMetadata, {
                deleteConfigService: true,
            });

            // Then: Skipped rather than attempted-and-failed
            expect(result.configService).toEqual({ success: false, skipped: true });
        });

        it('should skip a repo name that carries no owner/repo pair', async () => {
            // Given: A repo name with no slash
            const service = withConfigService();

            // When: Requesting config service deletion
            const result = await service.cleanupEdsResources(
                { githubRepo: 'no-slash' },
                { deleteConfigService: true },
            );

            // Then: The service is never called with an undefined site
            expect(mockConfigurationService.deleteSiteConfig).not.toHaveBeenCalled();
            expect(result.configService).toEqual({ success: false, skipped: true });
        });

        it('should skip a repo name with an empty owner', async () => {
            // Given: A repo name whose owner segment is empty
            const service = withConfigService();

            // When: Requesting config service deletion
            const result = await service.cleanupEdsResources(
                { githubRepo: '/my-site' },
                { deleteConfigService: true },
            );

            // Then: The service is never called with an empty org
            expect(mockConfigurationService.deleteSiteConfig).not.toHaveBeenCalled();
            expect(result.configService).toEqual({ success: false, skipped: true });
        });

        it('should report the service error verbatim when deletion fails', async () => {
            // Given: The Configuration Service refuses the delete
            mockConfigurationService.deleteSiteConfig = jest
                .fn()
                .mockResolvedValue({ success: false, error: '403 Forbidden' });
            const service = withConfigService();

            // When: Requesting config service deletion
            const result = await service.cleanupEdsResources(repoMetadata, {
                deleteConfigService: true,
            });

            // Then: The caller sees the service's own message
            expect(result.configService).toEqual({
                success: false,
                skipped: false,
                error: '403 Forbidden',
            });
        });

        it('should fall back to a generic message when the failure carries no error', async () => {
            // Given: A bare failure result
            mockConfigurationService.deleteSiteConfig = jest
                .fn()
                .mockResolvedValue({ success: false });
            const service = withConfigService();

            // When: Requesting config service deletion
            const result = await service.cleanupEdsResources(repoMetadata, {
                deleteConfigService: true,
            });

            // Then: A generic message stands in
            expect(result.configService).toEqual({
                success: false,
                skipped: false,
                error: 'Configuration Service deletion failed',
            });
        });

        it('should report a thrown error without marking the operation skipped', async () => {
            // Given: The Configuration Service throws
            mockConfigurationService.deleteSiteConfig = jest
                .fn()
                .mockRejectedValue(new Error('network down'));
            const service = withConfigService();

            // When: Requesting config service deletion
            const result = await service.cleanupEdsResources(repoMetadata, {
                deleteConfigService: true,
            });

            // Then: Attempted and failed, not skipped
            expect(result.configService).toEqual({
                success: false,
                skipped: false,
                error: 'network down',
            });
        });

        it('should run after backend cleanup and before DA.live and GitHub', async () => {
            // Given: Every resource present and every option enabled
            const service = withConfigService();

            // When: Running the full cleanup
            await service.cleanupEdsResources(
                {
                    githubRepo: 'testuser/my-site',
                    daLiveOrg: 'testorg',
                    daLiveSite: 'my-site',
                    backendType: 'aco',
                },
                {
                    cleanupBackendData: true,
                    deleteConfigService: true,
                    deleteDaLive: true,
                    deleteGitHub: true,
                },
            );

            // Then: Config Service deletion sits between backend and DA.live
            expect(operationOrder).toEqual(['backend', 'configService', 'dalive', 'github']);
        });
    });

    // ==========================================================
    // Failure Result Shapes
    // ==========================================================
    describe('Failure Result Shapes', () => {
        it('should report a failed DA.live deletion result without skipping', async () => {
            // Given: DA.live reports failure rather than throwing
            mockDaLiveOrgOps.deleteSite = jest.fn().mockResolvedValue({ success: false });

            // When: Deleting DA.live content
            const result = await cleanupService.cleanupEdsResources(
                { daLiveOrg: 'myorg', daLiveSite: 'mysite' },
                { deleteDaLive: true },
            );

            // Then: Attempted and failed with the DA.live message
            expect(result.daLive).toEqual({
                success: false,
                skipped: false,
                error: 'DA.live deletion failed',
            });
        });

        it('should fall back to a generic message when backend cleanup reports no error', async () => {
            // Given: The backend tool fails without an error string
            mockToolManager.executeCommerceCleanup = jest.fn().mockResolvedValue({
                success: false,
                stdout: '',
                stderr: '',
                duration: 10,
            });

            // When: Cleaning up backend data
            const result = await cleanupService.cleanupEdsResources(
                { backendType: 'commerce' },
                { cleanupBackendData: true },
            );

            // Then: A generic message stands in
            expect(result.backendData).toEqual({
                success: false,
                skipped: false,
                error: 'Backend cleanup failed',
            });
        });

        it('should reject a repository name with no owner/repo pair before calling GitHub', async () => {
            // Given: A repo name with no slash
            // When: Deleting the GitHub repository
            const result = await cleanupService.cleanupEdsResources(
                { githubRepo: 'no-slash' },
                { deleteGitHub: true },
            );

            // Then: Neither GitHub call is made and the name is reported back
            expect(mockGitHubRepoOps.deleteRepository).not.toHaveBeenCalled();
            expect(mockGitHubRepoOps.archiveRepository).not.toHaveBeenCalled();
            expect(result.github).toEqual({
                success: false,
                skipped: false,
                error: 'Invalid repository name: no-slash',
            });
        });

        it('should reject a repository name with an empty owner before calling GitHub', async () => {
            // Given: A repo name whose owner segment is empty
            // When: Archiving the GitHub repository
            const result = await cleanupService.cleanupEdsResources(
                { githubRepo: '/my-site' },
                { deleteGitHub: true, archiveInsteadOfDelete: true },
            );

            // Then: Neither GitHub call is made and the name is reported back
            expect(mockGitHubRepoOps.deleteRepository).not.toHaveBeenCalled();
            expect(mockGitHubRepoOps.archiveRepository).not.toHaveBeenCalled();
            expect(result.github).toEqual({
                success: false,
                skipped: false,
                error: 'Invalid repository name: /my-site',
            });
        });
    });
});

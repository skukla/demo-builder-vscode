/**
 * Unit Tests: CleanupService
 *
 * Tests for EDS project cleanup orchestration including backend data cleanup,
 * Helix unpublishing, DA.live deletion, and GitHub repository deletion/archiving.
 *
 * Coverage: 22 tests across 5 categories
 * - Cleanup Flow (10 tests)
 * - GitHub Operations (4 tests)
 * - DA.live Operations (3 tests)
 * - Backend Cleanup (3 tests)
 * - Error Handling (2 tests)
 *
 * CRITICAL: Cleanup order MUST be Backend -> Helix -> DA.live -> GitHub
 */

// Mock vscode module
jest.mock('vscode');

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
    Logger: jest.fn(() => mockLogger),
}));

// Mock timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        GITHUB_API: 30000,
        DA_LIVE_API: 30000,
        HELIX_API: 30000,
        DATA_INGESTION: 600000,
    },
}));

// Import types
import type { GitHubService } from '@/features/eds/services/githubService';
import type { DaLiveService } from '@/features/eds/services/daLiveService';
import type { ToolManager } from '@/features/eds/services/toolManager';
import type {
    EdsMetadata,
    EdsCleanupOptions,
    EdsCleanupResult,
} from '@/features/eds/services/types';

// Type for the services we'll import dynamically
type CleanupServiceType = import('@/features/eds/services/cleanupService').CleanupService;
type HelixServiceType = import('@/features/eds/services/helixService').HelixService;

describe('CleanupService', () => {
    let cleanupService: CleanupServiceType;
    let mockGitHubService: jest.Mocked<Partial<GitHubService>>;
    let mockDaLiveService: jest.Mocked<Partial<DaLiveService>>;
    let mockHelixService: jest.Mocked<Partial<HelixServiceType>>;
    let mockToolManager: jest.Mocked<Partial<ToolManager>>;

    // Track operation order for verifying cleanup sequence
    let operationOrder: string[];

    beforeEach(async () => {
        jest.clearAllMocks();
        operationOrder = [];

        // Mock GitHubService
        mockGitHubService = {
            deleteRepository: jest.fn().mockImplementation(async () => {
                operationOrder.push('github');
                return { success: true };
            }),
            archiveRepository: jest.fn().mockImplementation(async () => {
                operationOrder.push('github');
                return { success: true };
            }),
        };

        // Mock DaLiveService
        mockDaLiveService = {
            deleteSite: jest.fn().mockImplementation(async () => {
                operationOrder.push('dalive');
                return { success: true };
            }),
        };

        // Mock HelixService
        mockHelixService = {
            unpublishSite: jest.fn().mockImplementation(async () => {
                operationOrder.push('helix');
                return { liveUnpublished: true, previewDeleted: true };
            }),
        };

        // Mock ToolManager
        mockToolManager = {
            executeAcoCleanup: jest.fn().mockImplementation(async () => {
                operationOrder.push('backend');
                return { success: true, stdout: 'Cleanup complete', stderr: '', duration: 1000 };
            }),
            executeCommerceCleanup: jest.fn().mockImplementation(async () => {
                operationOrder.push('backend');
                return { success: true, stdout: 'Cleanup complete', stderr: '', duration: 1000 };
            }),
        };

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/cleanupService');
        cleanupService = new module.CleanupService(
            mockGitHubService as unknown as GitHubService,
            mockDaLiveService as unknown as DaLiveService,
            mockHelixService as unknown as HelixServiceType,
            mockToolManager as unknown as ToolManager,
        );
    });

    // ==========================================================
    // Cleanup Flow Tests (10 tests)
    // ==========================================================
    describe('Cleanup Flow', () => {
        it('should skip cleanup for non-EDS projects (no EDS metadata)', async () => {
            // Given: Project with no EDS metadata
            const metadata: EdsMetadata = {};
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: All operations should be skipped
            expect(result.backendData.skipped).toBe(true);
            expect(result.helix.skipped).toBe(true);
            expect(result.daLive.skipped).toBe(true);
            expect(result.github.skipped).toBe(true);

            // No actual cleanup should happen
            expect(mockToolManager.executeAcoCleanup).not.toHaveBeenCalled();
            expect(mockToolManager.executeCommerceCleanup).not.toHaveBeenCalled();
            expect(mockHelixService.unpublishSite).not.toHaveBeenCalled();
            expect(mockDaLiveService.deleteSite).not.toHaveBeenCalled();
            expect(mockGitHubService.deleteRepository).not.toHaveBeenCalled();
            expect(mockGitHubService.archiveRepository).not.toHaveBeenCalled();
        });

        it('should cleanup all resources when all options enabled', async () => {
            // Given: Full EDS metadata
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                daLiveOrg: 'testorg',
                daLiveSite: 'my-site',
                helixSiteUrl: 'https://main--my-site--testuser.aem.live',
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            };

            // When: Running full cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: All operations should succeed
            expect(result.backendData.success).toBe(true);
            expect(result.helix.success).toBe(true);
            expect(result.daLive.success).toBe(true);
            expect(result.github.success).toBe(true);
        });

        it('should archive instead of delete when option set', async () => {
            // Given: EDS metadata with GitHub repo
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                archiveInsteadOfDelete: true,
            };

            // When: Running cleanup with archive option
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should archive, not delete
            expect(mockGitHubService.archiveRepository).toHaveBeenCalledWith('testuser', 'my-site');
            expect(mockGitHubService.deleteRepository).not.toHaveBeenCalled();
        });

        it('should continue cleanup even if one service fails', async () => {
            // Given: DA.live service fails
            mockDaLiveService.deleteSite = jest.fn().mockRejectedValue(new Error('DA.live error'));

            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                daLiveOrg: 'testorg',
                daLiveSite: 'my-site',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                deleteDaLive: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: DA.live should fail but GitHub should still run
            expect(result.daLive.success).toBe(false);
            expect(result.daLive.error).toBeDefined();
            expect(result.github.success).toBe(true);
        });

        it('should cleanup in correct order (Backend -> Helix -> DA.live -> GitHub)', async () => {
            // Given: Full EDS metadata
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                daLiveOrg: 'testorg',
                daLiveSite: 'my-site',
                helixSiteUrl: 'https://main--my-site--testuser.aem.live',
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            };

            // When: Running cleanup
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Operations should be in correct order
            expect(operationOrder).toEqual(['backend', 'helix', 'dalive', 'github']);
        });

        it('should use ACO cleanup for ACO backend type', async () => {
            // Given: ACO backend type
            const metadata: EdsMetadata = {
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
            };

            // When: Running cleanup
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should use ACO cleanup
            expect(mockToolManager.executeAcoCleanup).toHaveBeenCalled();
            expect(mockToolManager.executeCommerceCleanup).not.toHaveBeenCalled();
        });

        it('should use Commerce cleanup for Commerce backend type', async () => {
            // Given: Commerce backend type
            const metadata: EdsMetadata = {
                backendType: 'commerce',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
            };

            // When: Running cleanup
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should use Commerce cleanup
            expect(mockToolManager.executeCommerceCleanup).toHaveBeenCalled();
            expect(mockToolManager.executeAcoCleanup).not.toHaveBeenCalled();
        });

        it('should continue cleanup even if backend cleanup fails', async () => {
            // Given: Backend cleanup fails
            mockToolManager.executeAcoCleanup = jest.fn().mockResolvedValue({
                success: false,
                stdout: '',
                stderr: 'Backend error',
                error: 'Connection refused',
                duration: 500,
            });

            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
                deleteGitHub: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Backend should fail but GitHub should still run
            expect(result.backendData.success).toBe(false);
            expect(result.github.success).toBe(true);
        });

        it('should skip cleanup for resources with missing metadata', async () => {
            // Given: Partial metadata (only GitHub)
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                // No DA.live or Helix metadata
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Only GitHub should run, others skipped
            expect(result.backendData.skipped).toBe(true);
            expect(result.helix.skipped).toBe(true);
            expect(result.daLive.skipped).toBe(true);
            expect(result.github.success).toBe(true);
            expect(result.github.skipped).toBe(false);
        });

        it('should handle partial cleanup with detailed results', async () => {
            // Given: Mixed success/failure scenario
            mockHelixService.unpublishSite = jest.fn().mockRejectedValue(new Error('Helix timeout'));

            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                daLiveOrg: 'testorg',
                daLiveSite: 'my-site',
                helixSiteUrl: 'https://main--my-site--testuser.aem.live',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Each result should have detailed status
            expect(result.helix.success).toBe(false);
            expect(result.helix.error).toContain('Helix timeout');
            expect(result.daLive.success).toBe(true);
            expect(result.github.success).toBe(true);
        });
    });

    // ==========================================================
    // GitHub Service Tests (4 tests)
    // ==========================================================
    describe('GitHub Operations', () => {
        it('should delete repository via DELETE /repos/{owner}/{repo}', async () => {
            // Given: GitHub repo to delete
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                archiveInsteadOfDelete: false, // Explicitly delete
            };

            // When: Running cleanup
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should call delete with owner and repo
            expect(mockGitHubService.deleteRepository).toHaveBeenCalledWith('testuser', 'my-site');
        });

        it('should archive repository via PATCH with archived: true', async () => {
            // Given: GitHub repo to archive
            const metadata: EdsMetadata = {
                githubRepo: 'owner/repo-name',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                archiveInsteadOfDelete: true,
            };

            // When: Running cleanup
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should call archive with owner and repo
            expect(mockGitHubService.archiveRepository).toHaveBeenCalledWith('owner', 'repo-name');
        });

        it('should throw error when delete_repo scope missing for delete', async () => {
            // Given: Delete fails due to missing scope
            mockGitHubService.deleteRepository = jest.fn().mockRejectedValue(
                new Error('Resource not accessible by personal access token (missing delete_repo scope)'),
            );

            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                archiveInsteadOfDelete: false,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: GitHub cleanup should fail with scope error
            expect(result.github.success).toBe(false);
            expect(result.github.error).toContain('delete_repo scope');
        });

        it('should work with repo scope for archive', async () => {
            // Given: Archive only needs repo scope (which we have)
            mockGitHubService.archiveRepository = jest.fn().mockResolvedValue({ success: true });

            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
            };
            const options: EdsCleanupOptions = {
                deleteGitHub: true,
                archiveInsteadOfDelete: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Archive should succeed (repo scope is sufficient)
            expect(result.github.success).toBe(true);
        });
    });

    // ==========================================================
    // DA.live Service Tests (3 tests)
    // ==========================================================
    describe('DA.live Operations', () => {
        it('should delete site content via DELETE /source/{org}/{site}/', async () => {
            // Given: DA.live site to delete
            const metadata: EdsMetadata = {
                daLiveOrg: 'myorg',
                daLiveSite: 'mysite',
            };
            const options: EdsCleanupOptions = {
                deleteDaLive: true,
            };

            // When: Running cleanup
            await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should call deleteSite with org and site
            expect(mockDaLiveService.deleteSite).toHaveBeenCalledWith('myorg', 'mysite');
        });

        it('should handle 404 as success (already deleted)', async () => {
            // Given: Site already deleted (returns success for 404)
            mockDaLiveService.deleteSite = jest.fn().mockResolvedValue({
                success: true,
                alreadyDeleted: true,
            });

            const metadata: EdsMetadata = {
                daLiveOrg: 'myorg',
                daLiveSite: 'mysite',
            };
            const options: EdsCleanupOptions = {
                deleteDaLive: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should succeed (404 is acceptable)
            expect(result.daLive.success).toBe(true);
        });

        it('should throw error on 403 access denied', async () => {
            // Given: Access denied
            mockDaLiveService.deleteSite = jest.fn().mockRejectedValue(
                new Error('Access denied to organization'),
            );

            const metadata: EdsMetadata = {
                daLiveOrg: 'myorg',
                daLiveSite: 'mysite',
            };
            const options: EdsCleanupOptions = {
                deleteDaLive: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should fail with access denied
            expect(result.daLive.success).toBe(false);
            expect(result.daLive.error).toContain('Access denied');
        });
    });

    // ==========================================================
    // Backend Cleanup Tests (3 tests)
    // ==========================================================
    describe('Backend Cleanup', () => {
        it('should skip backend cleanup when backendType is not set', async () => {
            // Given: No backend type
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                // backendType not set
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Backend cleanup should be skipped
            expect(result.backendData.skipped).toBe(true);
            expect(mockToolManager.executeAcoCleanup).not.toHaveBeenCalled();
            expect(mockToolManager.executeCommerceCleanup).not.toHaveBeenCalled();
        });

        it('should pass through tool execution errors', async () => {
            // Given: Tool manager throws
            mockToolManager.executeAcoCleanup = jest.fn().mockRejectedValue(
                new Error('Tool not installed'),
            );

            const metadata: EdsMetadata = {
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should fail with tool error
            expect(result.backendData.success).toBe(false);
            expect(result.backendData.error).toContain('Tool not installed');
        });

        it('should handle cleanup result with success: false', async () => {
            // Given: Cleanup returns success: false
            mockToolManager.executeCommerceCleanup = jest.fn().mockResolvedValue({
                success: false,
                stdout: '',
                stderr: 'API returned 401',
                error: 'Unauthorized',
                duration: 1000,
            });

            const metadata: EdsMetadata = {
                backendType: 'commerce',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: Should report failure
            expect(result.backendData.success).toBe(false);
            expect(result.backendData.error).toBeDefined();
        });
    });

    // ==========================================================
    // Error Handling Tests (2 tests)
    // ==========================================================
    describe('Error Handling', () => {
        it('should return all skipped when options are all false', async () => {
            // Given: All cleanup options disabled
            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                daLiveOrg: 'testorg',
                daLiveSite: 'my-site',
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: false,
                deleteGitHub: false,
                deleteDaLive: false,
                unpublishHelix: false,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: All should be skipped
            expect(result.backendData.skipped).toBe(true);
            expect(result.helix.skipped).toBe(true);
            expect(result.daLive.skipped).toBe(true);
            expect(result.github.skipped).toBe(true);
        });

        it('should handle simultaneous failures gracefully', async () => {
            // Given: Multiple services fail
            mockToolManager.executeAcoCleanup = jest.fn().mockRejectedValue(new Error('Backend failed'));
            mockHelixService.unpublishSite = jest.fn().mockRejectedValue(new Error('Helix failed'));
            mockDaLiveService.deleteSite = jest.fn().mockRejectedValue(new Error('DA.live failed'));
            mockGitHubService.deleteRepository = jest.fn().mockRejectedValue(new Error('GitHub failed'));

            const metadata: EdsMetadata = {
                githubRepo: 'testuser/my-site',
                daLiveOrg: 'testorg',
                daLiveSite: 'my-site',
                helixSiteUrl: 'https://example.com',
                backendType: 'aco',
            };
            const options: EdsCleanupOptions = {
                cleanupBackendData: true,
                deleteGitHub: true,
                deleteDaLive: true,
                unpublishHelix: true,
                archiveInsteadOfDelete: false,
            };

            // When: Running cleanup
            const result = await cleanupService.cleanupEdsResources(metadata, options);

            // Then: All should have errors but not throw
            expect(result.backendData.success).toBe(false);
            expect(result.backendData.error).toContain('Backend failed');
            expect(result.helix.success).toBe(false);
            expect(result.helix.error).toContain('Helix failed');
            expect(result.daLive.success).toBe(false);
            expect(result.daLive.error).toContain('DA.live failed');
            expect(result.github.success).toBe(false);
            expect(result.github.error).toContain('GitHub failed');
        });
    });
});

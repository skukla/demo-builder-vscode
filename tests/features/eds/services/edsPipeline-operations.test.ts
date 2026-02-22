/**
 * EDS Pipeline Tests - Operations
 *
 * Tests for individual pipeline operations:
 * - Content copy
 * - Block library
 * - EDS settings
 * - Cache purge
 * - Content publish
 * - Library publish
 */

import {
    executeEdsPipeline,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from '@/features/eds/services/edsPipeline';

// Mock edsHelpers
const mockApplyDaLiveOrgConfigSettings = jest.fn().mockResolvedValue(undefined);
const mockBulkPreviewAndPublish = jest.fn().mockResolvedValue(undefined);

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    bulkPreviewAndPublish: (...args: unknown[]) => mockBulkPreviewAndPublish(...args),
}));

describe('executeEdsPipeline - operations', () => {
    let mockDaLiveContentOps: EdsPipelineServices['daLiveContentOps'];
    let mockGithubFileOps: EdsPipelineServices['githubFileOps'];
    let mockHelixService: EdsPipelineServices['helixService'];
    let mockLogger: EdsPipelineServices['logger'];
    let services: EdsPipelineServices;
    let baseParams: EdsPipelineParams;

    beforeEach(() => {
        jest.clearAllMocks();

        mockDaLiveContentOps = {
            copyContentFromSource: jest.fn().mockResolvedValue({
                success: true,
                totalFiles: 42,
                copiedFiles: Array(42).fill('/page'),
                failedFiles: [],
            }),
            createBlockLibraryFromTemplate: jest.fn().mockResolvedValue({
                success: true,
                blocksCount: 5,
                paths: ['.da/library/blocks.json', '.da/library/blocks/hero'],
            }),
        } as unknown as EdsPipelineServices['daLiveContentOps'];

        mockGithubFileOps = {
            getFileContent: jest.fn().mockResolvedValue({ content: '{}', sha: 'abc' }),
        } as unknown as EdsPipelineServices['githubFileOps'];

        mockHelixService = {
            purgeCacheAll: jest.fn().mockResolvedValue(undefined),
            publishAllSiteContent: jest.fn().mockResolvedValue(undefined),
        } as unknown as EdsPipelineServices['helixService'];

        mockLogger = {
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as EdsPipelineServices['logger'];

        services = {
            daLiveContentOps: mockDaLiveContentOps,
            githubFileOps: mockGithubFileOps,
            helixService: mockHelixService,
            logger: mockLogger,
        };

        baseParams = {
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
        };
    });

    describe('content copy', () => {
        it('should skip content copy when skipContent is true', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true },
                services,
            );

            expect(result.success).toBe(true);
            expect(result.contentFilesCopied).toBe(0);
            expect(mockDaLiveContentOps.copyContentFromSource).not.toHaveBeenCalled();
        });

        it('should copy content when source is provided', async () => {
            const contentSource = { org: 'src-org', site: 'src-site' };
            const result = await executeEdsPipeline(
                { ...baseParams, contentSource },
                services,
            );

            expect(result.success).toBe(true);
            expect(result.contentFilesCopied).toBe(42);
            expect(mockDaLiveContentOps.copyContentFromSource).toHaveBeenCalledWith(
                expect.objectContaining({
                    org: 'src-org',
                    site: 'src-site',
                    indexUrl: 'https://main--src-site--src-org.aem.live/full-index.json',
                }),
                'test-org',
                'test-site',
                expect.any(Function),
                undefined,
                undefined,
            );
        });

        it('should use custom indexPath when provided', async () => {
            const contentSource = { org: 'src-org', site: 'src-site', indexPath: '/custom-index.json' };
            const result = await executeEdsPipeline(
                { ...baseParams, contentSource },
                services,
            );

            expect(result.success).toBe(true);
            expect(mockDaLiveContentOps.copyContentFromSource).toHaveBeenCalledWith(
                expect.objectContaining({
                    indexUrl: 'https://main--src-site--src-org.aem.live/custom-index.json',
                }),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                undefined,
                undefined,
            );
        });

        it('should pass content patches to copy operation', async () => {
            const contentSource = { org: 'src-org', site: 'src-site' };
            const contentPatches = ['patch-1', 'patch-2'];
            const contentPatchSource = { owner: 'patch-owner', repo: 'patch-repo', path: '/patches' };

            await executeEdsPipeline(
                { ...baseParams, contentSource, contentPatches, contentPatchSource },
                services,
            );

            expect(mockDaLiveContentOps.copyContentFromSource).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                contentPatches,
                contentPatchSource,
            );
        });

        it('should fail when skipContent is false and no content source', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: false },
                services,
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Content source is required');
        });

        it('should fail when content copy returns failure', async () => {
            (mockDaLiveContentOps.copyContentFromSource as jest.Mock).mockResolvedValue({
                success: false,
                totalFiles: 10,
                copiedFiles: [],
                failedFiles: [{ path: '/page', error: 'fail' }],
            });

            const result = await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's' } },
                services,
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Content copy failed');
        });
    });

    describe('block library', () => {
        it('should skip block library when includeBlockLibrary is false', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: false },
                services,
            );

            expect(result.success).toBe(true);
            expect(result.libraryPaths).toEqual([]);
            expect(mockDaLiveContentOps.createBlockLibraryFromTemplate).not.toHaveBeenCalled();
        });

        it('should use template repo without blockCollectionIds', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(result.success).toBe(true);
            expect(mockDaLiveContentOps.createBlockLibraryFromTemplate).toHaveBeenCalledWith(
                'test-org',
                'test-site',
                'template-owner',
                'template-repo',
                expect.any(Function),
                undefined,
            );
        });

        it('should use user repo with blockCollectionIds', async () => {
            const blockCollectionIds = ['hero', 'columns'];
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true, blockCollectionIds },
                services,
            );

            expect(result.success).toBe(true);
            expect(mockDaLiveContentOps.createBlockLibraryFromTemplate).toHaveBeenCalledWith(
                'test-org',
                'test-site',
                'test-owner',   // user's repo, not template
                'test-repo',
                expect.any(Function),
                blockCollectionIds,
            );
        });

        it('should include library paths in result', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(result.libraryPaths).toEqual(['.da/library/blocks.json', '.da/library/blocks/hero']);
        });
    });

    describe('EDS settings', () => {
        it('should always apply EDS settings', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true },
                services,
            );

            expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledWith(
                mockDaLiveContentOps,
                'test-org',
                'test-site',
                mockLogger,
            );
        });
    });

    describe('cache purge', () => {
        it('should not purge cache when purgeCache is false', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true, purgeCache: false },
                services,
            );

            expect(mockHelixService.purgeCacheAll).not.toHaveBeenCalled();
        });

        it('should purge cache when purgeCache is true', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true, purgeCache: true },
                services,
            );

            expect(mockHelixService.purgeCacheAll).toHaveBeenCalledWith(
                'test-owner',
                'test-repo',
                'main',
            );
        });
    });

    describe('content publish', () => {
        it('should skip publish when skipPublish defaults to skipContent', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true },
                services,
            );

            expect(mockHelixService.publishAllSiteContent).not.toHaveBeenCalled();
        });

        it('should publish when skipContent is true but skipPublish is false', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true, skipPublish: false },
                services,
            );

            expect(mockHelixService.publishAllSiteContent).toHaveBeenCalledWith(
                'test-owner/test-repo',
                'main',
                'test-org',
                'test-site',
                expect.any(Function),
            );
        });

        it('should publish content when content was copied', async () => {
            await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's' } },
                services,
            );

            expect(mockHelixService.publishAllSiteContent).toHaveBeenCalledWith(
                'test-owner/test-repo',
                'main',
                'test-org',
                'test-site',
                expect.any(Function),
            );
        });
    });

    describe('library publish', () => {
        it('should publish library paths when they exist', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(mockBulkPreviewAndPublish).toHaveBeenCalledWith(
                mockHelixService,
                'test-owner',
                'test-repo',
                ['.da/library/blocks.json', '.da/library/blocks/hero'],
                mockLogger,
            );
        });

        it('should not publish when no library paths', async () => {
            (mockDaLiveContentOps.createBlockLibraryFromTemplate as jest.Mock).mockResolvedValue({
                success: true,
                blocksCount: 0,
                paths: [],
            });

            await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(mockBulkPreviewAndPublish).not.toHaveBeenCalled();
        });

        it('should not fail when library publish throws', async () => {
            mockBulkPreviewAndPublish.mockRejectedValue(new Error('publish error'));

            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            // Pipeline should succeed even if library publish fails (non-fatal)
            expect(result.success).toBe(true);
        });
    });
});

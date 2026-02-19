/**
 * EDS Pipeline Tests
 *
 * Tests for the shared content pipeline used by both setup and reset flows.
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

describe('executeEdsPipeline', () => {
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

    // ============================================
    // Content Copy
    // ============================================

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

    // ============================================
    // Block Library
    // ============================================

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

    // ============================================
    // EDS Settings
    // ============================================

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

    // ============================================
    // Cache Purge
    // ============================================

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

    // ============================================
    // Content Publish
    // ============================================

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

    // ============================================
    // Library Publish
    // ============================================

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

    // ============================================
    // Progress Callback
    // ============================================

    describe('progress callback', () => {
        it('should call progress callback for each operation', async () => {
            const onProgress = jest.fn();

            await executeEdsPipeline(
                {
                    ...baseParams,
                    contentSource: { org: 'o', site: 's' },
                    includeBlockLibrary: true,
                    purgeCache: true,
                },
                services,
                onProgress,
            );

            const operations = onProgress.mock.calls.map(
                (call: [{ operation: string }]) => call[0].operation,
            );

            expect(operations).toContain('content-copy');
            expect(operations).toContain('block-library');
            expect(operations).toContain('eds-settings');
            expect(operations).toContain('cache-purge');
            expect(operations).toContain('content-publish');
            expect(operations).toContain('library-publish');
        });

        it('should pass through numeric progress data from content copy', async () => {
            const onProgress = jest.fn();

            (mockDaLiveContentOps.copyContentFromSource as jest.Mock).mockImplementation(
                async (_source: unknown, _org: unknown, _site: unknown, progressCb: (p: Record<string, unknown>) => void) => {
                    progressCb({ processed: 5, total: 10, percentage: 50, currentFile: '/page-5' });
                    return { success: true, totalFiles: 10, copiedFiles: [], failedFiles: [] };
                },
            );

            await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's' } },
                services,
                onProgress,
            );

            const contentCopyCalls = onProgress.mock.calls.filter(
                (call: [{ operation: string }]) => call[0].operation === 'content-copy' && call[0].current !== undefined,
            );
            expect(contentCopyCalls.length).toBeGreaterThan(0);
            expect(contentCopyCalls[0][0]).toMatchObject({
                current: 5,
                total: 10,
                percentage: 50,
            });
        });

        it('should pass through numeric progress data from publish', async () => {
            const onProgress = jest.fn();

            (mockHelixService.publishAllSiteContent as jest.Mock).mockImplementation(
                async (_repo: unknown, _branch: unknown, _org: unknown, _site: unknown, progressCb: (p: Record<string, unknown>) => void) => {
                    progressCb({ phase: 'publish', message: 'Publishing...', current: 3, total: 20, currentPath: '/page-3' });
                },
            );

            await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's' } },
                services,
                onProgress,
            );

            const publishCalls = onProgress.mock.calls.filter(
                (call: [{ operation: string }]) => call[0].operation === 'content-publish' && call[0].current !== undefined,
            );
            expect(publishCalls.length).toBeGreaterThan(0);
            expect(publishCalls[0][0]).toMatchObject({
                current: 3,
                total: 20,
            });
        });

        it('should work without a progress callback', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true },
                services,
            );

            expect(result.success).toBe(true);
        });
    });

    // ============================================
    // Content Clear + CDN Overwrite
    // ============================================

    describe('content clear', () => {
        it('should call unpublishPages with converted web paths', async () => {
            (mockDaLiveContentOps as Record<string, unknown>).deleteAllSiteContent = jest.fn().mockResolvedValue({
                success: true,
                deletedCount: 3,
                deletedPaths: ['/index.html', '/about.html', '/products/default.html'],
            });
            (mockHelixService as Record<string, unknown>).unpublishPages = jest.fn().mockResolvedValue({ success: true, count: 3 });

            const result = await executeEdsPipeline(
                { ...baseParams, clearExistingContent: true, skipContent: true },
                services,
            );

            expect(result.success).toBe(true);
            expect(mockDaLiveContentOps.deleteAllSiteContent).toHaveBeenCalledWith(
                'test-org', 'test-site', expect.any(Function),
            );

            // Should call unified unpublishPages with converted web paths
            expect(mockHelixService.unpublishPages).toHaveBeenCalledWith(
                'test-owner', 'test-repo', 'main',
                expect.arrayContaining(['/', '/about', '/products/default']),
            );
        });

        it('should succeed when unpublishPages throws (non-fatal)', async () => {
            (mockDaLiveContentOps as Record<string, unknown>).deleteAllSiteContent = jest.fn().mockResolvedValue({
                success: true,
                deletedCount: 2,
                deletedPaths: ['/index.html', '/about.html'],
            });
            (mockHelixService as Record<string, unknown>).unpublishPages = jest.fn().mockRejectedValue(new Error('Bulk job timeout'));

            const result = await executeEdsPipeline(
                { ...baseParams, clearExistingContent: true, skipContent: true },
                services,
            );

            // Pipeline succeeds — bulk unpublish failure is non-fatal
            expect(result.success).toBe(true);
        });

        it('should skip CDN unpublish when no files were deleted', async () => {
            (mockDaLiveContentOps as Record<string, unknown>).deleteAllSiteContent = jest.fn().mockResolvedValue({
                success: true,
                deletedCount: 0,
                deletedPaths: [],
            });

            const result = await executeEdsPipeline(
                { ...baseParams, clearExistingContent: true, skipContent: true },
                services,
            );

            expect(result.success).toBe(true);
            // No deleted files — unpublishPages should not be called
            expect((mockHelixService as Record<string, unknown>).unpublishPages).toBeUndefined();
        });

        it('should unpublish non-HTML files with their original paths', async () => {
            (mockDaLiveContentOps as Record<string, unknown>).deleteAllSiteContent = jest.fn().mockResolvedValue({
                success: true,
                deletedCount: 3,
                deletedPaths: ['/about.html', '/media_abc123.png', '/config.json'],
            });
            (mockHelixService as Record<string, unknown>).unpublishPages = jest.fn().mockResolvedValue({ success: true, count: 3 });

            await executeEdsPipeline(
                { ...baseParams, clearExistingContent: true, skipContent: true },
                services,
            );

            // HTML paths converted, non-HTML paths kept as-is
            expect(mockHelixService.unpublishPages).toHaveBeenCalledWith(
                'test-owner', 'test-repo', 'main',
                ['/about', '/media_abc123.png', '/config.json'],
            );
        });

        it('should convert index.html paths to / web paths', async () => {
            (mockDaLiveContentOps as Record<string, unknown>).deleteAllSiteContent = jest.fn().mockResolvedValue({
                success: true,
                deletedCount: 2,
                deletedPaths: ['/index.html', '/phones/index.html'],
            });
            (mockHelixService as Record<string, unknown>).unpublishPages = jest.fn().mockResolvedValue({ success: true, count: 2 });

            await executeEdsPipeline(
                { ...baseParams, clearExistingContent: true, skipContent: true },
                services,
            );

            // /index.html → /, /phones/index.html → /phones
            expect(mockHelixService.unpublishPages).toHaveBeenCalledWith(
                'test-owner', 'test-repo', 'main',
                ['/', '/phones'],
            );
        });
    });

    // ============================================
    // Full Pipeline
    // ============================================

    describe('full pipeline', () => {
        it('should execute all steps in order for a complete setup', async () => {
            const callOrder: string[] = [];

            (mockDaLiveContentOps.copyContentFromSource as jest.Mock).mockImplementation(async () => {
                callOrder.push('copyContent');
                return { success: true, totalFiles: 10, copiedFiles: [], failedFiles: [] };
            });
            (mockDaLiveContentOps.createBlockLibraryFromTemplate as jest.Mock).mockImplementation(async () => {
                callOrder.push('createBlockLibrary');
                return { success: true, blocksCount: 3, paths: ['.da/library/blocks.json'] };
            });
            mockApplyDaLiveOrgConfigSettings.mockImplementation(async () => {
                callOrder.push('applySettings');
            });
            (mockHelixService.purgeCacheAll as jest.Mock).mockImplementation(async () => {
                callOrder.push('purgeCache');
            });
            (mockHelixService.publishAllSiteContent as jest.Mock).mockImplementation(async () => {
                callOrder.push('publishContent');
            });
            mockBulkPreviewAndPublish.mockImplementation(async () => {
                callOrder.push('publishLibrary');
            });

            const result = await executeEdsPipeline(
                {
                    ...baseParams,
                    contentSource: { org: 'o', site: 's' },
                    includeBlockLibrary: true,
                    purgeCache: true,
                },
                services,
            );

            expect(result.success).toBe(true);
            expect(callOrder).toEqual([
                'copyContent',
                'createBlockLibrary',
                'applySettings',
                'purgeCache',
                'publishContent',
                'publishLibrary',
            ]);
        });

        it('should handle skipContent + includeBlockLibrary (custom package)', async () => {
            const result = await executeEdsPipeline(
                {
                    ...baseParams,
                    skipContent: true,
                    includeBlockLibrary: true,
                    purgeCache: false,
                },
                services,
            );

            expect(result.success).toBe(true);
            expect(result.contentFilesCopied).toBe(0);
            expect(mockDaLiveContentOps.copyContentFromSource).not.toHaveBeenCalled();
            expect(mockHelixService.publishAllSiteContent).not.toHaveBeenCalled();
            expect(mockHelixService.purgeCacheAll).not.toHaveBeenCalled();
            // Library should still be published
            expect(mockBulkPreviewAndPublish).toHaveBeenCalled();
        });
    });
});

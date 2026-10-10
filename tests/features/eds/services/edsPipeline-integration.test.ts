/**
 * EDS Pipeline Tests - Integration
 *
 * Tests for pipeline integration behavior:
 * - Progress callback
 * - Content clear + CDN unpublish (uses DA.live Bearer token auth)
 * - Full pipeline execution order
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import {
    basePipelineParams,
    executeEdsPipeline,
    pipelineHelixFake,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';

import { createMockProject } from '../../../helpers/projectFake';
// Mock edsHelpers
const mockApplyDaLiveOrgConfigSettings = jest.fn().mockResolvedValue(undefined);
const mockPublishLibraryPaths = jest.fn().mockResolvedValue(undefined);
// Present in the mock so the library-publish step's verify pass runs instead of
// throwing on an undefined import (the old orchestrator swallowed that throw
// identically, which is how the gap hid).
const mockVerifyLibraryPreviewed = jest.fn().mockResolvedValue(true);

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    publishLibraryPaths: (...args: unknown[]) => mockPublishLibraryPaths(...args),
    verifyLibraryPreviewed: (...args: unknown[]) => mockVerifyLibraryPreviewed(...args),
}));

const mockPrewarmCatalog = jest.fn().mockResolvedValue({ skipped: true });
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: (...args: unknown[]) => mockPrewarmCatalog(...args),
}));

describe('executeEdsPipeline - integration', () => {
    let mockDaLiveContentOps: EdsPipelineServices['daLiveContentOps'];
    let mockGithubFileOps: EdsPipelineServices['githubFileOps'];
    let mockHelixService: EdsPipelineServices['helixService'];
    let mockLogger: EdsPipelineServices['logger'];
    let services: EdsPipelineServices;
    let baseParams: EdsPipelineParams;

    beforeEach(() => {
        jest.clearAllMocks();

        mockDaLiveContentOps = {
            sourceOps: { deleteAllSiteContent: jest.fn() },
            copyOps: {
                copyContentFromSource: jest.fn().mockResolvedValue({
                    success: true,
                    totalFiles: 42,
                    copiedFiles: Array(42).fill('/page'),
                    failedFiles: [],
                }),
            },
            blockLibOps: {
                createBlockLibraryFromTemplate: jest.fn().mockResolvedValue({
                    success: true,
                    blocksCount: 5,
                    paths: ['/.da/library/blocks.json', '/.da/library/blocks/hero'],
                }),
            },
        } as unknown as EdsPipelineServices['daLiveContentOps'];

        mockGithubFileOps = {
            getFileContent: jest.fn().mockResolvedValue(null),
        } as unknown as EdsPipelineServices['githubFileOps'];

        mockHelixService = pipelineHelixFake();
        mockLogger = createMockLogger();

        services = pipelineServices({
            daLiveContentOps: mockDaLiveContentOps,
            githubFileOps: mockGithubFileOps,
            helixService: mockHelixService,
            logger: mockLogger,
        });

        baseParams = basePipelineParams();
    });

    describe('progress callback', () => {
        it('should call progress callback for each operation', async () => {
            const onProgress = jest.fn();

            await executeEdsPipeline(
                {
                    ...baseParams,
                    contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' },
                    includeBlockLibrary: true,
                    purgeCache: true,
                },
                services,
                onProgress
            );

            const operations = onProgress.mock.calls.map(
                (call: [{ operation: string }]) => call[0].operation
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

            (mockDaLiveContentOps.copyOps.copyContentFromSource as jest.Mock).mockImplementation(
                async (
                    _source: unknown,
                    _org: unknown,
                    _site: unknown,
                    progressCb: (p: Record<string, unknown>) => void
                ) => {
                    progressCb({ processed: 5, total: 10, percentage: 50, currentFile: '/page-5' });
                    return { success: true, totalFiles: 10, copiedFiles: [], failedFiles: [] };
                }
            );

            await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' } },
                services,
                onProgress
            );

            const contentCopyCalls = onProgress.mock.calls.filter(
                (call: [{ operation: string; current?: number }]) =>
                    call[0].operation === 'content-copy' && call[0].current !== undefined
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
                async (
                    _repo: unknown,
                    _branch: unknown,
                    _org: unknown,
                    _site: unknown,
                    progressCb: (p: Record<string, unknown>) => void
                ) => {
                    progressCb({
                        phase: 'publish',
                        message: 'Publishing...',
                        current: 3,
                        total: 20,
                        currentPath: '/page-3',
                    });
                }
            );

            await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' } },
                services,
                onProgress
            );

            const publishCalls = onProgress.mock.calls.filter(
                (call: [{ operation: string; current?: number }]) =>
                    call[0].operation === 'content-publish' && call[0].current !== undefined
            );
            expect(publishCalls.length).toBeGreaterThan(0);
            expect(publishCalls[0][0]).toMatchObject({
                current: 3,
                total: 20,
            });
        });

        it('should work without a progress callback', async () => {
            const result = await executeEdsPipeline({ ...baseParams, skipContent: true }, services);

            expect(result.success).toBe(true);
        });
    });

    describe('content clear', () => {
        it('clears the DA.live site directly, without fstab or config manipulation, and unpublishes nothing', async () => {
            // The pages left over are unpublished after the republish instead (EDS-33);
            // see edsPipeline-leftoverPages.test.ts.
            (mockDaLiveContentOps.sourceOps.deleteAllSiteContent as jest.Mock).mockResolvedValue({
                    success: true,
                    deletedCount: 3,
                    deletedPaths: ['/index.html', '/about.html', '/products/default.html'],
                });
            const unpublishPages = jest.fn();
            (mockHelixService as unknown as Record<string, unknown>).unpublishPages = unpublishPages;

            const result = await executeEdsPipeline(
                { ...baseParams, clearExistingContent: true, skipContent: true, skipPublish: true },
                services
            );

            expect(result.success).toBe(true);
            expect(mockDaLiveContentOps.sourceOps.deleteAllSiteContent).toHaveBeenCalledWith(
                'test-org',
                'test-site',
                expect.any(Function)
            );
            expect(unpublishPages).not.toHaveBeenCalled();
            expect(mockGithubFileOps.getFileContent).not.toHaveBeenCalled();
        });
    });

    describe('full pipeline', () => {
        it('should execute all steps in order for a complete setup', async () => {
            const callOrder: string[] = [];

            (mockDaLiveContentOps.copyOps.copyContentFromSource as jest.Mock).mockImplementation(
                async () => {
                    callOrder.push('copyContent');
                    return { success: true, totalFiles: 10, copiedFiles: [], failedFiles: [] };
                }
            );
            (mockDaLiveContentOps.blockLibOps.createBlockLibraryFromTemplate as jest.Mock).mockImplementation(
                async () => {
                    callOrder.push('createBlockLibrary');
                    return { success: true, blocksCount: 3, paths: ['.da/library/blocks.json'] };
                }
            );
            mockApplyDaLiveOrgConfigSettings.mockImplementation(async () => {
                callOrder.push('applySettings');
            });
            (mockHelixService.purgeCacheAll as jest.Mock).mockImplementation(async () => {
                callOrder.push('purgeCache');
            });
            (mockHelixService.publishAllSiteContent as jest.Mock).mockImplementation(async () => {
                callOrder.push('publishContent');
            });
            mockPublishLibraryPaths.mockImplementation(async () => {
                callOrder.push('publishLibrary');
            });

            const result = await executeEdsPipeline(
                {
                    ...baseParams,
                    contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' },
                    includeBlockLibrary: true,
                    purgeCache: true,
                },
                services
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

        it('continues when library publish fails — the step is declared non-fatal', async () => {
            mockPublishLibraryPaths.mockRejectedValueOnce(new Error('bulk job refused'));

            const result = await executeEdsPipeline(
                {
                    ...baseParams,
                    contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' },
                    includeBlockLibrary: true,
                },
                services
            );

            expect(result.success).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Block library publish failed: bulk job refused')
            );
        });

        it('continues when catalog pre-warming throws — defense in depth is declared on the step', async () => {
            mockPrewarmCatalog.mockRejectedValueOnce(new Error('enumeration exploded'));

            const result = await executeEdsPipeline(
                {
                    ...baseParams,
                    contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' },
                    byomOverlayUrl: 'https://overlay.example',
                    project: createMockProject({ name: 'p' }),
                },
                services
            );

            expect(result.success).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Catalog pre-warming threw unexpectedly: enumeration exploded')
            );
        });

        it('should handle skipContent + includeBlockLibrary (custom package)', async () => {
            const result = await executeEdsPipeline(
                {
                    ...baseParams,
                    skipContent: true,
                    includeBlockLibrary: true,
                    purgeCache: false,
                },
                services
            );

            expect(result.success).toBe(true);
            expect(result.contentFilesCopied).toBe(0);
            expect(mockDaLiveContentOps.copyOps.copyContentFromSource).not.toHaveBeenCalled();
            expect(mockHelixService.publishAllSiteContent).not.toHaveBeenCalled();
            expect(mockHelixService.purgeCacheAll).not.toHaveBeenCalled();
            // Library should still be published
            expect(mockPublishLibraryPaths).toHaveBeenCalled();
        });
    });
});

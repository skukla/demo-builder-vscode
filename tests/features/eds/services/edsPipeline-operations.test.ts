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

import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import {
    basePipelineParams,
    executeEdsPipeline,
    pipelineBlockLibOps,
    pipelineHelixFake,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';
import { installSiteFetch } from '../../../helpers/siteFetchFake';
import { DaLiveAuthError } from '@/features/eds/services/types';

// Mock edsHelpers
const mockApplyDaLiveOrgConfigSettings = jest.fn().mockResolvedValue(undefined);
const mockPublishLibraryPaths = jest.fn().mockResolvedValue(undefined);

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    resolveProjectAuthoringExperience: () => 'da-live-classic',
    publishLibraryPaths: (...args: unknown[]) => mockPublishLibraryPaths(...args),
}));

// Mock the brand-asset publisher (phase runs iff params.brandAssets present)
const mockPublishBrandAssets = jest.fn();

jest.mock('@/features/eds/services/brandAssetPublisher', () => ({
    publishBrandAssets: (...args: unknown[]) => mockPublishBrandAssets(...args),
    // Pure result filter — keep the real one so the pipeline's warning
    // summary exercises the actual semantics.
    failedTargets: jest.requireActual('@/features/eds/services/brandAssetPublisher').failedTargets,
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
            copyOps: {
                copyContentFromSource: jest.fn().mockResolvedValue({
                    success: true,
                    totalFiles: 42,
                    copiedFiles: Array(42).fill('/page'),
                    failedFiles: [],
                    sheetPaths: [],
                    codePathsOnSource: [],
                }),
            },
            blockLibOps: pipelineBlockLibOps({
                success: true,
                blocksCount: 5,
                paths: ['/.da/library/blocks.json', '/.da/library/blocks/hero'],
            }),
        } as unknown as EdsPipelineServices['daLiveContentOps'];

        mockGithubFileOps = {
            getFileContent: jest.fn().mockResolvedValue({ content: '{}', sha: 'abc' }),
            listRepoFiles: jest.fn().mockResolvedValue([]),
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

    describe('content copy', () => {
        it('should skip content copy when skipContent is true', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true },
                services,
            );

            expect(result.success).toBe(true);
            expect(result.contentFilesCopied).toBe(0);
            expect(mockDaLiveContentOps.copyOps.copyContentFromSource).not.toHaveBeenCalled();
        });

        it('should copy content when source is provided', async () => {
            const contentSource = { org: 'src-org', site: 'src-site', indexPath: '/full-index.json' };
            const result = await executeEdsPipeline(
                { ...baseParams, contentSource },
                services,
            );

            expect(result.success).toBe(true);
            expect(result.contentFilesCopied).toBe(42);
            expect(mockDaLiveContentOps.copyOps.copyContentFromSource).toHaveBeenCalledWith(
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
                // patchReport — pipeline always passes one (the unified
                // content + code patch report; ADR-006 Step 2c).
                expect.objectContaining({ results: expect.any(Array) }),
                // runtimeSurfaceSource (ADR-008 consumer) — codePatchSource, here undefined.
                undefined,
                // codePaths (EDS-40) — this suite's GitHub fake has no repository
                // archive, so the code is not read and the copy uses the fixed lists.
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
            expect(mockDaLiveContentOps.copyOps.copyContentFromSource).toHaveBeenCalledWith(
                expect.objectContaining({
                    indexUrl: 'https://main--src-site--src-org.aem.live/custom-index.json',
                }),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                undefined,
                undefined,
                expect.objectContaining({ results: expect.any(Array) }),
                undefined,
                undefined,
            );
        });

        it('should pass content patches to copy operation', async () => {
            const contentSource = { org: 'src-org', site: 'src-site', indexPath: '/full-index.json' };
            const contentPatches = ['patch-1', 'patch-2'];
            const contentPatchSource = { owner: 'patch-owner', repo: 'patch-repo', path: '/patches' };

            await executeEdsPipeline(
                { ...baseParams, contentSource, contentPatches, contentPatchSource },
                services,
            );

            expect(mockDaLiveContentOps.copyOps.copyContentFromSource).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                contentPatches,
                contentPatchSource,
                expect.objectContaining({ results: expect.any(Array) }),
                undefined,
                undefined,
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
            (mockDaLiveContentOps.copyOps.copyContentFromSource as jest.Mock).mockResolvedValue({
                success: false,
                totalFiles: 10,
                copiedFiles: [],
                failedFiles: [{ path: '/page', error: 'fail' }],
                sheetPaths: [],
                codePathsOnSource: [],
            });

            const result = await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' } },
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
            expect(result.libraryPaths).toStrictEqual([]);
            expect(mockDaLiveContentOps.blockLibOps.writeStorefrontBlockLibrary).not.toHaveBeenCalled();
        });

        it("builds the list from the storefront's own repository and writes it to its site", async () => {
            (mockGithubFileOps.listRepoFiles as jest.Mock).mockResolvedValue([
                { path: 'blocks/hero/hero.js', type: 'blob', sha: 'h' },
            ]);

            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(result.success).toBe(true);
            expect(mockGithubFileOps.listRepoFiles).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
            expect(mockDaLiveContentOps.blockLibOps.writeStorefrontBlockLibrary).toHaveBeenCalledWith(
                'test-org',
                'test-site',
                expect.objectContaining({
                    blocks: [{ id: 'hero', title: 'Hero', example: { kind: 'placeholder' } }],
                }),
            );
        });

        it("reads Adobe's library, the libraries' and the demo's sites from the params", async () => {
            const site = installSiteFetch([]);
            (mockGithubFileOps.listRepoFiles as jest.Mock).mockResolvedValue([
                { path: 'blocks/hero/hero.js', type: 'blob', sha: 'h' },
            ]);

            await executeEdsPipeline(
                {
                    ...baseParams,
                    skipContent: true,
                    includeBlockLibrary: true,
                    contentSource: { org: 'brand', site: 'brand-content', indexPath: '/full-index.json' },
                    accountContentSource: { org: 'adobe-commerce', site: 'boilerplate-b2b' },
                    blockLibraries: ['isle5'],
                    demoContentSource: { org: 'demo-org', site: 'demo-site' },
                },
                services,
            );

            expect(site.asked()).toEqual(expect.arrayContaining([
                'https://main--brand-content--brand.aem.page/docs/library/blocks.json',
                'https://main--boilerplate-b2b--adobe-commerce.aem.page/docs/library/blocks.json',
                'https://main--demo-site--demo-org.aem.page/docs/library/blocks/hero.plain.html',
            ]));
            expect(mockGithubFileOps.listRepoFiles).toHaveBeenCalledWith('stephen-garner-adobe', 'isle5', 'main');
        });

        it('should include library paths in result', async () => {
            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(result.libraryPaths).toEqual(['/.da/library/blocks.json', '/.da/library/blocks/hero']);
        });

        // EDS-71 step 4c: the callers record these on the project for the Draft Examples tile.
        it('carries the blocks the build left on a placeholder, only when the library was built', async () => {
            jest.mocked(services.daLiveContentOps.blockLibOps.writeStorefrontBlockLibrary)
                .mockResolvedValue({ success: true, blocksCount: 2, paths: [], needsExample: ['carousel'] });

            const built = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );
            const notBuilt = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: false },
                services,
            );

            expect(built.blocksNeedingExamples).toEqual(['carousel']);
            expect(notBuilt.blocksNeedingExamples).toBeUndefined();
        });
    });

    describe('brand assets', () => {
        const BRAND_ASSETS = {
            source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
            files: [{ from: 'styles/theme.css', to: 'styles/theme.css' }],
            headSnippet: '<link rel="stylesheet" href="/styles/theme.css">',
        };

        beforeEach(() => {
            mockPublishBrandAssets.mockResolvedValue({ success: true, files: [] });
        });

        it('should publish brand assets when params carry a brandAssets config', async () => {
            const params: EdsPipelineParams = {
                ...baseParams,
                skipContent: true,
                brandAssets: BRAND_ASSETS,
            };

            const result = await executeEdsPipeline(params, services);

            expect(result.success).toBe(true);
            expect(mockPublishBrandAssets).toHaveBeenCalledWith(
                BRAND_ASSETS,
                mockGithubFileOps,
                'test-owner',
                'test-repo',
                mockLogger,
            );
        });

        it('should skip silently when params have no brandAssets', async () => {
            await executeEdsPipeline({ ...baseParams, skipContent: true }, services);

            expect(mockPublishBrandAssets).not.toHaveBeenCalled();
        });

        it('should not fail the pipeline when brand-asset publishing reports failures', async () => {
            mockPublishBrandAssets.mockResolvedValue({
                success: false,
                files: [{ path: 'styles/theme.css', installed: false, reason: 'fetch failed' }],
            });

            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, brandAssets: BRAND_ASSETS },
                services,
            );

            expect(result.success).toBe(true);
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
                undefined,
            );
        });

        it('keeps a project\'s own authoring choice when it is reset', async () => {
            await executeEdsPipeline(
                { ...baseParams, skipContent: true, project: createMockProject() },
                services,
            );

            expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledWith(
                mockDaLiveContentOps,
                'test-org',
                'test-site',
                mockLogger,
                'da-live-classic',
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
                { ...baseParams, contentSource: { org: 'o', site: 's', indexPath: '/full-index.json' } },
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

            expect(mockPublishLibraryPaths).toHaveBeenCalledWith(
                mockHelixService,
                'test-owner',
                'test-repo',
                ['/.da/library/blocks.json', '/.da/library/blocks/hero'],
                mockLogger,
            );
        });

        it('should not publish when no library paths', async () => {
            (mockDaLiveContentOps.blockLibOps.writeStorefrontBlockLibrary as jest.Mock).mockResolvedValue({
                success: true,
                blocksCount: 0,
                paths: [],
            });

            await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            expect(mockPublishLibraryPaths).not.toHaveBeenCalled();
        });

        it('should not fail when library publish throws', async () => {
            mockPublishLibraryPaths.mockRejectedValue(new Error('publish error'));

            const result = await executeEdsPipeline(
                { ...baseParams, skipContent: true, includeBlockLibrary: true },
                services,
            );

            // Pipeline should succeed even if library publish fails (non-fatal)
            expect(result.success).toBe(true);
        });
    });

    describe('DaLiveAuthError propagation', () => {
        it('should re-throw DaLiveAuthError instead of swallowing it', async () => {
            // Given: Content copy throws DaLiveAuthError (token expired mid-pipeline)
            (mockDaLiveContentOps.copyOps.copyContentFromSource as jest.Mock).mockRejectedValue(
                new DaLiveAuthError('DA.live token expired during content copy'),
            );

            // When/Then: Pipeline should re-throw DaLiveAuthError, not return { success: false }
            await expect(
                executeEdsPipeline(
                    { ...baseParams, contentSource: { org: 'src', site: 'src', indexPath: '/full-index.json' } },
                    services,
                ),
            ).rejects.toThrow(DaLiveAuthError);
        });

        it('should still swallow non-auth errors into result', async () => {
            // Given: Content copy throws a generic error
            (mockDaLiveContentOps.copyOps.copyContentFromSource as jest.Mock).mockRejectedValue(
                new Error('Network failure'),
            );

            // When: Pipeline runs
            const result = await executeEdsPipeline(
                { ...baseParams, contentSource: { org: 'src', site: 'src', indexPath: '/full-index.json' } },
                services,
            );

            // Then: Generic errors still returned as { success: false }
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network failure');
        });
    });
});

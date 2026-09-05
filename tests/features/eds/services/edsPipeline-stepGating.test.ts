/**
 * EDS Pipeline — which steps run, and what an omitted flag means.
 *
 * Every gating flag is optional and resolves to a default here. The defaults
 * are the contract three callers rely on (create, reset, refresh-block-library),
 * and getting one backwards does not fail — it quietly does work nobody asked
 * for: purging a cache, rebuilding a library, pre-warming a catalog onto the
 * wrong site.
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import {
    basePipelineParams,
    executeEdsPipeline,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn().mockResolvedValue(undefined),
    publishLibraryPaths: jest.fn().mockResolvedValue(undefined),
    verifyLibraryPreviewed: jest.fn().mockResolvedValue(true),
}));

const mockApplyBlockCodePatches = jest.fn().mockResolvedValue([]);
jest.mock('@/features/eds/services/patches/codePatchPipelineHelpers', () => ({
    applyBlockCodePatches: (...args: unknown[]) => mockApplyBlockCodePatches(...args),
}));

const mockPrewarmCatalog = jest.fn();
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: (...args: unknown[]) => mockPrewarmCatalog(...args),
}));

const PROJECT = createMockProject({ name: 'demo-project' });
const CODE_PATCH_SOURCE = { owner: 'patch-owner', repo: 'patches', path: 'ledger' };

describe('executeEdsPipeline - step gating', () => {
    let mockCreateBlockLibrary: jest.Mock;
    let mockPurgeCacheAll: jest.Mock;
    let mockPublishAllSiteContent: jest.Mock;
    let mockCopyContentFromSource: jest.Mock;
    let services: EdsPipelineServices;
    let params: EdsPipelineParams;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPrewarmCatalog.mockResolvedValue({ skipped: false, succeeded: 3, attempted: 3 });
        mockCreateBlockLibrary = jest
            .fn()
            .mockResolvedValue({ success: true, blocksCount: 0, paths: [] });
        mockPurgeCacheAll = jest.fn().mockResolvedValue(undefined);
        mockPublishAllSiteContent = jest.fn().mockResolvedValue(undefined);
        mockCopyContentFromSource = jest.fn().mockResolvedValue({
            success: true,
            totalFiles: 1,
            copiedFiles: ['/page'],
            failedFiles: [],
        });

        services = pipelineServices({
            daLiveContentOps: {
                copyContentFromSource: mockCopyContentFromSource,
                createBlockLibraryFromTemplate: mockCreateBlockLibrary,
                deleteAllSiteContent: jest.fn(),
            },
            githubFileOps: { getFileContent: jest.fn().mockResolvedValue({ content: '{}' }) },
            helixService: {
                purgeCacheAll: mockPurgeCacheAll,
                publishAllSiteContent: mockPublishAllSiteContent,
            } as unknown as EdsPipelineServices['helixService'],
            logger: createMockLogger(),
        });

        // Nothing but the mandatory coordinates: every flag left to its default.
        params = basePipelineParams();
    });

    describe('what an omitted flag defaults to', () => {
        it('does not clear the site', async () => {
            const deleteAll = (
                services.daLiveContentOps as unknown as { deleteAllSiteContent: jest.Mock }
            ).deleteAllSiteContent;

            await executeEdsPipeline({ ...params, skipContent: true }, services);

            expect(deleteAll).not.toHaveBeenCalled();
        });

        it('does copy content, so an omitted source is an error rather than a silent skip', async () => {
            const result = await executeEdsPipeline(params, services);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Content source is required when skipContent is false');
        });

        it('does not rebuild the block library', async () => {
            // Rebuilding one nobody asked for overwrites an SC's promoted blocks.
            await executeEdsPipeline({ ...params, skipContent: true }, services);

            expect(mockCreateBlockLibrary).not.toHaveBeenCalled();
        });

        it('does not purge the cache', async () => {
            await executeEdsPipeline({ ...params, skipContent: true }, services);

            expect(mockPurgeCacheAll).not.toHaveBeenCalled();
        });

        it('follows the content decision when publish is not stated', async () => {
            // skipPublish defaults to skipContent: a run that copied nothing has
            // nothing to publish, and one that copied has to publish or the CDN
            // keeps serving the old pages.
            await executeEdsPipeline({ ...params, skipContent: true }, services);

            expect(mockPublishAllSiteContent).not.toHaveBeenCalled();
        });

        it('publishes when content was copied', async () => {
            await executeEdsPipeline(
                { ...params, contentSource: { org: 'src-org', site: 'src-site' } },
                services
            );

            expect(mockPublishAllSiteContent).toHaveBeenCalled();
        });
    });

    describe('block-targeting code patches', () => {
        // The step runs unconditionally; the guard is inside it, and each half
        // of the guard exists because a caller supplies one without the other.
        it('applies the patches when both a list and a ledger are supplied', async () => {
            await executeEdsPipeline(
                {
                    ...params,
                    skipContent: true,
                    codePatches: ['blocks/header/header.js'],
                    codePatchSource: CODE_PATCH_SOURCE,
                },
                services
            );

            expect(mockApplyBlockCodePatches).toHaveBeenCalledWith(
                services.githubFileOps,
                'test-owner',
                'test-repo',
                ['blocks/header/header.js'],
                CODE_PATCH_SOURCE,
                services.logger
            );
        });

        it('applies none when the list is absent', async () => {
            await executeEdsPipeline(
                { ...params, skipContent: true, codePatchSource: CODE_PATCH_SOURCE },
                services
            );

            expect(mockApplyBlockCodePatches).not.toHaveBeenCalled();
        });

        it('applies none when the list is empty', async () => {
            await executeEdsPipeline(
                {
                    ...params,
                    skipContent: true,
                    codePatches: [],
                    codePatchSource: CODE_PATCH_SOURCE,
                },
                services
            );

            expect(mockApplyBlockCodePatches).not.toHaveBeenCalled();
        });

        it('applies none when there is no ledger to read them from', async () => {
            await executeEdsPipeline(
                { ...params, skipContent: true, codePatches: ['blocks/header/header.js'] },
                services
            );

            expect(mockApplyBlockCodePatches).not.toHaveBeenCalled();
        });
    });

    describe('catalog pre-warming', () => {
        /** All three gates open. */
        const prewarmable = (over: Partial<EdsPipelineParams> = {}): EdsPipelineParams => ({
            ...basePipelineParams(),
            skipContent: true,
            skipPublish: false,
            byomOverlayUrl: 'https://overlay.example/render-pdp',
            project: PROJECT,
            ...over,
        });

        it('pre-warms the catalog when publishing, with an overlay, for a named project', async () => {
            await executeEdsPipeline(prewarmable(), services);

            expect(mockPrewarmCatalog).toHaveBeenCalledWith(
                PROJECT,
                'https://overlay.example/render-pdp',
                'test-org',
                'test-site',
                services.helixService,
                services.logger,
                undefined
            );
        });

        it('does not pre-warm on a run that publishes nothing', async () => {
            // refresh-block-library and similar narrow paths.
            await executeEdsPipeline(prewarmable({ skipPublish: true }), services);

            expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        });

        it('does not pre-warm without an overlay', async () => {
            // Same gate as the smart-404 install: with no overlay a pre-warmed
            // path cannot render a product anyway.
            await executeEdsPipeline(prewarmable({ byomOverlayUrl: undefined }), services);

            expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        });

        it('does not pre-warm without a project', async () => {
            // The caller opts in by passing one. On the create path there is no
            // project yet, and the last-opened one is the wrong catalog.
            await executeEdsPipeline(prewarmable({ project: undefined }), services);

            expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        });

        it('finishes the pipeline when pre-warming throws', async () => {
            // Defence in depth: pre-warming is already non-fatal internally, and
            // a thrown exception must not lose a storefront that is otherwise
            // built and published.
            mockPrewarmCatalog.mockRejectedValue(new Error('Commerce enumerate failed'));

            const result = await executeEdsPipeline(prewarmable(), services);

            expect(result.success).toBe(true);
        });
    });
});

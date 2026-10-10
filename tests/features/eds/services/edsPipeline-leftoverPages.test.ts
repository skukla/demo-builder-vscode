/**
 * EDS Pipeline — a reset unpublishes AFTER it republishes, and only what is left over
 * (EDS-33, the reset door; owner decision 2026-10-09).
 *
 * The old reset unpublished every deleted DA.live page at step 0 and republished at
 * step 5, so the storefront was offline in between, and a page live on Helix but no
 * longer in DA.live was never unpublished at all. Now step 0 only deletes the DA.live
 * content; after the republish the pipeline asks Helix what is published and takes off
 * what the reset did not republish, product pages excepted (the pre-warm after it owns
 * those).
 *
 * Every assertion on Helix is on the ARGUMENTS it was handed and the order of calls.
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import {
    basePipelineParams,
    executeEdsPipeline,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn().mockResolvedValue(undefined),
    publishLibraryPaths: jest.fn().mockResolvedValue(undefined),
    verifyLibraryPreviewed: jest.fn().mockResolvedValue(true),
}));

const mockPrewarmCatalog = jest.fn();
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: (...args: unknown[]) => mockPrewarmCatalog(...args),
}));

type ProgressCall = { operation: string; message: string; subMessage?: string };

describe('executeEdsPipeline - pages left over after a reset', () => {
    let helix: {
        purgeCacheAll: jest.Mock;
        publishAllSiteContent: jest.Mock;
        listPublishedPaths: jest.Mock;
        unpublishPages: jest.Mock;
    };
    let services: EdsPipelineServices;
    let logger: ReturnType<typeof createMockLogger>;
    let progress: ProgressCall[];
    /** What a storefront reset hands the pipeline: clear, copy, republish. */
    let resetParams: EdsPipelineParams;

    beforeEach(() => {
        jest.clearAllMocks();
        progress = [];
        logger = createMockLogger();
        mockPrewarmCatalog.mockResolvedValue({ skipped: false, succeeded: 2, attempted: 2 });
        helix = {
            purgeCacheAll: jest.fn().mockResolvedValue(undefined),
            // The pages the republish worked from.
            publishAllSiteContent: jest.fn().mockResolvedValue(['/', '/about']),
            // What Helix says is published once the republish is done.
            listPublishedPaths: jest
                .fn()
                .mockResolvedValue(['/index', '/about', '/old-campaign', '/products/drum/dc-100']),
            unpublishPages: jest.fn().mockImplementation(async (_o, _s, _b, paths: string[]) => ({
                success: true,
                count: paths.length,
                total: paths.length,
                liveFailed: 0,
                previewFailed: 0,
            })),
        };
        services = pipelineServices({
            daLiveContentOps: {
                sourceOps: {
                    deleteAllSiteContent: jest.fn().mockResolvedValue({
                        success: true,
                        deletedCount: 3,
                        deletedPaths: ['/index.html', '/about.html', '/old-campaign.html'],
                    }),
                },
                copyOps: {
                    copyContentFromSource: jest
                        .fn()
                        .mockResolvedValue({ success: true, totalFiles: 2, copiedFiles: [], failedFiles: [] }),
                },
                blockLibOps: { createBlockLibraryFromTemplate: jest.fn() },
            },
            githubFileOps: { getFileContent: jest.fn() },
            helixService: helix as unknown as EdsPipelineServices['helixService'],
            logger,
        });
        resetParams = {
            ...basePipelineParams(),
            clearExistingContent: true,
            contentSource: { org: 'src-org', site: 'src-site', indexPath: '/full-index.json' },
            purgeCache: true,
            skipPublish: false,
        };
    });

    const run = (params: EdsPipelineParams = resetParams) =>
        executeEdsPipeline(params, services, (info) => progress.push(info));

    it('unpublishes nothing while clearing the content, even with pages deleted', async () => {
        // The site stays up: the republish overwrites every page that still exists.
        await run({ ...resetParams, skipPublish: true });

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(progress.some((p) => /Unpublishing/.test(p.message))).toBe(false);
    });

    it('unpublishes only after the republish', async () => {
        await run();

        expect(helix.unpublishPages).toHaveBeenCalledTimes(1);
        const published = helix.publishAllSiteContent.mock.invocationCallOrder[0];
        expect(helix.listPublishedPaths.mock.invocationCallOrder[0]).toBeGreaterThan(published);
        expect(helix.unpublishPages.mock.invocationCallOrder[0]).toBeGreaterThan(published);
    });

    it('hands Helix exactly the live pages the reset did not republish, product pages excepted', async () => {
        const result = await run();

        expect(helix.listPublishedPaths).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', '/*');
        expect(helix.unpublishPages).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', ['/old-campaign']);
        expect(result.success).toBe(true);
        expect(result.leftoverPages).toEqual({
            status: 'removed',
            removed: 1,
            summary: 'Took 1 page from before the reset off main--test-repo--test-owner.aem.live.',
        });
    });

    it('runs before the catalog pre-warm, so the pages it publishes are never in the list', async () => {
        await run({ ...resetParams, byomOverlayUrl: 'https://overlay.example', project: createMockProject() });

        expect(mockPrewarmCatalog).toHaveBeenCalledTimes(1);
        expect(mockPrewarmCatalog.mock.invocationCallOrder[0]).toBeGreaterThan(
            helix.unpublishPages.mock.invocationCallOrder[0],
        );
    });

    it('warns in words, and never reads as clean, when Helix cannot say what is published', async () => {
        helix.listPublishedPaths.mockRejectedValue(new Error('Helix refused to list the published pages (HTTP 401)'));

        const result = await run();

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.leftoverPages?.status).toBe('not-listed');
        const sentence = result.leftoverPages?.summary ?? '';
        expect(sentence).toContain('may still be live');
        expect(progress).toContainEqual({ operation: 'leftover-pages', message: `⚠️ ${sentence}` });
    });

    it('warns when it cannot tell what the republish published', async () => {
        helix.publishAllSiteContent.mockResolvedValue(undefined);

        const result = await run();

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(result.leftoverPages?.status).toBe('not-compared');
    });

    it('compares against nothing republished when the site has no pages to publish', async () => {
        // A cleared site with no content source: everything still published is left over.
        helix.publishAllSiteContent.mockRejectedValue(new Error('No publishable pages found.'));

        await run({ ...resetParams, skipContent: true });

        expect(helix.unpublishPages).toHaveBeenCalledWith('test-owner', 'test-repo', 'main', [
            '/index',
            '/about',
            '/old-campaign',
        ]);
    });

    it('does not look for leftovers when the content was not cleared', async () => {
        // Setup on a fresh site, and a keep-my-content reset: nothing was replaced.
        const result = await run({ ...resetParams, clearExistingContent: false });

        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
        expect(result.leftoverPages).toBeUndefined();
    });

    it('does not look for leftovers when nothing was republished', async () => {
        await run({ ...resetParams, skipPublish: true });

        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
    });
});

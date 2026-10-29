/**
 * EDS Pipeline — the copy carries what the storefront's code loads, and says what is missing
 * (EDS-40).
 *
 * A project copied from a colleague's demo arrived without its cart and checkout
 * pages: they are in no content index and no backfill list. The pipeline now reads
 * the storefront's code from the SC's own repository before the copy, hands the
 * paths it loads to the copy, and after publishing asks the live storefront for
 * every one the source had, and for everything else the copy carried. Creation and
 * reset both run this pipeline, so both get it.
 *
 * Every assertion is on the ARGUMENTS a collaborator was handed (which repository
 * was downloaded, which paths the copy was given, which URLs were asked for) or on
 * the pipeline's result.
 */

import type { ArchivedFile } from '@/features/eds/services/github/githubRepoArchive';
import { createMockLogger } from '../../../helpers/loggerFake';
import { installSiteFetch, restoreFetch } from '../../../helpers/siteFetchFake';
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
    publishSheetPaths: jest.fn().mockResolvedValue({ published: 0, failed: 0 }),
    verifyLibraryPreviewed: jest.fn().mockResolvedValue(true),
}));

/** The storefront the pipeline publishes: GitHub `test-owner/test-repo`. */
const LIVE = 'https://main--test-repo--test-owner.aem.live';

/** The SC's repository: one block that links to the cart and the checkout. */
const REPOSITORY = new Map<string, ArchivedFile>([
    ['blocks/x/x.js', { data: Buffer.from("go('/cart'); go('/checkout');"), mode: '100644' }],
]);

type ProgressCall = { operation: string; message: string };

describe('executeEdsPipeline - what the storefront’s code loads', () => {
    let downloadRepoContents: jest.Mock;
    let copyContentFromSource: jest.Mock;
    let publishAllSiteContent: jest.Mock;
    let services: EdsPipelineServices;
    let progress: ProgressCall[];
    let params: EdsPipelineParams;

    beforeEach(() => {
        jest.clearAllMocks();
        progress = [];
        downloadRepoContents = jest.fn().mockResolvedValue(REPOSITORY);
        // The source had both pages, so the copy took both.
        copyContentFromSource = jest.fn().mockResolvedValue({
            success: true,
            totalFiles: 2,
            copiedFiles: [],
            failedFiles: [],
            sheetPaths: [],
            codePathsOnSource: ['/cart', '/checkout'],
        });
        publishAllSiteContent = jest.fn().mockResolvedValue(['/cart']);
        services = pipelineServices({
            daLiveContentOps: {
                copyOps: { copyContentFromSource },
                blockLibOps: { createBlockLibraryFromTemplate: jest.fn() },
            },
            githubFileOps: { getFileContent: jest.fn(), repoArchive: { downloadRepoContents } },
            helixService: {
                purgeCacheAll: jest.fn().mockResolvedValue(undefined),
                publishAllSiteContent,
            } as unknown as EdsPipelineServices['helixService'],
            logger: createMockLogger(),
        });
        params = {
            ...basePipelineParams(),
            contentSource: { org: 'src-org', site: 'src-site', indexPath: '/full-index.json' },
            skipPublish: false,
        };
    });

    afterEach(restoreFetch);

    const run = (overrides: Partial<EdsPipelineParams> = {}) =>
        executeEdsPipeline({ ...params, ...overrides }, services, (info) => progress.push(info));

    /** The ninth argument of the copy: the paths read out of the code. */
    const codePathsHandedToCopy = (): unknown => copyContentFromSource.mock.calls[0][8];

    describe('before the copy', () => {
        it('reads the code from the SC’s own repository, before copying anything', async () => {
            installSiteFetch([]);

            await run();

            expect(downloadRepoContents).toHaveBeenCalledTimes(1);
            expect(downloadRepoContents).toHaveBeenCalledWith('test-owner', 'test-repo');
            expect(downloadRepoContents.mock.invocationCallOrder[0]).toBeLessThan(
                copyContentFromSource.mock.invocationCallOrder[0]
            );
        });

        it('hands the copy the paths that code loads', async () => {
            installSiteFetch([]);

            await run();

            expect(codePathsHandedToCopy()).toEqual(['/cart', '/checkout']);
        });

        it('still copies, on the fixed lists, when the repository cannot be read', async () => {
            installSiteFetch([]);
            downloadRepoContents.mockRejectedValue(
                new Error('Failed to download archive: HTTP 404')
            );

            const result = await run();

            expect(result.success).toBe(true);
            expect(copyContentFromSource).toHaveBeenCalledTimes(1);
            expect(codePathsHandedToCopy()).toBeUndefined();
        });

        it('downloads nothing when no content is copied', async () => {
            installSiteFetch([]);

            await run({ skipContent: true });

            expect(downloadRepoContents).not.toHaveBeenCalled();
        });
    });

    describe('after the publish', () => {
        it('asks the live storefront for every path the source had, after publishing', async () => {
            const site = installSiteFetch([`${LIVE}/cart.plain.html`]);
            let askedBeforePublish = -1;
            publishAllSiteContent.mockImplementation(async () => {
                askedBeforePublish = site.asked().length;
                return ['/cart'];
            });

            await run();

            expect(askedBeforePublish).toBe(0);
            expect(site.asked().sort()).toEqual([
                `${LIVE}/cart.plain.html`,
                `${LIVE}/checkout.plain.html`,
            ]);
        });

        it('puts what is missing on the result, in a sentence', async () => {
            installSiteFetch([`${LIVE}/cart.plain.html`]);

            const result = await run();

            expect(result.success).toBe(true);
            // On the one list every surface reads (EDS-55).
            expect(result.warnings).toEqual([
                '1 page the source has is missing from this storefront: /checkout',
            ]);
        });

        it('says so on the progress line, as a warning', async () => {
            installSiteFetch([`${LIVE}/cart.plain.html`]);

            await run();

            const lines = progress
                .filter((p) => p.operation === 'page-check')
                .map((p) => p.message);
            expect(lines).toEqual([
                'Checking copied pages',
                '⚠️ 1 page the source has is missing from this storefront: /checkout',
            ]);
        });

        it('reports a complete copy without a sentence', async () => {
            installSiteFetch([`${LIVE}/cart.plain.html`, `${LIVE}/checkout.plain.html`]);

            const result = await run();

            expect(result.warnings).toStrictEqual([]);
        });

        it('never fails the pipeline when the storefront cannot be asked', async () => {
            installSiteFetch([], [`${LIVE}/cart.plain.html`, `${LIVE}/checkout.plain.html`]);

            const result = await run();

            expect(result.success).toBe(true);
            expect(result.warnings).toEqual([
                'Could not check whether every page the source has reached this storefront.',
            ]);
        });

        it('asks for nothing when nothing was published', async () => {
            const site = installSiteFetch([]);

            const result = await run({ skipPublish: true });

            expect(site.asked()).toStrictEqual([]);
            expect(result.warnings).toStrictEqual([]);
        });

        it('also checks what the copy carried from the source’s index, and names one left unpublished', async () => {
            // The live run that found it: two enrichment pages copied, never published.
            const SOURCE_LIVE = 'https://main--src-site--src-org.aem.live';
            installSiteFetch([
                `${LIVE}/cart.plain.html`,
                `${LIVE}/checkout.plain.html`,
                `${SOURCE_LIVE}/enrichment/category-banner.plain.html`,
            ]);
            copyContentFromSource.mockResolvedValue({
                success: true,
                totalFiles: 3,
                copiedFiles: ['/cart', '/checkout', '/enrichment/category-banner'],
                failedFiles: [],
                sheetPaths: [],
                codePathsOnSource: ['/cart', '/checkout'],
            });

            const result = await run();

            expect(result.warnings).toEqual([
                '1 page the source has is missing from this storefront: /enrichment/category-banner',
            ]);
        });

        it('asks for nothing when the copy carried nothing', async () => {
            const site = installSiteFetch([]);
            copyContentFromSource.mockResolvedValue({
                success: true,
                totalFiles: 2,
                copiedFiles: [],
                failedFiles: [],
                sheetPaths: [],
                codePathsOnSource: [],
            });

            const result = await run();

            expect(site.asked()).toStrictEqual([]);
            expect(result.warnings).toStrictEqual([]);
        });
    });
});

/**
 * EDS Pipeline: publishing the block library and the copied sheets, and the
 * library publish's verify-after-write. Split from edsPipeline-stepDetail.test.ts
 * on 2026-10-20 (EDS-55); the setup both share is in
 * edsPipeline-stepDetail.testUtils.ts.
 */

import {
    executeEdsPipeline,
    mockPublishLibraryPaths,
    mockPublishSheetPaths,
    mockVerifyLibraryPreviewed,
    stepDetailHarness,
} from './edsPipeline-stepDetail.testUtils';

describe('executeEdsPipeline - publishing the library and the sheets', () => {
    const h = stepDetailHarness();

    describe('publishing the block library', () => {
        const withPaths = (paths: string[]) => {
            h.mockCreateBlockLibrary.mockResolvedValue({
                success: true,
                blocksCount: paths.length,
                paths,
            });
            return { ...h.params, skipContent: true, includeBlockLibrary: true };
        };

        it('says how many pages it is publishing', async () => {
            // A two-minute spinner with a static hint was the complaint; the
            // count and then the half tell the SC what is happening.
            await executeEdsPipeline(withPaths(['/a', '/b']), h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'library-publish',
                message: 'Publishing the block list: 2 pages',
                subMessage: 'test-owner/test-repo',
            });
        });

        it('says page, not pages, when there is one', async () => {
            await executeEdsPipeline(withPaths(['/a']), h.services, h.onProgress);

            expect(h.find('library-publish', /: 1 page$/)?.message).toBe(
                'Publishing the block list: 1 page'
            );
        });

        it('says it is verifying before it verifies', async () => {
            await executeEdsPipeline(withPaths(['/a']), h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'library-publish',
                message: 'Publishing the block list: Checking the block list is live',
                subMessage: 'test-owner/test-repo',
            });
        });

        it('publishes exactly the paths the library produced', async () => {
            await executeEdsPipeline(withPaths(['/a', '/b']), h.services, h.onProgress);

            expect(mockPublishLibraryPaths).toHaveBeenCalledWith(
                h.services.helixService,
                'test-owner',
                'test-repo',
                ['/a', '/b'],
                h.services.logger
            );
        });

        it('reads the site config when the library did not preview', async () => {
            // The bulk job reports success for paths that matched nothing, so a
            // library that cannot preview a single block still logs "published".
            // The site config is the state nobody can inspect afterwards.
            mockVerifyLibraryPreviewed.mockResolvedValue(false);

            await executeEdsPipeline(withPaths(['/a']), h.services, h.onProgress);

            expect(h.mockReadSiteConfig).toHaveBeenCalledWith('test-org', 'test-site');
        });

        it('does not go looking for a cause when it previewed', async () => {
            await executeEdsPipeline(withPaths(['/a']), h.services, h.onProgress);

            expect(h.mockReadSiteConfig).not.toHaveBeenCalled();
        });

        it('publishes AND verifies with no progress callback at all', async () => {
            // Both halves: the step reports between the publish and the verify,
            // and a run with no callback must still reach the verify.
            const result = await executeEdsPipeline(withPaths(['/a']), h.services);

            expect(result.success).toBe(true);
            expect(mockPublishLibraryPaths).toHaveBeenCalled();
            expect(mockVerifyLibraryPreviewed).toHaveBeenCalled();
        });

        it('does not fail the run when the library publish throws', async () => {
            // The library config exists; publishing it can be retried.
            mockPublishLibraryPaths.mockRejectedValue(new Error('publish refused'));

            const result = await executeEdsPipeline(withPaths(['/a']), h.services, h.onProgress);

            expect(result.success).toBe(true);
            expect(result.libraryPaths).toEqual(['/a']);
        });
    });

    describe('publishing the copied sheets', () => {
        // A sheet written to DA.live is served only once it is previewed and
        // published, and the whole-site publish never touches one: it publishes
        // .html documents and skips metadata, redirects and placeholders by name.
        const SHEETS = ['/metadata.json', '/placeholders/cart.json'];
        const withSheets = (sheetPaths: string[]) =>
            h.mockCopyContentFromSource.mockResolvedValue({
                success: true,
                totalFiles: 3,
                copiedFiles: ['/page', '/metadata', '/placeholders/cart'],
                failedFiles: [],
                sheetPaths,
                codePathsOnSource: [],
            });

        beforeEach(() => {
            mockPublishSheetPaths.mockResolvedValue({ published: 2, failed: 0 });
        });

        it('publishes exactly the sheet paths the copy reported, one page at a time', async () => {
            withSheets(SHEETS);

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(mockPublishSheetPaths).toHaveBeenCalledTimes(1);
            expect(mockPublishSheetPaths).toHaveBeenCalledWith(
                h.services.helixService,
                'test-owner',
                'test-repo',
                SHEETS,
                h.services.logger
            );
        });

        it('publishes them after the pages', async () => {
            withSheets(SHEETS);
            const order: string[] = [];
            h.mockPublishAllSiteContent.mockImplementation(async () => {
                order.push('pages');
            });
            mockPublishSheetPaths.mockImplementation(async () => {
                order.push('sheets');
                return { published: 2, failed: 0 };
            });

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(order).toStrictEqual(['pages', 'sheets']);
        });

        it('says how many sheets it is publishing', async () => {
            withSheets(SHEETS);

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'sheet-publish',
                message: 'Publishing the sheets: 2 sheets',
                subMessage: 'test-owner/test-repo',
            });
        });

        it('says sheet, not sheets, when there is one', async () => {
            withSheets(['/metadata.json']);

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.find('sheet-publish', /: 1 sheet$/)?.message).toBe(
                'Publishing the sheets: 1 sheet'
            );
        });

        it('publishes nothing when the copy wrote no sheet', async () => {
            withSheets([]);

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(mockPublishSheetPaths).not.toHaveBeenCalled();
            expect(h.progress.some((p) => p.operation === 'sheet-publish')).toBe(false);
        });

        it('publishes nothing when the run was told not to publish', async () => {
            withSheets(SHEETS);

            await executeEdsPipeline({ ...h.params, skipPublish: true }, h.services, h.onProgress);

            expect(mockPublishSheetPaths).not.toHaveBeenCalled();
        });

        it('does not fail the run when the sheet publish throws', async () => {
            // The sheets are in DA.live; publishing them can be retried.
            withSheets(SHEETS);
            mockPublishSheetPaths.mockRejectedValue(new Error('publish refused'));

            const result = await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(result.success).toBe(true);
        });

        it('keeps the sheets out of the block library publish, and the library out of the sheets', async () => {
            withSheets(SHEETS);

            await executeEdsPipeline(
                { ...h.params, includeBlockLibrary: true },
                h.services,
                h.onProgress
            );

            expect(mockPublishSheetPaths.mock.calls.map((call) => call[3])).toStrictEqual([SHEETS]);
            expect(mockPublishLibraryPaths.mock.calls.map((call) => call[3])).toStrictEqual([
                ['/.da/library/blocks'],
            ]);
            expect(mockPublishSheetPaths.mock.invocationCallOrder[0]).toBeLessThan(
                mockPublishLibraryPaths.mock.invocationCallOrder[0]
            );
        });
    });
});

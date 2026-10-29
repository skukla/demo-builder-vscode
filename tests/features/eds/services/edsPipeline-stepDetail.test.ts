/**
 * EDS Pipeline: what each step reports and how it handles its own edges.
 *
 * The copy step's account-chrome overlay, the publish step's one tolerated
 * failure, the block library's comp-def read. Each of these is a decision the
 * pipeline makes on the SC's behalf and then reports; the progress payloads are
 * the only place most of them become visible. Publishing the library and the
 * sheets is in edsPipeline-stepDetail-publish.test.ts; the setup both share is in
 * edsPipeline-stepDetail.testUtils.ts.
 */

import { executeEdsPipeline, stepDetailHarness } from './edsPipeline-stepDetail.testUtils';
import { DaLiveError } from '@/features/eds/services/types';
import { createPatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { EdsPipelineParams } from '@/features/eds/services/edsPipeline';

describe('executeEdsPipeline - step detail', () => {
    const h = stepDetailHarness();

    describe('copying content', () => {
        it('names the source it is copying from', async () => {
            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress[0]).toEqual({
                operation: 'content-copy',
                message: 'Copying the content',
                subMessage: 'From src-org/src-site',
            });
        });

        it('passes the copier own status line through when it has one', async () => {
            h.mockCopyContentFromSource.mockImplementation(
                async (
                    _src: unknown,
                    _org: string,
                    _site: string,
                    report: (p: Record<string, unknown>) => void
                ) => {
                    report({
                        message: 'Retrying /products/shoes',
                        processed: 3,
                        total: 10,
                        percentage: 30,
                        currentFile: '/products/shoes',
                    });
                    return {
                        success: true,
                        totalFiles: 10,
                        copiedFiles: [],
                        failedFiles: [],
                        sheetPaths: [],
                        codePathsOnSource: [],
                    };
                }
            );

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'content-copy',
                message: 'Retrying /products/shoes',
                subMessage: '/products/shoes',
                current: 3,
                total: 10,
                percentage: 30,
            });
        });

        it('counts the files itself when the copier says nothing', async () => {
            h.mockCopyContentFromSource.mockImplementation(
                async (
                    _src: unknown,
                    _org: string,
                    _site: string,
                    report: (p: Record<string, unknown>) => void
                ) => {
                    report({ processed: 3, total: 10 });
                    return {
                        success: true,
                        totalFiles: 10,
                        copiedFiles: [],
                        failedFiles: [],
                        sheetPaths: [],
                        codePathsOnSource: [],
                    };
                }
            );

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.find('content-copy', /: 3 of/)?.message).toBe(
                'Copying the content: 3 of 10 files'
            );
        });

        it('says how many files it copied when it is done', async () => {
            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'content-copy',
                message: 'Copying the content: 42 files copied',
            });
        });

        it('runs with no progress callback at all', async () => {
            // Including while the copier is reporting file-by-file — the reset
            // flow calls the pipeline without a callback.
            h.mockCopyContentFromSource.mockImplementation(
                async (
                    _src: unknown,
                    _org: string,
                    _site: string,
                    report: (p: Record<string, unknown>) => void
                ) => {
                    report({ processed: 1, total: 2 });
                    return {
                        success: true,
                        totalFiles: 2,
                        copiedFiles: [],
                        failedFiles: [],
                        sheetPaths: [],
                        codePathsOnSource: [],
                    };
                }
            );

            const result = await executeEdsPipeline(h.params, h.services);

            expect(result.success).toBe(true);
        });
    });

    // =========================================================================
    // The account-chrome overlay
    // =========================================================================

    describe('the account-chrome overlay', () => {
        const hybrid = () => ({
            ...h.params,
            accountContentSource: { org: 'b2b-org', site: 'b2b-site' },
        });

        it('overlays the account pages on top of the brand content', async () => {
            await executeEdsPipeline(hybrid(), h.services, h.onProgress);

            expect(h.mockOverlayAccountChrome).toHaveBeenCalledWith(
                { org: 'b2b-org', site: 'b2b-site' },
                'test-org',
                'test-site',
                expect.anything()
            );
        });

        it('counts the overlaid files alongside the copied ones', async () => {
            const result = await executeEdsPipeline(hybrid(), h.services, h.onProgress);

            expect(result.contentFilesCopied).toBe(50);
        });

        it('does not overlay anything for a brand-only package', async () => {
            const result = await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.mockOverlayAccountChrome).not.toHaveBeenCalled();
            expect(result.contentFilesCopied).toBe(42);
        });

        it('tells the completeness audit the account pages arrive later', async () => {
            // The brand source has no /customer/* pages by design when an
            // overlay is configured. Without this the audit reports a gap this
            // same run then fills.
            const result = await executeEdsPipeline(hybrid(), h.services, h.onProgress);

            expect(result.patchReport?.deferredReferencePrefixes).toEqual(['/customer/']);
        });

        it('keeps prefixes an earlier phase already deferred', async () => {
            const patchReport = createPatchReport();
            patchReport.deferredReferencePrefixes = ['/earlier/'];

            const result = await executeEdsPipeline(
                { ...hybrid(), patchReport },
                h.services,
                h.onProgress
            );

            expect(result.patchReport?.deferredReferencePrefixes).toEqual([
                '/earlier/',
                '/customer/',
            ]);
        });

        it('defers nothing for a brand-only package', async () => {
            const result = await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(result.patchReport?.deferredReferencePrefixes).toBeUndefined();
        });
    });

    // =========================================================================
    // Publishing content
    // =========================================================================

    // =========================================================================
    // The jobs between the copy and the publish, by their one name
    // =========================================================================

    describe('the jobs named once for every flow', () => {
        it('applies the DA.live settings under that name', async () => {
            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'eds-settings',
                message: 'Applying DA.live settings',
            });
        });

        it('clears the cache under that name', async () => {
            await executeEdsPipeline({ ...h.params, purgeCache: true }, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'cache-purge',
                message: 'Clearing the cache',
            });
        });

        it('starts publishing the pages under that name', async () => {
            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'content-publish',
                message: 'Publishing the pages',
                subMessage: 'test-owner/test-repo',
            });
        });
    });

    describe('publishing content to the CDN', () => {
        it('falls back to the repo when the bulk job does not say which page', async () => {
            // The job reports counts but usually not a path; a blank detail row
            // under a counting title reads as a stall.
            h.mockPublishAllSiteContent.mockImplementation(
                async (
                    _repo: string,
                    _branch: string,
                    _org: string,
                    _site: string,
                    report: (i: Record<string, unknown>) => void
                ) => {
                    report({ message: 'Publishing 10 of 40', current: 10, total: 40 });
                }
            );

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'content-publish',
                message: 'Publishing 10 of 40',
                subMessage: 'test-owner/test-repo',
                current: 10,
                total: 40,
            });
        });

        it('names the page when the job does say', async () => {
            h.mockPublishAllSiteContent.mockImplementation(
                async (
                    _repo: string,
                    _branch: string,
                    _org: string,
                    _site: string,
                    report: (i: Record<string, unknown>) => void
                ) => {
                    report({ message: 'Publishing', currentPath: '/products/shoes' });
                }
            );

            await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(h.find('content-publish', /^Publishing$/)?.subMessage).toBe('/products/shoes');
        });

        it('reports the bulk job with no progress callback at all', async () => {
            h.mockPublishAllSiteContent.mockImplementation(
                async (
                    _repo: string,
                    _branch: string,
                    _org: string,
                    _site: string,
                    report: (i: Record<string, unknown>) => void
                ) => {
                    report({ message: 'Publishing 1 of 2', current: 1, total: 2 });
                }
            );

            const result = await executeEdsPipeline(h.params, h.services);

            expect(result.success).toBe(true);
        });

        it('treats having nothing to publish as a finished run', async () => {
            // A Custom package with no content source reaches the publish step
            // with an empty site. That is not a failure.
            h.mockPublishAllSiteContent.mockRejectedValue(
                new Error('No publishable pages found for site')
            );

            const result = await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(result.success).toBe(true);
        });

        it('fails the run on any other publish error', async () => {
            h.mockPublishAllSiteContent.mockRejectedValue(new Error('admin.hlx.page returned 401'));

            const result = await executeEdsPipeline(h.params, h.services, h.onProgress);

            expect(result.success).toBe(false);
            expect(result.error).toBe('admin.hlx.page returned 401');
        });
    });

    // =========================================================================
    // The block library
    // =========================================================================

    describe('the block library', () => {
        const withLibrary = (over: Partial<EdsPipelineParams> = {}) => ({
            ...h.params,
            skipContent: true,
            includeBlockLibrary: true,
            ...over,
        });

        it('reads the component definition through the GitHub file operations', async () => {
            // The reader is handed in as a callback; if it stops delegating, the
            // library builds from nothing and every block silently disappears.
            await executeEdsPipeline(withLibrary(), h.services, h.onProgress);

            const readFile = h.mockCreateBlockLibrary.mock.calls[0]?.[4] as (
                owner: string,
                repo: string,
                path: string
            ) => Promise<unknown>;
            const answer = await readFile('an-owner', 'a-repo', 'component-definition.json');

            expect(h.mockGetFileContent).toHaveBeenCalledWith(
                'an-owner',
                'a-repo',
                'component-definition.json'
            );
            expect(answer).toEqual({ content: '{}', sha: 'abc' });
        });

        it('says it is configuring the library before it starts', async () => {
            await executeEdsPipeline(withLibrary(), h.services, h.onProgress);

            // The second line names the storefront it is building into: the
            // step had no second line at all until 2026-09-20.
            expect(h.progress).toContainEqual({
                operation: 'block-library',
                message: 'Building block library',
                subMessage: 'test-org/test-site',
            });
        });

        it('says how many blocks it configured', async () => {
            await executeEdsPipeline(withLibrary(), h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'block-library',
                message: 'Building block library: 5 blocks',
            });
        });

        it('stays quiet when the library came back empty', async () => {
            // The control for the message above — and an empty library is worth
            // NOT announcing as a success.
            h.mockCreateBlockLibrary.mockResolvedValue({
                success: true,
                blocksCount: 0,
                paths: [],
            });

            await executeEdsPipeline(withLibrary(), h.services, h.onProgress);

            expect(h.find('block-library', /: \d+ blocks$/)).toBeUndefined();
        });

        // EDS-38: the palette lists blocks only through the site config, so a library whose
        // registration failed is said out loud where the SC is looking.
        it('warns that the palette will be empty when the library could not be registered', async () => {
            h.mockCreateBlockLibrary.mockResolvedValue({
                success: false,
                blocksCount: 5,
                paths: [],
                error: 'The block palette in DA.live will be empty: the site configuration did not take the Blocks list (config 403).',
            });

            const result = await executeEdsPipeline(withLibrary(), h.services, h.onProgress);

            expect(h.progress).toContainEqual({
                operation: 'block-library',
                message:
                    '⚠️ The block palette in DA.live will be empty: the site configuration did not take the Blocks list (config 403).',
            });
            // And on the list the completion card and the reset's warnings read (EDS-55).
            expect(result.warnings).toEqual([
                'The block palette in DA.live will be empty: the site configuration did not take the Blocks list (config 403).',
            ]);
        });

        it('tolerates a source org the SC has no DA.live access to', async () => {
            // 403 means someone else owns the library org; the CDN fallback
            // inside the library build handles it.
            h.mockCopyContent.mockRejectedValue(new DaLiveError('Forbidden', 'FORBIDDEN', 403));

            const result = await executeEdsPipeline(
                withLibrary({ libraryContentSources: [{ org: 'other-org', site: 'blocks' }] }),
                h.services,
                h.onProgress
            );

            expect(result.success).toBe(true);
            expect(h.mockCreateBlockLibrary).toHaveBeenCalled();
        });

        it('fails the run on a DA.live error that is not a permission one', async () => {
            h.mockCopyContent.mockRejectedValue(
                new DaLiveError('Gateway timeout', 'GATEWAY_TIMEOUT', 504)
            );

            const result = await executeEdsPipeline(
                withLibrary({ libraryContentSources: [{ org: 'other-org', site: 'blocks' }] }),
                h.services,
                h.onProgress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Gateway timeout');
        });

        it('fails the run on an error that is not a DA.live error at all', async () => {
            h.mockCopyContent.mockRejectedValue(new Error('socket hang up'));

            const result = await executeEdsPipeline(
                withLibrary({ libraryContentSources: [{ org: 'other-org', site: 'blocks' }] }),
                h.services,
                h.onProgress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('socket hang up');
        });
    });

    // =========================================================================
    // Publishing the library
    // =========================================================================
});

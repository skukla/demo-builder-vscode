/**
 * EDS Pipeline — what each step reports and how it handles its own edges.
 *
 * The copy step's account-chrome overlay, the publish step's one tolerated
 * failure, the block library's comp-def read, and the library publish's
 * verify-after-write. Each of these is a decision the pipeline makes on the
 * SC's behalf and then reports; the progress payloads are the only place most
 * of them become visible.
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import {
    basePipelineParams,
    executeEdsPipeline,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';
import { DaLiveError } from '@/features/eds/services/types';
import { createPatchReport } from '@/features/eds/services/patches/patchReportHelper';

const mockPublishLibraryPaths = jest.fn().mockResolvedValue(undefined);
const mockVerifyLibraryPreviewed = jest.fn().mockResolvedValue(true);
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn().mockResolvedValue(undefined),
    publishLibraryPaths: (...args: unknown[]) => mockPublishLibraryPaths(...args),
    verifyLibraryPreviewed: (...args: unknown[]) => mockVerifyLibraryPreviewed(...args),
}));

type ProgressCall = {
    operation: string;
    message: string;
    subMessage?: string;
    current?: number;
    total?: number;
    percentage?: number;
};

const CONTENT_SOURCE = { org: 'src-org', site: 'src-site' };

describe('executeEdsPipeline - step detail', () => {
    let mockCopyContentFromSource: jest.Mock;
    let mockOverlayAccountChrome: jest.Mock;
    let mockCreateBlockLibrary: jest.Mock;
    let mockCopyContent: jest.Mock;
    let mockReadSiteConfig: jest.Mock;
    let mockPublishAllSiteContent: jest.Mock;
    let mockGetFileContent: jest.Mock;
    let services: EdsPipelineServices;
    let params: EdsPipelineParams;
    let progress: ProgressCall[];
    let onProgress: (info: ProgressCall) => void;

    beforeEach(() => {
        jest.clearAllMocks();
        progress = [];
        onProgress = (info) => progress.push(info);
        mockVerifyLibraryPreviewed.mockResolvedValue(true);

        mockCopyContentFromSource = jest.fn().mockResolvedValue({
            success: true,
            totalFiles: 42,
            copiedFiles: ['/page'],
            failedFiles: [],
        });
        mockOverlayAccountChrome = jest.fn().mockResolvedValue({ totalFiles: 8 });
        mockCreateBlockLibrary = jest
            .fn()
            .mockResolvedValue({ success: true, blocksCount: 5, paths: ['/.da/library/blocks'] });
        mockCopyContent = jest.fn().mockResolvedValue({ success: true });
        mockReadSiteConfig = jest.fn().mockResolvedValue({ some: 'config' });
        mockPublishAllSiteContent = jest.fn().mockResolvedValue(undefined);
        mockGetFileContent = jest.fn().mockResolvedValue({ content: '{}', sha: 'abc' });

        services = pipelineServices({
            daLiveContentOps: {
                copyContentFromSource: mockCopyContentFromSource,
                overlayAccountChrome: mockOverlayAccountChrome,
                createBlockLibraryFromTemplate: mockCreateBlockLibrary,
                copyContent: mockCopyContent,
                readSiteConfigForDiagnostics: mockReadSiteConfig,
                deleteAllSiteContent: jest.fn(),
            },
            githubFileOps: { getFileContent: mockGetFileContent },
            helixService: {
                purgeCacheAll: jest.fn().mockResolvedValue(undefined),
                publishAllSiteContent: mockPublishAllSiteContent,
            } as unknown as EdsPipelineServices['helixService'],
            logger: createMockLogger(),
        });

        params = { ...basePipelineParams(), contentSource: CONTENT_SOURCE };
    });

    const find = (operation: string, match: RegExp) =>
        progress.find((p) => p.operation === operation && match.test(p.message));

    // =========================================================================
    // Copying content
    // =========================================================================

    describe('copying content', () => {
        it('names the source it is copying from', async () => {
            await executeEdsPipeline(params, services, onProgress);

            expect(progress[0]).toEqual({
                operation: 'content-copy',
                message: 'Populating DA.live content...',
                subMessage: 'from src-org/src-site',
            });
        });

        it('passes the copier own status line through when it has one', async () => {
            mockCopyContentFromSource.mockImplementation(
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
                    return { success: true, totalFiles: 10, copiedFiles: [], failedFiles: [] };
                }
            );

            await executeEdsPipeline(params, services, onProgress);

            expect(progress).toContainEqual({
                operation: 'content-copy',
                message: 'Retrying /products/shoes',
                subMessage: '/products/shoes',
                current: 3,
                total: 10,
                percentage: 30,
            });
        });

        it('counts the files itself when the copier says nothing', async () => {
            mockCopyContentFromSource.mockImplementation(
                async (
                    _src: unknown,
                    _org: string,
                    _site: string,
                    report: (p: Record<string, unknown>) => void
                ) => {
                    report({ processed: 3, total: 10 });
                    return { success: true, totalFiles: 10, copiedFiles: [], failedFiles: [] };
                }
            );

            await executeEdsPipeline(params, services, onProgress);

            expect(find('content-copy', /Copying content/)?.message).toBe('Copying content (3/10)');
        });

        it('says the content is populated when it is', async () => {
            await executeEdsPipeline(params, services, onProgress);

            expect(progress).toContainEqual({
                operation: 'content-copy',
                message: 'Content populated',
            });
        });

        it('runs with no progress callback at all', async () => {
            // Including while the copier is reporting file-by-file — the reset
            // flow calls the pipeline without a callback.
            mockCopyContentFromSource.mockImplementation(
                async (
                    _src: unknown,
                    _org: string,
                    _site: string,
                    report: (p: Record<string, unknown>) => void
                ) => {
                    report({ processed: 1, total: 2 });
                    return { success: true, totalFiles: 2, copiedFiles: [], failedFiles: [] };
                }
            );

            const result = await executeEdsPipeline(params, services);

            expect(result.success).toBe(true);
        });
    });

    // =========================================================================
    // The account-chrome overlay
    // =========================================================================

    describe('the account-chrome overlay', () => {
        const hybrid = () => ({
            ...params,
            accountContentSource: { org: 'b2b-org', site: 'b2b-site' },
        });

        it('overlays the account pages on top of the brand content', async () => {
            await executeEdsPipeline(hybrid(), services, onProgress);

            expect(mockOverlayAccountChrome).toHaveBeenCalledWith(
                { org: 'b2b-org', site: 'b2b-site' },
                'test-org',
                'test-site',
                expect.anything()
            );
        });

        it('counts the overlaid files alongside the copied ones', async () => {
            const result = await executeEdsPipeline(hybrid(), services, onProgress);

            expect(result.contentFilesCopied).toBe(50);
        });

        it('does not overlay anything for a brand-only package', async () => {
            const result = await executeEdsPipeline(params, services, onProgress);

            expect(mockOverlayAccountChrome).not.toHaveBeenCalled();
            expect(result.contentFilesCopied).toBe(42);
        });

        it('tells the completeness audit the account pages arrive later', async () => {
            // The brand source has no /customer/* pages by design when an
            // overlay is configured. Without this the audit reports a gap this
            // same run then fills.
            const result = await executeEdsPipeline(hybrid(), services, onProgress);

            expect(result.patchReport?.deferredReferencePrefixes).toEqual(['/customer/']);
        });

        it('keeps prefixes an earlier phase already deferred', async () => {
            const patchReport = createPatchReport();
            patchReport.deferredReferencePrefixes = ['/earlier/'];

            const result = await executeEdsPipeline(
                { ...hybrid(), patchReport },
                services,
                onProgress
            );

            expect(result.patchReport?.deferredReferencePrefixes).toEqual([
                '/earlier/',
                '/customer/',
            ]);
        });

        it('defers nothing for a brand-only package', async () => {
            const result = await executeEdsPipeline(params, services, onProgress);

            expect(result.patchReport?.deferredReferencePrefixes).toBeUndefined();
        });
    });

    // =========================================================================
    // Publishing content
    // =========================================================================

    describe('publishing content to the CDN', () => {
        it('falls back to the repo when the bulk job does not say which page', async () => {
            // The job reports counts but usually not a path; a blank detail row
            // under a counting title reads as a stall.
            mockPublishAllSiteContent.mockImplementation(
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

            await executeEdsPipeline(params, services, onProgress);

            expect(progress).toContainEqual({
                operation: 'content-publish',
                message: 'Publishing 10 of 40',
                subMessage: 'test-owner/test-repo',
                current: 10,
                total: 40,
            });
        });

        it('names the page when the job does say', async () => {
            mockPublishAllSiteContent.mockImplementation(
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

            await executeEdsPipeline(params, services, onProgress);

            expect(find('content-publish', /^Publishing$/)?.subMessage).toBe('/products/shoes');
        });

        it('reports the bulk job with no progress callback at all', async () => {
            mockPublishAllSiteContent.mockImplementation(
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

            const result = await executeEdsPipeline(params, services);

            expect(result.success).toBe(true);
        });

        it('treats having nothing to publish as a finished run', async () => {
            // A Custom package with no content source reaches the publish step
            // with an empty site. That is not a failure.
            mockPublishAllSiteContent.mockRejectedValue(
                new Error('No publishable pages found for site')
            );

            const result = await executeEdsPipeline(params, services, onProgress);

            expect(result.success).toBe(true);
        });

        it('fails the run on any other publish error', async () => {
            mockPublishAllSiteContent.mockRejectedValue(new Error('admin.hlx.page returned 401'));

            const result = await executeEdsPipeline(params, services, onProgress);

            expect(result.success).toBe(false);
            expect(result.error).toBe('admin.hlx.page returned 401');
        });
    });

    // =========================================================================
    // The block library
    // =========================================================================

    describe('the block library', () => {
        const withLibrary = (over: Partial<EdsPipelineParams> = {}) => ({
            ...params,
            skipContent: true,
            includeBlockLibrary: true,
            ...over,
        });

        it('reads the component definition through the GitHub file operations', async () => {
            // The reader is handed in as a callback; if it stops delegating, the
            // library builds from nothing and every block silently disappears.
            await executeEdsPipeline(withLibrary(), services, onProgress);

            const readFile = mockCreateBlockLibrary.mock.calls[0]?.[4] as (
                owner: string,
                repo: string,
                path: string
            ) => Promise<unknown>;
            const answer = await readFile('an-owner', 'a-repo', 'component-definition.json');

            expect(mockGetFileContent).toHaveBeenCalledWith(
                'an-owner',
                'a-repo',
                'component-definition.json'
            );
            expect(answer).toEqual({ content: '{}', sha: 'abc' });
        });

        it('says it is configuring the library before it starts', async () => {
            await executeEdsPipeline(withLibrary(), services, onProgress);

            expect(progress).toContainEqual({
                operation: 'block-library',
                message: 'Configuring block library...',
            });
        });

        it('says how many blocks it configured', async () => {
            await executeEdsPipeline(withLibrary(), services, onProgress);

            expect(progress).toContainEqual({
                operation: 'block-library',
                message: 'Block library configured (5 blocks)',
            });
        });

        it('stays quiet when the library came back empty', async () => {
            // The control for the message above — and an empty library is worth
            // NOT announcing as a success.
            mockCreateBlockLibrary.mockResolvedValue({
                success: true,
                blocksCount: 0,
                paths: [],
            });

            await executeEdsPipeline(withLibrary(), services, onProgress);

            expect(find('block-library', /configured \(/)).toBeUndefined();
        });

        it('tolerates a source org the SC has no DA.live access to', async () => {
            // 403 means someone else owns the library org; the CDN fallback
            // inside the library build handles it.
            mockCopyContent.mockRejectedValue(new DaLiveError('Forbidden', 'FORBIDDEN', 403));

            const result = await executeEdsPipeline(
                withLibrary({ libraryContentSources: [{ org: 'other-org', site: 'blocks' }] }),
                services,
                onProgress
            );

            expect(result.success).toBe(true);
            expect(mockCreateBlockLibrary).toHaveBeenCalled();
        });

        it('fails the run on a DA.live error that is not a permission one', async () => {
            mockCopyContent.mockRejectedValue(new DaLiveError('Gateway timeout', 'GATEWAY_TIMEOUT', 504));

            const result = await executeEdsPipeline(
                withLibrary({ libraryContentSources: [{ org: 'other-org', site: 'blocks' }] }),
                services,
                onProgress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Gateway timeout');
        });

        it('fails the run on an error that is not a DA.live error at all', async () => {
            mockCopyContent.mockRejectedValue(new Error('socket hang up'));

            const result = await executeEdsPipeline(
                withLibrary({ libraryContentSources: [{ org: 'other-org', site: 'blocks' }] }),
                services,
                onProgress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('socket hang up');
        });
    });

    // =========================================================================
    // Publishing the library
    // =========================================================================

    describe('publishing the block library', () => {
        const withPaths = (paths: string[]) => {
            mockCreateBlockLibrary.mockResolvedValue({
                success: true,
                blocksCount: paths.length,
                paths,
            });
            return { ...params, skipContent: true, includeBlockLibrary: true };
        };

        it('says how many paths it is publishing', async () => {
            // A two-minute spinner with a static hint was the complaint; the
            // count and then the half tell the SC what is happening.
            await executeEdsPipeline(withPaths(['/a', '/b']), services, onProgress);

            expect(progress).toContainEqual({
                operation: 'library-publish',
                message: 'Publishing block library...',
                subMessage: 'Publishing 2 library paths...',
            });
        });

        it('says path, not paths, when there is one', async () => {
            await executeEdsPipeline(withPaths(['/a']), services, onProgress);

            expect(find('library-publish', /^Publishing block/)?.subMessage).toBe(
                'Publishing 1 library path...'
            );
        });

        it('says it is verifying before it verifies', async () => {
            await executeEdsPipeline(withPaths(['/a']), services, onProgress);

            expect(progress).toContainEqual({
                operation: 'library-publish',
                message: 'Publishing block library...',
                subMessage: 'Verifying the library previewed...',
            });
        });

        it('publishes exactly the paths the library produced', async () => {
            await executeEdsPipeline(withPaths(['/a', '/b']), services, onProgress);

            expect(mockPublishLibraryPaths).toHaveBeenCalledWith(
                services.helixService,
                'test-owner',
                'test-repo',
                ['/a', '/b'],
                services.logger
            );
        });

        it('reads the site config when the library did not preview', async () => {
            // The bulk job reports success for paths that matched nothing, so a
            // library that cannot preview a single block still logs "published".
            // The site config is the state nobody can inspect afterwards.
            mockVerifyLibraryPreviewed.mockResolvedValue(false);

            await executeEdsPipeline(withPaths(['/a']), services, onProgress);

            expect(mockReadSiteConfig).toHaveBeenCalledWith('test-org', 'test-site');
        });

        it('does not go looking for a cause when it previewed', async () => {
            await executeEdsPipeline(withPaths(['/a']), services, onProgress);

            expect(mockReadSiteConfig).not.toHaveBeenCalled();
        });

        it('publishes AND verifies with no progress callback at all', async () => {
            // Both halves: the step reports between the publish and the verify,
            // and a run with no callback must still reach the verify.
            const result = await executeEdsPipeline(withPaths(['/a']), services);

            expect(result.success).toBe(true);
            expect(mockPublishLibraryPaths).toHaveBeenCalled();
            expect(mockVerifyLibraryPreviewed).toHaveBeenCalled();
        });

        it('does not fail the run when the library publish throws', async () => {
            // The library config exists; publishing it can be retried.
            mockPublishLibraryPaths.mockRejectedValue(new Error('publish refused'));

            const result = await executeEdsPipeline(withPaths(['/a']), services, onProgress);

            expect(result.success).toBe(true);
            expect(result.libraryPaths).toEqual(['/a']);
        });
    });
});

/**
 * Unit tests for edsContentSetup — ensureEdsContent()
 *
 * Verifies the full DA.live setup flow for imported projects:
 * content copy, permissions, block library, EDS settings, cache purge, CDN publish.
 */

// The harness owns the mocks and the SUT import, so it is imported first (see its header).
import {
    ensureEdsContent,
    helixSeam,
    makeConfig,
    makeDeps,
    mockApplyDaLiveOrgConfigSettings,
    mockConfigureDaLivePermissions,
    mockCopyContentFromSource,
    mockFetch,
    mockGetAccessToken,
    mockGetUserEmail,
    mockOverlayAccountChrome,
    mockPublishAllSiteContent,
    mockPublishLibraryPaths,
    mockPublishSheetPaths,
    mockPurgeCacheAll,
    mockReadCodePaths,
    mockWriteStorefrontBlockLibrary,
    setupDefaultMocks,
} from './edsContentSetup.testUtils';
import * as vscode from 'vscode';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { STOREFRONT_JOBS } from '@/core/utils/storefrontJobs';
import type { PatchReport } from '@/features/eds/services/patches/patchReportHelper';
import { DaLiveAuthError } from '@/features/eds/services/types';

describe('ensureEdsContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDefaultMocks();
    });

    it('returns false when content already exists (HEAD 200)', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200 });

        const result = await ensureEdsContent(makeConfig(), makeDeps());

        expect(result).toBe(false);
        expect(mockCopyContentFromSource).not.toHaveBeenCalled();
        expect(mockConfigureDaLivePermissions).not.toHaveBeenCalled();
    });

    // ADR-006 D1: the import/recovery path threads a PatchReport through the
    // content copy so unapplied content patches surface in the same toast as
    // unapplied code patches do on create/reset.

    it('threads a PatchReport into copyContentFromSource (7th arg)', async () => {
        await ensureEdsContent(makeConfig(), makeDeps());

        const args = mockCopyContentFromSource.mock.calls[0];
        // 7th positional arg = patchReport. Empty report shape: { results: [] }
        expect(args[6]).toEqual(expect.objectContaining({ results: expect.any(Array) }));
    });

    // EDS-40: the copy used the fixed lists only, so pages a demo's code loads were dropped.
    it("hands the copy the paths the SC's storefront code loads (9th arg)", async () => {
        mockReadCodePaths.mockResolvedValue(['/cart', '/placeholders/b2b']);

        await ensureEdsContent(makeConfig(), makeDeps());

        expect(mockReadCodePaths).toHaveBeenCalledWith({ owner: 'test-owner', repo: 'test-repo' });
        expect(mockCopyContentFromSource.mock.calls[0][8]).toEqual(['/cart', '/placeholders/b2b']);
    });

    // EDS-54: the permissions step is non-fatal, except for an expired sign-in.
    it('stops on an expired DA.live sign-in in the permissions step', async () => {
        mockConfigureDaLivePermissions.mockRejectedValue(new DaLiveAuthError('Authentication expired. Please log in again.'));

        await expect(ensureEdsContent(makeConfig(), makeDeps())).rejects.toBeInstanceOf(DaLiveAuthError);
    });

    it('does NOT fire the warning toast when no content patches failed', async () => {
        await ensureEdsContent(makeConfig(), makeDeps());

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('fires the warning toast when an unapplied content patch lands in the report', async () => {
        // Simulate copyContentFromSource recording an unapplied content-patch
        // result by mutating the patchReport arg before resolving.
        mockCopyContentFromSource.mockImplementation(
            async (
                _src: unknown,
                _destOrg: unknown,
                _destSite: unknown,
                _progress: unknown,
                _ids: unknown,
                _source: unknown,
                patchReport: PatchReport | undefined
            ) => {
                patchReport?.results.push({
                    kind: 'content',
                    patchId: 'index-product-teaser-sku',
                    target: '/',
                    applied: false,
                    reason: 'Search pattern not found in content',
                });
                return { success: true, totalFiles: 5, failedFiles: [], sheetPaths: [] };
            }
        );

        await ensureEdsContent(makeConfig(), makeDeps());

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        const msg = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0][0] as string;
        expect(msg).toContain('index-product-teaser-sku');
    });

    it('copies content and runs all operations when content is missing', async () => {
        const result = await ensureEdsContent(makeConfig(), makeDeps());

        expect(result).toBe(true);
        expect(mockCopyContentFromSource).toHaveBeenCalledTimes(1);
        expect(mockConfigureDaLivePermissions).toHaveBeenCalledTimes(1);
        expect(mockWriteStorefrontBlockLibrary).toHaveBeenCalledTimes(1);
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledTimes(1);
        expect(mockPurgeCacheAll).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
        expect(mockPublishAllSiteContent).toHaveBeenCalledWith(
            'test-owner/test-repo',
            'main',
            'test-org',
            'test-site',
            expect.any(Function)
        );
        expect(mockPublishLibraryPaths).toHaveBeenCalledTimes(1);
    });

    it('runs the caller hook after the copy and before the publish; a failing hook stops nothing (EDS-61)', async () => {
        const hook = jest.fn().mockRejectedValue(new Error('DA.live 503'));
        await ensureEdsContent(makeConfig(), { ...makeDeps(), beforeContentPublish: hook });
        const at = hook.mock.invocationCallOrder[0];
        expect(mockCopyContentFromSource.mock.invocationCallOrder[0]).toBeLessThan(at);
        expect(at).toBeLessThan(mockPublishAllSiteContent.mock.invocationCallOrder[0]);
    });

    it('permission failure is non-fatal', async () => {
        mockConfigureDaLivePermissions.mockRejectedValue(new Error('permission denied'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Permissions setup failed')
        );
        // Remaining operations still ran
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalled();
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('block library failure is non-fatal', async () => {
        mockWriteStorefrontBlockLibrary.mockRejectedValue(new Error('lib error'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Block library setup failed')
        );
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalled();
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('EDS settings failure is non-fatal', async () => {
        mockApplyDaLiveOrgConfigSettings.mockRejectedValue(new Error('settings error'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('EDS settings failed')
        );
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('cache purge failure is non-fatal', async () => {
        mockPurgeCacheAll.mockRejectedValue(new Error('purge error'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Cache purge failed')
        );
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('skips block library publish when no library paths returned', async () => {
        mockWriteStorefrontBlockLibrary.mockResolvedValue({ success: true, blocksCount: 0, paths: [] });

        await ensureEdsContent(makeConfig(), makeDeps());

        expect(mockPublishLibraryPaths).not.toHaveBeenCalled();
    });

    it('returns false when repo URL cannot be parsed', async () => {
        const config = makeConfig({ repoUrl: 'invalid-url' });
        const deps = makeDeps();

        const result = await ensureEdsContent(config, deps);

        expect(result).toBe(false);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not parse repo URL')
        );
    });

    it('logs warning when no user email available for permissions', async () => {
        mockGetUserEmail.mockResolvedValue(null);
        const deps = makeDeps();

        await ensureEdsContent(makeConfig(), deps);

        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('No user email available')
        );
        expect(mockConfigureDaLivePermissions).not.toHaveBeenCalled();
    });
});

/**
 * WHAT THE COLLABORATORS ARE HANDED.
 *
 * The tests above drive the flow and read its return value, which a mock answers
 * identically however it is called. These assert the ARGUMENTS instead: the
 * DA.live probe, the index URL the content copy is pointed at, the progress
 * messages that reach the wizard, the overlay source, and the file-reader closure
 * the block-library builder is given. Each is a decision this function makes and
 * nothing downstream can correct.
 */
describe('ensureEdsContent — the calls it makes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDefaultMocks();
    });

    describe('the DA.live existence probe', () => {
        it('asks DA.live source for index.html with a HEAD request', async () => {
            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.da.live/source/test-org/test-site/index.html',
                expect.objectContaining({ method: 'HEAD' })
            );
        });

        it('carries the DA.live session as a Bearer token', async () => {
            // Without it the probe reads a private site as absent and re-copies
            // content over the top of content that is already there.
            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: { Authorization: 'Bearer da-live-token' },
                })
            );
        });

        it('sends no Authorization header when there is no DA.live session', async () => {
            mockGetAccessToken.mockResolvedValue(undefined);

            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ headers: {} })
            );
        });

        it('copies content anyway when the probe itself fails', async () => {
            // A network error is not evidence the content is there.
            mockFetch.mockRejectedValue(new Error('ECONNRESET'));

            const result = await ensureEdsContent(makeConfig(), makeDeps());

            expect(result).toBe(true);
            expect(mockCopyContentFromSource).toHaveBeenCalledTimes(1);
        });
    });

    describe('the content source it copies from', () => {
        it('defaults the index to /full-index.json', async () => {
            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockCopyContentFromSource.mock.calls[0][0]).toEqual({
                org: 'source-org',
                site: 'source-site',
                indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
            });
        });

        it("uses the source's own indexPath when it declares one", async () => {
            const config = makeConfig({
                contentSource: { org: 'src-o', site: 'src-s', indexPath: '/query-index.json' },
            });

            await ensureEdsContent(config, makeDeps());

            expect(mockCopyContentFromSource.mock.calls[0][0]).toEqual({
                org: 'src-o',
                site: 'src-s',
                indexUrl: 'https://main--src-s--src-o.aem.live/query-index.json',
            });
        });

        it('copies into the project DA.live org and site', async () => {
            await ensureEdsContent(makeConfig(), makeDeps());

            const [, destOrg, destSite] = mockCopyContentFromSource.mock.calls[0];
            expect(destOrg).toBe('test-org');
            expect(destSite).toBe('test-site');
        });
    });

    describe('the progress the copy reports', () => {
        /** Fire the progress callback the subject handed to copyContentFromSource. */
        const reportProgress = (progress: {
            message?: string;
            processed?: number;
            total?: number;
        }) => {
            const cb = mockCopyContentFromSource.mock.calls[0][3] as (p: unknown) => void;
            cb(progress);
        };

        it("forwards the copy's own message when it has one", async () => {
            const onProgress = jest.fn();
            await ensureEdsContent(makeConfig(), makeDeps(), onProgress);
            onProgress.mockClear();

            reportProgress({ message: 'Copying /products/index', processed: 3, total: 9 });

            expect(onProgress).toHaveBeenCalledWith(
                OPERATION_STAGES.copyingContent.label,
                'Copying /products/index'
            );
        });

        // Line 2 on its own, under "Copying the content": a phrase, not a fragment.
        it('names the source it copies from, starting with a capital', async () => {
            const onProgress = jest.fn();
            await ensureEdsContent(makeConfig(), makeDeps(), onProgress);

            expect(onProgress).toHaveBeenCalledWith(OPERATION_STAGES.copyingContent.label, 'From source-org/source-site');
        });

        it('counts files when the copy reports no message', async () => {
            const onProgress = jest.fn();
            await ensureEdsContent(makeConfig(), makeDeps(), onProgress);
            onProgress.mockClear();

            reportProgress({ processed: 3, total: 9 });

            expect(onProgress).toHaveBeenCalledWith(
                OPERATION_STAGES.copyingContent.label,
                'Copying the content: 3 of 9 files'
            );
        });

        // Reset's steps for the same work, each job on the line under its step
        // (progress vocabulary, owner 2026-10-16).
        it("reports Reset's steps in the order it runs them, each job named the one way", async () => {
            const onProgress = jest.fn();
            mockPublishAllSiteContent.mockImplementation(
                async (_r: string, _b: string, _o: string, _s: string, cb: (i: { message: string }) => void) => {
                    cb({ message: 'Publishing the pages: 5 of 64 pages' });
                }
            );

            await ensureEdsContent(makeConfig(), makeDeps(), onProgress);

            const steps = onProgress.mock.calls.map(([stage]) => stage as string);
            expect([...new Set(steps)]).toStrictEqual([
                OPERATION_STAGES.copyingContent.label,
                OPERATION_STAGES.settingUpAuthoring.label,
                OPERATION_STAGES.publishingPages.label,
            ]);
            expect(onProgress.mock.calls.map(([, step]) => step)).toEqual(
                expect.arrayContaining([
                    STOREFRONT_JOBS.settingSitePermissions,
                    STOREFRONT_JOBS.buildingBlockLibrary,
                    STOREFRONT_JOBS.applyingDaLiveSettings,
                    STOREFRONT_JOBS.clearingCache,
                    'Publishing the pages: 5 of 64 pages',
                    STOREFRONT_JOBS.publishingBlockList,
                ])
            );
        });

        it('runs to completion when the caller supplies no progress callback', async () => {
            // Every onProgress call site is optional-chained. One that is not
            // throws mid-copy on the import path, which has no callback to give.
            mockCopyContentFromSource.mockImplementation(
                async (_src, _o, _s, progress: (p: unknown) => void) => {
                    progress({ processed: 1, total: 2 });
                    return { success: true, totalFiles: 2, failedFiles: [], sheetPaths: [] };
                }
            );
            const config = makeConfig({
                accountContentSource: { org: 'b2b-org', site: 'b2b-site' },
            });

            const result = await ensureEdsContent(config, makeDeps());

            expect(result).toBe(true);
            expect(mockOverlayAccountChrome).toHaveBeenCalledTimes(1);
        });
    });

    describe('the B2B account-chrome overlay', () => {
        it('overlays the account source on top of the brand content', async () => {
            const config = makeConfig({
                accountContentSource: { org: 'b2b-org', site: 'b2b-site' },
            });

            await ensureEdsContent(config, makeDeps());

            expect(mockOverlayAccountChrome).toHaveBeenCalledWith(
                { org: 'b2b-org', site: 'b2b-site' },
                'test-org',
                'test-site',
                expect.objectContaining({ results: expect.any(Array) })
            );
        });

        it('does not overlay when the package declares no account source', async () => {
            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockOverlayAccountChrome).not.toHaveBeenCalled();
        });
    });


    it('publishes to the CDN even when the content copy reported failures', async () => {
        // A partial copy still has to reach the CDN — otherwise the pages that DID
        // copy are invisible and the SC sees an empty storefront rather than a
        // partial one.
        mockCopyContentFromSource.mockResolvedValue({
            success: false,
            totalFiles: 4,
            failedFiles: ['/products/a', '/products/b'],
            sheetPaths: [],
        });

        const result = await ensureEdsContent(makeConfig(), makeDeps());

        expect(result).toBe(true);
        expect(mockPublishAllSiteContent).toHaveBeenCalledTimes(1);
    });

    describe('the sheets the copy wrote', () => {
        // The whole-site publish skips sheets, so a copied sheet is served only
        // when it is published by path, the way the pipeline does it.
        const withSheets = (sheetPaths: string[]) =>
            mockCopyContentFromSource.mockResolvedValue({
                success: true,
                totalFiles: 3,
                failedFiles: [],
                sheetPaths,
            });

        it('publishes exactly the sheet paths the copy reported', async () => {
            withSheets(['/metadata.json', '/placeholders/cart.json']);
            const deps = makeDeps();

            await ensureEdsContent(makeConfig(), deps);

            expect(mockPublishSheetPaths).toHaveBeenCalledTimes(1);
            expect(mockPublishSheetPaths).toHaveBeenCalledWith(
                helixSeam,
                'test-owner',
                'test-repo',
                ['/metadata.json', '/placeholders/cart.json'],
                deps.logger
            );
        });

        it('publishes them after the pages', async () => {
            withSheets(['/metadata.json']);
            mockWriteStorefrontBlockLibrary.mockResolvedValue({ success: true, blocksCount: 0, paths: [] });

            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockPublishAllSiteContent.mock.invocationCallOrder[0]).toBeLessThan(
                mockPublishSheetPaths.mock.invocationCallOrder[0]
            );
            expect(mockPublishLibraryPaths).not.toHaveBeenCalled();
        });

        it('publishes nothing when the copy wrote no sheet', async () => {
            withSheets([]);

            await ensureEdsContent(makeConfig(), makeDeps());

            expect(mockPublishSheetPaths).not.toHaveBeenCalled();
        });

        it('carries on when the sheet publish throws', async () => {
            withSheets(['/metadata.json']);
            mockPublishSheetPaths.mockRejectedValue(new Error('publish refused'));

            await expect(ensureEdsContent(makeConfig(), makeDeps())).resolves.toBe(true);
        });
    });

    describe('the broken links it hands back for the Storefront Report', () => {
        it('hands the caller the links the copy recorded, exactly as recorded', async () => {
            const recorded = [{ link: '/fr', pages: ['/footer', '/nav'] }];
            mockCopyContentFromSource.mockImplementation(
                async (
                    _src: unknown,
                    _destOrg: unknown,
                    _destSite: unknown,
                    _progress: unknown,
                    _ids: unknown,
                    _source: unknown,
                    patchReport: PatchReport | undefined
                ) => {
                    if (patchReport) patchReport.brokenLinks = recorded;
                    return { success: true, totalFiles: 5, failedFiles: [], sheetPaths: [] };
                }
            );
            const onBrokenLinks = jest.fn();

            await ensureEdsContent(makeConfig(), { ...makeDeps(), onBrokenLinks });

            expect(onBrokenLinks).toHaveBeenCalledTimes(1);
            expect(onBrokenLinks).toHaveBeenCalledWith(recorded);
        });

        it('hands the caller an empty list, not nothing, when the copy recorded none', async () => {
            // The caller writes this straight onto the project; an undefined here
            // would leave a previous run's links standing in the report.
            const onBrokenLinks = jest.fn();

            await ensureEdsContent(makeConfig(), { ...makeDeps(), onBrokenLinks });

            expect(onBrokenLinks).toHaveBeenCalledTimes(1);
            expect(onBrokenLinks.mock.calls[0]).toStrictEqual([[]]);
        });
    });
});

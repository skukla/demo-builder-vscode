/**
 * Unit tests for edsContentSetup — ensureEdsContent()
 *
 * Verifies the full DA.live setup flow for imported projects:
 * content copy, permissions, block library, EDS settings, cache purge, CDN publish.
 */

import * as vscode from 'vscode';
import { ensureEdsContent } from '@/features/project-creation/services/edsContentSetup';
import type { EdsContentHelix } from '@/features/project-creation/services/edsContentSetup';
import type { PatchReport } from '@/features/eds/services/patches/patchReportHelper';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

const mockCopyContentFromSource = jest.fn();
const mockCreateBlockLibraryFromTemplate = jest.fn();
const mockOverlayAccountChrome = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        copyContentFromSource: mockCopyContentFromSource,
        createBlockLibraryFromTemplate: mockCreateBlockLibraryFromTemplate,
        overlayAccountChrome: mockOverlayAccountChrome,
    })),
    createDaLiveServiceTokenProvider: jest
        .fn()
        .mockImplementation((service: { getAccessToken: () => Promise<string> }) => ({
            getAccessToken: () => service.getAccessToken(),
        })),
}));

const mockPublishAllSiteContent = jest.fn();
const mockPurgeCacheAll = jest.fn();

const mockPreviewAndPublishPage = jest.fn();
const mockGetResourceStatus = jest.fn();

// HelixService is NOT module-mocked. It arrives through the `makeHelix` seam on
// EdsContentDeps, typed to the four calls this function makes — two of its own and
// two it forwards to the block-library helpers.
const helixSeam: EdsContentHelix = {
    publishAllSiteContent: mockPublishAllSiteContent,
    purgeCacheAll: mockPurgeCacheAll,
    previewAndPublishPage: mockPreviewAndPublishPage,
    getResourceStatus: mockGetResourceStatus,
};

jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

// The subject now asks the service cache instead of constructing its own token
// service. This delegates to the SAME mocked class above, so the suite's
// behaviour is unchanged — only the route to it is.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => {
        const { GitHubTokenService } = jest.requireMock(
            '@/features/eds/services/github/githubTokenService',
        );
        return { tokenService: new GitHubTokenService() };
    }),
}));

const mockGetUserEmail = jest.fn();
const mockGetAccessToken = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        getUserEmail: mockGetUserEmail,
        getAccessToken: mockGetAccessToken,
    })),
}));

const mockGetFileContent = jest.fn();

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: mockGetFileContent,
    })),
}));

const mockConfigureDaLivePermissions = jest.fn();
const mockApplyDaLiveOrgConfigSettings = jest.fn();
const mockPublishLibraryPaths = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: (...args: unknown[]) => mockConfigureDaLivePermissions(...args),
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    publishLibraryPaths: (...args: unknown[]) => mockPublishLibraryPaths(...args),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: mockGetAccessToken,
        getUserEmail: mockGetUserEmail,
    }),
}));

jest.mock('@/core/utils/githubUrlParser', () => ({
    parseGitHubUrl: jest.fn((url: string) => {
        if (url === 'https://github.com/test-owner/test-repo') {
            return { owner: 'test-owner', repo: 'test-repo' };
        }
        return null;
    }),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 3000 },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeConfig(overrides = {}) {
    return {
        repoUrl: 'https://github.com/test-owner/test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        contentSource: { org: 'source-org', site: 'source-site' },
        ...overrides,
    };
}

function makeDeps() {
    return {
        logger: createMockLogger(),
        secrets: createMockSecretStorage().secrets,
        extensionContext: createMockExtensionContext(),
        makeHelix: () => helixSeam,
    };
}

function setupDefaultMocks() {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    mockCopyContentFromSource.mockResolvedValue({ success: true, totalFiles: 10, failedFiles: [] });
    mockGetUserEmail.mockResolvedValue('user@example.com');
    mockConfigureDaLivePermissions.mockResolvedValue({ success: true });
    mockCreateBlockLibraryFromTemplate.mockResolvedValue({ blocksCount: 3, paths: ['/library'] });
    mockApplyDaLiveOrgConfigSettings.mockResolvedValue(undefined);
    mockPurgeCacheAll.mockResolvedValue(undefined);
    mockPreviewAndPublishPage.mockResolvedValue(undefined);
    mockGetResourceStatus.mockResolvedValue({ httpStatus: 200 });
    mockPublishAllSiteContent.mockResolvedValue(undefined);
    mockPublishLibraryPaths.mockResolvedValue(undefined);
    mockGetAccessToken.mockResolvedValue('da-live-token');
    mockOverlayAccountChrome.mockResolvedValue({ success: true, totalFiles: 4, failedFiles: [] });
}

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
                return { success: true, totalFiles: 5, failedFiles: [] };
            }
        );

        await ensureEdsContent(makeConfig(), makeDeps());

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        const msg = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0][0] as string;
        expect(msg).toContain('index-product-teaser-sku');
    });

    it('copies content and runs all operations when content is missing', async () => {
        const config = makeConfig({
            templateOwner: 'tmpl-owner',
            templateRepo: 'tmpl-repo',
        });

        const result = await ensureEdsContent(config, makeDeps());

        expect(result).toBe(true);
        expect(mockCopyContentFromSource).toHaveBeenCalledTimes(1);
        expect(mockConfigureDaLivePermissions).toHaveBeenCalledTimes(1);
        expect(mockCreateBlockLibraryFromTemplate).toHaveBeenCalledTimes(1);
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledTimes(1);
        expect(mockPurgeCacheAll).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
        expect(mockPublishAllSiteContent).toHaveBeenCalledWith(
            'test-owner/test-repo',
            'main',
            'test-org',
            'test-site'
        );
        expect(mockPublishLibraryPaths).toHaveBeenCalledTimes(1);
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
        mockCreateBlockLibraryFromTemplate.mockRejectedValue(new Error('lib error'));
        const deps = makeDeps();
        const config = makeConfig({ templateOwner: 'o', templateRepo: 'r' });

        const result = await ensureEdsContent(config, deps);

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

    it('skips block library when templateOwner/templateRepo missing', async () => {
        const config = makeConfig(); // no templateOwner/templateRepo

        const result = await ensureEdsContent(config, makeDeps());

        expect(result).toBe(true);
        expect(mockCreateBlockLibraryFromTemplate).not.toHaveBeenCalled();
        expect(mockPublishLibraryPaths).not.toHaveBeenCalled();
    });

    it('skips block library publish when no library paths returned', async () => {
        mockCreateBlockLibraryFromTemplate.mockResolvedValue({ blocksCount: 0, paths: [] });
        const config = makeConfig({ templateOwner: 'o', templateRepo: 'r' });

        await ensureEdsContent(config, makeDeps());

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
                'Setting up storefront content...',
                'Copying /products/index'
            );
        });

        it('counts pages when the copy reports no message', async () => {
            const onProgress = jest.fn();
            await ensureEdsContent(makeConfig(), makeDeps(), onProgress);
            onProgress.mockClear();

            reportProgress({ processed: 3, total: 9 });

            expect(onProgress).toHaveBeenCalledWith(
                'Setting up storefront content...',
                'Copying content (3/9)'
            );
        });

        it('runs to completion when the caller supplies no progress callback', async () => {
            // Every onProgress call site is optional-chained. One that is not
            // throws mid-copy on the import path, which has no callback to give.
            mockCopyContentFromSource.mockImplementation(
                async (_src, _o, _s, progress: (p: unknown) => void) => {
                    progress({ processed: 1, total: 2 });
                    return { success: true, totalFiles: 2, failedFiles: [] };
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

    describe('the block library from the template', () => {
        it('needs BOTH the template owner and the template repo', async () => {
            // Either alone cannot address a repository; running with half of one
            // asks GitHub for `undefined/tmpl-repo`.
            await ensureEdsContent(makeConfig({ templateOwner: 'tmpl-owner' }), makeDeps());
            await ensureEdsContent(makeConfig({ templateRepo: 'tmpl-repo' }), makeDeps());

            expect(mockCreateBlockLibraryFromTemplate).not.toHaveBeenCalled();
        });

        it('addresses the template repo it was given', async () => {
            const config = makeConfig({ templateOwner: 'tmpl-owner', templateRepo: 'tmpl-repo' });

            await ensureEdsContent(config, makeDeps());

            const [org, site, owner, repo] = mockCreateBlockLibraryFromTemplate.mock.calls[0];
            expect([org, site, owner, repo]).toEqual([
                'test-org',
                'test-site',
                'tmpl-owner',
                'tmpl-repo',
            ]);
        });

        it('hands the builder a reader that fetches from GitHub', async () => {
            const config = makeConfig({ templateOwner: 'tmpl-owner', templateRepo: 'tmpl-repo' });
            await ensureEdsContent(config, makeDeps());

            const readFile = mockCreateBlockLibraryFromTemplate.mock.calls[0][4] as (
                owner: string,
                repo: string,
                path: string
            ) => Promise<unknown>;
            await readFile('tmpl-owner', 'tmpl-repo', 'component-definition.json');

            // A closure that resolves to undefined leaves the builder reporting
            // "no component-definition.json" for every template that has one.
            expect(mockGetFileContent).toHaveBeenCalledWith(
                'tmpl-owner',
                'tmpl-repo',
                'component-definition.json'
            );
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
        });

        const result = await ensureEdsContent(makeConfig(), makeDeps());

        expect(result).toBe(true);
        expect(mockPublishAllSiteContent).toHaveBeenCalledTimes(1);
    });
});

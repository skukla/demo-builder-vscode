/**
 * What a delete removes ONLINE (`edsExternalCleanup.ts`): the CDN unpublish, the
 * DA.live site and its org config, and the GitHub repository, each with its own
 * sign-in check.
 *
 * Driven through the answered delete the batch runs (`deleteAnswered`, over
 * `runProjectDelete`), because the module wall in `projectDeletionService.testUtils`
 * is the one place these collaborators are faked. Which of these run is the SC's
 * ticked answer; the local removal is the orchestrator's, in
 * `projectDeletionService.test.ts`. Same rule in both: every assertion reads the arguments a collaborator received or
 * the `cleanupResults` the service reports, never a value a mock handed back.
 */

import {
    mockCheckLiveStatus,
    mockDaLiveAccessToken,
    mockDefaultDeleteAdminApiKey,
    mockDefaultListAllPages,
    mockDefaultListPublishedPaths,
    mockDefaultUnpublishPages,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockDeleteDaLiveSite,
    mockEnsureDaLiveAuth,
    mockGetSession,
    mockGetToken,
    mockHelixInitKeyStore,
    mockListRepoFiles,
    mockRemoveSitePermissions,
    mockRm,
    mockShowWarningMessage,
    mockSleep,
    mockStoreToken,
} from './projectDeletionService.testUtils';
import {
    SERVICES,
    context,
    deleteAnswered,
    edsProject,
    mockDeleteAdminApiKey,
    mockCheckDaLiveSignIn,
    mockDeleteCode,
    mockListAllPages,
    mockListPublishedPaths,
    mockStageReport,
    mockUnpublishPages,
} from './projectDeletionService.fixtures';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';

/** The cleanup ledger the delete reports back. */
function resultsOf(result: { cleanupResults: CleanupResultItem[] }): CleanupResultItem[] {
    return result.cleanupResults;
}

const of = (results: CleanupResultItem[], type: string) => results.filter((r) => r.type === type);

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockSleep.mockResolvedValue(undefined);
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockDeleteDaLiveSite.mockResolvedValue({ success: true });
    mockGetToken.mockResolvedValue('gh-token');
    mockDeleteRepository.mockResolvedValue(undefined);
    mockRemoveSitePermissions.mockResolvedValue({ success: true });
    mockDeleteSiteConfig.mockResolvedValue({ success: true });
    mockListAllPages.mockResolvedValue(['/index', '/products']);
    mockUnpublishPages.mockResolvedValue({
        success: true,
        count: 2,
        total: 2,
        liveFailed: 0,
        previewFailed: 0,
    });
    mockDeleteAdminApiKey.mockResolvedValue({ success: true });
    mockListPublishedPaths.mockResolvedValue([]);
    mockDefaultListPublishedPaths.mockResolvedValue([]);
    mockDefaultListAllPages.mockResolvedValue([]);
    mockDefaultUnpublishPages.mockResolvedValue({
        success: true,
        count: 0,
        total: 0,
        liveFailed: 0,
        previewFailed: 0,
    });
    mockDefaultDeleteAdminApiKey.mockResolvedValue({ success: true });
    mockHelixInitKeyStore.mockResolvedValue(undefined);
    mockCheckLiveStatus.mockImplementation(async () => 404);
    mockListRepoFiles.mockResolvedValue([{ path: 'scripts/aem.js' }, { path: 'head.html' }]);
    mockDeleteCode.mockResolvedValue(undefined);
    mockCheckDaLiveSignIn.mockResolvedValue('valid');
    mockDaLiveAccessToken.mockResolvedValue('token');
});

describe('the CDN unpublish step', () => {
    it('skips entirely when the project has no GitHub repo to address the CDN by', async () => {
        const project = edsProject();
        delete metadataOf(project).githubRepo;

        await deleteAnswered(context(), project, SERVICES, ['daLive']);

        // The DA.live content still goes; only the CDN step has no address.
        expect(mockListAllPages).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('skips when the stored repo is not an owner/repo pair', async () => {
        const project = edsProject();
        metadataOf(project).githubRepo = 'no-slash-here';

        await deleteAnswered(context(), project, SERVICES, ['daLive']);

        expect(mockListAllPages).not.toHaveBeenCalled();
    });

    it('records a helix result only when pages were actually unpublished', async () => {
        mockUnpublishPages.mockResolvedValue({
            success: true, count: 0, total: 0, liveFailed: 0, previewFailed: 0,
        });

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        // Nothing was published, so there is nothing to report as cleaned up.
        expect(of(resultsOf(result), 'helix')).toStrictEqual([]);
    });

    // EDS-33: a site whose pages may still be live is shown as such, never left out.
    // EDS-65: and the delete stops there. The repository and the project are how a
    // second try takes the pages down, so neither goes while the pages are live.
    it('records a failed helix result, with the sentence, and keeps everything else when pages are still live', async () => {
        mockUnpublishPages.mockResolvedValue({
            success: false, count: 0, total: 2, liveFailed: 2, previewFailed: 0,
        });

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive', 'github']);

        expect(of(resultsOf(result), 'helix')).toStrictEqual([
            {
                type: 'helix',
                name: 'skukla/demo-storefront',
                success: false,
                error: '2 of 2 pages could not be taken off main--demo-storefront--skukla.aem.live and may still be live.',
            },
        ]);
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockRm).not.toHaveBeenCalled();
        expect(result.stopped).toBe(
            'The pages could not be taken off the live site, so nothing else was deleted. ' +
                'Sign in to DA.live again, then try again.',
        );
    });

    it('records the repo as cleaned when pages were unpublished', async () => {
        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'helix')).toEqual([
            { type: 'helix', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    // EDS-33, measured 2026-10-09: the DA.live content was already gone, so the delete
    // listed nothing to unpublish and the site's pages stayed live.
    it('unpublishes what Helix lists when DA.live lists nothing, and checks the live host', async () => {
        mockListAllPages.mockResolvedValue([]);
        mockListPublishedPaths.mockImplementation(async (_o: string, _s: string, _b: string, pattern: string) =>
            pattern === '/*' ? ['/', '/about'] : [],
        );

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(mockListPublishedPaths).toHaveBeenCalledWith('skukla', 'demo-storefront', 'main', '/*');
        expect(mockUnpublishPages).toHaveBeenNthCalledWith(1, 'skukla', 'demo-storefront', 'main', ['/', '/about']);
        expect(mockCheckLiveStatus).toHaveBeenCalledWith('https://main--demo-storefront--skukla.aem.live/');
        expect(of(resultsOf(result), 'helix')).toEqual([
            { type: 'helix', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    it('records a failed helix result when a page still answers after the unpublish', async () => {
        mockCheckLiveStatus.mockImplementation(async (url: string) =>
            url === 'https://main--demo-storefront--skukla.aem.live/' ? 200 : 404,
        );

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'helix')).toEqual([
            expect.objectContaining({
                type: 'helix',
                name: 'skukla/demo-storefront',
                success: false,
                error: expect.stringContaining('still answer'),
            }),
        ]);
    });

    // Product pages are published through the overlay and are in no DA.live listing (EDS-26).
    it('removes the product pages Helix lists, by owner/repo, and records them as cleaned', async () => {
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100', '/products/default', '/index']);

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(mockListPublishedPaths).toHaveBeenCalledWith('skukla', 'demo-storefront', 'main', '/products/*');
        expect(mockUnpublishPages).toHaveBeenNthCalledWith(2, 'skukla', 'demo-storefront', 'main', [
            '/products/drum/dc-100',
        ]);
        expect(of(resultsOf(result), 'helix')).toContainEqual({
            type: 'helix',
            name: 'product pages, skukla/demo-storefront',
            success: true,
        });
    });

    it('names both CDN results by the repository, not the DA.live site, when the two differ', async () => {
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100']);
        const project = edsProject();
        metadataOf(project).daLiveSite = 'demo-site';

        const result = await deleteAnswered(context(), project, SERVICES, ['daLive']);

        // The CDN is addressed by owner/repo; the DA.live pair names the content.
        expect(of(resultsOf(result), 'helix')).toStrictEqual([
            { type: 'helix', name: 'product pages, skukla/demo-storefront', success: true },
            { type: 'helix', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    it('leaves the product pages, and says why, when another project publishes to the same repository', async () => {
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100']);
        const ctx = context();
        // Its own DA.live site on the shared repository: that site is offered, its product pages are not.
        const other = edsProject({ name: 'other-demo', path: '/projects/other' });
        metadataOf(other).daLiveSite = 'other-site';
        (ctx.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
            { name: 'demo-project', path: '/projects/demo', lastModified: new Date(0) },
            { name: 'other-demo', path: '/projects/other', lastModified: new Date(0) },
        ]);
        (ctx.stateManager.loadProjectFromPath as jest.Mock).mockImplementation(async (path: string) =>
            path === '/projects/other' ? other : edsProject(),
        );

        const result = await deleteAnswered(ctx, edsProject(), SERVICES, ['daLive']);

        expect(mockListPublishedPaths).not.toHaveBeenCalledWith('skukla', 'demo-storefront', 'main', '/products/*');
        expect(mockUnpublishPages).toHaveBeenCalledTimes(1);
        expect(of(resultsOf(result), 'helix')).toContainEqual({
            type: 'helix',
            name: 'product pages, skukla/demo-storefront',
            success: false,
            error:
                'Product pages were left published: the project "other-demo" also publishes to ' +
                'skukla/demo-storefront, and removing them would take its product pages down too.',
        });
    });

    it('never reports a clean result when Helix keeps the preview copies', async () => {
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100']);
        mockUnpublishPages
            .mockResolvedValueOnce({ success: true, count: 2, total: 2, liveFailed: 0, previewFailed: 0 })
            .mockResolvedValueOnce({ success: true, count: 1, total: 1, liveFailed: 0, previewFailed: 1 });

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        const row = of(resultsOf(result), 'helix').find((r) => r.name.startsWith('product pages'));
        expect(row).toMatchObject({ success: false });
        expect(row?.error).toContain('those preview copies remain');
    });

    it('falls back to the real Helix when no service seam is handed in', async () => {
        // Production passes no `services`. The default arm builds a HelixService and
        // inits its key store; nothing else in the suite exercises that branch.

        await deleteAnswered(context(), edsProject(), undefined, ['daLive']);

        expect(mockHelixInitKeyStore).toHaveBeenCalled();
        expect(mockDefaultListAllPages).toHaveBeenCalledWith('skukla', 'demo-storefront');
        // The handed-in seam must NOT have been used.
        expect(mockListAllPages).not.toHaveBeenCalled();
    });
});

describe('the DA.live site cleanup', () => {
    it("forwards the teardown's own steps to the progress surface", async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        // The site step and the file removal are two lines; anything more is the
        // shared teardown narrating its own steps (CDN, content, site settings)
        // through onStep. Without the forwarding the SC sees one frozen line for
        // the whole teardown.
        expect(mockStageReport.mock.calls.length).toBeGreaterThan(2);
        expect(mockDeleteDaLiveSite).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it('records the deleted site and clears its org-config rows', async () => {
        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'daLive')).toEqual([
            { type: 'daLive', name: 'skukla/demo-storefront', success: true, error: undefined },
        ]);
        // A stale permission row outliving its site is a grant nobody can see.
        expect(mockRemoveSitePermissions).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteSiteConfig).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it('reports the site deletion failure it was given', async () => {
        mockDeleteDaLiveSite.mockResolvedValue({ success: false, error: 'DA.live 500' });

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'daLive')).toEqual([
            { type: 'daLive', name: 'skukla/demo-storefront', success: false, error: 'DA.live 500' },
        ]);
    });

    it('turns a thrown cleanup into a reported failure, not a lost delete', async () => {
        mockDeleteDaLiveSite.mockRejectedValue(new Error('token expired'));

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'daLive')).toEqual([
            {
                type: 'daLive',
                name: 'skukla/demo-storefront',
                success: false,
                error: 'token expired',
            },
        ]);
        expect(mockRm).toHaveBeenCalled();
    });

    it('records a SKIPPED result carrying why, when DA.live auth is unavailable', async () => {
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, error: 'sign-in declined' });

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'daLive')).toEqual([
            {
                type: 'daLive',
                name: 'skukla/demo-storefront',
                success: false,
                skipped: true,
                error: 'sign-in declined',
            },
        ]);
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
    });

    it('falls back to a generic reason when the guard gave none', async () => {
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false });

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(of(resultsOf(result), 'daLive')[0].error).toBe('Authentication required');
    });
});

describe('the GitHub repository cleanup', () => {
    it('records the repo as deleted, by owner and name', async () => {
        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(of(resultsOf(result), 'github')).toEqual([
            { type: 'github', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    it('refuses a repo name that is not owner/repo, and says so', async () => {
        const project = edsProject();
        metadataOf(project).githubRepo = 'no-slash-here';

        const result = await deleteAnswered(context(), project, SERVICES, ['github']);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(of(resultsOf(result), 'github')).toEqual([
            {
                type: 'github',
                name: 'no-slash-here',
                success: false,
                error: 'Invalid repository name format',
            },
        ]);
    });

    it('reports a thrown deletion rather than losing it', async () => {
        mockDeleteRepository.mockRejectedValue(new Error('403 from GitHub'));

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(of(resultsOf(result), 'github')).toEqual([
            {
                type: 'github',
                name: 'skukla/demo-storefront',
                success: false,
                error: '403 from GitHub',
            },
        ]);
        expect(mockRm).toHaveBeenCalled();
    });

    describe('when no token is stored yet', () => {
        beforeEach(() => {
            mockGetToken.mockResolvedValue(null);
        });

        it('stores the session token with the scopes a repo delete needs', async () => {
            mockShowWarningMessage.mockResolvedValue('Sign In');
            mockGetSession.mockResolvedValue({ accessToken: 'gh-session-token' });

            await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

            expect(mockGetSession).toHaveBeenCalledWith(
                'github',
                ['repo', 'delete_repo'],
                { createIfNone: true },
            );
            // delete_repo is the scope that makes this work; a bearer token without
            // it authenticates and then 403s on the delete.
            expect(mockStoreToken).toHaveBeenCalledWith({
                token: 'gh-session-token',
                tokenType: 'bearer',
                scopes: ['repo', 'delete_repo'],
            });
            expect(mockDeleteRepository).toHaveBeenCalled();
        });

        it('proceeds without storing anything when the session comes back empty', async () => {
            mockShowWarningMessage.mockResolvedValue('Sign In');
            mockGetSession.mockResolvedValue(undefined);

            await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

            expect(mockStoreToken).not.toHaveBeenCalled();
            expect(mockDeleteRepository).toHaveBeenCalled();
        });

        it('skips the repo, with a reason, when the user declines to sign in', async () => {
            mockShowWarningMessage.mockResolvedValue(undefined);

            const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

            expect(mockGetSession).not.toHaveBeenCalled();
            expect(mockDeleteRepository).not.toHaveBeenCalled();
            expect(of(resultsOf(result), 'github')).toEqual([
                {
                    type: 'github',
                    name: 'skukla/demo-storefront',
                    success: false,
                    skipped: true,
                    error: 'Authentication required',
                },
            ]);
        });

        it('skips the repo when the sign-in itself fails', async () => {
            mockShowWarningMessage.mockResolvedValue('Sign In');
            mockGetSession.mockRejectedValue(new Error('user aborted'));

            const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

            expect(mockDeleteRepository).not.toHaveBeenCalled();
            expect(of(resultsOf(result), 'github')).toEqual([
                {
                    type: 'github',
                    name: 'skukla/demo-storefront',
                    success: false,
                    skipped: true,
                    error: 'Authentication failed',
                },
            ]);
        });
    });
});

// EDS-67: deleting the repository left AEM's copy of its code serving on aem.live.
describe("the site's code on aem.live, after the repository", () => {
    const codeRows = (results: CleanupResultItem[]) => results.filter((r) => r.name.startsWith('site code'));

    it('lists the repository before deleting it, then removes each file from the same site', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockListRepoFiles).toHaveBeenCalledWith('skukla', 'demo-storefront', 'main');
        expect(mockDeleteCode.mock.calls).toEqual(
            expect.arrayContaining([
                ['skukla', 'demo-storefront', '/scripts/aem.js', 'main'],
                ['skukla', 'demo-storefront', '/head.html', 'main'],
            ]),
        );
        const [listed] = mockListRepoFiles.mock.invocationCallOrder;
        const [deleted] = mockDeleteRepository.mock.invocationCallOrder;
        expect(listed).toBeLessThan(deleted);
        expect(Math.min(...mockDeleteCode.mock.invocationCallOrder)).toBeGreaterThan(deleted);
    });

    it('records the code as cleaned up when aem.live no longer serves it', async () => {
        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockCheckLiveStatus).toHaveBeenCalledWith(
            expect.stringMatching(/^https:\/\/main--demo-storefront--skukla\.aem\.live\/scripts\/aem\.js\?/),
        );
        expect(codeRows(resultsOf(result))).toStrictEqual([
            { type: 'helix', name: 'site code, skukla/demo-storefront', success: true },
        ]);
    });

    it('never says cleaned up over code aem.live still serves', async () => {
        mockCheckLiveStatus.mockImplementation(async () => 200);

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(codeRows(resultsOf(result))).toStrictEqual([
            {
                type: 'helix',
                name: 'site code, skukla/demo-storefront',
                success: false,
                error: expect.stringContaining('still serves'),
            },
        ]);
    });

    // Owner, 2026-10-28: once the repository is gone its code can never be listed for
    // removal, so with no working DA.live sign-in the repository AND the project stay.
    it.each([
        ['no DA.live session', () => mockDaLiveAccessToken.mockResolvedValue(null)],
        ['a DA.live sign-in IMS no longer accepts', () => mockCheckDaLiveSignIn.mockResolvedValue('refused')],
    ])('keeps the repository and the project with %s, and says why', async (_name, arrange) => {
        arrange();

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        const kept = 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';
        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteCode).not.toHaveBeenCalled();
        expect(mockRm).not.toHaveBeenCalled();
        expect(result.stopped).toBe(kept);
        expect(of(resultsOf(result), 'github')).toStrictEqual([
            { type: 'github', name: 'skukla/demo-storefront', success: false, error: kept },
        ]);
    });

    it('asks IMS about the DA.live token the code would be removed with', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockCheckDaLiveSignIn).toHaveBeenCalledWith('token');
    });

    it('removes no code when the repository delete fails, the repository being still there', async () => {
        mockDeleteRepository.mockRejectedValue(new Error('403 from GitHub'));

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockDeleteCode).not.toHaveBeenCalled();
        expect(codeRows(resultsOf(result))).toStrictEqual([]);
    });
});

/** The stored EDS metadata of a fixture, for tests that spoil one field. */
function metadataOf(project: ReturnType<typeof edsProject>): Record<string, unknown> {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata;
    if (!metadata) throw new Error('fixture is missing its eds-storefront metadata');
    return metadata as Record<string, unknown>;
}

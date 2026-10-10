/**
 * What a delete removes ONLINE (`edsExternalCleanup.ts`): the CDN unpublish, the
 * DA.live site and its org config, and the GitHub repository, each with its own
 * sign-in check.
 *
 * Driven through `deleteProject`, because the module wall in
 * `projectDeletionService.testUtils` is the one place these collaborators are
 * faked. The confirmation that decides WHICH of these run is
 * `deletionConfirmation.test.ts`; the one-time tip after a cleanup and the local
 * removal are the orchestrator's, in `projectDeletionService.test.ts`. Same rule
 * in all of them: every assertion reads the arguments a collaborator received or
 * the `cleanupResults` the service reports, never a value a mock handed back.
 */

import {
    deleteProject,
    mockCheckLiveStatus,
    mockDefaultDeleteAdminApiKey,
    mockDefaultListAllPages,
    mockDefaultListPublishedPaths,
    mockDefaultUnpublishPages,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockDeleteDaLiveSite,
    mockEnsureDaLiveAuth,
    mockGetConfiguration,
    mockGetSession,
    mockGetToken,
    mockHelixInitKeyStore,
    mockProgressReport,
    mockRemoveSitePermissions,
    mockRm,
    mockShowInformationMessage,
    mockShowWarningMessage,
    mockSleep,
    mockStoreToken,
} from './projectDeletionService.testUtils';
import {
    SERVICES,
    armQuickPick,
    context,
    edsProject,
    mockDeleteAdminApiKey,
    mockListAllPages,
    mockListPublishedPaths,
    mockUnpublishPages,
} from './projectDeletionService.fixtures';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';

/** The cleanup ledger the service reports back on its response. */
function resultsOf(result: { data?: unknown }): CleanupResultItem[] {
    return (result.data as { cleanupResults?: CleanupResultItem[] }).cleanupResults ?? [];
}

const of = (results: CleanupResultItem[], type: string) => results.filter((r) => r.type === type);

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockSleep.mockResolvedValue(undefined);
    mockGetConfiguration.mockReturnValue({ get: () => 'ask' });
    // showOneTimeTip chains .then on this, so it must always be a promise.
    mockShowInformationMessage.mockResolvedValue(undefined);
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
});

describe('the CDN unpublish step', () => {
    it('skips entirely when the project has no GitHub repo to address the CDN by', async () => {
        armQuickPick('accept', ['daLive']);
        const project = edsProject();
        delete metadataOf(project).githubRepo;

        await deleteProject(context(), project, SERVICES);

        // The DA.live content still goes; only the CDN step has no address.
        expect(mockListAllPages).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('skips when the stored repo is not an owner/repo pair', async () => {
        armQuickPick('accept', ['daLive']);
        const project = edsProject();
        metadataOf(project).githubRepo = 'no-slash-here';

        await deleteProject(context(), project, SERVICES);

        expect(mockListAllPages).not.toHaveBeenCalled();
    });

    it('records a helix result only when pages were actually unpublished', async () => {
        armQuickPick('accept', ['daLive']);
        mockUnpublishPages.mockResolvedValue({
            success: true, count: 0, total: 0, liveFailed: 0, previewFailed: 0,
        });

        const result = await deleteProject(context(), edsProject(), SERVICES);

        // Nothing was published, so there is nothing to report as cleaned up.
        expect(of(resultsOf(result), 'helix')).toStrictEqual([]);
    });

    // EDS-33: a site whose pages may still be live is shown as such, never left out.
    it('records a failed helix result, with the sentence, when the unpublish failed', async () => {
        armQuickPick('accept', ['daLive']);
        mockUnpublishPages.mockResolvedValue({
            success: false, count: 0, total: 2, liveFailed: 2, previewFailed: 0,
        });

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(of(resultsOf(result), 'helix')).toStrictEqual([
            {
                type: 'helix',
                name: 'skukla/demo-storefront',
                success: false,
                error: '2 of 2 pages could not be taken off main--demo-storefront--skukla.aem.live and may still be live.',
            },
        ]);
        // ...and it must not stop the rest of the deletion.
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
    });

    it('records the repo as cleaned when pages were unpublished', async () => {
        armQuickPick('accept', ['daLive']);

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(of(resultsOf(result), 'helix')).toEqual([
            { type: 'helix', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    // EDS-33, measured 2026-10-09: the DA.live content was already gone, so the delete
    // listed nothing to unpublish and the site's pages stayed live.
    it('unpublishes what Helix lists when DA.live lists nothing, and checks the live host', async () => {
        armQuickPick('accept', ['daLive']);
        mockListAllPages.mockResolvedValue([]);
        mockListPublishedPaths.mockImplementation(async (_o: string, _s: string, _b: string, pattern: string) =>
            pattern === '/*' ? ['/', '/about'] : [],
        );

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockListPublishedPaths).toHaveBeenCalledWith('skukla', 'demo-storefront', 'main', '/*');
        expect(mockUnpublishPages).toHaveBeenNthCalledWith(1, 'skukla', 'demo-storefront', 'main', ['/', '/about']);
        expect(mockCheckLiveStatus).toHaveBeenCalledWith('https://main--demo-storefront--skukla.aem.live/');
        expect(of(resultsOf(result), 'helix')).toEqual([
            { type: 'helix', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    it('records a failed helix result when a page still answers after the unpublish', async () => {
        armQuickPick('accept', ['daLive']);
        mockCheckLiveStatus.mockImplementation(async (url: string) =>
            url === 'https://main--demo-storefront--skukla.aem.live/' ? 200 : 404,
        );

        const result = await deleteProject(context(), edsProject(), SERVICES);

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
        armQuickPick('accept', ['daLive']);
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100', '/products/default', '/index']);

        const result = await deleteProject(context(), edsProject(), SERVICES);

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
        armQuickPick('accept', ['daLive']);
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100']);
        const project = edsProject();
        metadataOf(project).daLiveSite = 'demo-site';

        const result = await deleteProject(context(), project, SERVICES);

        // The CDN is addressed by owner/repo; the DA.live pair names the content.
        expect(of(resultsOf(result), 'helix')).toStrictEqual([
            { type: 'helix', name: 'product pages, skukla/demo-storefront', success: true },
            { type: 'helix', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    it('leaves the product pages, and says why, when another project publishes to the same repository', async () => {
        armQuickPick('accept', ['daLive']);
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100']);
        const ctx = context();
        const other = edsProject({ name: 'other-demo', path: '/projects/other' });
        (ctx.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
            { name: 'demo-project', path: '/projects/demo', lastModified: new Date(0) },
            { name: 'other-demo', path: '/projects/other', lastModified: new Date(0) },
        ]);
        (ctx.stateManager.loadProjectFromPath as jest.Mock).mockImplementation(async (path: string) =>
            path === '/projects/other' ? other : edsProject(),
        );

        const result = await deleteProject(ctx, edsProject(), SERVICES);

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
        armQuickPick('accept', ['daLive']);
        mockListPublishedPaths.mockResolvedValue(['/products/drum/dc-100']);
        mockUnpublishPages
            .mockResolvedValueOnce({ success: true, count: 2, total: 2, liveFailed: 0, previewFailed: 0 })
            .mockResolvedValueOnce({ success: true, count: 1, total: 1, liveFailed: 0, previewFailed: 1 });

        const result = await deleteProject(context(), edsProject(), SERVICES);

        const row = of(resultsOf(result), 'helix').find((r) => r.name.startsWith('product pages'));
        expect(row).toMatchObject({ success: false });
        expect(row?.error).toContain('those preview copies remain');
    });

    it('falls back to the real Helix when no service seam is handed in', async () => {
        // Production passes no `services`. The default arm builds a HelixService and
        // inits its key store; nothing else in the suite exercises that branch.
        armQuickPick('accept', ['daLive']);

        await deleteProject(context(), edsProject());

        expect(mockHelixInitKeyStore).toHaveBeenCalled();
        expect(mockDefaultListAllPages).toHaveBeenCalledWith('skukla', 'demo-storefront');
        // The handed-in seam must NOT have been used.
        expect(mockListAllPages).not.toHaveBeenCalled();
    });
});

describe('the DA.live site cleanup', () => {
    it("forwards the teardown's own steps to the progress surface", async () => {
        armQuickPick('accept', ['daLive']);

        await deleteProject(context(), edsProject(), SERVICES);

        // The site step and the file removal are two lines; anything more is the
        // shared teardown narrating its own steps (CDN, content, site settings)
        // through onStep. Without the forwarding the SC sees one frozen line for
        // the whole teardown.
        const lines = mockProgressReport.mock.calls
            .map(([update]) => (update as { message?: string }).message ?? '')
            .filter((message) => message !== '');
        expect(lines.length).toBeGreaterThan(2);
        expect(mockDeleteDaLiveSite).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it('records the deleted site and clears its org-config rows', async () => {
        armQuickPick('accept', ['daLive']);

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(of(resultsOf(result), 'daLive')).toEqual([
            { type: 'daLive', name: 'skukla/demo-storefront', success: true, error: undefined },
        ]);
        // A stale permission row outliving its site is a grant nobody can see.
        expect(mockRemoveSitePermissions).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteSiteConfig).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it('reports the site deletion failure it was given', async () => {
        armQuickPick('accept', ['daLive']);
        mockDeleteDaLiveSite.mockResolvedValue({ success: false, error: 'DA.live 500' });

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(of(resultsOf(result), 'daLive')).toEqual([
            { type: 'daLive', name: 'skukla/demo-storefront', success: false, error: 'DA.live 500' },
        ]);
    });

    it('turns a thrown cleanup into a reported failure, not a lost delete', async () => {
        armQuickPick('accept', ['daLive']);
        mockDeleteDaLiveSite.mockRejectedValue(new Error('token expired'));

        const result = await deleteProject(context(), edsProject(), SERVICES);

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
        armQuickPick('accept', ['daLive']);
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, error: 'sign-in declined' });

        const result = await deleteProject(context(), edsProject(), SERVICES);

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
        armQuickPick('accept', ['daLive']);
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false });

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(of(resultsOf(result), 'daLive')[0].error).toBe('Authentication required');
    });
});

describe('the GitHub repository cleanup', () => {
    it('records the repo as deleted, by owner and name', async () => {
        armQuickPick('accept', ['github']);

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(of(resultsOf(result), 'github')).toEqual([
            { type: 'github', name: 'skukla/demo-storefront', success: true },
        ]);
    });

    it('refuses a repo name that is not owner/repo, and says so', async () => {
        armQuickPick('accept', ['github']);
        const project = edsProject();
        metadataOf(project).githubRepo = 'no-slash-here';

        const result = await deleteProject(context(), project, SERVICES);

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
        armQuickPick('accept', ['github']);
        mockDeleteRepository.mockRejectedValue(new Error('403 from GitHub'));

        const result = await deleteProject(context(), edsProject(), SERVICES);

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
            armQuickPick('accept', ['github']);
            mockShowWarningMessage.mockResolvedValue('Sign In');
            mockGetSession.mockResolvedValue({ accessToken: 'gh-session-token' });

            await deleteProject(context(), edsProject(), SERVICES);

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
            armQuickPick('accept', ['github']);
            mockShowWarningMessage.mockResolvedValue('Sign In');
            mockGetSession.mockResolvedValue(undefined);

            await deleteProject(context(), edsProject(), SERVICES);

            expect(mockStoreToken).not.toHaveBeenCalled();
            expect(mockDeleteRepository).toHaveBeenCalled();
        });

        it('skips the repo, with a reason, when the user declines to sign in', async () => {
            armQuickPick('accept', ['github']);
            mockShowWarningMessage.mockResolvedValue(undefined);

            const result = await deleteProject(context(), edsProject(), SERVICES);

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
            armQuickPick('accept', ['github']);
            mockShowWarningMessage.mockResolvedValue('Sign In');
            mockGetSession.mockRejectedValue(new Error('user aborted'));

            const result = await deleteProject(context(), edsProject(), SERVICES);

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

/** The stored EDS metadata of a fixture, for tests that spoil one field. */
function metadataOf(project: ReturnType<typeof edsProject>): Record<string, unknown> {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata;
    if (!metadata) throw new Error('fixture is missing its eds-storefront metadata');
    return metadata as Record<string, unknown>;
}

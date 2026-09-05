/**
 * The REMOTE half of a delete: the CDN unpublish, the DA.live site and its org
 * config, the GitHub repository, and the one-time tip that follows a cleanup.
 *
 * Split from `projectDeletionService-cleanup`, which covers the confirmation and
 * the dialog that decides WHICH of these run. Same rule in both: every assertion
 * reads the arguments a collaborator received or the `cleanupResults` the service
 * reports, never a value a mock handed back.
 */

import {
    deleteProject,
    deleteProjectFiles,
    mockDefaultDeleteAdminApiKey,
    mockDefaultListAllPages,
    mockDefaultUnpublishPages,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockDeleteDaLiveSite,
    mockEnsureDaLiveAuth,
    mockExecuteCommand,
    mockGetConfiguration,
    mockGetSession,
    mockGetToken,
    mockHelixInitKeyStore,
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
    mockUnpublishPages,
    plainProject,
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
        expect(of(resultsOf(result), 'helix')).toEqual([]);
    });

    it('records no helix result when the unpublish failed', async () => {
        armQuickPick('accept', ['daLive']);
        mockUnpublishPages.mockResolvedValue({
            success: false, count: 0, total: 2, liveFailed: 2, previewFailed: 0,
        });

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(of(resultsOf(result), 'helix')).toEqual([]);
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

describe('the one-time cleanup-settings tip', () => {
    /**
     * A context where the tip has NOT been shown before. The shared handler-context
     * fake answers `true` to every globalState read so tips stay out of other suites'
     * way — which here means the tip never fires and the assertions pass on nothing.
     */
    function freshTipContext(): ReturnType<typeof context> {
        const ctx = context();
        (ctx.context.globalState.get as jest.Mock).mockReturnValue(false);
        return ctx;
    }

    it('appears after a cleanup ran, offering the settings it configures', async () => {
        armQuickPick('accept', ['github', 'daLive']);
        const ctx = freshTipContext();

        await deleteProject(ctx, edsProject(), SERVICES);

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
            expect.any(String),
            'Open Settings',
        );
        expect(ctx.context.globalState.update).toHaveBeenCalledWith(
            'edsCleanup.settingsTipShown',
            true,
        );
    });

    it('does not appear when nothing was cleaned up', async () => {
        armQuickPick('accept', []);

        await deleteProject(freshTipContext(), edsProject(), SERVICES);

        expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('does not appear a second time', async () => {
        armQuickPick('accept', ['github', 'daLive']);
        const ctx = context();
        (ctx.context.globalState.get as jest.Mock).mockReturnValue(true);

        await deleteProject(ctx, edsProject(), SERVICES);

        expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('opens the cleanupBehavior setting when its action is chosen', async () => {
        armQuickPick('accept', ['github', 'daLive']);
        mockShowInformationMessage.mockResolvedValue('Open Settings');

        await deleteProject(freshTipContext(), edsProject(), SERVICES);
        // The tip is fire-and-forget; let its .then run.
        await Promise.resolve();

        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'workbench.action.openSettings',
            'demoBuilder.cleanupBehavior',
        );
    });
});

describe('removing the local footprint', () => {
    it('removes the directory recursively and forcibly', async () => {
        await deleteProjectFiles(context(), plainProject());

        expect(mockRm).toHaveBeenCalledWith('/projects/demo', { recursive: true, force: true });
    });

    it('touches nothing on disk when the project has no path', async () => {
        const ctx = context();

        await deleteProjectFiles(ctx, plainProject({ path: '' }));

        expect(mockRm).not.toHaveBeenCalled();
        expect(ctx.stateManager.removeFromRecentProjects).not.toHaveBeenCalled();
    });

    it('backs off exponentially between retries, from a bounded base', async () => {
        const transient = Object.assign(new Error('busy'), { code: 'EBUSY' });
        mockRm.mockRejectedValue(transient);

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow();

        // The first sleep is the file-handle release, not a retry delay.
        const delays = mockSleep.mock.calls.slice(1).map((c) => c[0]);
        expect(delays).toEqual([100, 200, 400, 800]);
    });

    it('makes exactly five attempts — the ceiling is a number, not "several"', async () => {
        const transient = Object.assign(new Error('busy'), { code: 'EBUSY' });
        mockRm.mockRejectedValue(transient);

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow();

        expect(mockRm).toHaveBeenCalledTimes(5);
    });

    it('treats an error with NO code as non-retryable', async () => {
        mockRm.mockRejectedValue(new Error('something else'));

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow(
            /something else/,
        );
        expect(mockRm).toHaveBeenCalledTimes(1);
    });

    it('does not claim it tried repeatedly when it gave up on the first attempt', async () => {
        const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
        mockRm.mockRejectedValue(denied);

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow(
            /^Failed to delete project: permission denied$/,
        );
    });
});

/** The stored EDS metadata of a fixture, for tests that spoil one field. */
function metadataOf(project: ReturnType<typeof edsProject>): Record<string, unknown> {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata;
    if (!metadata) throw new Error('fixture is missing its eds-storefront metadata');
    return metadata as Record<string, unknown>;
}

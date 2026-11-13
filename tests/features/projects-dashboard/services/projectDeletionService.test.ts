/**
 * Deleting a project once the SC has answered: `runProjectDelete`, which the batch window runs
 * a row at a time (`projectsBatch.ts`). The question itself, and its cancel, are the batch's
 * (`ProjectsBatchModal`, `projectsBatch.test.ts`).
 *
 * DONE CRITERION for this unit, written BEFORE the work and recorded in
 * `.rptc/plans/architecture-test-convergence/overview.md` (the cancel half went with the
 * one-project delete question, step-05 S5):
 *
 *   1. An UNTICKED resource is not destroyed.
 *   2. `deleteDirectoryWithRetry` retries, and gives up rather than looping.
 *
 * WHY 1 MATTERS. This is the only operation in the extension that destroys a user's work
 * irreversibly — files, the GitHub repo, DA.live content, the Helix site. Unticking a row is
 * how the SC keeps a resource while the project goes.
 */

import {
    deleteProjectFiles,
    mockDeleteDaLiveSite,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockEnsureDaLiveAuth,
    mockExecuteCommand,
    mockGetToken,
    mockRemoveDataBeforeDelete,
    mockRemoveSitePermissions,
    mockRm,
    mockSleep,
} from './projectDeletionService.testUtils';
import {
    SERVICES,
    context,
    deleteAnswered,
    edsProject,
    mockDeleteAdminApiKey,
    mockInitKeyStore,
    mockListAllPages,
    mockListPublishedPaths,
    mockStageReport,
    mockUnpublishPages,
    plainProject,
} from './projectDeletionService.fixtures';
import { OPERATION_STAGES } from '@/core/utils/operationStages';

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockInitKeyStore.mockResolvedValue(undefined);
    mockListAllPages.mockResolvedValue(['/index', '/products']);
    // Helix's record of what is published (EDS-33). The real call answers a list or
    // throws; an unset mock answered undefined, a shape it never returns.
    mockListPublishedPaths.mockResolvedValue([]);
    mockUnpublishPages.mockResolvedValue({
        success: true,
        count: 2,
        total: 2,
        liveFailed: 0,
        previewFailed: 0,
    });
    mockDeleteAdminApiKey.mockResolvedValue({ success: true });
    mockRemoveDataBeforeDelete.mockResolvedValue(undefined);
});

describe('CRITERION 1 — an UNTICKED resource is not destroyed', () => {
    /**
     * Unticking a row is how the user says no to one resource: they WANT the project gone but wants to keep
     * the repo. Getting this backwards deletes a GitHub repository the user
     * explicitly declined to delete, which no undo reaches.
     */
    beforeEach(() => {
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);
        mockDeleteDaLiveSite.mockResolvedValue({ success: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    });

    it('deletes both remote resources when both stay ticked', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['github', 'daLive']);

        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('spares the GitHub repo when its row is unticked', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled(); // the other one still runs
    });

    it('spares the DA.live site when its row is unticked', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
        expect(mockDeleteRepository).toHaveBeenCalled();
    });

    it('deletes NO remote resource when both rows are unticked', async () => {
        // Confirming with nothing ticked means "remove the local project only".
        await deleteAnswered(context(), edsProject(), SERVICES, []);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled(); // but the local files DO go
    });

    it('does not delete the repo when GitHub auth is unavailable', async () => {
        // No token and no successful prompt: the safe outcome is to skip the
        // repo and report it, never to proceed against an unauthenticated API.
        mockGetToken.mockResolvedValue(undefined);
        await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
    });

    it('does not delete the DA.live site when its auth is unavailable', async () => {
        // The same rule on the other resource. An expired DA.live session must
        // skip the site, not fall through to an unauthenticated delete.
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, error: 'expired' });
        await deleteAnswered(context(), edsProject(), SERVICES, ['daLive']);

        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
    });
});

/** The stored storefront names a fixture can lose, to test what is still addressable. */
function metadataOf(project: ReturnType<typeof edsProject>): Record<string, unknown> {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata;
    if (!metadata) throw new Error('fixture is missing its eds-storefront metadata');
    return metadata as Record<string, unknown>;
}

describe('with both ticked, what the project can address goes', () => {
    beforeEach(() => {
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockDeleteDaLiveSite.mockResolvedValue({ success: true });
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);
        mockRemoveSitePermissions.mockResolvedValue({ success: true });
        mockDeleteSiteConfig.mockResolvedValue({ success: true });
    });

    it('takes only the DA.live site when there is no repo to take', async () => {
        const project = edsProject();
        delete metadataOf(project).githubRepo;

        await deleteAnswered(context(), project, SERVICES);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    // Both halves fall back to the repo, so a project that stored neither is still
    // addressable — and must still have its site taken down. Read raw, deleting a
    // migrated project left the storefront up (owner sweep, 2026-09-20).
    it('still takes the DA.live site down when neither half was stored', async () => {
        const project = edsProject();
        delete metadataOf(project).daLiveOrg;
        delete metadataOf(project).daLiveSite;

        await deleteAnswered(context(), project, SERVICES);

        expect(mockDeleteRepository).toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('takes only the repo when nothing names the storefront', async () => {
        const project = edsProject();
        delete metadataOf(project).daLiveOrg;
        delete metadataOf(project).daLiveSite;
        delete metadataOf(project).githubRepo;

        await deleteAnswered(context(), project, SERVICES);

        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
    });
});

describe('CRITERION 2 — the delete retry gives up rather than looping', () => {
    /** ENOTEMPTY is the classic transient one: a watcher still holds the tree. */
    const transient = Object.assign(new Error('directory not empty'), { code: 'ENOTEMPTY' });

    it('retries a transient failure and succeeds on a later attempt', async () => {
        mockRm.mockRejectedValueOnce(transient).mockResolvedValueOnce(undefined);

        await deleteProjectFiles(context(), plainProject());

        expect(mockRm).toHaveBeenCalledTimes(2);
    });

    it('stops after a bounded number of attempts — it does not loop forever', async () => {
        mockRm.mockRejectedValue(transient);

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow(
            /after \d+ attempts/
        );
        // The exact ceiling is the module's business; that there IS one is not.
        expect(mockRm.mock.calls.length).toBeGreaterThan(1);
        expect(mockRm.mock.calls.length).toBeLessThan(10);
    });

    it('does NOT retry a non-transient failure', async () => {
        // A permissions problem will not fix itself, and retrying only delays
        // telling the user.
        const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
        mockRm.mockRejectedValue(denied);

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow(
            /permission denied/
        );
        expect(mockRm).toHaveBeenCalledTimes(1);
    });

    it('keeps the underlying reason in the message it throws', async () => {
        // The retry wrapper must not swallow WHY it failed — "failed to delete"
        // alone sends the user nowhere.
        mockRm.mockRejectedValue(transient);

        await expect(deleteProjectFiles(context(), plainProject())).rejects.toThrow(
            /directory not empty/
        );
    });
});

describe('the surrounding cleanup that a delete must not skip', () => {
    it('stops a RUNNING demo before removing its files', async () => {
        // Deleting the directory out from under a running dev server leaves an
        // orphaned process holding a port.
        await deleteProjectFiles(
            context(),
            plainProject({ status: 'running' })
        );

        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');
    });

    it('does not try to stop a demo that is not running', async () => {
        await deleteProjectFiles(context(), plainProject({ status: 'ready' }));

        expect((mockExecuteCommand).mock.calls.map(([id]) => id)).not.toContain('demoBuilder.stopDemo');
    });

    it('drops the project from the recent list', async () => {
        // Otherwise the home screen keeps offering a project whose files are
        // gone, and opening it fails in a way that looks like a bug.
        const ctx = context();

        await deleteProjectFiles(ctx, plainProject());

        expect(ctx.stateManager.removeFromRecentProjects).toHaveBeenCalledWith('/projects/demo');
    });

    it('clears the CURRENT project when it is the one being deleted', async () => {
        const ctx = context();
        (ctx.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(
            plainProject({ path: '/projects/demo' })
        );

        await deleteProjectFiles(ctx, plainProject({ path: '/projects/demo' }));

        expect(ctx.stateManager.clearProject).toHaveBeenCalled();
    });

    it('leaves the current project alone when a DIFFERENT one is deleted', async () => {
        // Deleting project B must not sign the user out of project A.
        const ctx = context();
        (ctx.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(
            plainProject({ path: '/projects/other' })
        );

        await deleteProjectFiles(ctx, plainProject({ path: '/projects/demo' }));

        expect(ctx.stateManager.clearProject).not.toHaveBeenCalled();
    });
});

/**
 * The CDN unpublish, which had NO coverage until the seam made it reachable.
 *
 * Deleting a storefront without unpublishing leaves its pages served by the CDN
 * after the DA.live site and the GitHub repo are gone — a demo URL that keeps
 * answering with content nobody can edit or take down. The Admin API key is the
 * same problem in miniature: a live credential outliving the site it was minted for.
 */
describe('CDN unpublish before the site is deleted', () => {
    beforeEach(() => {
        // The step sits behind the DA.live auth gate in performDaLiveCleanup — a
        // signed-out user reaches none of it.
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockDeleteDaLiveSite.mockResolvedValue({ success: true });
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);
    });

    it('lists the site pages and unpublishes exactly those', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES);

        expect(mockListAllPages).toHaveBeenCalledWith('skukla', 'demo-storefront');
        // The GitHub pair addresses the CDN, the DA pair addresses the content —
        // they are different names here and swapping them unpublishes nothing.
        expect(mockUnpublishPages).toHaveBeenCalledWith('skukla', 'demo-storefront', 'main', [
            '/index',
            '/products',
        ]);
    });

    it('initialises the key store BEFORE minting or deleting a key', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES);

        expect(mockInitKeyStore.mock.invocationCallOrder[0]).toBeLessThan(
            mockDeleteAdminApiKey.mock.invocationCallOrder[0],
        );
    });

    it('deletes the site Admin API key — a live credential must not outlive the site', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES);

        expect(mockDeleteAdminApiKey).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it('a failed unpublish never stops the deletion', async () => {
        mockUnpublishPages.mockRejectedValue(new Error('helix 500'));

        const result = await deleteAnswered(context(), edsProject(), SERVICES);

        // Non-fatal by design: a CDN that will not answer must not strand the user
        // with a project they cannot remove.
        expect(result.stopped).toBeUndefined();
        expect(mockRm).toHaveBeenCalled();
    });
});

describe("a confirmed delete takes the project's secrets with it", () => {
    it("deletes the project's kept secrets from SecretStorage once the folder is gone", async () => {
        const ctx = context();
        const remove = jest.fn(async () => undefined);
        Object.assign(ctx.context as object, { secrets: { delete: remove } });
        await deleteAnswered(ctx, plainProject({ adobe: { workspace: 'ws-1' } }), SERVICES);
        expect(mockRm).toHaveBeenCalled();
        expect(remove).toHaveBeenCalledWith('demoBuilder.commerceRest.credential.ws-1');
    });

    it('keeps them when the folder could not be deleted', async () => {
        mockRm.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
        const ctx = context();
        const remove = jest.fn(async () => undefined);
        Object.assign(ctx.context as object, { secrets: { delete: remove } });
        await expect(
            deleteAnswered(ctx, plainProject({ adobe: { workspace: 'ws-1' } }), SERVICES),
        ).rejects.toThrow('Failed to delete project: denied');
        expect(remove).not.toHaveBeenCalled();
    });
});

describe('removing the local footprint', () => {
    beforeEach(() => {
        mockSleep.mockResolvedValue(undefined);
    });

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

describe('the steps it reports', () => {
    const at = (index: number, total: number) => ({ index, total });

    beforeEach(() => {
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockDeleteDaLiveSite.mockResolvedValue({ success: true });
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);
    });

    // A stage reported with no line under it shows its stage table detail: that is the surface's
    // job (`withOperationProgress`), so here it is undefined.
    it('numbers every step of a full EDS delete, with the lines it adds under them', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['github', 'daLive']);

        expect(mockStageReport.mock.calls).toStrictEqual([
            [OPERATION_STAGES.checkingRequirements.label, at(1, 8), 'Your DA.live sign-in'],
            [OPERATION_STAGES.takingPagesOffSite.label, at(2, 8), undefined],
            [OPERATION_STAGES.removingProductPages.label, at(3, 8), undefined],
            [OPERATION_STAGES.removingProductPages.label, at(3, 8), 'The page made for each product'],
            [OPERATION_STAGES.clearingDaLiveContent.label, at(4, 8), undefined],
            [OPERATION_STAGES.clearingSiteSettings.label, at(5, 8), undefined],
            [OPERATION_STAGES.deletingRepository.label, at(6, 8), undefined],
            // EDS-67: AEM's copy of the code, once the repository is gone.
            [OPERATION_STAGES.removingSiteCode.label, at(7, 8), undefined],
            [OPERATION_STAGES.removingProjectFiles.label, at(8, 8), undefined],
        ]);
    });

    it('counts only the steps the SC chose', async () => {
        await deleteAnswered(context(), edsProject(), SERVICES, ['github']);

        expect(mockStageReport.mock.calls.map(([stage, position]) => [stage, position])).toStrictEqual([
            [OPERATION_STAGES.deletingRepository.label, at(1, 3)],
            [OPERATION_STAGES.removingSiteCode.label, at(2, 3)],
            [OPERATION_STAGES.removingProjectFiles.label, at(3, 3)],
        ]);
    });

    // "1 of 1" says nothing a step alone does not.
    it('shows a project with nothing online as one step, unnumbered', async () => {
        await deleteAnswered(context(), plainProject(), SERVICES, []);

        expect(mockStageReport.mock.calls).toStrictEqual([
            [OPERATION_STAGES.removingProjectFiles.label, undefined, undefined],
        ]);
    });
});

/**
 * Uninstall Datapack (owner, 2026-11-09, walk F96): a ticked box removes the data FIRST; a
 * removal that does not finish stops the delete and keeps the project. The removal is mocked in
 * the wall (`mockRemoveDataBeforeDelete`); its own suite is `datapackDataRemoval.test.ts`.
 */
describe("the datapack's data", () => {
    beforeEach(() => {
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);
    });

    it('leaves the data when the box is left unticked', async () => {
        const result = await deleteAnswered(context(), plainProject(), SERVICES, []);

        expect(mockRm).toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ cleanupResults: [] });
    });

    it('removes the data before the repository and the files when ticked', async () => {
        const ctx = context();
        const project = edsProject();
        const order: string[] = [];
        mockRemoveDataBeforeDelete.mockImplementation(async () => { order.push('data'); });
        mockDeleteRepository.mockImplementation(async () => { order.push('repository'); });
        mockRm.mockImplementation(async () => { order.push('files'); });

        const result = await deleteAnswered(ctx, project, SERVICES, ['github', 'datapackData']);

        expect(mockRemoveDataBeforeDelete).toHaveBeenCalledWith(ctx, project, expect.any(Function), { given: undefined });
        expect(order).toEqual(['data', 'repository', 'files']);
        expect(result.stopped).toBeUndefined();
    });

    it('keeps the project, and everything online, when the data does not all come out', async () => {
        const why = "Its datapack's data was not removed, so the project was kept: Commerce refused 2 products.";
        mockRemoveDataBeforeDelete.mockResolvedValue(why);

        const result = await deleteAnswered(context(), edsProject(), SERVICES, ['github', 'datapackData']);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockRm).not.toHaveBeenCalled();
        expect(result.stopped).toBe(why);
    });
});

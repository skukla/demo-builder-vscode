/**
 * Deleting a project — the decisions, not the dialogs.
 *
 * DONE CRITERION for this unit, written BEFORE the work and recorded in
 * `.rptc/plans/architecture-test-convergence/overview.md`:
 *
 *   1. Cancelling is proven to delete NOTHING, on both confirmation paths.
 *   2. `deleteDirectoryWithRetry` retries, and gives up rather than looping.
 *   3. Every remaining uncovered line is NAMED in the commit and is a
 *      `vscode.window` call or filesystem I/O — not a decision.
 *
 * The criterion is quoted verbatim above, including where it was wrong — that
 * is the point of writing it first. Two corrections, both recorded in the plan:
 * there are THREE confirmation configurations, not two (`cleanupBehavior` is
 * ask / localOnly / deleteAll); and clause 3 FAILED on the first pass, because
 * the uncovered remainder still held the decisions about which remote resources
 * get destroyed. Those got tested rather than narrated.
 *
 * WHY 1 IS THE ONE THAT MATTERS. This is the only operation in the extension
 * that destroys a user's work irreversibly — files, the GitHub repo, DA.live
 * content, the Helix site. "Cancel" is the last thing standing between a
 * misclick and all of it, and nothing asserted that it holds. A cancel that
 * silently proceeds would look exactly like a successful delete.
 */

import {
    deleteProject,
    deleteProjectFiles,
    mockCreateQuickPick,
    mockDeleteDaLiveSite,
    mockDeleteRepository,
    mockEnsureDaLiveAuth,
    mockExecuteCommand,
    mockGetConfiguration,
    mockGetToken,
    mockProgressReport,
    mockRm,
    mockShowInformationMessage,
    mockShowWarningMessage,
    mockSleep,
    mockWithProgressOptions,
} from './projectDeletionService.testUtils';
import {
    SERVICES,
    armQuickPick,
    context,
    edsProject,
    mockDeleteAdminApiKey,
    mockInitKeyStore,
    mockListAllPages,
    mockListPublishedPaths,
    mockUnpublishPages,
    plainProject,
} from './projectDeletionService.fixtures';
import { startModalRun } from '@/core/vscode/operationProgress';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

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
    // 'ask' is the shipped default and the only value that reaches the dialog;
    // 'deleteAll' skips the prompt entirely.
    mockGetConfiguration.mockReturnValue({ get: () => 'ask' });
});

describe('CRITERION 1 — cancelling deletes nothing', () => {
    it('deletes nothing when the plain confirmation is dismissed', () => {
        // `showWarningMessage` resolving undefined is what a dismissed modal
        // looks like — the user pressed Escape rather than "Delete".
        mockShowWarningMessage.mockResolvedValue(undefined);

        return deleteProject(context(), plainProject(), SERVICES).then((result) => {
            expect(mockRm).not.toHaveBeenCalled();
            expect(result.data).toMatchObject({ success: false, error: 'cancelled' });
        });
    });

    it('deletes nothing when the user answers anything other than Delete', () => {
        mockShowWarningMessage.mockResolvedValue('Cancel');

        return deleteProject(context(), plainProject(), SERVICES).then((result) => {
            expect(mockRm).not.toHaveBeenCalled();
            expect(result.data).toMatchObject({ success: false, error: 'cancelled' });
        });
    });

    it('CONTROL: an EDS project really does take the OTHER confirmation path', async () => {
        // Without this, a fixture that quietly fails `isEdsProject` sends the
        // next two tests down the plain path and they pass anyway. That is
        // exactly what the first draft of this file did.
        armQuickPick('escape');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockCreateQuickPick).toHaveBeenCalled();
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('deletes nothing when the EDS dialog is dismissed with Escape', async () => {
        // The EDS path asks a different question — which external resources to
        // remove — and leaving it must be just as safe as dismissing the plain
        // modal. This is the path that would also have taken the GitHub repo
        // and the DA.live content.
        armQuickPick('escape');

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockRm).not.toHaveBeenCalled();
        // Same envelope/payload split as the plain path: the call worked, the
        // delete did not happen.
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ success: false, error: 'cancelled' });
    });

    it('deletes nothing when the EDS dialog Cancel button is pressed', async () => {
        // A SECOND cancel route through the same dialog, resolved by a
        // different handler. Escape passing says nothing about this one.
        armQuickPick('cancelButton');

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockRm).not.toHaveBeenCalled();
        expect(result.data).toMatchObject({ success: false, error: 'cancelled' });
    });

    it('deletes nothing when an EDS project set to local-only is declined', () => {
        // The THIRD confirmation configuration. `cleanupBehavior: 'localOnly'`
        // skips the resource dialog and shows the plain modal instead — a
        // separate early return from either of the two above.
        mockGetConfiguration.mockReturnValue({ get: () => 'localOnly' });
        mockShowWarningMessage.mockResolvedValue(undefined);

        return deleteProject(context(), edsProject(), SERVICES).then((result) => {
            expect(mockRm).not.toHaveBeenCalled();
            expect(result.data).toMatchObject({ success: false, error: 'cancelled' });
        });
    });

    it('asks NOTHING when the user has configured delete-all', async () => {
        // Pinned deliberately, because it is the one path with no confirmation
        // at all: `cleanupBehavior: 'deleteAll'` removes the project AND its
        // GitHub repo AND its DA.live site without a prompt. That is what the
        // setting means, and this test is what stops it becoming true of the
        // default 'ask' by accident.
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockCreateQuickPick).not.toHaveBeenCalled();
        // No CONFIRMATION. Downstream prompts (GitHub sign-in) are a different
        // question and may still appear, so match the confirmation text rather
        // than asserting the modal was never used for anything at all.
        const asked = mockShowWarningMessage.mock.calls.map((c) => String(c[0]));
        expect(asked.filter((t) => /Are you sure/.test(t))).toStrictEqual([]);
        expect(mockRm).toHaveBeenCalled();
    });

    it('reports a cancel as a SUCCESSFUL call that did not delete', () => {
        // The envelope says success (the handler ran fine); the payload says the
        // delete did not happen. A caller reading only `success` must not
        // conclude the project is gone.
        mockShowWarningMessage.mockResolvedValue(undefined);

        return deleteProject(context(), plainProject(), SERVICES).then((result) => {
            expect(result.success).toBe(true);
            expect(result.data).toMatchObject({ success: false });
        });
    });
});

describe('CRITERION 1 (cont.) — an UNTICKED resource is not destroyed', () => {
    /**
     * Cancelling is one way to say no. Unticking a row is the other, and it is
     * the finer-grained one: the user WANTS the project gone but wants to keep
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
        armQuickPick('accept', ['github', 'daLive']);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('spares the GitHub repo when its row is unticked', async () => {
        armQuickPick('accept', ['daLive']);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled(); // the other one still runs
    });

    it('spares the DA.live site when its row is unticked', async () => {
        armQuickPick('accept', ['github']);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
        expect(mockDeleteRepository).toHaveBeenCalled();
    });

    it('deletes NO remote resource when both rows are unticked', async () => {
        // Confirming with nothing ticked means "remove the local project only".
        armQuickPick('accept', []);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled(); // but the local files DO go
    });

    it('does not delete the repo when GitHub auth is unavailable', async () => {
        // No token and no successful prompt: the safe outcome is to skip the
        // repo and report it, never to proceed against an unauthenticated API.
        mockGetToken.mockResolvedValue(undefined);
        armQuickPick('accept', ['github']);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
    });

    it('does not delete the DA.live site when its auth is unavailable', async () => {
        // The same rule on the other resource. An expired DA.live session must
        // skip the site, not fall through to an unauthenticated delete.
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, error: 'expired' });
        armQuickPick('accept', ['daLive']);

        await deleteProject(context(), edsProject(), SERVICES);

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

        expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.stopDemo');
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
        armQuickPick('accept');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockListAllPages).toHaveBeenCalledWith('skukla', 'demo-storefront');
        // The GitHub pair addresses the CDN, the DA pair addresses the content —
        // they are different names here and swapping them unpublishes nothing.
        expect(mockUnpublishPages).toHaveBeenCalledWith('skukla', 'demo-storefront', 'main', [
            '/index',
            '/products',
        ]);
    });

    it('initialises the key store BEFORE minting or deleting a key', async () => {
        armQuickPick('accept');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockInitKeyStore.mock.invocationCallOrder[0]).toBeLessThan(
            mockDeleteAdminApiKey.mock.invocationCallOrder[0],
        );
    });

    it('deletes the site Admin API key — a live credential must not outlive the site', async () => {
        armQuickPick('accept');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteAdminApiKey).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it('a failed unpublish never stops the deletion', async () => {
        armQuickPick('accept');
        mockUnpublishPages.mockRejectedValue(new Error('helix 500'));

        const result = await deleteProject(context(), edsProject(), SERVICES);

        // Non-fatal by design: a CDN that will not answer must not strand the user
        // with a project they cannot remove.
        expect(result.success).toBe(true);
        expect(mockRm).toHaveBeenCalled();
    });
});

describe("a confirmed delete takes the project's secrets with it", () => {
    it("deletes the project's kept secrets from SecretStorage once the folder is gone", async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        const ctx = context();
        const remove = jest.fn(async () => undefined);
        Object.assign(ctx.context as object, { secrets: { delete: remove } });
        await deleteProject(ctx, plainProject({ adobe: { workspace: 'ws-1' } }), SERVICES);
        expect(mockRm).toHaveBeenCalled();
        expect(remove).toHaveBeenCalledWith('demoBuilder.commerceRest.credential.ws-1');
    });

    it('keeps them when the folder could not be deleted', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        mockRm.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
        const ctx = context();
        const remove = jest.fn(async () => undefined);
        Object.assign(ctx.context as object, { secrets: { delete: remove } });
        await expect(
            deleteProject(ctx, plainProject({ adobe: { workspace: 'ws-1' } }), SERVICES),
        ).rejects.toThrow('Failed to delete project: denied');
        expect(remove).not.toHaveBeenCalled();
    });
});

describe('the one-time cleanup-settings tip', () => {
    beforeEach(() => {
        // showOneTimeTip chains .then on this, so it must always be a promise.
        mockShowInformationMessage.mockResolvedValue(undefined);
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockDeleteDaLiveSite.mockResolvedValue({ success: true });
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);
    });

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

describe('where a delete narrates', () => {
    /** The non-empty lines the progress notification was handed, in order. */
    const notified = (): string[] =>
        mockProgressReport.mock.calls
            .map(([update]) => (update as { message?: string }).message ?? '')
            .filter((message) => message !== '');

    it('a delete started from a screen narrates in that screen\'s modal, by its id, and ends it as succeeded', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');
        const pushed: OperationProgressPayload[] = [];
        startModalRun('screen-op-1', async (_type: string, payload?: unknown) => {
            pushed.push(payload as OperationProgressPayload);
        });

        await deleteProject(context(), plainProject(), SERVICES, {
            progress: 'modal',
            operationId: 'screen-op-1',
        });

        // One surface per operation (PL-59 R1): no notification beside the modal.
        expect(mockWithProgressOptions).not.toHaveBeenCalled();
        expect(pushed.at(-1)).toStrictEqual({ id: 'screen-op-1', state: 'succeeded' });
    });

    it("the cleanup's own step reaches the notification ahead of the file removal", async () => {
        armQuickPick('accept', ['github']);
        mockGetToken.mockResolvedValue('gh-token');
        mockDeleteRepository.mockResolvedValue(undefined);

        await deleteProject(context(), edsProject(), SERVICES);

        // One line from the repository cleanup, one for the files. Dropping the
        // forwarding, or forwarding blanks, leaves the file removal alone.
        expect(notified()).toHaveLength(2);
        expect(mockDeleteRepository).toHaveBeenCalled();
    });
});

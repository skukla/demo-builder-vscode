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

const mockShowWarningMessage = jest.fn();
const mockExecuteCommand = jest.fn();
const mockRm = jest.fn();
const mockGetConfiguration = jest.fn();
const mockCreateQuickPick = jest.fn();

jest.mock('vscode', () => ({
    workspace: { getConfiguration: (...a: unknown[]) => mockGetConfiguration(...a) },
    window: {
        showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a),
        createQuickPick: () => mockCreateQuickPick(),
        showInformationMessage: jest.fn(),
        withProgress: (_opts: unknown, task: (p: { report: () => void }) => Promise<unknown>) =>
            task({ report: () => {} }),
    },
    commands: { executeCommand: (...a: unknown[]) => mockExecuteCommand(...a) },
    ThemeIcon: class {
        constructor(public readonly id: string) {}
    },
    ProgressLocation: { Notification: 15 },
}));

jest.mock('fs/promises', () => ({ rm: (...a: unknown[]) => mockRm(...a) }));

// The two ground-truth primitives for destroying a remote resource. Everything
// in the cleanup path exists to decide whether these get called.
const mockDeleteRepository = jest.fn();
const mockDeleteDaLiveSite = jest.fn();
const mockGetToken = jest.fn();
const mockEnsureDaLiveAuth = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({
        tokenService: { getToken: (...a: unknown[]) => mockGetToken(...a) },
        repoOperations: { deleteRepository: (...a: unknown[]) => mockDeleteRepository(...a) },
    }),
    // `{ authenticated }` — read from edsHelpers, not guessed. The first draft
    // wrote `{ success, authService }` and the DA.live cleanup silently skipped.
    ensureDaLiveAuth: (...a: unknown[]) => mockEnsureDaLiveAuth(...a),
    getDaLiveAuthService: jest.fn().mockReturnValue({}),
}));

// requireActual keeps `isEdsProject`/`extractEdsMetadata` REAL — they decide
// which confirmation path runs, and a stub of them would hide the fixture bug
// the CONTROL test exists to catch.
jest.mock('@/features/eds/services/resourceCleanupHelpers', () => ({
    ...jest.requireActual('@/features/eds/services/resourceCleanupHelpers'),
    deleteDaLiveSite: (...a: unknown[]) => mockDeleteDaLiveSite(...a),
    formatCleanupResults: () => '',
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: () => async () => 'token',
    DaLiveContentOperations: class {},
}));

// Real timers would make the exponential backoff take seconds of wall clock.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import {
    deleteProject,
    deleteProjectFiles,
} from '@/features/projects-dashboard/services/projectDeletionService';
import type { DeletionServices } from '@/features/projects-dashboard/services/projectDeletionService';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';

/** A plain, non-EDS project — takes the simple warning-modal path. */
function plainProject(over: Partial<Project> = {}): Project {
    return createMockProject({ name: 'demo-project', path: '/projects/demo', ...over });
}

/**
 * An EDS project — takes the cleanup-options dialog path instead.
 *
 * `isEdsProject` keys off `componentInstances`, NOT `componentSelections`
 * (resourceCleanupHelpers.ts:90). Getting that wrong is silent: the project
 * simply takes the plain path and every assertion still passes, which is
 * exactly what the first draft of this file did.
 *
 * The metadata fields are the ones `extractEdsMetadata` reads; without them
 * it returns a null-ish shape and `deleteProject` skips the EDS branch again.
 */
function edsProject(over: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo-project',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'skukla/demo-storefront',
                    daLiveOrg: 'skukla',
                    daLiveSite: 'demo-storefront',
                },
            },
        },
        ...over,
    });
}

function context(): HandlerContext {
    return createMockHandlerContext();
}

/**
 * The CDN-unpublish services, handed in through the seam.
 *
 * There used to be a `jest.mock` here instead, supplying an `unpublishAllContent`
 * the source had stopped calling and NO `initKeyStore` static. The key-store init is
 * the first statement inside the step's try block, so it threw a TypeError, the catch
 * logged it as a warning, and every Helix call below was unreachable — with 23 tests
 * green. Measured 2026-08-31 by planting a throw inside that try: the suite did not
 * notice.
 */
const mockInitKeyStore = jest.fn();
const mockListAllPages = jest.fn();
const mockUnpublishPages = jest.fn();
const mockDeleteAdminApiKey = jest.fn();
const SERVICES: DeletionServices = {
    initKeyStore: mockInitKeyStore,
    makeHelix: () => ({
        listAllPages: mockListAllPages,
        unpublishPages: mockUnpublishPages,
        deleteAdminApiKey: mockDeleteAdminApiKey,
    }),
};

/** The three ways a user leaves the cleanup dialog. Two of them are cancels. */
type Gesture = 'escape' | 'cancelButton' | 'accept';

/**
 * A fake `QuickPick` that performs one gesture when the code calls `show()`.
 *
 * The dialog is event-driven — `showCleanupConfirmation` returns a promise that
 * only settles inside `onDidHide` / `onDidTriggerButton` / `onDidAccept` — so a
 * stub that merely records the call would hang the test forever.
 */
function armQuickPick(
    gesture: Gesture,
    /** Which resource rows the user leaves ticked when they press Enter. */
    keep: Array<'github' | 'daLive'> = ['github', 'daLive']
): { selected: () => unknown[] } {
    const handlers: Record<string, () => void> = {};
    const pick = {
        title: '',
        placeholder: '',
        canSelectMany: false,
        ignoreFocusOut: false,
        items: [] as Array<{ id: string; picked?: boolean }>,
        selectedItems: [] as Array<{ id: string }>,
        buttons: [] as unknown[],
        onDidTriggerButton: (h: () => void) => (handlers.button = h),
        onDidAccept: (h: () => void) => (handlers.accept = h),
        onDidHide: (h: () => void) => (handlers.hide = h),
        hide: () => {},
        dispose: () => {},
        show: () => {
            if (gesture === 'escape') handlers.hide?.();
            if (gesture === 'cancelButton') handlers.button?.();
            if (gesture === 'accept') {
                // Untick whatever `keep` leaves out — the production code reads
                // `selectedItems`, so this IS the user's choice.
                pick.selectedItems = pick.items.filter((i) =>
                    keep.includes(i.id as 'github' | 'daLive')
                );
                handlers.accept?.();
            }
        },
    };
    mockCreateQuickPick.mockReturnValue(pick);
    return { selected: () => pick.selectedItems };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockInitKeyStore.mockResolvedValue(undefined);
    mockListAllPages.mockResolvedValue(['/index', '/products']);
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
        expect(asked.filter((t) => /Are you sure/.test(t))).toEqual([]);
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

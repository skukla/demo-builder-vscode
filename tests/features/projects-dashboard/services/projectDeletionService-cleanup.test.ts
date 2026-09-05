/**
 * What the delete DOES once the user has said yes.
 *
 * The sibling suite asks the safety question — does cancelling delete nothing.
 * This one asks the completeness question: given a yes, which remote resources
 * are destroyed, in what order, with what arguments, and what does the caller
 * learn when one of them fails.
 *
 * Every assertion reads the arguments a collaborator received or the
 * `cleanupResults` the service reports, never a value a mock handed back. A mock
 * answers the same however it is invoked, so asserting its answer would test the
 * mock rather than the call — which is exactly how a Helix step in this file once
 * sat unreachable behind a TypeError with 23 tests green.
 */

import {
    deleteProject,
    mockCreateQuickPick,
    mockDefaultDeleteAdminApiKey,
    mockDefaultListAllPages,
    mockDefaultUnpublishPages,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockDeleteDaLiveSite,
    mockEnsureDaLiveAuth,
    mockGetConfiguration,
    mockGetToken,
    mockHelixInitKeyStore,
    mockRemoveSitePermissions,
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
    mockListAllPages,
    mockUnpublishPages,
    plainProject,
} from './projectDeletionService.fixtures';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';

/** The cleanup ledger the service reports back on its response. */
function resultsOf(result: { data?: unknown }): CleanupResultItem[] {
    return (result.data as { cleanupResults?: CleanupResultItem[] }).cleanupResults ?? [];
}

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

describe('a confirmed plain delete', () => {
    it('removes the files and reports an empty cleanup ledger', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');

        const result = await deleteProject(context(), plainProject(), SERVICES);

        expect(mockRm).toHaveBeenCalled();
        expect(result.data).toEqual({
            success: true,
            projectName: 'demo-project',
            cleanupResults: [],
        });
    });

    it('asks with a MODAL — a delete must not be dismissible by clicking elsewhere', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ modal: true }),
            'Delete',
        );
    });

    it('still asks a plain project even when cleanupBehavior is deleteAll', async () => {
        // deleteAll waives the RESOURCE dialog, which a non-EDS project never sees.
        // It must not waive the delete confirmation itself.
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockShowWarningMessage).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
    });

    it('reports progress from within a NON-cancellable notification', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        // Half-deleting a project is not a state the user can be left in.
        expect(mockWithProgressOptions).toHaveBeenCalledWith(
            expect.objectContaining({ location: 15, cancellable: false }),
        );
    });

    it('shows no cleanup-settings tip — there was no cleanup to configure', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });
});

describe('the cleanup dialog it builds', () => {
    it('offers a row per available resource and pre-ticks NOTHING', async () => {
        const pick = armQuickPick('accept', []);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(pick.items().map((i) => i.id)).toEqual(['github', 'daLive']);
        // Destroying a repo is opt-in. A pre-ticked row makes Enter destructive.
        expect(pick.selectedAtShow()).toEqual([]);
    });

    it('offers only the DA.live row when the project has no GitHub repo', async () => {
        const pick = armQuickPick('accept', []);
        const project = edsProject();
        delete metadataOf(project).githubRepo;

        await deleteProject(context(), project, SERVICES);

        expect(pick.items().map((i) => i.id)).toEqual(['daLive']);
    });

    it('offers only the GitHub row when the DA.live pair is incomplete', async () => {
        const pick = armQuickPick('accept', []);
        const project = edsProject();
        // A half pair addresses nothing, so it must not be offered as deletable.
        // The ORG is the half to remove: extractEdsMetadata falls back to the repo
        // name for a missing site, so deleting daLiveSite leaves the pair complete.
        delete metadataOf(project).daLiveOrg;

        await deleteProject(context(), project, SERVICES);

        expect(pick.items().map((i) => i.id)).toEqual(['github']);
    });

    it('stays open when the webview steals focus, and carries a cancel button', async () => {
        const pick = armQuickPick('accept', []);

        await deleteProject(context(), edsProject(), SERVICES);

        // ignoreFocusOut: the dashboard webview takes focus while this is up, and a
        // dialog that vanished then would read as a silent cancel.
        expect(pick.flags()).toEqual({ canSelectMany: true, ignoreFocusOut: true });
        expect(pick.buttons()).toHaveLength(1);
        expect(pick.buttons()[0]).toHaveProperty('iconPath');
    });

    it('settles once — a hide after an accept does not turn the answer into a cancel', async () => {
        // Real VS Code fires onDidHide after onDidAccept. Without the resolved guard
        // the second handler would resolve null and cancel a confirmed delete.
        armQuickPick('acceptThenHide', ['github', 'daLive']);

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockRm).toHaveBeenCalled();
        expect(mockDeleteRepository).toHaveBeenCalled();
        expect(result.data).toMatchObject({ success: true });
    });

    it('falls back to the plain modal for an EDS project with no external resources', async () => {
        const project = edsProject();
        delete metadataOf(project).githubRepo;
        delete metadataOf(project).daLiveOrg;
        delete metadataOf(project).daLiveSite;
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), project, SERVICES);

        expect(mockCreateQuickPick).not.toHaveBeenCalled();
        expect(mockShowWarningMessage).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
    });

    it('cancels when that fallback modal is dismissed', async () => {
        const project = edsProject();
        delete metadataOf(project).githubRepo;
        delete metadataOf(project).daLiveOrg;
        delete metadataOf(project).daLiveSite;
        mockShowWarningMessage.mockResolvedValue(undefined);

        const result = await deleteProject(context(), project, SERVICES);

        expect(mockRm).not.toHaveBeenCalled();
        // The CALL succeeded; the deletion did not. A caller reading only the
        // envelope must not conclude the project is gone.
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ success: false, error: 'cancelled' });
    });

    it('makes that fallback modal modal too', async () => {
        const project = edsProject();
        delete metadataOf(project).githubRepo;
        delete metadataOf(project).daLiveOrg;
        delete metadataOf(project).daLiveSite;
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), project, SERVICES);

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ modal: true }),
            'Delete',
        );
    });
});

describe('cleanupBehavior: deleteAll picks the resources itself', () => {
    beforeEach(() => {
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });
    });

    it('takes both resources when both are addressable', async () => {
        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('takes only the DA.live site when there is no repo to take', async () => {
        const project = edsProject();
        delete metadataOf(project).githubRepo;

        await deleteProject(context(), project, SERVICES);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });

    it('takes only the repo when the DA.live pair is incomplete', async () => {
        const project = edsProject();
        delete metadataOf(project).daLiveOrg;

        await deleteProject(context(), project, SERVICES);

        expect(mockDeleteRepository).toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
    });
});

describe('cleanupBehavior: localOnly deletes the project and nothing else', () => {
    it('removes the files and spares both remote resources on a confirmed delete', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'localOnly' });
        mockShowWarningMessage.mockResolvedValue('Delete');

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockCreateQuickPick).not.toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
        expect(resultsOf(result)).toEqual([]);
    });

    it('asks with a modal', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'localOnly' });
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ modal: true }),
            'Delete',
        );
    });
});

/** The stored EDS metadata of a fixture, for tests that spoil one field. */
function metadataOf(project: ReturnType<typeof edsProject>): Record<string, unknown> {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata;
    if (!metadata) throw new Error('fixture is missing its eds-storefront metadata');
    return metadata as Record<string, unknown>;
}

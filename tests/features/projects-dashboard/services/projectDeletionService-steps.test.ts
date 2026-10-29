/**
 * The steps a delete shows while it runs (progress vocabulary slice 2, owner
 * 2026-10-16).
 *
 * Every line a delete reported was shown AS the step: "Taking the pages off the
 * CDN", then "Deleting the DA.live content", each with no expectation and nothing
 * under it. Each phase is now a step from the stage table, numbered "(n of N)"
 * because the list is known once the SC has said what to remove; a count or detail
 * is the line under it.
 */

import {
    deleteProject,
    mockCheckLiveStatus,
    mockDeleteDaLiveSite,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockEnsureDaLiveAuth,
    mockGetConfiguration,
    mockGetToken,
    mockHelixInitKeyStore,
    mockProgressReport,
    mockRemoveSitePermissions,
    mockRm,
    mockShowInformationMessage,
    mockShowWarningMessage,
    mockSleep,
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
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { startModalRun } from '@/core/vscode/operationProgress';
import { answerOperationPrompt, isAwaitingAnswer } from '@/core/vscode/operationPrompt';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const OP = 'delete-op';

/** The modal's lines while a step runs: [line 1, its position, line 2]. */
async function modalSteps(run: () => Promise<unknown>): Promise<Array<[unknown, unknown, unknown]>> {
    const pushed: OperationProgressPayload[] = [];
    startModalRun(OP, async (_type: string, payload?: unknown) => {
        pushed.push(payload as OperationProgressPayload);
    });
    await run();
    return pushed
        .filter((p) => p.state === 'running' && p.stage !== undefined)
        .map((p) => (p.state === 'running' ? [p.stage, p.position, p.step] : [undefined, undefined, undefined]));
}

const at = (index: number, total: number) => ({ index, total });

/**
 * Delete the EDS project from a screen: the cleanup question is asked in the modal
 * (`deletionConfirmation-modal.test.ts`), answered here with the resources ticked.
 */
async function deleteFromScreen(ticked: { github: boolean; daLive: boolean }): Promise<void> {
    const done = deleteProject(context(), edsProject(), SERVICES, { progress: 'modal', operationId: OP });
    for (let i = 0; i < 50 && !isAwaitingAnswer(OP); i++) {
        await Promise.resolve();
    }
    expect(isAwaitingAnswer(OP)).toBe(true);
    answerOperationPrompt(OP, 'Delete', {
        github: ticked.github ? 'true' : '',
        daLive: ticked.daLive ? 'true' : '',
    });
    await done;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockSleep.mockResolvedValue(undefined);
    mockGetConfiguration.mockReturnValue({ get: () => 'ask' });
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockDeleteDaLiveSite.mockResolvedValue({ success: true });
    mockGetToken.mockResolvedValue('gh-token');
    mockDeleteRepository.mockResolvedValue(undefined);
    mockRemoveSitePermissions.mockResolvedValue({ success: true });
    mockDeleteSiteConfig.mockResolvedValue({ success: true });
    mockInitKeyStore.mockResolvedValue(undefined);
    mockHelixInitKeyStore.mockResolvedValue(undefined);
    mockListAllPages.mockResolvedValue(['/index', '/products']);
    mockListPublishedPaths.mockResolvedValue([]);
    mockUnpublishPages.mockResolvedValue({ success: true, count: 2, total: 2, liveFailed: 0, previewFailed: 0 });
    mockDeleteAdminApiKey.mockResolvedValue({ success: true });
    mockCheckLiveStatus.mockImplementation(async () => 404);
});

describe('in the progress modal', () => {
    it('numbers every step of a full EDS delete, each with what it is doing under it', async () => {
        const steps = await modalSteps(() => deleteFromScreen({ github: true, daLive: true }));

        expect(steps).toStrictEqual([
            [OPERATION_STAGES.checkingRequirements.label, at(1, 8), 'Your DA.live sign-in'],
            [OPERATION_STAGES.takingPagesOffSite.label, at(2, 8), OPERATION_STAGES.takingPagesOffSite.detail],
            [OPERATION_STAGES.removingProductPages.label, at(3, 8), OPERATION_STAGES.removingProductPages.detail],
            [OPERATION_STAGES.removingProductPages.label, at(3, 8), 'The page made for each product'],
            [OPERATION_STAGES.clearingDaLiveContent.label, at(4, 8), OPERATION_STAGES.clearingDaLiveContent.detail],
            [OPERATION_STAGES.clearingSiteSettings.label, at(5, 8), OPERATION_STAGES.clearingSiteSettings.detail],
            [OPERATION_STAGES.deletingRepository.label, at(6, 8), OPERATION_STAGES.deletingRepository.detail],
            // EDS-67: AEM's copy of the code, once the repository is gone.
            [OPERATION_STAGES.removingSiteCode.label, at(7, 8), OPERATION_STAGES.removingSiteCode.detail],
            [OPERATION_STAGES.removingProjectFiles.label, at(8, 8), OPERATION_STAGES.removingProjectFiles.detail],
        ]);
    });

    it('counts only the steps the SC chose', async () => {
        const steps = await modalSteps(() => deleteFromScreen({ github: true, daLive: false }));

        expect(steps.map(([stage, position]) => [stage, position])).toStrictEqual([
            [OPERATION_STAGES.deletingRepository.label, at(1, 3)],
            [OPERATION_STAGES.removingSiteCode.label, at(2, 3)],
            [OPERATION_STAGES.removingProjectFiles.label, at(3, 3)],
        ]);
    });

    // "1 of 1" says nothing a step alone does not.
    it('shows a project with nothing online as one step, unnumbered', async () => {
        mockShowWarningMessage.mockResolvedValue('Delete');

        const steps = await modalSteps(() =>
            deleteProject(context(), plainProject(), SERVICES, { progress: 'modal', operationId: OP }),
        );

        expect(steps).toStrictEqual([
            [OPERATION_STAGES.removingProjectFiles.label, undefined, OPERATION_STAGES.removingProjectFiles.detail],
        ]);
    });
});

describe('in a notification', () => {
    // The notification's one line is the step and its position, never a count.
    it('shows each step with its position', async () => {
        armQuickPick('accept', ['github', 'daLive']);

        await deleteProject(context(), edsProject(), SERVICES);

        const lines = mockProgressReport.mock.calls.map(([update]) => (update as { message?: string }).message);
        expect(lines).toStrictEqual([
            'Checking requirements (1 of 8)',
            'Taking pages off the site (2 of 8)',
            'Removing product pages (3 of 8)',
            'Removing product pages (3 of 8)',
            'Clearing DA.live content (4 of 8)',
            'Clearing site settings (5 of 8)',
            'Deleting the repository (6 of 8)',
            "Removing the site's code (7 of 8)",
            'Removing project files (8 of 8)',
        ]);
    });
});

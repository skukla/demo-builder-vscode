/**
 * A delete started from a screen asks its cleanup question in that screen's
 * progress modal, not in a QuickPick at the top of the window (picker-to-modal).
 * The answer must mean what the QuickPick's did: ticked boxes are deleted, the
 * rest are kept, and dismissing deletes nothing. The question is asked by
 * `askCleanupInModal` in `deletionConfirmation.ts`.
 */

import {
    deleteProject,
    mockCreateQuickPick,
    mockDeleteDaLiveSite,
    mockDeleteRepository,
    mockEnsureDaLiveAuth,
    mockGetConfiguration,
    mockGetToken,
    mockRm,
    mockShowInformationMessage,
    mockSleep,
} from './projectDeletionService.testUtils';
import {
    SERVICES,
    context,
    edsProject,
    mockDeleteAdminApiKey,
    mockInitKeyStore,
    mockListAllPages,
    mockListPublishedPaths,
    mockUnpublishPages,
} from './projectDeletionService.fixtures';
import { heldProgress } from '@/core/vscode/operationProgress';
import { answerOperationPrompt, isAwaitingAnswer } from '@/core/vscode/operationPrompt';

const ID = 'delete-demo-project';

/** Start a modal delete and wait until its question is up. */
async function deleteAndAsk() {
    const done = deleteProject(context(), edsProject(), SERVICES, { progress: 'modal', operationId: ID });
    for (let i = 0; i < 50 && !isAwaitingAnswer(ID); i++) {
        await Promise.resolve();
    }
    expect(isAwaitingAnswer(ID)).toBe(true);
    return { done };
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
});

describe('the cleanup question in the progress modal', () => {
    it('never opens the QuickPick', async () => {
        const { done } = await deleteAndAsk();
        answerOperationPrompt(ID, undefined);
        await done;

        expect(mockCreateQuickPick).not.toHaveBeenCalled();
    });

    it('dismissing deletes nothing', async () => {
        const { done } = await deleteAndAsk();
        answerOperationPrompt(ID, undefined, { github: 'true', daLive: 'true' });
        const result = await done;

        expect(result.data).toEqual({ success: false, error: 'cancelled' });
        expect(mockRm).not.toHaveBeenCalled();
        expect(mockDeleteRepository).not.toHaveBeenCalled();
    });

    it('Delete removes the files and only the ticked resources', async () => {
        const { done } = await deleteAndAsk();
        answerOperationPrompt(ID, 'Delete', { github: 'true', daLive: '' });
        await done;

        expect(mockRm).toHaveBeenCalled();
        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
    });

    it('asks with one unticked box per resource, each described by what it would delete, and one Delete action', async () => {
        const { done } = await deleteAndAsk();
        const prompt = heldProgress(ID)?.prompt;
        answerOperationPrompt(ID, undefined);
        await done;

        expect(prompt?.actions).toStrictEqual(['Delete']);
        expect(
            prompt?.fields?.map(({ id, kind, value, description }) => ({ id, kind, value, description })),
        ).toStrictEqual([
            { id: 'github', kind: 'checkbox', value: '', description: 'skukla/demo-storefront' },
            { id: 'daLive', kind: 'checkbox', value: '', description: 'skukla/demo-storefront' },
        ]);
        // Every box says what it is; the words themselves are not this test's business.
        expect(prompt?.fields?.every((field) => field.label.length > 0)).toBe(true);
    });

    it('Delete with only the DA.live box ticked takes the site and spares the repository', async () => {
        mockInitKeyStore.mockResolvedValue(undefined);
        mockListAllPages.mockResolvedValue([]);
        mockUnpublishPages.mockResolvedValue({
            success: true,
            count: 0,
            total: 0,
            liveFailed: 0,
            previewFailed: 0,
        });
        mockDeleteAdminApiKey.mockResolvedValue({ success: true });
        mockListPublishedPaths.mockResolvedValue([]);
        const { done } = await deleteAndAsk();
        answerOperationPrompt(ID, 'Delete', { github: '', daLive: 'true' });
        await done;

        expect(mockDeleteDaLiveSite).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(mockDeleteRepository).not.toHaveBeenCalled();
    });
});

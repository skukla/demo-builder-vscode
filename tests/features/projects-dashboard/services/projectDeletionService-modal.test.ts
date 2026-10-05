/**
 * A delete started from a screen asks its cleanup question in that screen's
 * progress modal, not in a QuickPick at the top of the window (picker-to-modal).
 * The answer must mean what the QuickPick's did: ticked boxes are deleted, the
 * rest are kept, and dismissing deletes nothing.
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
import { SERVICES, context, edsProject } from './projectDeletionService.fixtures';
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
});

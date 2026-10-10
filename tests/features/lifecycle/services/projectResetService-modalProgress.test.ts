/**
 * projectResetService — a reset started from a screen (`progress: 'modal'`).
 *
 * PL-59 R1: the reset narrates in that screen's progress modal, keyed by the id the
 * screen gave, with no notification beside it; a failure is answered to the caller
 * and must NOT be repeated as an error notification (the modal already shows it).
 * Pinned by the PL-69 sitting 9 re-measure (2026-10-09): the modal branch, its id and
 * the suppressed notification had no test.
 */

import {
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
    installResetDefaults,
    mockGetStackById,
    resetProjectWithUI,
    showErrorMessage,
    withProgress,
} from './projectResetService-resetWithUI.testUtils';
import { startModalRun } from '@/core/vscode/operationProgress';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

function runInModal(id: string, project = createResetProject()) {
    const pushed: OperationProgressPayload[] = [];
    startModalRun(id, async (_type: string, payload?: unknown) => {
        pushed.push(payload as OperationProgressPayload);
    });
    const done = resetProjectWithUI({
        project,
        context: createResetHandlerContext(),
        commandManager,
        authManager,
        progress: 'modal',
        operationId: id,
    });
    return { pushed, done };
}

beforeEach(installResetDefaults);

describe('resetProjectWithUI — started from a screen (progress: modal)', () => {
    it("narrates in that screen's modal, by the id the screen gave, and ends it as succeeded", async () => {
        const { pushed, done } = runInModal('screen-reset-1');

        await expect(done).resolves.toEqual(expect.objectContaining({ success: true }));

        // One surface per operation: no notification beside the modal.
        expect(withProgress).not.toHaveBeenCalled();
        expect(pushed.at(-1)).toStrictEqual({ id: 'screen-reset-1', state: 'succeeded' });
    });

    it('a failure is answered, not repeated as an error notification beside the modal', async () => {
        mockGetStackById.mockReturnValue(undefined);
        const { done } = runInModal('screen-reset-2', createResetProject({ selectedStack: 'gone' }));

        await expect(done).resolves.toEqual({
            success: false,
            error: 'Stack "gone" not found in stacks.json. Cannot reset.',
        });
        expect(showErrorMessage).not.toHaveBeenCalled();
    });
});

/**
 * "Run in background" hands the operation to a VS Code progress notification that
 * keeps narrating it (owner, 2026-09-19: the modal vanished and the SC lost track of
 * what was happening). Reopening the modal takes it back; only one surface narrates.
 */

const mockProgressReport = jest.fn();
let mockProgressEnded: Promise<unknown> | undefined;
const mockWithProgress = jest.fn(
    (_options: unknown, task: (p: { report: (v: unknown) => void }) => Promise<unknown>) => {
        mockProgressEnded = task({ report: (v) => mockProgressReport(v) });
        return mockProgressEnded;
    },
);
const mockShowWarning = jest.fn();
const mockShowInformation = jest.fn();
const mockStatusBar = jest.fn();
const mockExecuteCommand = jest.fn();
jest.mock('vscode', () => ({
    window: {
        withProgress: (...a: [unknown, never]) => mockWithProgress(...a),
        showWarningMessage: (...a: unknown[]) => mockShowWarning(...a),
        showInformationMessage: (...a: unknown[]) => mockShowInformation(...a),
        setStatusBarMessage: (...a: unknown[]) => mockStatusBar(...a),
    },
    commands: { executeCommand: (...a: unknown[]) => mockExecuteCommand(...a) },
    ProgressLocation: { Notification: 15 },
}));

import {
    handleBackgroundOperation,
    handleGetOperationProgress,
    pushOperationProgress,
} from '@/core/vscode/operationProgress';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { BackgroundOperationRequest } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../helpers/handlerContextTestHelpers';

const ID = 'erp-integration';
const TITLE = 'Redeploying ERP integration';
/** The result's own words, which the notification ends in (prototype-conventions rule 21). */
const DONE = 'ERP Integration Redeployed';
const FAILED = "Couldn't Redeploy ERP Integration";
const REQUEST: BackgroundOperationRequest = { id: ID, title: TITLE, doneTitle: DONE, failedTitle: FAILED };

async function runningInBackground(): Promise<void> {
    await pushOperationProgress({
        id: ID,
        state: 'running',
        stage: 'Deploying the app',
        step: 'Running aio app deploy',
    });
    await handleBackgroundOperation(createMockHandlerContext(), REQUEST);
}

beforeEach(async () => {
    // The result's notification closes itself after a timer: fake, so no test waits on it.
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockShowWarning.mockResolvedValue(undefined);
    // Leave nothing held between tests: end any run a test left open.
    await pushOperationProgress({ id: ID, state: 'succeeded' });
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('Run in background', () => {
    it('opens a notification titled with the operation, at the stage it had reached', async () => {
        await runningInBackground();

        expect(mockWithProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: TITLE, location: 15, cancellable: false }),
            expect.any(Function),
        );
        // The stage alone: the short words. The step is the modal's long set.
        expect(mockProgressReport).toHaveBeenCalledWith({ message: 'Deploying the app' });
    });

    it('keeps narrating each stage the operation reaches', async () => {
        await runningInBackground();

        await pushOperationProgress({ id: ID, state: 'running', stage: 'Installing into Commerce' });

        expect(mockProgressReport).toHaveBeenLastCalledWith({ message: 'Installing into Commerce' });
    });

    // Owner walk, 2026-11-16: "Installing Frescopa: Installing Frescopa". A stage that only says what
    // the title does gives way to the step: the part under way.
    it('says the step, not the stage, when the stage is the title again', async () => {
        await pushOperationProgress({ id: 'datapack-x', state: 'running', stage: 'Installing Frescopa', step: 'Categories, 4 of 10' });
        await handleBackgroundOperation(createMockHandlerContext(), { ...REQUEST, id: 'datapack-x', title: 'Installing Frescopa' });

        expect(mockProgressReport).toHaveBeenLastCalledWith({ message: 'Categories, 4 of 10' });
        await pushOperationProgress({ id: 'datapack-x', state: 'succeeded' });
    });

    it('shows the pair count after the stage', async () => {
        await runningInBackground();

        await pushOperationProgress({
            id: ID,
            state: 'running',
            stage: 'Deploying the app',
            position: { index: 2, total: 2 },
        });

        expect(mockProgressReport).toHaveBeenLastCalledWith({ message: 'Deploying the app (2 of 2)' });
    });

    it("closes when the operation succeeds, then says the result's words in a notification that closes itself", async () => {
        await runningInBackground();
        const narrating = mockProgressEnded;

        await pushOperationProgress({ id: ID, state: 'succeeded' });

        await expect(narrating).resolves.toBeUndefined();
        // The second progress notification is the result: titled with its words, no button.
        expect(mockWithProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ title: DONE, location: 15, cancellable: false }),
            expect.any(Function),
        );
        let closed = false;
        void mockProgressEnded?.then(() => {
            closed = true;
        });
        await Promise.resolve();
        expect(closed).toBe(false);
        await jest.advanceTimersByTimeAsync(TIMEOUTS.UI.NOTIFICATION);
        expect(closed).toBe(true);
        expect(mockStatusBar).not.toHaveBeenCalled();
        expect(mockShowWarning).not.toHaveBeenCalled();
        expect(mockShowInformation).not.toHaveBeenCalled();
    });

    it("names a success by its own title when the run gave one (a save with nothing to save)", async () => {
        await runningInBackground();

        await pushOperationProgress({ id: ID, state: 'succeeded', title: 'No Changes to Save' });

        expect(mockWithProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ title: 'No Changes to Save' }),
            expect.any(Function),
        );
    });

    it("says a success's warning in a warning notification that stays, under the result's words", async () => {
        await runningInBackground();

        await pushOperationProgress({ id: ID, state: 'succeeded', warning: 'Prices were not published.' });

        await expect(mockProgressEnded).resolves.toBeUndefined();
        expect(mockShowWarning).toHaveBeenCalledWith(`${DONE}. Prices were not published.`);
        expect(mockStatusBar).not.toHaveBeenCalled();
        expect(mockWithProgress).toHaveBeenCalledTimes(1);
    });

    it('says a warning under the title the window ends on with one, when it has its own', async () => {
        await pushOperationProgress({ id: ID, state: 'running', stage: 'Resetting' });
        await handleBackgroundOperation(createMockHandlerContext(), {
            ...REQUEST,
            warnedTitle: "Couldn't Reset Projects",
        });

        await pushOperationProgress({ id: ID, state: 'succeeded', warning: '1 project not reset.' });

        expect(mockShowWarning).toHaveBeenCalledWith("Couldn't Reset Projects. 1 project not reset.");
    });

    it("says a success's note in a plain notification, never a warning", async () => {
        await runningInBackground();

        await pushOperationProgress({
            id: ID,
            state: 'succeeded',
            note: 'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.',
        });

        await expect(mockProgressEnded).resolves.toBeUndefined();
        expect(mockShowInformation).toHaveBeenCalledWith(
            `${DONE}. Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.`,
        );
        expect(mockShowWarning).not.toHaveBeenCalled();
        expect(mockStatusBar).not.toHaveBeenCalled();
    });

    it('turns into a warning with the reason and the Debug Logs when it fails', async () => {
        mockShowWarning.mockResolvedValue('Open Debug Logs');
        await runningInBackground();

        await pushOperationProgress({ id: ID, state: 'failed', error: 'Adobe refused this.' });
        await mockProgressEnded;
        await Promise.resolve();

        expect(mockShowWarning).toHaveBeenCalledWith(`${FAILED}. Adobe refused this.`, 'Open Debug Logs');
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showDebugLogs');
    });

    it('closes without a word when the SC takes it back into the modal', async () => {
        await runningInBackground();

        await handleGetOperationProgress(createMockHandlerContext(), { id: ID });

        await expect(mockProgressEnded).resolves.toBeUndefined();
        await pushOperationProgress({ id: ID, state: 'succeeded' });
        expect(mockWithProgress).toHaveBeenCalledTimes(1);
    });

    it('opens nothing for an operation that has already ended', async () => {
        await handleBackgroundOperation(createMockHandlerContext(), REQUEST);

        expect(mockWithProgress).not.toHaveBeenCalled();
    });

    it('refuses a request with no id or title', async () => {
        const result = await handleBackgroundOperation(createMockHandlerContext(), { id: ID });

        expect(result).toMatchObject({ success: false, code: 'INVALID_OPERATION' });
        expect(mockWithProgress).not.toHaveBeenCalled();
    });

    it("refuses a request without the result's words, which the notification ends in", async () => {
        await pushOperationProgress({ id: ID, state: 'running', stage: 'Deploying the app' });

        const result = await handleBackgroundOperation(createMockHandlerContext(), { id: ID, title: TITLE });

        expect(result).toMatchObject({ success: false, code: 'INVALID_OPERATION' });
        expect(mockWithProgress).not.toHaveBeenCalled();
    });
});

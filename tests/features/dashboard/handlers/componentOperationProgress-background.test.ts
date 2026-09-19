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
const mockStatusBar = jest.fn();
const mockExecuteCommand = jest.fn();
jest.mock('vscode', () => ({
    window: {
        withProgress: (...a: [unknown, never]) => mockWithProgress(...a),
        showWarningMessage: (...a: unknown[]) => mockShowWarning(...a),
        setStatusBarMessage: (...a: unknown[]) => mockStatusBar(...a),
    },
    commands: { executeCommand: (...a: unknown[]) => mockExecuteCommand(...a) },
    ProgressLocation: { Notification: 15 },
}));

jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: { sendComponentOperationProgress: jest.fn() },
}));

import {
    handleBackgroundComponentOperation,
    handleGetComponentOperationProgress,
    pushComponentOperationProgress,
} from '@/features/dashboard/handlers/componentOperationProgress';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const ID = 'erp-integration';
const TITLE = 'Redeploying ERP integration';

async function runningInBackground(): Promise<void> {
    await pushComponentOperationProgress({
        id: ID,
        state: 'running',
        stage: 'Deploying the app',
        step: 'Running aio app deploy',
    });
    await handleBackgroundComponentOperation(createMockHandlerContext(), { id: ID, title: TITLE });
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockShowWarning.mockResolvedValue(undefined);
    // Leave nothing held between tests: end any run a test left open.
    await pushComponentOperationProgress({ id: ID, state: 'succeeded' });
    jest.clearAllMocks();
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

        await pushComponentOperationProgress({ id: ID, state: 'running', stage: 'Installing into Commerce' });

        expect(mockProgressReport).toHaveBeenLastCalledWith({ message: 'Installing into Commerce' });
    });

    it('closes when the operation succeeds, saying so in the status bar', async () => {
        await runningInBackground();

        await pushComponentOperationProgress({ id: ID, state: 'succeeded' });

        await expect(mockProgressEnded).resolves.toBeUndefined();
        expect(mockStatusBar).toHaveBeenCalledWith(`$(check) ${TITLE} — done`, expect.any(Number));
        expect(mockShowWarning).not.toHaveBeenCalled();
    });

    it('turns into a warning with the reason and the Debug Logs when it fails', async () => {
        mockShowWarning.mockResolvedValue('Open Debug Logs');
        await runningInBackground();

        await pushComponentOperationProgress({ id: ID, state: 'failed', error: 'Adobe refused this.' });
        await mockProgressEnded;
        await Promise.resolve();

        expect(mockShowWarning).toHaveBeenCalledWith(
            `${TITLE} did not finish: Adobe refused this.`,
            'Open Debug Logs',
        );
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showDebugLogs');
    });

    it('closes without a word when the SC takes it back into the modal', async () => {
        await runningInBackground();

        await handleGetComponentOperationProgress(createMockHandlerContext(), { id: ID });

        await expect(mockProgressEnded).resolves.toBeUndefined();
        await pushComponentOperationProgress({ id: ID, state: 'succeeded' });
        expect(mockStatusBar).not.toHaveBeenCalled();
    });

    it('opens nothing for an operation that has already ended', async () => {
        await handleBackgroundComponentOperation(createMockHandlerContext(), { id: ID, title: TITLE });

        expect(mockWithProgress).not.toHaveBeenCalled();
    });

    it('refuses a request with no id or title', async () => {
        const result = await handleBackgroundComponentOperation(createMockHandlerContext(), { id: ID });

        expect(result).toMatchObject({ success: false, code: 'INVALID_OPERATION' });
        expect(mockWithProgress).not.toHaveBeenCalled();
    });
});

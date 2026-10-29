/**
 * SyncStorefrontCommand — the steps the SC reads while it runs (progress vocabulary
 * slice 2, owner 2026-10-16).
 *
 * Started from the dashboard, the sync runs inside the progress modal, and every line
 * it reported reached the modal as a plain line. With no step reported before it, the
 * first one, "Saving your changes", froze as line 1 for the whole run, over the push
 * and the code publish. Each step is now reported AS a step; the palette's
 * notification still shows the step's name as its message.
 */

import * as vscode from 'vscode';
import {
    answerGit,
    makeLogger,
    makeStateManager,
    makeSyncStorefrontContext,
    makeSyncTargetProject,
    mockGetAccessToken,
    rejectPushOnce,
    resetSyncStorefrontMocks,
    syncAndPublishMock,
    SyncStorefrontCommand,
    type SyncStorefrontOutcome,
} from './syncStorefront.testUtils';
import type { StateManager } from '@/core/state/stateManager';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { withStepSink } from '@/core/utils/operationStepChannel';
import type { SyncAndPublishInput, SyncAndPublishResult } from '@/features/eds/services/storefront/storefrontSyncService';

const PUBLISHED: SyncAndPublishResult = { committed: true, pushed: true, helixPublished: true, summary: '' };

/** The service as it runs for real, naming its push and its code publish. */
async function namingItsSteps(input: SyncAndPublishInput): Promise<SyncAndPublishResult> {
    input.onStep?.(OPERATION_STAGES.pushingToGitHub.label);
    input.onStep?.(OPERATION_STAGES.publishingCode.label);
    return PUBLISHED;
}

function runCommand(): Promise<SyncStorefrontOutcome> {
    return new SyncStorefrontCommand(
        makeSyncStorefrontContext(),
        makeStateManager(makeSyncTargetProject()) as unknown as StateManager,
        makeLogger(),
    ).execute();
}

/** The steps the progress modal was handed, in order. */
async function stepsInModal(): Promise<string[]> {
    const steps: string[] = [];
    await withStepSink((stage) => steps.push(stage), runCommand);
    return steps;
}

beforeEach(() => {
    resetSyncStorefrontMocks();
    mockGetAccessToken.mockResolvedValue('da-token');
});

describe('in the progress modal', () => {
    it('shows saving, pushing and publishing the code as three steps', async () => {
        syncAndPublishMock.mockImplementation(namingItsSteps);

        expect(await stepsInModal()).toStrictEqual([
            OPERATION_STAGES.savingChanges.label,
            OPERATION_STAGES.pushingToGitHub.label,
            OPERATION_STAGES.publishingCode.label,
        ]);
    });

    it('shows the merge as a step of its own when GitHub had work the SC did not', async () => {
        rejectPushOnce();
        syncAndPublishMock.mockImplementationOnce(namingItsSteps);
        answerGit({});

        expect(await stepsInModal()).toStrictEqual([
            OPERATION_STAGES.savingChanges.label,
            OPERATION_STAGES.mergingChanges.label,
            OPERATION_STAGES.pushingToGitHub.label,
            OPERATION_STAGES.publishingCode.label,
        ]);
    });

    // In the modal, a plain line is the line UNDER the step: the step's own name
    // there a second time would read "Saving your changes" twice.
    it('does not report a step the modal took again as a plain line', async () => {
        const report = jest.fn();
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) => task({ report }),
        );
        syncAndPublishMock.mockImplementation(namingItsSteps);

        await stepsInModal();

        expect(report).not.toHaveBeenCalled();
    });
});

describe('from the command palette', () => {
    it("shows each step's name as the notification's message", async () => {
        const report = jest.fn();
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) => task({ report }),
        );
        syncAndPublishMock.mockImplementation(namingItsSteps);

        await runCommand();

        expect(report.mock.calls).toStrictEqual([
            [{ message: OPERATION_STAGES.savingChanges.label }],
            [{ message: OPERATION_STAGES.pushingToGitHub.label }],
            [{ message: OPERATION_STAGES.publishingCode.label }],
        ]);
    });
});

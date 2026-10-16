/**
 * The dashboard's three storefront buttons narrate where the SC is looking
 * (PL-59 slice 4, plan rows 6-8): the screen's progress modal when the button
 * asked for one, else the notification they have always used.
 *
 * Sync and the block-library refresh run through their palette COMMANDS, which
 * report through `BaseCommand.withProgress`. Inside a modal that stands down and
 * reports there instead (R7) — what these pin is that the handler asks for the
 * modal at all, and that it ends on what the command answered rather than on
 * "the command returned".
 */

import * as vscode from 'vscode';
import {
    handleRefreshBlockLibrary,
    handleSyncStorefront,
} from '@/features/dashboard/handlers/edsContentHandlers';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { reportStep } from '@/core/utils/operationStepChannel';
import { startModalRun } from '@/core/vscode/operationProgress';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockProject } from '../../../helpers/projectFake';
import type { HandlerContext } from '@/types/handlers';

const executeCommand = vscode.commands.executeCommand as jest.Mock;
const screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);

function context(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest
                .fn()
                // EDS-ness is the STACK id, which is what the block-library
                // refusal reads (`isEdsProject` -> `isEdsStackId`).
                .mockResolvedValue(createMockProject({ name: 'bodea', selectedStack: 'eds-accs' })),
        }),
        sendMessage: screen,
    });
}

/** Every progress payload the modal's screen was sent. */
function pushes(): Array<Record<string, unknown>> {
    return screen.mock.calls
        .filter(([type]) => type === 'operationProgress')
        .map(([, payload]) => payload as Record<string, unknown>);
}

/** The modal's lines while a step runs, as [line 1, line 2]; the run's own opening push names none. */
function running(): Array<[unknown, unknown]> {
    return pushes()
        .filter((payload) => payload.state === 'running' && payload.stage !== undefined)
        .map((payload) => [payload.stage, payload.step]);
}

beforeEach(() => {
    jest.clearAllMocks();
    executeCommand.mockResolvedValue({ success: true });
});

describe('sync storefront', () => {
    it('ends the modal on what the command answered', async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockResolvedValue({ success: false, error: 'push rejected' });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(executeCommand).toHaveBeenCalledWith('demoBuilder.syncStorefront');
        expect(pushes().at(-1)).toEqual({
            id: 'sync-storefront',
            state: 'failed',
            error: 'push rejected',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });

    // Until slice 2 of the progress vocabulary (owner 2026-10-16) the command's first
    // line froze as the modal's step for the whole sync.
    it("shows each step the command reports as the modal's step, its lines under it", async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockImplementation(async () => {
            reportStep(OPERATION_STAGES.savingChanges.label);
            reportPhase('3 files');
            reportStep(OPERATION_STAGES.pushingToGitHub.label);
            reportStep(OPERATION_STAGES.publishingCode.label);
            return { success: true };
        });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(running()).toStrictEqual([
            [OPERATION_STAGES.savingChanges.label, OPERATION_STAGES.savingChanges.detail],
            [OPERATION_STAGES.savingChanges.label, '3 files'],
            [OPERATION_STAGES.pushingToGitHub.label, OPERATION_STAGES.pushingToGitHub.detail],
            [OPERATION_STAGES.publishingCode.label, OPERATION_STAGES.publishingCode.detail],
        ]);
    });

    // The SC dismissed the commit-message prompt. Nothing failed, so the modal
    // closes rather than showing a failure with no reason in it.
    it('closes the modal when the run was cancelled', async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockResolvedValue({ success: false, cancelled: true });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(pushes().at(-1)).toEqual({
            id: 'sync-storefront',
            state: 'succeeded',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });

    it('opens a notification when no screen asked for the modal', async () => {
        await handleSyncStorefront(context(), undefined);

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Syncing the storefront' }),
            expect.any(Function),
        );
        expect(pushes()).toStrictEqual([]);
    });
});

describe('refresh block library', () => {
    it("shows each step as the modal's step, without its name a second time under it", async () => {
        startModalRun('block-library', screen);
        executeCommand.mockImplementation(async () => {
            reportStep(OPERATION_STAGES.buildingBlockLibrary.label, 'Building block library: 5 blocks');
            reportStep(OPERATION_STAGES.publishingBlockList.label, 'Publishing the block list: 2 pages');
            return { success: true };
        });

        await handleRefreshBlockLibrary(context(), { id: 'block-library', progress: 'modal' });

        expect(running()).toStrictEqual([
            [OPERATION_STAGES.buildingBlockLibrary.label, '5 blocks'],
            [OPERATION_STAGES.publishingBlockList.label, '2 pages'],
        ]);
    });

    it('ends the modal on what the command answered', async () => {
        startModalRun('block-library', screen);
        executeCommand.mockResolvedValue({ success: false, error: 'DA.live refused' });

        await handleRefreshBlockLibrary(context(), { id: 'block-library', progress: 'modal' });

        expect(executeCommand).toHaveBeenCalledWith('demoBuilder.refreshBlockLibrary');
        expect(pushes().at(-1)).toEqual({
            id: 'block-library',
            state: 'failed',
            error: 'DA.live refused',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });
});

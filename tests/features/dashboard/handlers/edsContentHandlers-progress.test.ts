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
        });
    });

    // The SC dismissed the commit-message prompt. Nothing failed, so the modal
    // closes rather than showing a failure with no reason in it.
    it('closes the modal when the run was cancelled', async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockResolvedValue({ success: false, cancelled: true });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(pushes().at(-1)).toEqual({ id: 'sync-storefront', state: 'succeeded' });
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
    it('ends the modal on what the command answered', async () => {
        startModalRun('block-library', screen);
        executeCommand.mockResolvedValue({ success: false, error: 'DA.live refused' });

        await handleRefreshBlockLibrary(context(), { id: 'block-library', progress: 'modal' });

        expect(executeCommand).toHaveBeenCalledWith('demoBuilder.refreshBlockLibrary');
        expect(pushes().at(-1)).toEqual({
            id: 'block-library',
            state: 'failed',
            error: 'DA.live refused',
        });
    });
});

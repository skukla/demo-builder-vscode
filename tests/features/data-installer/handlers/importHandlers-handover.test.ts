/**
 * A datapack job keeps narrating after its modal closes (PL-59 slice 6, row 11).
 *
 * The import modal has always shown rich per-type progress; what it could not do
 * was survive being closed. Closing it now hands the job to a notification, and
 * that notification is fed by the SHARED progress channel — so the watcher has
 * to report there as well as to the screen.
 */

import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { startModalRun } from '@/core/vscode/operationProgress';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import type { HandlerContext } from '@/types/handlers';

const screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);

function context(): HandlerContext {
    return createMockHandlerContext({ sendMessage: screen });
}

/** Every payload pushed on the shared operation channel. */
function pushes(): Array<Record<string, unknown>> {
    return screen.mock.calls
        .filter(([type]) => type === 'operationProgress')
        .map(([, payload]) => payload as Record<string, unknown>);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the handover channel', () => {
    // Registered on the Data Installer's own map: without it the modal's
    // "Run in background" would post into a panel that answers nothing.
    it('is registered by the panel that hosts the import modal', () => {
        expect(importHandlers).toHaveProperty('backgroundOperation');
    });

    it('opens a notice for the job, keyed the way the watcher reports it', async () => {
        startModalRun('datapack', screen);

        const response = await importHandlers.backgroundOperation(context(), {
            id: 'datapack',
            title: 'Importing CitiSignal',
        });

        expect(response).toEqual({ success: true });
        // Nothing is pushed by the handover itself — it only starts the notice
        // that the watcher's own pushes then feed.
        expect(pushes()).toStrictEqual([]);
    });

    it('refuses a handover with no operation named', async () => {
        const response = await importHandlers.backgroundOperation(context(), {
            title: 'Importing CitiSignal',
        });

        expect(response.success).toBe(false);
    });
});

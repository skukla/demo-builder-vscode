/**
 * The agent-operation notifier — visibility slice of the consent/visibility
 * design. Progress wraps the call; the OUTCOME lands in the window (quiet
 * status bar on success, warning toast on failure) because the agent's own
 * report may never reach the user.
 */

const mockWithProgress = jest.fn(
    async (_opts: unknown, task: () => Promise<unknown>) => task()
);
const mockSetStatusBarMessage = jest.fn();
const mockShowWarningMessage = jest.fn();

jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: (...a: unknown[]) =>
                mockWithProgress(...(a as [unknown, () => Promise<unknown>])),
            setStatusBarMessage: (...a: unknown[]) => mockSetStatusBarMessage(...a),
            showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a),
        },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true }
);

import { createAgentOperationNotifier } from '@/features/ai/server/agentOperationNotifier';
import type { Logger } from '@/types/logger';

const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as unknown as Logger;

beforeEach(() => jest.clearAllMocks());

describe('createAgentOperationNotifier', () => {
    it('wraps the call in a named progress notification and returns its result', async () => {
        const notifier = createAgentOperationNotifier(logger);

        const result = await notifier('sync_storefront', async () => ({ ok: true }));

        expect(result).toEqual({ ok: true });
        expect(mockWithProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringContaining('Sync storefront') }),
            expect.any(Function)
        );
        expect(mockSetStatusBarMessage).toHaveBeenCalledWith(
            expect.stringContaining('Sync storefront completed'),
            expect.any(Number)
        );
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('lands a failure as a warning toast and rethrows', async () => {
        const notifier = createAgentOperationNotifier(logger);

        await expect(
            notifier('republish', async () => {
                throw new Error('CDN said no');
            })
        ).rejects.toThrow('CDN said no');

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('"Republish" failed: CDN said no')
        );
        expect(mockSetStatusBarMessage).not.toHaveBeenCalled();
    });
});

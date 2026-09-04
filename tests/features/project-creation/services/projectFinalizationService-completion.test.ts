/**
 * Unit tests for projectFinalizationService.sendCompletionAndCleanup
 *
 * The auto-close fallback is the only behaviour in this function: it schedules a
 * timer that disposes the wizard panel two minutes after creation finishes, and it
 * unrefs that timer so it cannot hold a process open. Neither half had a test.
 */

import * as vscode from 'vscode';
import {
    sendCompletionAndCleanup,
    type FinalizationContext,
} from '@/features/project-creation/services/projectFinalizationService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockLogger } from '../../../helpers/loggerFake';

/** Only the fields sendCompletionAndCleanup reads. */
function createContext(panel?: Partial<vscode.WebviewPanel>): FinalizationContext {
    return {
        setupContext: { logger: createMockLogger() },
        projectPath: '/test/project',
        componentDefinitions: new Map(),
        progressTracker: jest.fn(),
        saveProject: jest.fn().mockResolvedValue(undefined),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        panel: panel as vscode.WebviewPanel | undefined,
    } as unknown as FinalizationContext;
}

describe('projectFinalizationService - sendCompletionAndCleanup', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('disposes a still-visible panel once the auto-close timeout elapses', async () => {
        const dispose = jest.fn();
        const context = createContext({ visible: true, dispose });

        await sendCompletionAndCleanup(context);

        expect(dispose).not.toHaveBeenCalled();
        jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_AUTO_CLOSE);
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('leaves a panel the user already navigated away from alone', async () => {
        const dispose = jest.fn();
        const context = createContext({ visible: false, dispose });

        await sendCompletionAndCleanup(context);
        jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_AUTO_CLOSE);

        expect(dispose).not.toHaveBeenCalled();
    });

    it('swallows a dispose that races the user closing the panel', async () => {
        const dispose = jest.fn(() => {
            throw new Error('panel already disposed');
        });
        const context = createContext({ visible: true, dispose });

        await sendCompletionAndCleanup(context);

        expect(() => jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_AUTO_CLOSE)).not.toThrow();
    });

    it('schedules NO timer when there is no panel to close', async () => {
        await sendCompletionAndCleanup(createContext(undefined));

        expect(jest.getTimerCount()).toBe(0);
    });

    it('tolerates a host whose timer handle has no unref (browser-style number)', async () => {
        // The handle is typed as a browser `number` and only unref-able on Node, which
        // is why the call is optional. Give it the browser shape and it must still
        // resolve rather than throw on `.unref`.
        const setTimeoutSpy = jest
            .spyOn(global, 'setTimeout')
            .mockReturnValue(7 as unknown as NodeJS.Timeout);
        const context = createContext({ visible: true, dispose: jest.fn() });

        await expect(sendCompletionAndCleanup(context)).resolves.toBeUndefined();

        expect(setTimeoutSpy).toHaveBeenCalledWith(
            expect.any(Function),
            TIMEOUTS.WEBVIEW_AUTO_CLOSE
        );
        setTimeoutSpy.mockRestore();
    });
});

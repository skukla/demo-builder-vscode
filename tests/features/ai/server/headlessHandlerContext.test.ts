/**
 * Headless HandlerContext factory tests.
 *
 * Verifies the context is webview-free (panel/comm undefined, sendMessage a
 * resolved no-op) and threads through the extension context, stateManager, and
 * ServiceLocator-provided auth service.
 */

import { ServiceLocator } from '@/core/di';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';

function makeLogger(): Logger {
    return { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
}

describe('createHeadlessHandlerContext', () => {
    const fakeAuth = { id: 'auth' } as unknown as Parameters<typeof ServiceLocator.setAuthenticationService>[0];
     
    const fakeContext = { extensionPath: '/ext', globalState: { get: jest.fn(), update: jest.fn() } } as any;
    const fakeStateManager = { getCurrentProject: jest.fn() } as unknown as StateManager;

    beforeEach(() => {
        ServiceLocator.reset();
        ServiceLocator.setAuthenticationService(fakeAuth);
    });

    it('builds a webview-free context (panel/comm undefined, sendMessage no-op)', async () => {
        const ctx = createHeadlessHandlerContext(fakeContext, fakeStateManager, makeLogger());

        expect(ctx.panel).toBeUndefined();
        expect(ctx.communicationManager).toBeUndefined();
        await expect(ctx.sendMessage('anything')).resolves.toBeUndefined();
    });

    it('threads through context, stateManager, logger, and the ServiceLocator auth service', () => {
        const logger = makeLogger();
        const ctx = createHeadlessHandlerContext(fakeContext, fakeStateManager, logger);

        expect(ctx.context).toBe(fakeContext);
        expect(ctx.stateManager).toBe(fakeStateManager);
        expect(ctx.logger).toBe(logger);
        expect(ctx.debugLogger).toBe(logger);
        expect(ctx.authManager).toBe(fakeAuth);
        expect(ctx.sharedState).toEqual({ isAuthenticating: false });
    });
});

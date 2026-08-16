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
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    } as unknown as Logger;
}

describe('createHeadlessHandlerContext', () => {
    const fakeAuth = { id: 'auth' } as unknown as Parameters<
        typeof ServiceLocator.setAuthenticationService
    >[0];

    const fakeContext = {
        extensionPath: '/ext',
        globalState: { get: jest.fn(), update: jest.fn() },
    } as any;
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
        // NOT the same object: the state manager is wrapped so getCurrentProject
        // reads the pointer from disk. Delegation is asserted below.
        expect(ctx.logger).toBe(logger);
        expect(ctx.debugLogger).toBe(logger);
        expect(ctx.authManager).toBe(fakeAuth);
        expect(ctx.sharedState).toEqual({ isAuthenticating: false });
    });

    // Every window binds the same MCP socket name and the last to bind serves, so
    // the host answering an agent is often not the host the user is working in.
    // Its in-memory pointer is whatever it loaded at startup and nothing reloads
    // it, so getCurrentProject() returned a freshly-read manifest for the WRONG
    // project — which is why it reads as correct.
    describe('current-project pointer is read from disk, not memory', () => {
        const stale = { name: 'stale-project', path: '/projects/stale' };
        const onDisk = { name: 'on-disk-project', path: '/projects/on-disk' };

        function makeStateManager() {
            return {
                // What the serving window loaded at ITS startup.
                getCurrentProject: jest.fn().mockResolvedValue(stale),
                readCurrentProjectFromDisk: jest.fn().mockResolvedValue(onDisk),
                saveProject: jest.fn().mockResolvedValue(undefined),
                someOtherMethod: jest.fn().mockReturnValue('delegated'),
            } as unknown as StateManager;
        }

        it('answers with the project on disk, not the one held in memory', async () => {
            const sm = makeStateManager();
            const ctx = createHeadlessHandlerContext(fakeContext, sm, makeLogger());

            await expect(ctx.stateManager.getCurrentProject()).resolves.toBe(onDisk);
            expect(sm.readCurrentProjectFromDisk).toHaveBeenCalled();
            // The in-memory read must not be what answered.
            expect(sm.getCurrentProject).not.toHaveBeenCalled();
        });

        it('delegates every other member to the real state manager', async () => {
            const sm = makeStateManager();
            const ctx = createHeadlessHandlerContext(fakeContext, sm, makeLogger());

            await ctx.stateManager.saveProject({ name: 'x' } as never);
            expect(sm.saveProject).toHaveBeenCalledWith({ name: 'x' });
            expect(
                (ctx.stateManager as unknown as { someOtherMethod: () => string }).someOtherMethod()
            ).toBe('delegated');
        });
    });
});

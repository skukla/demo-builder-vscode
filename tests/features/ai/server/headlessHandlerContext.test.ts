/**
 * Headless HandlerContext factory tests.
 *
 * Verifies the context is webview-free (panel/comm undefined, sendMessage a
 * resolved no-op) and threads through the extension context, stateManager, and
 * ServiceLocator-provided auth service.
 */

// The factory now constructs a real PrerequisitesManager, whose import graph
// wants an initialized logger. Production initializes one long before the MCP
// server starts (extension.ts:80 vs :493); this is a wiring test, so the manager
// is stubbed rather than the logger bootstrapped.
jest.mock('@/features/prerequisites/services/PrerequisitesManager', () => ({
    PrerequisitesManager: jest.fn().mockImplementation((extensionPath: string) => ({
        __extensionPath: extensionPath,
    })),
}));

import { ServiceLocator } from '@/core/di';
import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
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
        // ADR-015: the headless context builds a PrerequisitesManager, which
        // now takes the executor as a constructor argument.
        ServiceLocator.setCommandExecutor({ execute: jest.fn() } as never);
    });

    it('builds a webview-free context (panel/comm undefined, sendMessage no-op)', async () => {
        const ctx = createHeadlessHandlerContext(fakeContext, fakeStateManager, makeLogger());

        expect(ctx.panel).toBeUndefined();
        expect(ctx.communicationManager).toBeUndefined();
        await expect(ctx.sendMessage('anything')).resolves.toBeUndefined();
    });

    // Regression: this was `undefined`, and `initializePrerequisiteCheck` calls
    // `context.prereqManager?.loadConfig()` — so the check loop iterated zero
    // prerequisites and `[].every(...)` returned TRUE. A prerequisites tool built
    // on that would report "everything installed" on a bare machine.
    it('builds a real PrerequisitesManager from the extension path', () => {
        const ctx = createHeadlessHandlerContext(fakeContext, fakeStateManager, makeLogger());

        expect(ctx.prereqManager).toBeDefined();
        expect(PrerequisitesManager).toHaveBeenCalledWith(
            fakeContext.extensionPath,
            expect.anything(),
            // ADR-015: the shell executor, resolved here at the boundary.
            expect.objectContaining({ execute: expect.any(Function) }),
            // And its cache, likewise handed in rather than built inside the manager
            // — it is stateful, so the manager may not construct it.
            expect.objectContaining({ getCachedResult: expect.any(Function) })
        );
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

/**
 * Shared setup for the deployHandler family: the handler context and the registry.
 *
 * Both suites call the handler with the same kind of context and both need the
 * services it fetches at the boundary. What they MOCK differs — one replaces the
 * deploy core, the other the whole deploy — and a `jest.mock` only hoists above the
 * imports of the file it appears in, so the mocks stay in each suite.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import type { HandlerContext } from '@/types/handlers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/**
 * ADR-015 (2026-08-28): the handler resolves the auth manager and executor at
 * the boundary, which is where fetching is allowed. The shared node setup empties
 * the registry after EVERY test, so the fakes are seeded per-test.
 *
 * @returns the two fakes it registered, for a suite that asserts they were handed on
 */
export function seedRegistry(): {
    authManager: ReturnType<typeof createMockAuthenticationService>;
    commandManager: ReturnType<typeof createMockCommandExecutor>;
} {
    const authManager = createMockAuthenticationService();
    const commandManager = createMockCommandExecutor();
    ServiceLocator.setAuthenticationService(authManager);
    ServiceLocator.setCommandExecutor(commandManager);
    return { authManager, commandManager };
}

/** A handler context whose current project is `project`, living at `/ext`. */
export function ctx(project: unknown): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        logger: createMockLogger(),
        context: createMockExtensionContext({ extensionPath: '/ext' }),
    });
}

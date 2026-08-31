/**
 * Test Helpers for HandlerContext
 *
 * Provides type-safe mock implementations for HandlerContext used across tests.
 * Eliminates the need for repeated `as any` type assertions.
 */

import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from './loggerFake';

/**
 * Create a mock HandlerContext with type-safe empty objects
 *
 * This helper provides a properly typed HandlerContext mock that can be
 * extended with specific implementations as needed per test.
 *
 * @param overrides Partial HandlerContext to override defaults
 * @returns jest.Mocked<HandlerContext> with sensible defaults
 *
 * @example
 * ```typescript
 * const context = createMockHandlerContext({
 *     prereqManager: mockPrereqManager
 * });
 * ```
 */
export function createMockHandlerContext(
    overrides?: Partial<HandlerContext>
): jest.Mocked<HandlerContext> {
    const mockLogger = createMockLogger();

    return {
        prereqManager: {} as jest.Mocked<HandlerContext['prereqManager']>,
        authManager: {} as jest.Mocked<HandlerContext['authManager']>,
        errorLogger: {} as jest.Mocked<HandlerContext['errorLogger']>,
        progressUnifier: {} as jest.Mocked<HandlerContext['progressUnifier']>,
        stepLogger: {} as jest.Mocked<HandlerContext['stepLogger']>,
        logger: mockLogger,
        debugLogger: {} as jest.Mocked<HandlerContext['debugLogger']>,
        /**
         * Handlers read this through `componentRegistryFrom`, which THROWS when
         * it is absent — deliberately, so a wiring bug names itself instead of
         * quietly building a second registry. Suites that assert on registry
         * contents override it; the rest just need it present.
         */
        componentRegistry: {
            getComponentRegistry: jest.fn().mockResolvedValue({ components: {} }),
            loadRegistry: jest.fn().mockResolvedValue({ components: {} }),
        } as unknown as HandlerContext['componentRegistry'],
        /**
         * `globalState` gets METHODS for the same reason `stateManager` does
         * (see the note below). Production reads it through `showOneTimeTip`,
         * so any handler that shows a one-time tip failed here with
         * "Cannot read properties of undefined (reading 'get')" — a TypeError
         * that reads like a bug in the code under test rather than a hole in
         * the fixture. `get` returns the SHOWN value by default so tips stay
         * out of the way; a suite that tests tip behaviour overrides it.
         */
        context: {
            extensionPath: '/test/extension/path',
            globalState: {
                get: jest.fn().mockReturnValue(true),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn(),
            },
        } as unknown as jest.Mocked<HandlerContext['context']>,
        panel: undefined,
        /**
         * The state manager gets METHODS, not `{}`.
         *
         * Every other collaborator here is an empty object cast to its type,
         * which is fine for a collaborator nothing calls. This one is called:
         * handlers reach `context.stateManager` for eight distinct methods
         * across production, `getCurrentProject` (49 sites) and `saveProject`
         * (38) most of all.
         *
         * As `{}` the cast silenced exactly what the compiler is best at, and a
         * test whose subject saved a project failed with
         * "context.stateManager.saveProject is not a function" — a TypeError
         * that reads like a bug in the code under test rather than a hole in the
         * fixture. It is the same shape as the four production defects this
         * repo's own guidance was written about: a cast at a boundary hiding a
         * missing field.
         *
         * Method list read from the `context.stateManager.*` call sites in src/,
         * not from the interface — a fake mirroring a whole interface drifts the
         * moment it grows something nobody calls (ADR-016 rule 3).
         *
         * Neutral content: `getCurrentProject` resolves to null ("no project
         * open"), the writes resolve undefined. A suite that needs a project
         * passes its own stateManager through `overrides`.
         */
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject: jest.fn().mockResolvedValue(undefined),
            saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
            loadProjectFromPath: jest.fn().mockResolvedValue(null),
            getAllProjects: jest.fn().mockResolvedValue([]),
            clearProject: jest.fn(),
            removeFromRecentProjects: jest.fn(),
            markDirty: jest.fn(),
        } as unknown as jest.Mocked<HandlerContext['stateManager']>,
        communicationManager: undefined,
        sendMessage: jest.fn(),
        sharedState: {
            isAuthenticating: false,
            currentComponentSelection: undefined,
            currentPrerequisiteStates: new Map(),
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

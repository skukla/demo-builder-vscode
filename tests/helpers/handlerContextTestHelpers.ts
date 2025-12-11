/**
 * Test Helpers for HandlerContext
 *
 * Provides type-safe mock implementations for HandlerContext used across tests.
 * Eliminates the need for repeated `as any` type assertions.
 */

import type { HandlerContext } from '@/types/handlers';

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
    const mockLogger = {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    return {
        prereqManager: {} as jest.Mocked<HandlerContext['prereqManager']>,
        authManager: {} as jest.Mocked<HandlerContext['authManager']>,
        componentHandler: {} as jest.Mocked<HandlerContext['componentHandler']>,
        errorLogger: {} as jest.Mocked<HandlerContext['errorLogger']>,
        progressUnifier: {} as jest.Mocked<HandlerContext['progressUnifier']>,
        stepLogger: {} as jest.Mocked<HandlerContext['stepLogger']>,
        logger: mockLogger,
        debugLogger: {} as jest.Mocked<HandlerContext['debugLogger']>,
        context: {
            extensionPath: '/test/extension/path',
        } as jest.Mocked<HandlerContext['context']>,
        panel: undefined,
        stateManager: {} as jest.Mocked<HandlerContext['stateManager']>,
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

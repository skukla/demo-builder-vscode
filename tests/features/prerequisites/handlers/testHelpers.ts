import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/**
 * Test Helpers for Prerequisites Handlers Tests
 *
 * Shared mock factories and utilities for testing prerequisite handlers.
 */

/**
 * Creates a mock logger with all standard methods.
 */
export function createMockLogger(): jest.Mocked<Logger> {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

/**
 * Creates a mock HandlerContext with sensible defaults and optional overrides.
 * All properties are properly typed without using 'as any'.
 */
export function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    const baseContext: HandlerContext = {
        prereqManager: {} as HandlerContext['prereqManager'],
        authManager: {} as HandlerContext['authManager'],
        componentHandler: {} as HandlerContext['componentHandler'],
        errorLogger: {} as HandlerContext['errorLogger'],
        progressUnifier: {} as HandlerContext['progressUnifier'],
        stepLogger: {} as HandlerContext['stepLogger'],
        logger: createMockLogger(),
        debugLogger: {} as HandlerContext['debugLogger'],
        context: {
            extensionPath: '/test/extension/path',
        } as HandlerContext['context'],
        panel: undefined,
        stateManager: {} as HandlerContext['stateManager'],
        communicationManager: undefined,
        sendMessage: jest.fn(),
        sharedState: {
            isAuthenticating: false,
            currentComponentSelection: undefined,
            currentPrerequisiteStates: new Map(),
        },
        ...overrides,
    };

    return baseContext as jest.Mocked<HandlerContext>;
}

/**
 * Creates a component selection configuration for testing.
 */
export function createComponentSelection(overrides?: {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    integrations?: string[];
    appBuilder?: string[];
}) {
    return {
        frontend: overrides?.frontend ?? 'react-app',
        backend: overrides?.backend ?? 'commerce-paas',
        dependencies: overrides?.dependencies ?? [],
        integrations: overrides?.integrations ?? [],
        appBuilder: overrides?.appBuilder ?? [],
    };
}

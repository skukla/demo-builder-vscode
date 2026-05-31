/**
 * Component Handlers - Shared Test Utilities
 *
 * Factory builders for the mock HandlerContext, ComponentRegistryManager, and
 * DependencyResolver used across the componentHandlers test suites. Not a
 * `*.test.ts` file, so Jest does not run it directly.
 *
 * NOTE: The `jest.mock('@/features/components/services/ComponentRegistryManager')`
 * call and the constructor `mockImplementation` wiring must stay inline in each
 * test file (jest.mock is hoisted and references module-scoped imports).
 */

import { HandlerContext } from '@/types/handlers';
import type { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';

/** Build a minimal mock HandlerContext (uses `as any` to avoid over-mocking). */
export function createMockHandlerContext(): HandlerContext {
    return {
        context: {
            extensionPath: '/mock/extension/path',
        } as any,
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as any,
        sharedState: {
            isAuthenticating: false,
        } as any,
        sendMessage: jest.fn(),
    } as any;
}

/** Build a mock ComponentRegistryManager with all queried methods stubbed. */
export function createMockRegistryManager(): jest.Mocked<ComponentRegistryManager> {
    return {
        getFrontends: jest.fn(),
        getBackends: jest.fn(),
        getIntegrations: jest.fn(),
        getAppBuilder: jest.fn(),
        getDependencies: jest.fn(),
        getMesh: jest.fn(),
        loadRegistry: jest.fn(),
        getPresets: jest.fn(),
        checkCompatibility: jest.fn(),
    } as any;
}

/** Build a mock DependencyResolver. */
export function createMockDependencyResolver(): jest.Mocked<DependencyResolver> {
    return {
        resolveDependencies: jest.fn(),
        validateDependencyChain: jest.fn(),
    } as any;
}

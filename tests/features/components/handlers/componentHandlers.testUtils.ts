/**
 * Component Handlers - Shared Test Utilities
 *
 * Factory builders for the mock HandlerContext, ComponentRegistryManager, and
 * DependencyResolver used across the componentHandlers test suites. Not a
 * `*.test.ts` file, so Jest does not run it directly.
 *
 * THIS FILE OWNS THE MOCK AND THE SUT IMPORT. Specs take ComponentRegistryManager
 * and DependencyResolver from HERE and declare no jest.mock of their own.
 *
 * The old note here said the mock "must stay inline in each test file (jest.mock is
 * hoisted and references module-scoped imports)". Half right, wrong conclusion:
 * jest.mock does hoist above the imports of the module it appears in, but NOT
 * across modules — so the fix is for this file to own the import too, not for every
 * spec to repeat the mock. Corrected 2026-08-30 (lane C1).
 */

import { HandlerContext } from '@/types/handlers';
jest.mock('@/features/components/services/ComponentRegistryManager');

import {
    ComponentRegistryManager,
    DependencyResolver,
} from '@/features/components/services/ComponentRegistryManager';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../../helpers/handlerContextTestHelpers';

/** Build a minimal mock HandlerContext (uses `as any` to avoid over-mocking). */
export function createComponentHandlerContext(): HandlerContext {
    return createMockHandlerContextBase({
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
    } as never)
}

/** Build a mock ComponentRegistryManager with all queried methods stubbed. */
export function createMockRegistryManager(): jest.Mocked<ComponentRegistryManager> {
    return {
        getFrontends: jest.fn(),
        getBackends: jest.fn(),
        getIntegrations: jest.fn(),
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

// Re-exported so specs never import the (mocked) module directly.
export { ComponentRegistryManager, DependencyResolver };

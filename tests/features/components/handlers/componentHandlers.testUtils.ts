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
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
/** Build a minimal mock HandlerContext over the canonical builder. */
export function createComponentHandlerContext(): HandlerContext {
    return createMockHandlerContextBase({
        context: createMockExtensionContext({}, '/mock/extension/path'),
        logger: createMockLogger(),
        sharedState: {
            isAuthenticating: false,
        },
        sendMessage: jest.fn(),
    })
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
    } as unknown as jest.Mocked<ComponentRegistryManager>;
}

/** Build a mock DependencyResolver. */
export function createMockDependencyResolver(): jest.Mocked<DependencyResolver> {
    return {
        resolveDependencies: jest.fn(),
        validateDependencyChain: jest.fn(),
    } as unknown as jest.Mocked<DependencyResolver>;
}

/** The three doubles both componentHandlers suites drive, already wired up. */
export interface ComponentHandlerSuite {
    context: HandlerContext;
    registryManager: jest.Mocked<ComponentRegistryManager>;
    dependencyResolver: jest.Mocked<DependencyResolver>;
}

/**
 * Everything both suites did in their `beforeEach`, which was byte-identical in
 * both (hashed 2026-09-02 with comments stripped).
 *
 * The registry is HANDED IN on the context, because under ADR-015 the handler
 * reads it there rather than constructing one. The two CONSTRUCTOR mocks are
 * installed here too — but only because the suites' import order was fixed in
 * the same change, and that is worth knowing.
 *
 * Moving these two calls here FAILED first, with
 * `this.registryManager.getComponentById is not a function` — the real
 * DependencyResolver running against the partial registry fake above. Both
 * suites were importing `@/features/components/handlers/componentHandlers`
 * ABOVE this file, so the handler bound before this file's automock registered,
 * and the class this file installed an implementation on was not the class the
 * handler had. Moving this import to the top of both suites made all 24 pass
 * with the wiring shared. `tests/sop/mock-wall-import-order.test.ts` is what
 * named the two files; without it this would have been recorded as an
 * unexplained "these two lines cannot be shared".
 */
export function setupComponentHandlerSuite(): ComponentHandlerSuite {
    const context = createComponentHandlerContext();
    const registryManager = createMockRegistryManager();
    context.componentRegistry = registryManager;
    const dependencyResolver = createMockDependencyResolver();

    (ComponentRegistryManager as jest.MockedClass<typeof ComponentRegistryManager>).mockImplementation(
        () => registryManager
    );
    (DependencyResolver as jest.MockedClass<typeof DependencyResolver>).mockImplementation(
        () => dependencyResolver
    );

    return { context, registryManager, dependencyResolver };
}

// Re-exported so specs never import the (mocked) module directly.
export { ComponentRegistryManager, DependencyResolver };

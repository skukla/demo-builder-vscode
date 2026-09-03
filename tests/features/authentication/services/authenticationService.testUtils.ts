import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';
import { createMockCommandExecutor as createMockCommandExecutorLocal } from '../../../helpers/commandExecutorFake';
import { createMockLogger as createMockLoggerLocal } from '../../../helpers/loggerFake';
import type { CommandResult } from '@/core/shell/types';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { EntityServices } from '@/features/authentication/services/adobeEntityService';

/**
 * Shared test utilities for AuthenticationService tests
 */

// Mock data
export const mockOrg: AdobeOrg = {
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
};

export const mockProject: AdobeProject = {
    id: 'proj123',
    name: 'Test Project',
};

export const mockWorkspace: AdobeWorkspace = {
    id: 'ws123',
    name: 'Test Workspace',
};

// Mock factory functions
/** Canonical command-executor fake (ADR-016). */
export { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

/** Canonical logger fake (ADR-016). */
export { createMockLogger } from '../../../helpers/loggerFake';

export const createMockStepLogger = (): jest.Mocked<StepLogger> => ({
    logTemplate: jest.fn(),
    logMessage: jest.fn(),
    setCurrentStep: jest.fn(),
    setStepName: jest.fn(),
} as any);

// Command result helpers
import { createSuccessResult } from '../../../helpers/commandResultFake';
export { createSuccessResult };

export { createFailureResult } from '../../../helpers/commandResultFake';

// `createValidTokenResult` / `createInvalidTokenResult` lived here. They staged a
// token as fake `aio config get` STDOUT, which stopped being how the token is read
// — `TokenManager` reads the config store in process. Suites now mock
// `@adobe/aio-lib-core-config` directly, and these were deleted rather than left
// as helpers that build a shape nothing consumes.

export const createOrgContextResult = (): CommandResult => {
    return createSuccessResult(JSON.stringify({ org: 'org123', project: 'proj123' }));
};

export const createProjectListResult = (): CommandResult => {
    return createSuccessResult(JSON.stringify([{ id: 'proj1', name: 'Project 1' }]));
};

/**
 * Creates a mock SDK client with default behavior.
 * IMPORTANT: Returns a function to create fresh instances per test to avoid closure issues.
 */
export const createMockSDKClient = (): jest.Mocked<AdobeSDKClient> => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    ensureInitialized: jest.fn().mockResolvedValue(true),
    clear: jest.fn(),
} as any);

/**
 * Creates mock entity services matching the EntityServices shape.
 * Methods are grouped by sub-service (fetcher, resolver, selector).
 */
export const createMockEntityServices = (): {
    entities: EntityServices;
    fetcher: jest.Mocked<EntityServices['fetcher']>;
    resolver: jest.Mocked<EntityServices['resolver']>;
    selector: jest.Mocked<EntityServices['selector']>;
} => {
    const fetcher = {
        getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
        getProjects: jest.fn().mockResolvedValue([mockProject]),
        getWorkspaces: jest.fn().mockResolvedValue([mockWorkspace]),
    } as any;

    const resolver = {
        getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
        getCurrentProject: jest.fn().mockResolvedValue(mockProject),
        getCurrentWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
        getCurrentContext: jest.fn().mockResolvedValue({
            org: mockOrg, project: mockProject, workspace: mockWorkspace,
        }),
    } as any;

    const selector = {
        clearConsoleContext: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
        entities: { fetcher, resolver, selector },
        fetcher,
        resolver,
        selector,
    };
};

/** What a suite gets back from `setupAuthServiceSuite`. */
export interface AuthServiceHarness {
    authService: AuthenticationService;
    commandExecutor: jest.Mocked<CommandExecutor>;
    logger: jest.Mocked<Logger>;
    stepLogger: jest.Mocked<StepLogger>;
    sdkClient: jest.Mocked<AdobeSDKClient>;
}

/**
 * The `beforeEach` the context and operations suites shared.
 *
 * THE MOCKED CLASSES ARE HANDED IN rather than imported here, and that is
 * deliberate. This file declares no `jest.mock` of its own — each suite does —
 * so a binding imported here would not reliably be the one the suite's wall
 * replaced. An earlier extraction in `componentHandlers.testUtils` hit exactly
 * that and failed two tests with the REAL collaborator running; passing the
 * suite's own bindings removes the question rather than answering it.
 *
 * @param deps - the suite's own mocked bindings, and the fetcher it needs
 */
export function setupAuthServiceSuite(deps: {
    AdobeSDKClient: { mockImplementation: (fn: () => AdobeSDKClient) => unknown };
    createEntityServices: jest.Mock;
    getLogger: jest.Mock;
    /** The context suite also needs `getOrganizationsSdkOnly`; operations does not. */
    fetcher?: Record<string, unknown>;
}): AuthServiceHarness {
    const commandExecutor = createMockCommandExecutorLocal();
    const logger = createMockLoggerLocal();
    const stepLogger = createMockStepLogger();

    deps.getLogger.mockReturnValue(logger);

    // StepLogger.create is a static, so it is replaced on the class itself.
    const StepLoggerClass = require('@/core/logging/stepLogger').StepLogger;
    StepLoggerClass.create = jest.fn().mockResolvedValue(stepLogger);

    const sdkClient = {
        initialize: jest.fn().mockResolvedValue(undefined),
        ensureInitialized: jest.fn().mockResolvedValue(true),
        clear: jest.fn(),
    } as unknown as jest.Mocked<AdobeSDKClient>;
    deps.AdobeSDKClient.mockImplementation(() => sdkClient);

    deps.createEntityServices.mockReturnValue({
        fetcher: deps.fetcher ?? { getOrganizations: jest.fn().mockResolvedValue([mockOrg]) },
        resolver: {},
        selector: {},
    });

    const authService = new AuthenticationService('/mock/extension/path', logger, commandExecutor);
    return { authService, commandExecutor, logger, stepLogger, sdkClient };
}

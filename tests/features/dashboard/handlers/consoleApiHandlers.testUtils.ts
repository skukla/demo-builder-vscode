/**
 * Shared setup for the consoleApiHandlers suites: the module mocks, and the SUT
 * re-exported from here so it binds to them (jest hoists a mock above the imports
 * of the file it is in, not across files).
 */

import { resolveDesiredApis } from '@/core/state/componentApiPicks';
import {
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
} from '@/features/dashboard/handlers/consoleApiHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import { subscribeRequiredApis } from '@/features/app-builder/services/apiSubscriber';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import { withOrgContext } from '@/core/shell/orgContextEnv';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/app-builder/services/apiSubscriber', () => ({
    computeRequiredApis: jest.requireActual('@/features/app-builder/services/apiSubscriber')
        .computeRequiredApis,
    entriesThatNeedApis: jest.requireActual('@/features/app-builder/services/apiSubscriber')
        .entriesThatNeedApis,
    // Answers the way the real one does when every code lands: the baseline plus
    // each requested extra. A case where a code does NOT land says so itself.
    subscribeRequiredApis: jest.fn(
        async (_catalog: unknown, _target: unknown, _client: unknown, _domain: unknown, extras: string[] = []) => [
            { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
            ...extras.map((code) => ({ code })),
        ],
    ),
}));
jest.mock('@/features/app-builder/services/apiSubscriberClientAdapter', () => ({
    createApiSubscriberClient: jest.fn(() => ({
        getServicesForOrg: jest.fn().mockResolvedValue([
            { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
            { code: 'FireflyAPISDK', name: 'Firefly Services' },
            { code: 'GraphQLServiceSDK', name: 'API Mesh' },
        ]),
    })),
}));
jest.mock('@/features/app-builder/services/allowedDomain', () => ({
    deriveAllowedDomain: jest.fn(() => 'localhost:3000'),
}));
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(() => []),
    // resolveApiOwners reads this per integration. A partial module mock left it
    // undefined and the handler failed inside its own try/catch, surfacing as a
    // missing `data` rather than as the real cause.
    getAppBuilderComponentEntry: jest.fn(() => undefined),
}));
jest.mock('@/core/shell/orgContextEnv', () => ({
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org-1' })),
    withOrgContext: jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn()),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        })),
    },
}));

export function consoleApiProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        name: 'demo',
        path: '/projects/demo',
        adobe: { organization: 'org-1', projectId: 'p-1', workspace: 'w-1' },
        ...overrides,
    };
}

export function consoleApiContext(project: Record<string, unknown> | null): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
        logger: createMockLogger(),
        sendMessage: jest.fn(),
    });
}

export {
    resolveDesiredApis,
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
    ErrorCode,
    runGuards,
    subscribeRequiredApis,
    getAvailableAppBuilderComponents,
    createApiSubscriberClient,
    withOrgContext,
};

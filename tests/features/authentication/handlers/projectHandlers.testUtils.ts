/**
 * Shared Test Utilities for Project Handlers
 *
 * Common mocks, factories, and helpers used across project handler tests.
 */

import type { Organization } from '@/types/webview';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

// Mock dependencies setup
export const setupMocks = () => {
    jest.mock('@/core/di/serviceLocator');
    jest.mock('@/core/validation/validators/AdobeResourceValidator');
    jest.mock('@/types/typeGuards', () => ({
        toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
        parseJSON: jest.fn((str: string) => JSON.parse(str))
    }));
    jest.mock('@/core/utils/timeoutConfig', () => ({
        TIMEOUTS: {
            NORMAL: 30000 // Standard API calls (replaces PROJECT_LIST, WORKSPACE_LIST)
        }
    }));
    jest.mock('@/core/utils/promiseUtils', () => ({
        withTimeout: jest.fn((promise) => promise)
    }));
};

/**
 * The canonical AuthenticationService fake (ADR-016).
 *
 * This used to be a hand-rolled object with FOUR methods, and the six suites here
 * bolted the rest on at the call site (`context.authManager.getWorkspaces =
 * jest.fn()`). That works at runtime — JavaScript adds the property — and it costs
 * the compiler's opinion entirely: eight such assignments in
 * `deleteAdobeProjectHandler.test.ts` alone were invisible, because the surrounding
 * `as any` meant nothing was checked against the real service in the first place.
 * The canonical fake declares all of them, so an override that names a method
 * `AuthenticationService` does not have now fails `typecheck:tests`.
 */
export const createMockAuthManager = createMockAuthenticationService;

/**
 * Creates a mock command executor
 */
/** Canonical command-executor fake (ADR-016). */
export { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

/**
 * Creates a mock handler context with all required dependencies
 *
 * IMPORTANT: This returns a FUNCTION, not an object.
 * Call it to get a fresh mock context: const mockContext = createMockContext();
 */
export const createMockContext = () => {
    const authManager = createMockAuthManager();
    const base = createMockHandlerContext({
        authManager,
        logger: createMockLogger(),
        // The DEBUG logger is `Logger`-shaped, so the same builder is the right
        // fake for it — the previous two-method literal was not a different
        // interface, only a smaller guess at one.
        debugLogger: createMockLogger(),
    });

    /**
     * `authManager` is re-attached so its type survives.
     *
     * On `HandlerContext` it is OPTIONAL (`authManager?: AuthenticationService`),
     * which is correct for production — not every handler has one. But it means a
     * suite reading `context.authManager.getProjects.mockResolvedValue(...)` gets
     * two errors: possibly-undefined, and no `mockResolvedValue` on a plain
     * function type. Spreading it back with its concrete mocked type answers both
     * WITHOUT a cast, which is the whole point of removing the `as any` that used
     * to sit here.
     */
    return { ...base, authManager };
};

/**
 * Sample project data for testing
 */
export const mockProjects = [
    { id: 'proj-1', name: 'Project 1', title: 'Project 1' },
    { id: 'proj-2', name: 'Project 2', title: 'Project 2' }
];

/**
 * Sample organization data for testing
 */
export const mockOrganization: Organization = {
    id: 'org-123',
    // `code` is REQUIRED on Organization and production dispatches on it:
    // `ensureOrgContext` matches an org by id OR name OR code, and
    // `authenticationService` builds its org-context target from
    // `{ orgId, orgCode, orgName }`. This fixture omitted it for as long as the
    // surrounding `as any` meant nothing checked — so fifteen tests across four
    // suites were asserting against an organization the real code would not accept.
    code: 'TESTORGCODE@AdobeOrg',
    name: 'Test Org'
};

/**
 * The canonical AuthenticationService fake (ADR-016 § Fixtures and fakes).
 *
 * WHY IT EXISTS, and why now. On 2026-09-01 the HandlerContext casts were converted
 * to `createMockHandlerContext(...)` on the syntax tree, and 51 files then failed
 * `typecheck:tests`. The compiler named the reason and ranked it: the literals hold
 * PARTIAL FAKES OF COLLABORATORS, and `AuthenticationService` was the second-largest
 * blocker at 16 failures. `as unknown as HandlerContext` erased that; a typed
 * builder's overrides do not.
 *
 * So this is not a tidy-up. It is the thing 16 conversions are waiting on, chosen
 * by measurement rather than taste.
 *
 * COVERS THE WHOLE PUBLIC SURFACE — 44 methods — for the reason `stateManagerFake`
 * documents: a builder narrower than the need is one nobody adopts, and the
 * divergence it was meant to stop grows around it instead. That fake answered one
 * method, and 50 suites hand-rolled their own rather than use it.
 *
 * TYPED TO THE REAL CLASS, which is the point. `HandlerContext.authManager` is
 * `AuthenticationService` (handlers.ts:181), so `jest.Mocked<AuthenticationService>`
 * makes this file stop compiling the day the class gains a method — one failure, in
 * one place, instead of every hand-rolled partial quietly ceasing to resemble it.
 * The import is type-only: no runtime dependency on the service or on vscode.
 *
 * The method list is READ from the class, not remembered (ADR-016 rule 3): the two
 * `private` members are excluded, everything else is here.
 *
 * @see tests/helpers/stateManagerFake.ts — the same design, and the argument for it
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section B
 */

import type { AuthenticationService } from '@/features/authentication/services/authenticationService';

/**
 * An AuthenticationService whose every method is a jest mock.
 *
 * Defaults are the SIGNED-IN, nothing-configured shape: `isAuthenticated` resolves
 * true because a suite that cares about the signed-out path says so explicitly,
 * while a suite that does not care would otherwise fail on a guard it never meant
 * to exercise. Every list resolves empty and every getter resolves null, so a test
 * asserting "no organizations" needs no override either.
 *
 * @param overrides - methods to replace. Typed, so a member that is not on
 *   AuthenticationService fails `typecheck:tests` instead of silently faking a
 *   method the real object does not have.
 */
export function createMockAuthenticationService(
    overrides: Partial<jest.Mocked<AuthenticationService>> = {}
): jest.Mocked<AuthenticationService> {
    return {
        // --- state and cache ---
        clearCache: jest.fn(),
        clearConsoleContext: jest.fn(),
        getCacheManager: jest.fn(),
        getValidationCache: jest.fn(),
        getCachedOrganization: jest.fn().mockReturnValue(null),
        getCachedProject: jest.fn().mockReturnValue(null),
        setCachedOrganization: jest.fn(),
        setOrgRejectedFlag: jest.fn(),
        wasOrgClearedDueToValidation: jest.fn().mockReturnValue(false),

        // --- session ---
        isAuthenticated: jest.fn().mockResolvedValue(true),
        isFullyAuthenticated: jest.fn().mockResolvedValue(true),
        login: jest.fn().mockResolvedValue(undefined),
        loginAndRestoreProjectContext: jest.fn().mockResolvedValue(undefined),
        logout: jest.fn().mockResolvedValue(undefined),
        getTokenManager: jest.fn(),
        getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true }),
        ensureSDKInitialized: jest.fn().mockResolvedValue(undefined),

        // --- console entities ---
        getCurrentContext: jest.fn().mockResolvedValue(null),
        getCurrentOrganization: jest.fn().mockResolvedValue(null),
        getCurrentProject: jest.fn().mockResolvedValue(null),
        getCurrentWorkspace: jest.fn().mockResolvedValue(null),
        getOrganizations: jest.fn().mockResolvedValue([]),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
        getProjects: jest.fn().mockResolvedValue([]),
        getProjectsSdkOnly: jest.fn().mockResolvedValue([]),
        getWorkspaces: jest.fn().mockResolvedValue([]),
        getWorkspacesSdkOnly: jest.fn().mockResolvedValue([]),
        createProject: jest.fn().mockResolvedValue(undefined),
        createWorkspace: jest.fn().mockResolvedValue(undefined),
        deleteConsoleProject: jest.fn().mockResolvedValue(undefined),
        renameRemoteProject: jest.fn().mockResolvedValue(undefined),

        // --- credentials ---
        createAdobeIdCredential: jest.fn().mockResolvedValue(undefined),
        createWorkspaceCredential: jest.fn().mockResolvedValue(undefined),
        createWorkspaceS2SCredentialFor: jest.fn().mockResolvedValue(undefined),
        ensureOAuthCredentialId: jest.fn().mockResolvedValue(undefined),
        getS2SDeployCredentials: jest.fn().mockResolvedValue(undefined),
        getWorkspaceCredential: jest.fn().mockResolvedValue(undefined),
        getWorkspaceS2SCredential: jest.fn().mockResolvedValue(undefined),

        // --- services and permissions ---
        getServicesForOrg: jest.fn().mockResolvedValue([]),
        getSubscribedServiceCodes: jest.fn().mockResolvedValue([]),
        subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        testDeveloperPermissions: jest.fn().mockResolvedValue(true),
        ensureWorkspaceRuntimeNamespace: jest.fn().mockResolvedValue(undefined),

        ...overrides,
    } as unknown as jest.Mocked<AuthenticationService>;
}

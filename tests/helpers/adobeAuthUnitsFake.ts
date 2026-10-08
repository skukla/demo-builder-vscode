/**
 * Fakes of the units `AuthenticationService` hands out: its entity services
 * (orgReads, projectReads, workspaceReads, credentials, orgServices, projectOps,
 * resolver, selector), its cache
 * manager and its SDK client. Callers reach those units directly since 2026-10-08, when the service's
 * forty pass-through methods were removed (decompose-god-file), so a test that
 * stages an answer stages it on the unit that owns it.
 *
 * Kept apart from `authenticationServiceFake.ts` because that file must fake
 * exactly the class's own surface, which `tests/sop/fake-mirrors-subject.test.ts`
 * checks by reading it.
 */

import type { EntityServices } from '@/features/authentication/services/adobeEntityService';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

/** The units an AuthenticationService fake hands out, each method a jest mock. */
export interface MockEntityServices {
    orgReads: jest.Mocked<EntityServices['orgReads']>;
    projectReads: jest.Mocked<EntityServices['projectReads']>;
    workspaceReads: jest.Mocked<EntityServices['workspaceReads']>;
    credentials: jest.Mocked<EntityServices['credentials']>;
    orgServices: jest.Mocked<EntityServices['orgServices']>;
    projectOps: jest.Mocked<EntityServices['projectOps']>;
    resolver: jest.Mocked<EntityServices['resolver']>;
    selector: jest.Mocked<EntityServices['selector']>;
}

/** Per-unit method replacements for {@link createMockEntityServices}. */
export type EntityServiceOverrides = {
    [K in keyof MockEntityServices]?: Partial<MockEntityServices[K]>;
};

/**
 * Entity services whose every method a caller uses is a jest mock. Same defaults
 * as the methods had when they sat on the service: lists empty, getters null.
 *
 * @param overrides - methods to replace, grouped by the unit that owns them
 */
export function createMockEntityServices(
    overrides: EntityServiceOverrides = {}
): MockEntityServices {
    const base: MockEntityServices = {
        orgReads: {
            getOrganizations: jest.fn().mockResolvedValue([]),
            getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<EntityServices['orgReads']>,
        projectReads: {
            getProjects: jest.fn().mockResolvedValue([]),
            getProjectsSdkOnly: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<EntityServices['projectReads']>,
        workspaceReads: {
            getWorkspaces: jest.fn().mockResolvedValue([]),
            getWorkspacesSdkOnly: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<EntityServices['workspaceReads']>,
        credentials: {
            createAdobeIdCredential: jest.fn().mockResolvedValue(undefined),
            createWorkspaceCredential: jest.fn().mockResolvedValue(undefined),
            createWorkspaceS2SCredentialFor: jest.fn().mockResolvedValue(undefined),
            ensureOAuthCredentialId: jest.fn().mockResolvedValue(undefined),
            listCredentialIds: jest.fn().mockResolvedValue([]),
            getS2SDeployCredentials: jest.fn().mockResolvedValue(undefined),
            getWorkspaceCredential: jest.fn().mockResolvedValue(undefined),
            getWorkspaceS2SCredential: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<EntityServices['credentials']>,
        orgServices: {
            getServicesForOrg: jest.fn().mockResolvedValue([]),
            getSubscribedServiceCodes: jest.fn().mockResolvedValue([]),
            getSubscribedServices: jest.fn().mockResolvedValue([]),
            subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            subscribeOAuthServerToServerIntegrationToServices: jest
                .fn()
                .mockResolvedValue(undefined),
        } as unknown as jest.Mocked<EntityServices['orgServices']>,
        projectOps: {
            createProject: jest.fn().mockResolvedValue(undefined),
            createWorkspace: jest.fn().mockResolvedValue(undefined),
            deleteWorkspace: jest.fn().mockResolvedValue(undefined),
            deleteConsoleProject: jest.fn().mockResolvedValue(undefined),
            renameRemoteProject: jest.fn().mockResolvedValue({ ok: true }),
            ensureWorkspaceRuntimeNamespace: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<EntityServices['projectOps']>,
        resolver: {
            getCurrentContext: jest.fn().mockResolvedValue(null),
            getCurrentOrganization: jest.fn().mockResolvedValue(null),
            getCurrentProject: jest.fn().mockResolvedValue(null),
            getCurrentWorkspace: jest.fn().mockResolvedValue(null),
        } as unknown as jest.Mocked<EntityServices['resolver']>,
        selector: {
            clearConsoleContext: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<EntityServices['selector']>,
    };
    Object.assign(base.orgReads, overrides.orgReads);
    Object.assign(base.projectReads, overrides.projectReads);
    Object.assign(base.workspaceReads, overrides.workspaceReads);
    Object.assign(base.credentials, overrides.credentials);
    Object.assign(base.orgServices, overrides.orgServices);
    Object.assign(base.projectOps, overrides.projectOps);
    Object.assign(base.resolver, overrides.resolver);
    Object.assign(base.selector, overrides.selector);
    return base;
}

/**
 * The cached org/project and validation state, each method a jest mock.
 *
 * @param overrides - methods to replace
 */
export function createMockAuthCacheManager(
    overrides: Partial<jest.Mocked<AuthCacheManager>> = {}
): jest.Mocked<AuthCacheManager> {
    return {
        clearAll: jest.fn(),
        getValidationCache: jest.fn(),
        getCachedOrganization: jest.fn().mockReturnValue(null),
        getCachedProject: jest.fn().mockReturnValue(null),
        setCachedOrganization: jest.fn(),
        setOrgClearedDueToValidation: jest.fn(),
        wasOrgClearedDueToValidation: jest.fn().mockReturnValue(false),
        ...overrides,
    } as unknown as jest.Mocked<AuthCacheManager>;
}

/**
 * A Console SDK client fake: initialises, reports itself ready, clears. A fresh
 * object per call, so no test inherits another's.
 */
export function createMockSDKClient(): jest.Mocked<AdobeSDKClient> {
    return {
        initialize: jest.fn().mockResolvedValue(undefined),
        ensureInitialized: jest.fn().mockResolvedValue(true),
        clear: jest.fn(),
    } as unknown as jest.Mocked<AdobeSDKClient>;
}

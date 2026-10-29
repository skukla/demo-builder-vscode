/**
 * Shared arrangement for the deployMeshHeadless suites: the module mocks, the
 * fixture project and the dependency bag. No assertions live here.
 *
 * This file OWNS the import of the module under test and re-exports it. The
 * `jest.mock` calls below are hoisted above the imports of THIS module only, so a
 * suite that imported `deployMeshHeadless` itself could bind it to the real
 * collaborators (docs/testing/test-file-splitting-playbook.md).
 */

jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: jest.fn(),
}));
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ components: {} }),
    })),
}));
jest.mock('@/features/app-builder/services/ensureMeshApiSubscribed', () => ({
    ensureMeshApiSubscribed: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: jest.fn(),
}));
jest.mock('@/features/mesh/services/meshDeployment', () => ({ deployMeshComponent: jest.fn() }));
// Dynamically imported across the feature boundary (same pattern as
// projectResetService), so the mock targets the module it imports.
export const mockRegenerateComponentEnvFile = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/project-creation/helpers/envFileRegeneration', () => ({
    ...jest.requireActual('@/features/project-creation/helpers/envFileRegeneration'),
    regenerateComponentEnvFile: (...args: unknown[]) => mockRegenerateComponentEnvFile(...args),
}));
export const mockUpdateMeshState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/mesh/services/meshDeployBaseline', () => ({
    updateMeshState: (...args: unknown[]) => mockUpdateMeshState(...args),
}));

import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import { ensureMeshApiSubscribed } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { resetComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { projectRequiresAppBuilder } from '@/features/components/services/projectAppBuilderPredicate';
import { deployMeshHeadless } from '@/features/mesh/services/deployMeshHeadless';
import type { DeployMeshHeadlessDeps } from '@/features/mesh/services/deployMeshHeadless';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { fetchMeshInfoFromAdobeIO } from '@/features/mesh/services/meshVerifier';
import type { ComponentInstance, Project } from '@/types/base';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export { deployMeshHeadless };

export const mockRequiresAppBuilder = projectRequiresAppBuilder as jest.MockedFunction<
    typeof projectRequiresAppBuilder
>;
export const mockPreflight = ensureProjectAdobeContext as jest.Mock;
export const mockSubscribe = ensureMeshApiSubscribed as jest.MockedFunction<
    typeof ensureMeshApiSubscribed
>;
export const mockDeploy = deployMeshComponent as jest.MockedFunction<typeof deployMeshComponent>;
export const mockFetchInfo = fetchMeshInfoFromAdobeIO as jest.MockedFunction<
    typeof fetchMeshInfoFromAdobeIO
>;

export function project(withMesh = true): Project {
    return createMockProject({
        name: 'p',
        path: '/p',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { organization: 'org', projectId: 'proj', workspace: 'ws', authenticated: true },
        componentInstances: withMesh
            ? {
                  'commerce-mesh': {
                      id: 'commerce-mesh',
                      name: 'Mesh',
                      type: 'app-builder',
                      subType: 'mesh',
                      path: '/p/mesh',
                      status: 'ready',
                  } as ComponentInstance,
              }
            : {},
        componentConfigs: {},
    });
}

/** The fixture's mesh instance, resolved once so a fixture drift fails loudly. */
export function meshInstanceOf(p: Project): ComponentInstance {
    const instance = p.componentInstances?.['commerce-mesh'];
    if (!instance) throw new Error('fixture has no commerce-mesh instance');
    return instance;
}

/**
 * CONVERTED 2026-08-28 (ADR-015): the auth manager and executor are handed in
 * through the bag `deps()` builds, so the suites mock the service registry NOT AT
 * ALL. This is what the old registry stub used to return.
 *
 * Typed `unknown` until 2026-09-01, which is why every member needed `as never`:
 * one untyped variable in an object literal erases the whole argument at the call
 * site, and `deployMeshHeadless` then accepted anything. It holds the canonical
 * `AuthenticationService` fake now, so an override naming a method the real
 * service does not have fails `typecheck:tests`.
 */
let currentAuthManager: ReturnType<typeof createMockAuthenticationService>;

/** Swap the auth manager the next `deps()` hands in; returns it for assertions. */
export function useAuthManager(
    authManager: ReturnType<typeof createMockAuthenticationService>
): ReturnType<typeof createMockAuthenticationService> {
    currentAuthManager = authManager;
    return authManager;
}

/** The auth manager `deps()` hands in right now. */
export function authManagerInUse(): ReturnType<typeof createMockAuthenticationService> {
    return currentAuthManager;
}

export function deps(overrides: Partial<DeployMeshHeadlessDeps> = {}): DeployMeshHeadlessDeps {
    return {
        project: project(),
        authManager: currentAuthManager,
        commandManager: createMockCommandExecutor(),
        secrets: createMockSecretStorage().secrets,
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
        extensionPath: '/ext',
        ...overrides,
    };
}

/** The `beforeEach` both suites share: a signed-in Developer and a deploy that works. */
export function arrangeSuccessfulDeploy(): void {
    jest.clearAllMocks();
    // The registry manager is a SESSION singleton now; without this the first
    // test's instance (and its memoised registry) leaks into every later one.
    resetComponentRegistryManager();
    // `mockReturnValue` outlives clearAllMocks, so the one test that turns the
    // App Builder gate ON left it on for every test declared after it.
    mockRequiresAppBuilder.mockReturnValue(false);
    mockRegenerateComponentEnvFile.mockResolvedValue(undefined);
    mockSubscribe.mockResolvedValue([]);
    useAuthManager(
        createMockAuthenticationService(
            { testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }) },
            {
                cache: {
                    // Enriches the org target with code/name when the id matches
                    // (buildOrgTargetFromProjectAdobe).
                    getCachedOrganization: jest.fn(() => ({
                        id: 'org',
                        code: 'ORG@AdobeOrg',
                        name: 'Adobe Demo System',
                    })),
                },
            }
        )
    );
    mockPreflight.mockResolvedValue({ ready: true });
    mockFetchInfo.mockResolvedValue({ meshId: 'existing-1', endpoint: 'https://old/graphql' });
    mockDeploy.mockResolvedValue({
        success: true,
        data: { meshId: 'mesh-1', endpoint: 'https://new/graphql' },
    });
    // Mirror the REAL writer chokepoint (ADR-011 D3 Steps 07+09):
    // updateMeshState lands the deploy outcome on the keyed mesh entry via
    // the real (pure) recordDeployOutcome, so key resolution / source
    // preservation / providesEnvVars refresh are exercised for real.
    mockUpdateMeshState.mockImplementation(async (p: unknown, endpoint?: unknown) => {
        recordDeployOutcome(p as Project, 'mesh', 'commerce-mesh', {
            status: 'deployed',
            endpoint: endpoint as string | undefined,
            lastDeployed: new Date().toISOString(),
            userDeclinedUpdate: undefined,
            declinedAt: undefined,
        });
    });
}

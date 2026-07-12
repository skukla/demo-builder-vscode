/**
 * deployMeshHeadless — the shared, UI-free mesh deploy core.
 *
 * Runs the same sequence DeployMeshCommand orchestrates (preflight → App Builder
 * permission gate → find mesh → pre-deploy subscribe → create-or-update deploy →
 * persist) but returns a plain result and emits status/progress via callbacks
 * instead of driving the dashboard/notification UI directly. Both the command
 * (with UI callbacks) and the deploy_mesh MCP handler (headless) call it.
 */

jest.mock('@/core/di/serviceLocator');
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
const mockUpdateMeshState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: (...args: unknown[]) => mockUpdateMeshState(...args),
}));

import { ServiceLocator } from '@/core/di';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { fetchMeshInfoFromAdobeIO } from '@/features/mesh/services/meshVerifier';
import { deployMeshHeadless } from '@/features/mesh/services/deployMeshHeadless';
import type { Project, ComponentInstance } from '@/types/base';

const mockPreflight = ensureProjectAdobeContext as jest.Mock;
const mockDeploy = deployMeshComponent as jest.MockedFunction<typeof deployMeshComponent>;
const mockFetchInfo = fetchMeshInfoFromAdobeIO as jest.MockedFunction<
    typeof fetchMeshInfoFromAdobeIO
>;

function project(withMesh = true): Project {
    return {
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
    } as Project;
}

function deps(overrides: Record<string, unknown> = {}) {
    return {
        project: project(),
        stateManager: { saveProject: jest.fn().mockResolvedValue(undefined) } as never,
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
        extensionPath: '/ext',
        ...overrides,
    };
}

describe('deployMeshHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const authManager = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(authManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({ execute: jest.fn() });
        mockPreflight.mockResolvedValue({ ready: true });
        mockFetchInfo.mockResolvedValue({ meshId: 'existing-1', endpoint: 'https://old/graphql' });
        mockDeploy.mockResolvedValue({
            success: true,
            data: { meshId: 'mesh-1', endpoint: 'https://new/graphql' },
        });
    });

    it('deploys with the existing mesh id (update strategy) and persists on success', async () => {
        const d = deps();
        const result = await deployMeshHeadless(d);

        expect(mockDeploy).toHaveBeenCalledWith(
            '/p/mesh',
            expect.anything(),
            d.logger,
            expect.any(Function),
            'existing-1'
        );
        expect(mockUpdateMeshState).toHaveBeenCalledWith(expect.any(Object), 'https://new/graphql');
        expect(d.stateManager.saveProject).toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            meshId: 'mesh-1',
            endpoint: 'https://new/graphql',
        });
    });

    it('passes an empty id (create strategy) when no mesh exists remotely', async () => {
        mockFetchInfo.mockResolvedValue(null);
        await deployMeshHeadless(deps());
        expect(mockDeploy).toHaveBeenCalledWith(
            '/p/mesh',
            expect.anything(),
            expect.anything(),
            expect.any(Function),
            ''
        );
    });

    it('emits deploying then deployed status via onStatus', async () => {
        const onStatus = jest.fn();
        await deployMeshHeadless(deps({ onStatus }));
        expect(onStatus).toHaveBeenCalledWith('deploying', expect.any(String));
        expect(onStatus).toHaveBeenLastCalledWith('deployed', undefined, 'https://new/graphql');
    });

    it('blocks on preflight failure without deploying (auth/org)', async () => {
        mockPreflight.mockResolvedValue({ ready: false, blockedBy: 'auth', cancelled: true });
        const result = await deployMeshHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('auth');
        expect(result.cancelled).toBe(true);
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks on missing Developer permission when the project needs App Builder', async () => {
        const {
            projectRequiresAppBuilder,
        } = require('@/features/components/services/projectAppBuilderPredicate');
        projectRequiresAppBuilder.mockReturnValue(true);
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue({
            testDeveloperPermissions: jest
                .fn()
                .mockResolvedValue({ hasPermissions: false, error: 'no role' }),
        });

        const result = await deployMeshHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('permission');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks when the project has no mesh component', async () => {
        const result = await deployMeshHeadless(deps({ project: project(false) }));
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('no-mesh');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('returns a failure result (no persistence) when the deploy fails', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
        const onStatus = jest.fn();
        const result = await deployMeshHeadless(deps({ onStatus }));
        expect(result.success).toBe(false);
        expect(result.error).toBe('boom');
        expect(mockUpdateMeshState).not.toHaveBeenCalled();
        expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(String));
    });
});

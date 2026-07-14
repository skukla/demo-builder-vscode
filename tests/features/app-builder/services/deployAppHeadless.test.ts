/**
 * deployAppHeadless — the shared, UI-free App Builder app deploy core.
 *
 * Runs the same sequence DeployAppCommand orchestrates (preflight → App Builder
 * permission gate → find app → deploy under org-context → persist) but returns a
 * plain result and emits status/progress via callbacks instead of driving the
 * dashboard/notification UI. Both the command (with UI callbacks) and the
 * projects-list redeployApp handler (headless) call it.
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
jest.mock('@/features/app-builder/services/appDeployment', () => ({
    deployAppComponent: jest.fn(),
}));
// withOrgContext just runs the thunk; buildOrgTargetFromProjectAdobe returns a stub.
jest.mock('@/core/shell', () => ({
    withOrgContext: (_t: unknown, fn: () => unknown) => fn(),
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org' })),
}));

import { ServiceLocator } from '@/core/di';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import { deployAppHeadless } from '@/features/app-builder/services/deployAppHeadless';
import type { ComponentInstance, Project } from '@/types/base';

const mockPreflight = ensureProjectAdobeContext as jest.Mock;
const mockDeploy = deployAppComponent as jest.MockedFunction<typeof deployAppComponent>;

function project(withApp = true): Project {
    return {
        name: 'p',
        path: '/p',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { organization: 'org', projectId: 'proj', workspace: 'ws', authenticated: true },
        componentInstances: withApp
            ? {
                  'app-builder-shell': {
                      id: 'app-builder-shell',
                      name: 'App',
                      type: 'app-builder',
                      subType: 'app',
                      path: '/p/app',
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

describe('deployAppHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const authManager = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
            getCachedOrganization: jest.fn().mockReturnValue({ id: 'org' }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(authManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({ execute: jest.fn() });
        mockPreflight.mockResolvedValue({ ready: true });
        mockDeploy.mockResolvedValue({
            success: true,
            data: { url: 'https://app.example', deployedUrls: { web: 'https://app.example' } },
        });
    });

    it('deploys the app and persists appState + appStatusSummary on success', async () => {
        const d = deps();
        const result = await deployAppHeadless(d);

        expect(mockDeploy).toHaveBeenCalledWith(
            '/p/app',
            expect.anything(),
            d.logger,
            expect.any(Function)
        );
        expect(d.project.appStatusSummary).toBe('deployed');
        expect(d.project.appState).toEqual(
            expect.objectContaining({ url: 'https://app.example', status: 'deployed' })
        );
        expect(d.stateManager.saveProject).toHaveBeenCalled();
        expect(result).toEqual({ success: true, url: 'https://app.example' });
    });

    it('emits deploying then deployed status via onStatus', async () => {
        const onStatus = jest.fn();
        await deployAppHeadless(deps({ onStatus }));
        expect(onStatus).toHaveBeenCalledWith('deploying', expect.any(String));
        expect(onStatus).toHaveBeenLastCalledWith('deployed', undefined, 'https://app.example');
    });

    it('blocks on preflight failure without deploying (auth/org)', async () => {
        mockPreflight.mockResolvedValue({
            ready: false,
            blockedBy: 'org',
            currentOrg: 'Other Org',
        });
        const result = await deployAppHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('org');
        expect(result.currentOrg).toBe('Other Org');
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
            getCachedOrganization: jest.fn().mockReturnValue({ id: 'org' }),
        });

        const result = await deployAppHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('permission');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks when the project has no App Builder app', async () => {
        const result = await deployAppHeadless(deps({ project: project(false) }));
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('no-app');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('records appStatusSummary=error and returns the message on a failed deploy', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
        const d = deps();
        const result = await deployAppHeadless(d);
        expect(d.project.appStatusSummary).toBe('error');
        expect(result).toEqual({ success: false, error: 'boom' });
    });
});

/**
 * DeployAppCommand Tests
 *
 * App Builder app deploy command — sibling of DeployMeshCommand. Mirrors the
 * mesh command's guard order exactly:
 *   concurrency lock -> ensureAdobeIOAuth -> detectProjectOrgMismatch
 *   -> projectRequiresAppBuilder + testDeveloperPermissions
 *   -> withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg),
 *        () => deployAppComponent(appPath, cm, logger, onProgress))
 *
 * On success: set project.appState (from the result) + appStatusSummary='deployed',
 * persist, push dashboard status. On deploy failure: appStatusSummary='error'.
 * Abort early (no deployAppComponent call) on failed auth / org mismatch /
 * missing permission.
 *
 * Strict TDD: tests written BEFORE the command implementation.
 */

import * as vscode from 'vscode';
import { DeployAppCommand } from '@/features/app-builder/commands/deployApp';
import { StateManager } from '@/core/state';
import { ServiceLocator } from '@/core/di';
import type { Logger } from '@/types/logger';
import type { Project, ComponentInstance } from '@/types/base';

// =============================================================================
// Mocks
// =============================================================================

jest.mock('vscode');
jest.mock('@/core/di/serviceLocator');

// Shared auth guard
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn(),
}));

// Org reachability guard
const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...args: unknown[]) => mockDetectProjectOrgMismatch(...args),
}));

// App Builder predicate gate
const mockProjectRequiresAppBuilder = jest.fn();
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: (...args: unknown[]) => mockProjectRequiresAppBuilder(...args),
}));

// Registry manager (loadRegistry is awaited then passed to the predicate)
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ components: [] }),
    })),
}));

// Dashboard status push
const mockSendAppStatusUpdate = jest.fn().mockResolvedValue(undefined);
const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppStatusUpdate: mockSendAppStatusUpdate,
        refreshStatus: mockRefreshStatus,
    },
}));

// org-context boundary: record the target, run the callback (no global mutation)
const mockWithOrgContext = jest.fn(
    (_target: unknown, fn: () => Promise<unknown>) => fn(),
);
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) =>
        mockWithOrgContext(target, fn),
}));

// The org-agnostic deploy helper
const mockDeployAppComponent = jest.fn();
jest.mock('@/features/app-builder/services/appDeployment', () => ({
    deployAppComponent: (...args: unknown[]) => mockDeployAppComponent(...args),
}));

import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
const mockEnsureAdobeIOAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;

// =============================================================================
// Helpers
// =============================================================================

function createTestProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: {
            projectId: 'proj-456',
            organization: 'org-123',
            workspace: 'ws-789',
            authenticated: true,
        },
        componentInstances: {
            'my-app': {
                id: 'my-app',
                name: 'My App',
                type: 'app-builder',
                subType: 'app',
                path: '/test/project/components/my-app',
                status: 'ready',
            } as ComponentInstance,
        },
        componentConfigs: {},
        ...overrides,
    } as unknown as Project;
}

const DEPLOY_RESULT = {
    success: true,
    data: {
        url: 'https://app.example.com/index.html',
        deployedUrls: { 'web/app': 'https://app.example.com/index.html' },
    },
};

describe('DeployAppCommand', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockAuthManager: {
        getCachedOrganization: jest.Mock;
        testDeveloperPermissions: jest.Mock;
    };
    let mockCommandExecutor: { execute: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<StateManager>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        mockAuthManager = {
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        };

        mockCommandExecutor = { execute: jest.fn() };

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Defaults: authed, org reachable, requires app builder, has permission, deploy ok
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
        mockProjectRequiresAppBuilder.mockReturnValue(true);
        mockDeployAppComponent.mockResolvedValue(DEPLOY_RESULT);
        mockWithOrgContext.mockImplementation(
            (_target: unknown, fn: () => Promise<unknown>) => fn(),
        );

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: unknown, task: (progress: unknown) => Promise<void>) => {
                const mockProgress = { report: jest.fn() };
                return task(mockProgress);
            },
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    });

    function run(): Promise<void> {
        const command = new DeployAppCommand(mockContext, mockStateManager, mockLogger);
        return command.execute();
    }

    // =========================================================================
    // No project / no app
    // =========================================================================

    it('aborts when there is no current project', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(undefined as never);

        await run();

        expect(mockDeployAppComponent).not.toHaveBeenCalled();
    });

    it('aborts when the project has no App Builder app instance', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(
            createTestProject({ componentInstances: {} }),
        );

        await run();

        expect(mockDeployAppComponent).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Guard: auth
    // =========================================================================

    it('aborts (no deploy) when auth fails', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        await run();

        expect(mockDeployAppComponent).not.toHaveBeenCalled();
        expect(mockDetectProjectOrgMismatch).not.toHaveBeenCalled();
        expect(mockRefreshStatus).toHaveBeenCalled();
    });

    it('does not show a failure error when auth is cancelled', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        await run();

        expect(mockDeployAppComponent).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('Sign-in failed'),
        );
    });

    // =========================================================================
    // Guard: org mismatch
    // =========================================================================

    it('aborts (no deploy) when the project org is unreachable (mismatch)', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockDetectProjectOrgMismatch.mockResolvedValue({
            reachable: false,
            currentOrg: 'Other Org',
        });

        await run();

        expect(mockDeployAppComponent).not.toHaveBeenCalled();
        expect(mockProjectRequiresAppBuilder).not.toHaveBeenCalled();
        expect(mockRefreshStatus).toHaveBeenCalled();
    });

    // =========================================================================
    // Guard: developer permission
    // =========================================================================

    it('aborts (no deploy) when developer permission is missing', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockAuthManager.testDeveloperPermissions.mockResolvedValue({
            hasPermissions: false,
            error: 'No developer role',
        });

        await run();

        expect(mockDeployAppComponent).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('skips the permission check when the project does not require App Builder', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockProjectRequiresAppBuilder.mockReturnValue(false);

        await run();

        expect(mockAuthManager.testDeveloperPermissions).not.toHaveBeenCalled();
        // Still deploys (the instance exists)
        expect(mockDeployAppComponent).toHaveBeenCalled();
    });

    // =========================================================================
    // Guard ORDER
    // =========================================================================

    it('runs the guards in order: auth -> org -> permission -> deploy', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        const order: string[] = [];
        mockEnsureAdobeIOAuth.mockImplementation(async () => { order.push('auth'); return { authenticated: true }; });
        mockDetectProjectOrgMismatch.mockImplementation(async () => { order.push('org'); return { reachable: true }; });
        mockAuthManager.testDeveloperPermissions.mockImplementation(async () => { order.push('permission'); return { hasPermissions: true }; });
        mockDeployAppComponent.mockImplementation(async () => { order.push('deploy'); return DEPLOY_RESULT; });

        await run();

        expect(order).toEqual(['auth', 'org', 'permission', 'deploy']);
    });

    // =========================================================================
    // Org-context wrapping
    // =========================================================================

    it('wraps deployAppComponent in withOrgContext targeting the project org/project/workspace', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());

        await run();

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function),
        );
    });

    it('enriches the org target from the cached org when its id matches', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockAuthManager.getCachedOrganization.mockReturnValue({
            id: 'org-123', code: 'CODE@AdobeOrg', name: 'Acme Inc',
        });

        await run();

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                orgCode: 'CODE@AdobeOrg',
                orgName: 'Acme Inc',
            }),
            expect.any(Function),
        );
    });

    it('deploys from the app component path', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());

        await run();

        expect(mockDeployAppComponent).toHaveBeenCalledWith(
            '/test/project/components/my-app',
            mockCommandExecutor,
            mockLogger,
            expect.any(Function),
        );
    });

    // =========================================================================
    // Success persistence
    // =========================================================================

    it('persists appState and appStatusSummary=deployed on success', async () => {
        const project = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        await run();

        expect(project.appStatusSummary).toBe('deployed');
        expect(project.appState).toEqual(
            expect.objectContaining({
                status: 'deployed',
                url: 'https://app.example.com/index.html',
                deployedUrls: { 'web/app': 'https://app.example.com/index.html' },
            }),
        );
        expect(project.appState?.lastDeployed).toBeDefined();
        expect(mockStateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('pushes a deployed dashboard status on success', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());

        await run();

        expect(mockSendAppStatusUpdate).toHaveBeenCalledWith(
            'deployed',
            undefined,
            'https://app.example.com/index.html',
        );
    });

    // =========================================================================
    // Failure
    // =========================================================================

    it('sets appStatusSummary=error and pushes error status when deploy fails', async () => {
        const project = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(project);
        mockDeployAppComponent.mockResolvedValue({ success: false, error: 'deploy boom' });

        await run();

        expect(project.appStatusSummary).toBe('error');
        expect(mockStateManager.saveProject).toHaveBeenCalledWith(project);
        expect(mockSendAppStatusUpdate).toHaveBeenCalledWith('error', expect.any(String));
    });

    it('sets appStatusSummary=error when deployAppComponent throws', async () => {
        const project = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(project);
        mockDeployAppComponent.mockRejectedValue(new Error('network down'));

        await run();

        expect(project.appStatusSummary).toBe('error');
        expect(mockSendAppStatusUpdate).toHaveBeenCalledWith('error', expect.any(String));
    });
});

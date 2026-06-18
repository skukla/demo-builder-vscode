/**
 * DeployMeshCommand Unification Tests
 *
 * The command delegates build + deploy + verify to the shared deployMeshComponent
 * service instead of inlining `aio api-mesh:update`. Verifies:
 * - it fetches the existing mesh id (remote truth) and passes it through for
 *   create-or-update (id present -> update; absent -> create)
 * - it calls deployMeshComponent with the mesh path, executor, logger, onProgress
 * - success drives persistence (updateMeshState + saveProject + deployed status)
 * - a failed deploy result surfaces the error status + toast (no persistence)
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { StateManager } from '@/core/state';
import { ServiceLocator } from '@/core/di';
import type { Logger } from '@/types/logger';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('@/core/di/serviceLocator');
jest.mock('@/features/mesh/utils/errorFormatter', () => ({
    formatAdobeCliError: jest.fn((s: string) => s),
    extractMeshErrorSummary: jest.fn((s: string) => s),
}));
jest.mock('@/features/mesh/services/meshConfig', () => ({ getMeshNodeVersion: jest.fn(() => '18') }));

// App Builder gate skipped — not under test here.
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ components: {} }),
    })),
}));

// Pre-flight always passes — isolate the deploy delegation.
jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: jest.fn().mockResolvedValue({ ready: true }),
}));

// The deploy primitive + remote mesh-info fetch under test.
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: jest.fn(),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: jest.fn(),
}));

const mockSendMeshStatusUpdate = jest.fn().mockResolvedValue(undefined);
const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: mockSendMeshStatusUpdate,
        refreshStatus: mockRefreshStatus,
    },
}));
const mockUpdateMeshState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: (...args: unknown[]) => mockUpdateMeshState(...args),
}));

import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { fetchMeshInfoFromAdobeIO } from '@/features/mesh/services/meshVerifier';
const mockDeploy = deployMeshComponent as jest.MockedFunction<typeof deployMeshComponent>;
const mockFetchInfo = fetchMeshInfoFromAdobeIO as jest.MockedFunction<typeof fetchMeshInfoFromAdobeIO>;

function createTestProject(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { projectId: 'proj-123', projectName: 'Test', organization: 'org-123', workspace: 'ws-123', authenticated: true },
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh', name: 'Commerce Mesh', type: 'app-builder',
                subType: 'mesh', path: '/test/project/mesh', status: 'ready',
            } as ComponentInstance,
        },
        componentConfigs: {},
    };
}

describe('DeployMeshCommand - Unification (delegates to deployMeshComponent)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockAuthManager: { getOrganizations: jest.Mock; loginAndRestoreProjectContext: jest.Mock };
    let mockCommandExecutor: { execute: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = { subscriptions: [], extensionPath: '/test/extension' } as unknown as vscode.ExtensionContext;
        mockStateManager = { getCurrentProject: jest.fn(), saveProject: jest.fn() } as unknown as jest.Mocked<StateManager>;
        mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() } as jest.Mocked<Logger>;
        mockAuthManager = {
            getOrganizations: jest.fn().mockResolvedValue([{ id: 'org-123', name: 'Org 123' }]),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        };
        mockCommandExecutor = { execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }) };

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_o: unknown, task: (p: unknown) => Promise<void>) => { await task({ report: jest.fn() }); },
        );
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockResolvedValue(undefined);

        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
        mockDeploy.mockResolvedValue({ success: true, data: { meshId: 'mesh-xyz', endpoint: 'https://m.adobe.io/graphql' } });
        mockFetchInfo.mockResolvedValue({ meshId: 'existing-789', endpoint: 'https://old.adobe.io/graphql' });
    });

    it('delegates to deployMeshComponent with the mesh path, executor, an onProgress fn, and the existing mesh id', async () => {
        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockFetchInfo).toHaveBeenCalled();
        expect(mockDeploy).toHaveBeenCalledWith(
            '/test/project/mesh',
            mockCommandExecutor,
            mockLogger,
            expect.any(Function),
            'existing-789', // update strategy: a mesh already exists
        );
    });

    it('passes an empty mesh id (create strategy) when no mesh exists remotely', async () => {
        mockFetchInfo.mockResolvedValue(null);

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockDeploy).toHaveBeenCalledWith(
            '/test/project/mesh',
            mockCommandExecutor,
            mockLogger,
            expect.any(Function),
            '',
        );
    });

    it('persists deployed state and emits the deployed status on success', async () => {
        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockUpdateMeshState).toHaveBeenCalledWith(expect.any(Object), 'https://m.adobe.io/graphql');
        expect(mockStateManager.saveProject).toHaveBeenCalled();
        expect(mockSendMeshStatusUpdate).toHaveBeenCalledWith('deployed', undefined, 'https://m.adobe.io/graphql');
    });

    it('surfaces an error (no persistence) when the deploy result is a failure', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'boom' });

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockSendMeshStatusUpdate).toHaveBeenCalledWith('error', expect.any(String));
        expect(mockUpdateMeshState).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });
});

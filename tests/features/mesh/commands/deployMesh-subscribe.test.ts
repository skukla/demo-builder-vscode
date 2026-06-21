/**
 * DeployMeshCommand — pre-deploy API subscribe (D2 Track A, Step 03)
 *
 * Verifies the bounded `ensureMeshApiSubscribed` runs BEFORE `deployMeshComponent`
 * (and AFTER the auth preflight + permission gate pass), surfaces a typed error
 * + mesh-status 'error' if the subscribe throws (no half-deploy), and does not
 * block deploy when there's nothing to subscribe.
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
jest.mock('@/features/mesh/services/meshConfig', () => ({ getMeshNodeVersion: jest.fn(() => '18') }));

// Preflight + permission gate pass.
jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: jest.fn().mockResolvedValue({ ready: true }),
}));
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn().mockReturnValue(false),
}));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({}),
    })),
}));

// The new subscribe helper.
const mockEnsureSubscribed = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/app-builder/services/ensureMeshApiSubscribed', () => ({
    ensureMeshApiSubscribed: (...args: unknown[]) => mockEnsureSubscribed(...args),
}));

// The deploy core.
const mockDeployMeshComponent = jest.fn().mockResolvedValue({
    success: true, data: { meshId: 'mesh-1', endpoint: 'https://m.adobe.io/graphql' },
});
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: (...args: unknown[]) => mockDeployMeshComponent(...args),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: jest.fn().mockResolvedValue({ meshId: '' }),
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
}));

const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
const mockSendMeshStatusUpdate = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: mockSendMeshStatusUpdate,
        refreshStatus: mockRefreshStatus,
    },
}));

function createTestProject(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: {
            projectId: 'proj-123', projectName: 'Test', organization: 'org-123',
            workspace: 'ws-123', authenticated: true,
        },
        componentSelections: { backend: 'adobe-commerce-paas', frontend: 'eds-storefront' },
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh', name: 'Commerce Mesh', type: 'app-builder',
                subType: 'mesh', path: '/test/project/mesh', status: 'ready',
            } as ComponentInstance,
        },
        componentConfigs: {},
    };
}

describe('DeployMeshCommand - pre-deploy subscribe', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockAuthManager: Record<string, jest.Mock>;
    let mockCommandExecutor: { execute: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        mockEnsureSubscribed.mockResolvedValue(undefined);
        mockDeployMeshComponent.mockResolvedValue({
            success: true, data: { meshId: 'mesh-1', endpoint: 'https://m.adobe.io/graphql' },
        });

        mockContext = { subscriptions: [], extensionPath: '/test/extension' } as unknown as vscode.ExtensionContext;
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(createTestProject()),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<StateManager>;
        mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() } as jest.Mocked<Logger>;
        mockAuthManager = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        };
        mockCommandExecutor = { execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '', duration: 1 }) };

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_o: unknown, task: (p: unknown) => Promise<void>) => task({ report: jest.fn() }),
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));
    });

    it('calls ensureMeshApiSubscribed BEFORE deployMeshComponent', async () => {
        const order: string[] = [];
        mockEnsureSubscribed.mockImplementation(async () => { order.push('subscribe'); });
        mockDeployMeshComponent.mockImplementation(async () => {
            order.push('deploy');
            return { success: true, data: { meshId: 'm', endpoint: 'e' } };
        });

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockEnsureSubscribed).toHaveBeenCalled();
        expect(mockDeployMeshComponent).toHaveBeenCalled();
        expect(order).toEqual(['subscribe', 'deploy']);
    });

    it('does NOT call deployMeshComponent and posts error status when subscribe throws', async () => {
        mockEnsureSubscribed.mockRejectedValue(new Error('subscribe failed'));

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockDeployMeshComponent).not.toHaveBeenCalled();
        expect(mockSendMeshStatusUpdate).toHaveBeenCalledWith('error', expect.any(String));
    });

    it('still deploys when there is nothing to subscribe (helper no-ops)', async () => {
        mockEnsureSubscribed.mockResolvedValue(undefined);

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockDeployMeshComponent).toHaveBeenCalled();
    });
});

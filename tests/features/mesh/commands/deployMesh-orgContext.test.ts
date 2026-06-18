/**
 * DeployMeshCommand Org-Context Gate Tests
 *
 * Verifies deployMesh's adoption of the reactive org-context gate
 * (ensureProjectOrgContext) in place of the old dead-end warning:
 * - reachable -> proceeds (no early return)
 * - cancelled -> refreshStatus, no error toast, returns early
 * - unreachable (not cancelled) -> refreshStatus + error toast, returns early
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
jest.mock('@/features/mesh/services/meshConfig', () => ({
    getMeshNodeVersion: jest.fn(() => '18'),
}));

// Auth always passes — isolate the org-context gate.
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));

// The gate under test.
jest.mock('@/features/authentication/services/ensureProjectOrgContext', () => ({
    ensureProjectOrgContext: jest.fn(),
}));

const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
const mockSendMeshStatusUpdate = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: mockSendMeshStatusUpdate,
        refreshStatus: mockRefreshStatus,
    },
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/mesh/services/meshDeploymentVerifier', () => ({
    waitForMeshDeployment: jest.fn().mockResolvedValue({
        deployed: true,
        meshId: 'mesh-test-123',
        endpoint: 'https://test-mesh.adobe.io/graphql',
    }),
}));

import { ensureProjectOrgContext } from '@/features/authentication/services/ensureProjectOrgContext';
const mockEnsureOrg = ensureProjectOrgContext as jest.MockedFunction<typeof ensureProjectOrgContext>;

function createTestProject(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: {
            projectId: 'proj-123',
            projectName: 'Test Project',
            organization: 'org-123',
            workspace: 'ws-123',
            authenticated: true,
        },
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'Commerce Mesh',
                type: 'app-builder',
                subType: 'mesh',
                path: '/test/project/mesh',
                status: 'ready',
            } as ComponentInstance,
        },
        componentConfigs: {},
    };
}

describe('DeployMeshCommand - Org-Context Gate (ensureProjectOrgContext)', () => {
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
            getOrganizations: jest.fn().mockResolvedValue([{ id: 'org-123', code: 'ORG@AdobeOrg', name: 'Org 123' }]),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        };
        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: 'Mesh deployed successfully', stderr: '', duration: 5000 }),
        };

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_o: unknown, task: (p: unknown) => Promise<void>) => { await task({ report: jest.fn() }); },
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

        mockStateManager.getCurrentProject.mockResolvedValue(createTestProject());
    });

    it('proceeds past the gate when the org is reachable', async () => {
        mockEnsureOrg.mockResolvedValue({ reachable: true, currentOrg: 'Org 123' });

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockEnsureOrg).toHaveBeenCalledWith(
            expect.objectContaining({ authManager: mockAuthManager, project: expect.any(Object), logPrefix: '[Mesh Deployment]' }),
        );
        // Proceeded past the gate: the gate did not trigger its early refresh-only return.
        expect(mockRefreshStatus).not.toHaveBeenCalled();
    });

    it('returns early without an error toast when the user cancels the switch', async () => {
        mockEnsureOrg.mockResolvedValue({ reachable: false, cancelled: true, currentOrg: 'Wrong Org' });

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockRefreshStatus).toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
    });

    it('shows an error and returns early when still mismatched after the switch', async () => {
        mockEnsureOrg.mockResolvedValue({ reachable: false, currentOrg: 'Wrong Org' });

        await new DeployMeshCommand(mockContext, mockStateManager, mockLogger).execute();

        expect(mockRefreshStatus).toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('wrong Adobe organization'),
        );
        expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
    });
});

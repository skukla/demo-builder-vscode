/**
 * DeployMeshCommand Auth Refactor Tests
 *
 * Tests verifying the refactored auth check in DeployMeshCommand.execute():
 * - Already authenticated -> proceeds to org check
 * - Expired -> sign-in succeeds -> proceeds
 * - Expired -> cancelled -> refreshStatus called, returns early
 * - Expired -> sign-in fails -> error message shown, returns early
 *
 * Step 4a: Replace inline auth (lines 51-92) with ensureAdobeIOAuth shared guard.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { StateManager } from '@/core/state';
import { ServiceLocator } from '@/core/di';
import type { Logger } from '@/types/logger';
import type { Project, ComponentInstance } from '@/types/base';

// =============================================================================
// Mocks
// =============================================================================

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

// Mock the shared auth guard
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn(),
}));

// Mock dynamic imports for dashboard
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

// Import the mock after jest.mock hoisting
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
const mockEnsureAdobeIOAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Tests
// =============================================================================

describe('DeployMeshCommand - Auth Refactor (ensureAdobeIOAuth)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockAuthManager: { isAuthenticated: jest.Mock; getCurrentOrganization: jest.Mock };
    let mockCommandExecutor: { execute: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn(),
        } as unknown as jest.Mocked<StateManager>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        } as jest.Mocked<Logger>;

        mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org-123' }),
        };

        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({
                code: 0,
                stdout: 'Mesh deployed successfully',
                stderr: '',
                duration: 5000,
            }),
        };

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: unknown, task: (progress: unknown) => Promise<void>) => {
                const mockProgress = { report: jest.fn() };
                await task(mockProgress);
            }
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
            meshConfig: { sources: [] },
        }));
    });

    // =========================================================================
    // Already Authenticated -> Proceeds to org check
    // =========================================================================

    it('should proceed to org check when ensureAdobeIOAuth returns authenticated', async () => {
        // Given: ensureAdobeIOAuth says user is authenticated
        const testProject = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(testProject);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });

        // When: DeployMeshCommand executes
        const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
        await command.execute();

        // Then: ensureAdobeIOAuth should have been called with authManager, logger, etc.
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                authManager: mockAuthManager,
                logger: mockLogger,
                logPrefix: '[Mesh Deployment]',
                warningMessage: 'Adobe sign-in required to deploy mesh.',
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: 'proj-123',
                    workspace: 'ws-123',
                }),
            }),
        );

        // And: org check should have been called (means we proceeded past auth)
        expect(mockAuthManager.getCurrentOrganization).toHaveBeenCalled();
    });

    // =========================================================================
    // Expired -> Sign-in succeeds -> Proceeds
    // =========================================================================

    it('should proceed when ensureAdobeIOAuth sign-in succeeds', async () => {
        // Given: ensureAdobeIOAuth succeeds after re-auth
        const testProject = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(testProject);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });

        // When: DeployMeshCommand executes
        const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
        await command.execute();

        // Then: Should proceed to org check (deployment continues)
        expect(mockAuthManager.getCurrentOrganization).toHaveBeenCalled();
        // And: refreshStatus should NOT have been called (no early return)
        expect(mockRefreshStatus).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Expired -> Cancelled -> refreshStatus called, returns early
    // =========================================================================

    it('should call refreshStatus and return early when user cancels auth', async () => {
        // Given: User cancels the sign-in dialog
        const testProject = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(testProject);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        // When: DeployMeshCommand executes
        const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
        await command.execute();

        // Then: refreshStatus should be called
        expect(mockRefreshStatus).toHaveBeenCalled();

        // And: Should NOT show error message (cancelled, not failed)
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('Sign-in failed'),
            expect.anything(),
        );

        // And: Should NOT proceed to org check
        expect(mockAuthManager.getCurrentOrganization).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Expired -> Sign-in fails -> Error message shown, returns early
    // =========================================================================

    it('should show error message and return early when sign-in fails', async () => {
        // Given: Sign-in fails (not cancelled, just failed)
        const testProject = createTestProject();
        mockStateManager.getCurrentProject.mockResolvedValue(testProject);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        // When: DeployMeshCommand executes
        const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
        await command.execute();

        // Then: refreshStatus should be called
        expect(mockRefreshStatus).toHaveBeenCalled();

        // And: Error message should be shown
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Sign-in failed or was cancelled. Please try again.',
        );

        // And: Should NOT proceed to org check
        expect(mockAuthManager.getCurrentOrganization).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Project context forwarding
    // =========================================================================

    it('should forward project adobe context to ensureAdobeIOAuth', async () => {
        // Given: Project with specific adobe config
        const testProject = createTestProject();
        testProject.adobe = {
            organization: 'custom-org',
            projectId: 'custom-proj',
            workspace: 'custom-ws',
        };
        mockStateManager.getCurrentProject.mockResolvedValue(testProject);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });

        // When
        const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
        await command.execute();

        // Then: projectContext should match project.adobe fields
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: {
                    organization: 'custom-org',
                    projectId: 'custom-proj',
                    workspace: 'custom-ws',
                },
            }),
        );
    });
});

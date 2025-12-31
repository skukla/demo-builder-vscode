/**
 * DeployMeshCommand Storage Tests
 *
 * Tests verifying mesh endpoint storage behavior:
 * - Mesh endpoint stored ONLY in meshState.endpoint (single source of truth)
 * - Mesh endpoint NOT persisted to componentConfigs or componentInstances.endpoint
 *
 * The mesh endpoint is now stored in project.meshState.endpoint as the
 * authoritative location. See docs/architecture/state-ownership.md for details.
 *
 * Target Coverage: 85%+
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { ServiceLocator } from '@/core/di';
import type { Logger } from '@/types/logger';
import type { Project, ComponentInstance } from '@/types/base';

// Mock all external dependencies
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

// Mock dynamic imports
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: jest.fn().mockResolvedValue(undefined),
    },
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockImplementation(async (project, endpoint) => {
        // Simulate the actual behavior: set meshState.endpoint
        project.meshState = {
            envVars: {},
            sourceHash: null,
            lastDeployed: new Date().toISOString(),
            endpoint,
        };
    }),
}));
jest.mock('@/features/mesh/services/meshDeploymentVerifier', () => ({
    waitForMeshDeployment: jest.fn().mockResolvedValue({
        deployed: true,
        meshId: 'mesh-test-123',
        endpoint: 'https://test-mesh.adobe.io/graphql',
    }),
}));

describe('DeployMeshCommand - Storage Behavior', () => {
    // Mocks
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockAuthManager: { isAuthenticated: jest.Mock; getCurrentOrganization: jest.Mock };
    let mockCommandExecutor: { execute: jest.Mock };

    // Captured project state for assertions
    let capturedProject: Project | null = null;

    // Test project with mesh and frontend components
    const createTestProject = (): Project => ({
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
                // endpoint will be set during deployment
            } as ComponentInstance,
            'frontend-headless': {
                id: 'frontend-headless',
                name: 'Headless Frontend',
                type: 'frontend',
                path: '/test/project/frontend',
                status: 'ready',
            } as ComponentInstance,
        },
        // componentConfigs may or may not exist - should NOT have MESH_ENDPOINT after deployment
        componentConfigs: {},
    });

    beforeEach(() => {
        jest.clearAllMocks();
        capturedProject = null;

        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
        } as unknown as vscode.ExtensionContext;

        // Setup mock StateManager
        mockStateManager = {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn(),
        } as unknown as jest.Mocked<StateManager>;

        // Capture project state on saveProject call
        mockStateManager.saveProject.mockImplementation(async (project: Project) => {
            capturedProject = JSON.parse(JSON.stringify(project)); // Deep clone
        });

        // Setup mock StatusBar
        mockStatusBar = {
            show: jest.fn(),
            hide: jest.fn(),
        } as unknown as jest.Mocked<StatusBarManager>;

        // Setup mock Logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        };

        // Setup mock AuthManager
        mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org-123' }),
        };

        // Setup mock CommandExecutor
        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({
                code: 0,
                stdout: 'Mesh deployed successfully',
                stderr: '',
                duration: 5000,
            }),
        };

        // Wire up ServiceLocator mocks
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Setup vscode mocks
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: unknown, task: (progress: unknown) => Promise<void>) => {
                const mockProgress = { report: jest.fn() };
                await task(mockProgress);
            }
        );
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        // Setup fs mocks
        (fs.access as jest.Mock).mockResolvedValue(undefined); // mesh.json exists
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
            meshConfig: { sources: [] },
        }));
    });

    describe('Mesh endpoint storage after successful deployment', () => {
        it('should NOT write MESH_ENDPOINT to componentConfigs', async () => {
            // Given: A project with mesh and frontend components
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes successfully
            const command = new DeployMeshCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );
            await command.execute();

            // Then: componentConfigs should NOT contain MESH_ENDPOINT for frontend
            expect(capturedProject).not.toBeNull();

            // Check that no component in componentConfigs has MESH_ENDPOINT
            const componentConfigs = capturedProject!.componentConfigs || {};
            for (const [componentId, config] of Object.entries(componentConfigs)) {
                expect(config).not.toHaveProperty('MESH_ENDPOINT');
                // Extra assertion: Check the frontend specifically
                if (componentId === 'frontend-headless') {
                    expect((config as Record<string, unknown>)['MESH_ENDPOINT']).toBeUndefined();
                }
            }
        });

        it('should store mesh endpoint in meshState.endpoint (single source of truth)', async () => {
            // Given: A project with mesh component
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes with endpoint
            const command = new DeployMeshCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );
            await command.execute();

            // Then: Endpoint should be stored in meshState.endpoint (authoritative location)
            // See docs/architecture/state-ownership.md
            expect(capturedProject).not.toBeNull();
            expect(capturedProject!.meshState).toBeDefined();
            expect(capturedProject!.meshState!.endpoint).toBe(
                'https://test-mesh.adobe.io/graphql'
            );
            // And: componentInstances should NOT have endpoint (deprecated)
            expect(capturedProject!.componentInstances!['commerce-mesh'].endpoint).toBeUndefined();
        });

        it('should update mesh component status to deployed', async () => {
            // Given: A project with mesh component in ready state
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes
            const command = new DeployMeshCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );
            await command.execute();

            // Then: Mesh component status should be 'deployed'
            expect(capturedProject).not.toBeNull();
            expect(capturedProject!.componentInstances!['commerce-mesh'].status).toBe('deployed');
        });

        it('should store meshId in component metadata', async () => {
            // Given: A project with mesh component
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes
            const command = new DeployMeshCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );
            await command.execute();

            // Then: meshId should be stored in component metadata
            expect(capturedProject).not.toBeNull();
            const meshComponent = capturedProject!.componentInstances!['commerce-mesh'];
            expect(meshComponent.metadata).toBeDefined();
            expect(meshComponent.metadata!.meshId).toBe('mesh-test-123');
            expect(meshComponent.metadata!.meshStatus).toBe('deployed');
        });
    });

    describe('Project without frontend component', () => {
        it('should complete deployment without writing to componentConfigs', async () => {
            // Given: A project with mesh but NO frontend component
            const testProject = createTestProject();
            delete testProject.componentInstances!['frontend-headless'];
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes
            const command = new DeployMeshCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );
            await command.execute();

            // Then: Deployment should succeed and endpoint stored in meshState (single source of truth)
            expect(capturedProject).not.toBeNull();
            expect(capturedProject!.meshState!.endpoint).toBe(
                'https://test-mesh.adobe.io/graphql'
            );
            // And: componentConfigs should not have any MESH_ENDPOINT entries
            const componentConfigs = capturedProject!.componentConfigs || {};
            expect(Object.keys(componentConfigs).length).toBe(0);
        });
    });

    describe('Project with existing componentConfigs', () => {
        it('should NOT add MESH_ENDPOINT to existing componentConfigs entries', async () => {
            // Given: A project with pre-existing componentConfigs for frontend
            const testProject = createTestProject();
            testProject.componentConfigs = {
                'frontend-headless': {
                    'COMMERCE_URL': 'https://commerce.example.com',
                    'SOME_OTHER_VAR': 'value',
                },
            };
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes
            const command = new DeployMeshCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );
            await command.execute();

            // Then: componentConfigs should preserve existing values
            expect(capturedProject).not.toBeNull();
            const frontendConfig = capturedProject!.componentConfigs!['frontend-headless'];
            expect(frontendConfig['COMMERCE_URL']).toBe('https://commerce.example.com');
            expect(frontendConfig['SOME_OTHER_VAR']).toBe('value');

            // And: MESH_ENDPOINT should NOT be added
            expect(frontendConfig).not.toHaveProperty('MESH_ENDPOINT');
        });
    });
});

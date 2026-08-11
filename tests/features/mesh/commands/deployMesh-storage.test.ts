/**
 * DeployMeshCommand Storage Tests
 *
 * Tests verifying mesh endpoint storage behavior:
 * - Mesh endpoint stored ONLY on the keyed appBuilderComponents entry
 * - Mesh endpoint NOT persisted to componentConfigs
 *
 * The keyed `appBuilderComponents[id]` entry is the authoritative location
 * (ADR-011 D3 Steps 07+09); the legacy `meshState` singleton is cleared on write
 * and read-only for pre-migration manifests. See docs/architecture/state-ownership.md.
 *
 * Target Coverage: 85%+
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { StateManager } from '@/core/state';
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

// The DeployMeshCommand gates App Builder operations on
// projectRequiresAppBuilder + testDeveloperPermissions. These tests focus on
// storage behavior, not the gate — stub the predicate to false so deployment
// proceeds to the storage assertions.
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({
            version: 'test',
            components: { frontends: [], backends: [], dependencies: [], mesh: [] },
        }),
    })),
}));

// Mock dynamic imports
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: jest.fn().mockResolvedValue(undefined),
    },
}));
// A FAITHFUL double. The previous one simulated behaviour production had already
// retired — it wrote the legacy `meshState` singleton and nothing else — and the
// gap was invisible only because deployMeshHeadless also set the instance status
// by hand. Removing that redundant second writer (2026-08-04) exposed it: the
// suite asserted an instance status that, in production, comes from
// recordDeployOutcome inside updateMeshState. The real thing is mocked because it
// reads the mesh .env and hashes the source tree; what it WRITES is reproduced.
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockImplementation(async (project, endpoint) => {
        const { recordDeployOutcome } = jest.requireActual(
            '@/features/app-builder/services/appBuilderDeployOutcome'
        );
        const meshInstance = Object.values(
            (project.componentInstances ?? {}) as Record<string, { id: string; subType?: string }>
        ).find((instance) => instance.subType === 'mesh');

        recordDeployOutcome(project, 'mesh', meshInstance?.id ?? 'mesh', {
            status: 'deployed',
            endpoint,
            envVars: {},
            sourceHash: null,
            lastDeployed: new Date().toISOString(),
        });
        // updateMeshStateImpl clears the retired singleton; the keyed entry is
        // authoritative and a leftover meshState resurfaces through the legacy
        // read fallbacks.
        project.meshState = undefined;
    }),
}));
jest.mock('@/features/mesh/services/meshDeploymentVerifier', () => ({
    waitForMeshDeployment: jest.fn().mockResolvedValue({
        deployed: true,
        meshId: 'mesh-test-123',
        endpoint: 'https://test-mesh.adobe.io/graphql',
    }),
}));
// The command delegates build+deploy+verify to deployMeshComponent; mock it so the
// command's persistence (the subject of these tests) runs on a successful result.
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: jest.fn().mockResolvedValue({
        success: true,
        data: { meshId: 'mesh-test-123', endpoint: 'https://test-mesh.adobe.io/graphql' },
    }),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: jest.fn().mockResolvedValue(null),
}));

describe('DeployMeshCommand - Storage Behavior', () => {
    // Mocks
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockAuthManager: {
        isAuthenticated: jest.Mock;
        getOrganizations: jest.Mock;
        getCurrentOrganization: jest.Mock;
    };
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

        // Setup mock Logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        };

        // Setup mock AuthManager — org-123 is reachable, matching the project's
        // org, so the canonical detectProjectOrgMismatch check passes.
        mockAuthManager = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getOrganizations: jest
                .fn()
                .mockResolvedValue([{ id: 'org-123', code: 'ORG123@AdobeOrg', name: 'Org 123' }]),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org-123', name: 'Org 123' }),
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
        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({
                meshConfig: { sources: [] },
            })
        );
    });

    describe('Mesh endpoint storage after successful deployment', () => {
        it('should NOT write MESH_ENDPOINT to componentConfigs', async () => {
            // Given: A project with mesh and frontend components
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes successfully
            const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
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

        it('should store the mesh endpoint on the KEYED entry (single source of truth)', async () => {
            // Given: A project with mesh component
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes with endpoint
            const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
            await command.execute();

            // Then: the endpoint lands on the keyed appBuilderComponents entry.
            //
            // This used to assert `meshState.endpoint`. That WAS the authoritative
            // location; ADR-011 D3 Steps 07+09 made the keyed map authoritative and
            // updateMeshStateImpl now CLEARS the legacy singleton. The assertion
            // survived the migration only because this suite's mock kept writing
            // the retired field. See docs/architecture/state-ownership.md.
            expect(capturedProject).not.toBeNull();
            expect(capturedProject!.appBuilderComponents!['commerce-mesh'].endpoint).toBe(
                'https://test-mesh.adobe.io/graphql'
            );
            // And the retired singleton is gone, not merely unread.
            expect(capturedProject!.meshState).toBeUndefined();
        });

        it('should update mesh component status to deployed', async () => {
            // Given: A project with mesh component in ready state
            const testProject = createTestProject();
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes
            const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
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
            const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
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
            const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
            await command.execute();

            // Then: deployment succeeds and the endpoint lands on the keyed entry
            expect(capturedProject).not.toBeNull();
            expect(capturedProject!.appBuilderComponents!['commerce-mesh'].endpoint).toBe(
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
                    COMMERCE_URL: 'https://commerce.example.com',
                    SOME_OTHER_VAR: 'value',
                },
            };
            mockStateManager.getCurrentProject.mockResolvedValue(testProject);

            // When: Mesh deployment completes
            const command = new DeployMeshCommand(mockContext, mockStateManager, mockLogger);
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

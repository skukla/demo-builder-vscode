/**
 * Tests for mesh endpoint single source of truth in executor
 *
 * These tests verify that mesh endpoint is stored ONLY in
 * meshState.endpoint (single source of truth),
 * NOT duplicated in componentConfigs or componentInstances.endpoint.
 *
 * The mesh endpoint is now stored in project.meshState.endpoint as the
 * authoritative location. See docs/architecture/state-ownership.md for details.
 */

import * as stalenessDetector from '@/features/mesh/services/stalenessDetector';
import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Mock dependencies
jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        }),
    },
}));

// Mock fs/promises for file operations
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue(new Error('Not found')),
    readdir: jest.fn().mockResolvedValue([]),
    rm: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
}));

// Mock ComponentManager and ComponentRegistryManager
jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockImplementation((_projectPath, componentDef) => {
            return Promise.resolve({
                success: true,
                component: {
                    id: componentDef.id,
                    name: componentDef.name,
                    type: componentDef.type,
                    status: 'installed',
                    path: `/tmp/test-project/components/${componentDef.id}`,
                    lastUpdated: new Date(),
                },
            });
        }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([{
            id: 'headless',
            name: 'CitiSignal Next.js',
            type: 'frontend',
            source: { type: 'git', url: 'https://github.com/test/headless' },
        }]),
        getDependencies: jest.fn().mockResolvedValue([{
            id: 'commerce-mesh',
            name: 'Commerce API Mesh',
            type: 'dependency',
            subType: 'mesh',
            source: { type: 'git', url: 'https://github.com/test/commerce-mesh' },
        }]),
        getAppBuilder: jest.fn().mockResolvedValue([]),
    })),
}));

// Mock envFileGenerator
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(3000),
        }),
    },
    window: {
        setStatusBarMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
}), { virtual: true });

const mockReadMeshEnvVarsFromFile = stalenessDetector.readMeshEnvVarsFromFile as jest.Mock;

describe('Executor - Mesh Endpoint Single Source of Truth', () => {
    let mockContext: Partial<HandlerContext>;
    let savedProject: any;

    const createMockContext = (): Partial<HandlerContext> => {
        savedProject = null;

        return {
            context: { extensionPath: '/test/extension' } as any,
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as any,
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockImplementation((project) => {
                    savedProject = project;
                    return Promise.resolve();
                }),
            } as any,
            sharedState: {},
            sendMessage: jest.fn(),
            panel: { visible: false, dispose: jest.fn() } as any,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();

        // Default mock implementations
        mockReadMeshEnvVarsFromFile.mockResolvedValue({
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
        });
    });

    describe('When mesh deployed via wizard step (meshStepEnabled=true)', () => {
        const meshEndpoint = 'https://edge-sandbox-graph.adobe.io/api/test-mesh/graphql';

        const configWithMeshStepEnabled = {
            projectName: 'test-project',
            meshStepEnabled: true,
            apiMesh: {
                endpoint: meshEndpoint,
                meshId: 'test-mesh-123',
                meshStatus: 'deployed',
            },
            components: {
                frontend: 'headless',
                dependencies: ['commerce-mesh'],
            },
            componentConfigs: {},
        };

        it('should store mesh endpoint in meshState.endpoint (single source of truth)', async () => {
            // Given: Project with mesh deployed via wizard step
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // When: Project creation completes
            await executeProjectCreation(
                mockContext as HandlerContext,
                configWithMeshStepEnabled
            );

            // Then: meshState.endpoint IS set correctly (single source of truth)
            expect(savedProject).not.toBeNull();
            expect(savedProject.meshState?.endpoint).toBe(meshEndpoint);
            // And: componentInstances should NOT have endpoint (deprecated)
            expect(savedProject.componentInstances?.['commerce-mesh']?.endpoint).toBeUndefined();
        });

        it('should set correct mesh status in componentInstances', async () => {
            // Given: Project with mesh deployed via wizard step
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // When: Project creation completes
            await executeProjectCreation(
                mockContext as HandlerContext,
                configWithMeshStepEnabled
            );

            // Then: componentInstances['commerce-mesh'] has correct status
            const meshInstance = savedProject.componentInstances?.['commerce-mesh'];
            expect(meshInstance?.status).toBe('deployed');
            expect(meshInstance?.metadata?.meshId).toBe('test-mesh-123');
            expect(meshInstance?.metadata?.meshStatus).toBe('deployed');
        });

        it('should NOT store MESH_ENDPOINT in componentConfigs[frontendId]', async () => {
            // Given: Project with mesh deployed via wizard step
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // When: Project creation completes
            await executeProjectCreation(
                mockContext as HandlerContext,
                configWithMeshStepEnabled
            );

            // Then: componentConfigs does NOT contain MESH_ENDPOINT for frontend
            const frontendId = configWithMeshStepEnabled.components.frontend;
            const frontendConfigs = savedProject.componentConfigs?.[frontendId] || {};

            // The redundant write should be removed - MESH_ENDPOINT should NOT be here
            expect(frontendConfigs['MESH_ENDPOINT']).toBeUndefined();
        });

        it('should NOT create componentConfigs[frontendId] just for MESH_ENDPOINT', async () => {
            // Given: Project with mesh and empty componentConfigs
            const configWithEmptyConfigs = {
                ...configWithMeshStepEnabled,
                componentConfigs: {}, // Start with empty configs
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // When: Project creation completes
            await executeProjectCreation(
                mockContext as HandlerContext,
                configWithEmptyConfigs
            );

            // Then: componentConfigs should NOT have frontend config with MESH_ENDPOINT
            const frontendId = configWithMeshStepEnabled.components.frontend;

            // Either frontendId key doesn't exist OR it doesn't have MESH_ENDPOINT
            if (savedProject.componentConfigs?.[frontendId]) {
                expect(savedProject.componentConfigs[frontendId]['MESH_ENDPOINT']).toBeUndefined();
            }
        });
    });

    describe('Endpoint storage location verification', () => {
        it('should only have one location for mesh endpoint (componentInstances)', async () => {
            // Given: Complete mesh deployment configuration
            const meshEndpoint = 'https://edge-sandbox-graph.adobe.io/api/unique-mesh/graphql';
            const config = {
                projectName: 'single-source-test',
                meshStepEnabled: true,
                apiMesh: {
                    endpoint: meshEndpoint,
                    meshId: 'unique-mesh-456',
                },
                components: {
                    frontend: 'headless',
                    dependencies: ['commerce-mesh'],
                },
                componentConfigs: {},
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // When: Project is created
            await executeProjectCreation(
                mockContext as HandlerContext,
                config
            );

            // Then: Endpoint exists ONLY in meshState (single source of truth)
            expect(savedProject.meshState?.endpoint).toBe(meshEndpoint);

            // Check deprecated location is NOT populated
            expect(savedProject.componentInstances?.['commerce-mesh']?.endpoint).toBeUndefined();

            // Check componentConfigs is NOT populated with this endpoint
            const allConfigs = savedProject.componentConfigs || {};
            const allMeshEndpoints: string[] = [];

            Object.keys(allConfigs).forEach(componentId => {
                const configs = allConfigs[componentId];
                if (configs && configs['MESH_ENDPOINT']) {
                    allMeshEndpoints.push(configs['MESH_ENDPOINT']);
                }
            });

            // No component configs should have MESH_ENDPOINT
            expect(allMeshEndpoints).not.toContain(meshEndpoint);
        });
    });
});

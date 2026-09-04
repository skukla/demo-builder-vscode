/**
 * Unit tests for meshSetupService
 *
 * Tests mesh deployment logic with ProjectSetupContext integration.
 * Focuses on context passing and .env generation.
 */

import {
    deployNewMesh,
    linkExistingMesh,
    shouldConfigureExistingMesh,
    type MeshSetupContext,
    type MeshApiConfig,
} from '@/features/project-creation/services/meshSetupService';
import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';

// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: jest.fn(),
}));

jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn(),
}));
const mockEnsureSubscribed = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/app-builder/services/ensureMeshApiSubscribed', () => ({
    ensureMeshApiSubscribed: (...args: unknown[]) => mockEnsureSubscribed(...args),
}));

// Import mocked functions
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { generateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('meshSetupService', () => {
    let mockSetupContext: ProjectSetupContext;
    let mockProject: Project;
    let mockMeshDefinition: TransformedComponentDefinition;
    let mockProgressTracker: jest.Mock;
    let mockCommandExecutor: any;
    let mockAuthManager: any;
    let mockHandlerContext: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock for deployMeshComponent (can be overridden in specific tests)
        (deployMeshComponent as jest.Mock).mockResolvedValue({
            success: true,
            data: {
                meshId: 'deployed-mesh-id',
                endpoint: 'https://deployed-mesh.adobe.io/graphql',
            },
        });

        mockProject = {
            name: 'test-project',
            path: '/test/project',
            status: 'ready',
            created: new Date(),
            lastModified: new Date(),
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    subType: 'mesh',
                    path: '/test/project/components/commerce-mesh',
                    version: '1.0.0',
                    status: 'ready',
                },
            },
        };

        mockMeshDefinition = {
            id: 'commerce-mesh',
            name: 'Adobe Commerce API Mesh',
            subType: 'mesh',
            configuration: {
                requiredEnvVars: ['ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
            },
        };

        // Create a real ProjectSetupContext with mock dependencies
        mockHandlerContext = {
            logger: createMockLogger(),
            debugLogger: createMockLogger(),
            context: {
                extensionPath: '/test/extension',
            },
        };

        const mockRegistry = {
            version: '1.0.0',
            envVars: {},
            components: {
                frontends: [],
                backends: [],
                dependencies: [],
                mesh: [],
                integrations: [],
            },
            services: {},
        };

        mockSetupContext = new ProjectSetupContext(mockHandlerContext, mockRegistry, mockProject, {
            projectName: 'test-project',
        });

        mockProgressTracker = jest.fn();

        mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

        // CONVERTED 2026-08-28 (ADR-015): both collaborators arrive on the
        // MeshSetupContext, so this suite mocks the service registry NOT AT ALL.
        mockAuthManager = {
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        };
        mockEnsureSubscribed.mockResolvedValue(undefined);
    });

    describe('shouldConfigureExistingMesh', () => {
        it('should return true when mesh exists and not yet configured', () => {
            const meshConfig: MeshApiConfig = {
                meshId: 'test-mesh-id',
                endpoint: 'https://mesh.adobe.io/graphql',
            };

            const result = shouldConfigureExistingMesh(meshConfig, undefined);
            expect(result).toBe(true);
        });

        it('should return false when mesh already configured', () => {
            const meshConfig: MeshApiConfig = {
                meshId: 'test-mesh-id',
                endpoint: 'https://mesh.adobe.io/graphql',
            };

            const result = shouldConfigureExistingMesh(
                meshConfig,
                'https://existing.adobe.io/graphql'
            );
            expect(result).toBe(false);
        });

        it('should return false when the workspace reports a mesh id but no endpoint', () => {
            // Both halves are required: an id alone does not describe a mesh the
            // project can be pointed at.
            expect(shouldConfigureExistingMesh({ meshId: 'test-mesh-id' }, undefined)).toBe(false);
        });

        it('should return false when no existing mesh', () => {
            const result = shouldConfigureExistingMesh(undefined, undefined);
            expect(result).toBe(false);
        });
    });

    describe('deployNewMesh', () => {
        it('should call generateComponentEnvFile with setupContext', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            // Mock successful deployment (default mock already set in beforeEach)

            await deployNewMesh(context, undefined);

            // Verify generateComponentEnvFile was called with setupContext
            expect(generateComponentEnvFile).toHaveBeenCalledWith(
                '/test/project/components/commerce-mesh',
                'commerce-mesh',
                mockMeshDefinition,
                mockSetupContext
            );
        });

        it('should call ensureMeshApiSubscribed BEFORE deployMeshComponent (create-time)', async () => {
            const order: string[] = [];
            mockEnsureSubscribed.mockImplementation(async () => {
                order.push('subscribe');
            });
            (deployMeshComponent as jest.Mock).mockImplementation(async () => {
                order.push('deploy');
                return { success: true, data: { meshId: 'm', endpoint: 'e' } };
            });

            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            await deployNewMesh(context, undefined);

            expect(mockEnsureSubscribed).toHaveBeenCalled();
            expect(deployMeshComponent).toHaveBeenCalled();
            expect(order).toEqual(['subscribe', 'deploy']);
        });

        it('should not generate env if mesh component path is missing', async () => {
            const projectWithoutMeshPath = {
                ...mockProject,
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        status: 'ready' as const,
                        version: '1.0.0',
                        // path is missing
                    },
                },
            };

            const mockSetupContextWithoutPath = new ProjectSetupContext(
                mockHandlerContext,
                mockSetupContext.registry,
                projectWithoutMeshPath,
                { projectName: 'test-project' }
            );

            const context: MeshSetupContext = {
                setupContext: mockSetupContextWithoutPath,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            await deployNewMesh(context, undefined);

            expect(generateComponentEnvFile).not.toHaveBeenCalled();
        });

        it('should not generate env if mesh definition is missing', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: undefined,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            await deployNewMesh(context, undefined);

            expect(generateComponentEnvFile).not.toHaveBeenCalled();
        });

        it('should call progressTracker during deployment', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            // Default mock already set in beforeEach

            await deployNewMesh(context, undefined);

            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Configuring API Mesh',
                70,
                'Generating mesh configuration...'
            );
            // The pre-deploy API subscribe must be communicated to the user.
            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Configuring API Mesh',
                72,
                'Enabling API access...'
            );
            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Deploying API Mesh',
                75,
                'Deploying mesh to Adobe I/O...'
            );
        });

        it('should log debug message after env generation', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            // Default mock already set in beforeEach

            await deployNewMesh(context, undefined);

            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Mesh .env generated'
            );
        });

        describe('self-detects existing mesh for update-vs-create', () => {
            const context = (): MeshSetupContext => ({
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            });

            const getExistingMeshIdArg = (): unknown => {
                const call = (deployMeshComponent as jest.Mock).mock.calls[0];
                return call[4];
            };

            it('should pass describe-derived mesh id when apiMeshConfig.meshId is undefined', async () => {
                mockCommandExecutor.execute.mockResolvedValue({
                    code: 0,
                    stdout: JSON.stringify({
                        meshId: 'described-mesh-id',
                        endpoint: 'https://described.adobe.io/graphql',
                    }),
                });

                await deployNewMesh(context(), undefined);

                expect(getExistingMeshIdArg()).toBe('described-mesh-id');
            });

            it('should pass undefined when neither apiMeshConfig nor describe report a mesh', async () => {
                mockCommandExecutor.execute.mockResolvedValue({
                    code: 0,
                    stdout: '{}',
                });

                await deployNewMesh(context(), undefined);

                expect(getExistingMeshIdArg()).toBeUndefined();
            });

            it('should prefer apiMeshConfig.meshId over describe-derived id when present', async () => {
                mockCommandExecutor.execute.mockResolvedValue({
                    code: 0,
                    stdout: JSON.stringify({ meshId: 'described-mesh-id' }),
                });

                await deployNewMesh(context(), { meshId: 'wizard-mesh-id' });

                expect(getExistingMeshIdArg()).toBe('wizard-mesh-id');
            });
        });
    });

    describe('linkExistingMesh', () => {
        it('should call generateComponentEnvFile with setupContext', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
                workspace: 'test-workspace',
            };

            await linkExistingMesh(context, meshConfig);

            // Verify generateComponentEnvFile was called with setupContext
            expect(generateComponentEnvFile).toHaveBeenCalledWith(
                '/test/project/components/commerce-mesh',
                'commerce-mesh',
                mockMeshDefinition,
                mockSetupContext
            );
        });

        it('should not generate env if mesh component path is missing', async () => {
            const projectWithoutMeshPath = {
                ...mockProject,
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        status: 'ready' as const,
                        version: '1.0.0',
                        // path is missing
                    },
                },
            };

            const mockSetupContextWithoutPath = new ProjectSetupContext(
                mockHandlerContext,
                mockSetupContext.registry,
                projectWithoutMeshPath,
                { projectName: 'test-project' }
            );

            const context: MeshSetupContext = {
                setupContext: mockSetupContextWithoutPath,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
            };

            await linkExistingMesh(context, meshConfig);

            expect(generateComponentEnvFile).not.toHaveBeenCalled();
        });

        it('should call progressTracker during linking', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
            };

            await linkExistingMesh(context, meshConfig);

            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Configuring API Mesh',
                75,
                'Updating existing mesh configuration...'
            );
        });

        it('should log info about linking existing mesh', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
                commandManager: mockCommandExecutor,
                authManager: mockAuthManager,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
                workspace: 'test-workspace',
            };

            await linkExistingMesh(context, meshConfig);

            expect(mockSetupContext.logger.info).toHaveBeenCalledWith(
                '[Project Creation] Phase 3: Configuring and deploying API Mesh...'
            );
        });
    });
});

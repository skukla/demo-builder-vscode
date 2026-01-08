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
import type { Project, TransformedComponentDefinition } from '@/types';

// Mock dependencies
jest.mock('@/core/di');
jest.mock('@/core/logging/debugLogger');
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/project-creation/helpers', () => ({
    generateComponentEnvFile: jest.fn(),
    deployMeshComponent: jest.fn(),
}));

// Import mocked functions
import * as helpers from '@/features/project-creation/helpers';
import { ServiceLocator } from '@/core/di';

describe('meshSetupService', () => {
    let mockSetupContext: ProjectSetupContext;
    let mockProject: Project;
    let mockMeshDefinition: TransformedComponentDefinition;
    let mockProgressTracker: jest.Mock;
    let mockCommandExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock for deployMeshComponent (can be overridden in specific tests)
        (helpers.deployMeshComponent as jest.Mock).mockResolvedValue({
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
            created: new Date().toISOString(),
            componentInstances: {
                'commerce-mesh': {
                    path: '/test/project/components/commerce-mesh',
                    version: '1.0.0',
                },
            },
        } as Project;

        mockMeshDefinition = {
            id: 'commerce-mesh',
            name: 'Adobe Commerce API Mesh',
            type: 'mesh',
            configuration: {
                requiredEnvVars: ['ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
            },
        } as TransformedComponentDefinition;

        // Create a real ProjectSetupContext with mock dependencies
        const mockHandlerContext = {
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            },
            debugLogger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            },
            context: {
                extensionPath: '/test/extension',
            },
        } as any;

        const mockRegistry = {
            envVars: {},
            components: { frontends: [], backends: [], dependencies: [], mesh: [], integrations: [], appBuilder: [] },
            services: {},
        };

        mockSetupContext = new ProjectSetupContext(
            mockHandlerContext,
            mockRegistry,
            mockProject,
            {},
        );

        mockProgressTracker = jest.fn();

        mockCommandExecutor = {
            execute: jest.fn(),
        };

        (ServiceLocator.getCommandExecutor as jest.Mock) = jest.fn().mockReturnValue(mockCommandExecutor);
    });

    describe('shouldConfigureExistingMesh', () => {
        it('should return true when mesh exists and not yet configured', () => {
            const meshConfig: MeshApiConfig = {
                meshId: 'test-mesh-id',
                endpoint: 'https://mesh.adobe.io/graphql',
            };

            const result = shouldConfigureExistingMesh(meshConfig, undefined, false);
            expect(result).toBe(true);
        });

        it('should return false when mesh already configured', () => {
            const meshConfig: MeshApiConfig = {
                meshId: 'test-mesh-id',
                endpoint: 'https://mesh.adobe.io/graphql',
            };

            const result = shouldConfigureExistingMesh(meshConfig, 'https://existing.adobe.io/graphql', false);
            expect(result).toBe(false);
        });

        it('should return false when mesh step is enabled', () => {
            const meshConfig: MeshApiConfig = {
                meshId: 'test-mesh-id',
                endpoint: 'https://mesh.adobe.io/graphql',
            };

            const result = shouldConfigureExistingMesh(meshConfig, undefined, true);
            expect(result).toBe(false);
        });

        it('should return false when no existing mesh', () => {
            const result = shouldConfigureExistingMesh(undefined, undefined, false);
            expect(result).toBe(false);
        });
    });

    describe('deployNewMesh', () => {
        it('should call generateComponentEnvFile with setupContext', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            // Mock successful deployment (default mock already set in beforeEach)

            await deployNewMesh(context, undefined);

            // Verify generateComponentEnvFile was called with setupContext
            expect(helpers.generateComponentEnvFile).toHaveBeenCalledWith(
                '/test/project/components/commerce-mesh',
                'commerce-mesh',
                mockMeshDefinition,
                mockSetupContext,
            );
        });

        it('should not generate env if mesh component path is missing', async () => {
            const projectWithoutMeshPath = {
                ...mockProject,
                componentInstances: {
                    'commerce-mesh': {
                        version: '1.0.0',
                        // path is missing
                    },
                },
            } as Project;

            const mockSetupContextWithoutPath = new ProjectSetupContext(
                mockSetupContext['handlerContext' as any],
                mockSetupContext.registry,
                projectWithoutMeshPath,
                {},
            );

            const context: MeshSetupContext = {
                setupContext: mockSetupContextWithoutPath,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            await deployNewMesh(context, undefined);

            expect(helpers.generateComponentEnvFile).not.toHaveBeenCalled();
        });

        it('should not generate env if mesh definition is missing', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: undefined,
                progressTracker: mockProgressTracker,
            };

            await deployNewMesh(context, undefined);

            expect(helpers.generateComponentEnvFile).not.toHaveBeenCalled();
        });

        it('should call progressTracker during deployment', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            // Default mock already set in beforeEach

            await deployNewMesh(context, undefined);

            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Configuring API Mesh',
                70,
                'Generating mesh configuration...',
            );
            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Deploying API Mesh',
                75,
                'Deploying mesh to Adobe I/O...',
            );
        });

        it('should log debug message after env generation', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            // Default mock already set in beforeEach

            await deployNewMesh(context, undefined);

            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Mesh .env generated',
            );
        });
    });

    describe('linkExistingMesh', () => {
        it('should call generateComponentEnvFile with setupContext', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
                workspace: 'test-workspace',
            };

            await linkExistingMesh(context, meshConfig);

            // Verify generateComponentEnvFile was called with setupContext
            expect(helpers.generateComponentEnvFile).toHaveBeenCalledWith(
                '/test/project/components/commerce-mesh',
                'commerce-mesh',
                mockMeshDefinition,
                mockSetupContext,
            );
        });

        it('should not generate env if mesh component path is missing', async () => {
            const projectWithoutMeshPath = {
                ...mockProject,
                componentInstances: {
                    'commerce-mesh': {
                        version: '1.0.0',
                    },
                },
            } as Project;

            const mockSetupContextWithoutPath = new ProjectSetupContext(
                mockSetupContext['handlerContext' as any],
                mockSetupContext.registry,
                projectWithoutMeshPath,
                {},
            );

            const context: MeshSetupContext = {
                setupContext: mockSetupContextWithoutPath,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
            };

            await linkExistingMesh(context, meshConfig);

            expect(helpers.generateComponentEnvFile).not.toHaveBeenCalled();
        });

        it('should call progressTracker during linking', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
            };

            await linkExistingMesh(context, meshConfig);

            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Configuring API Mesh',
                75,
                'Adding existing mesh to project...',
            );
        });

        it('should log info about linking existing mesh', async () => {
            const context: MeshSetupContext = {
                setupContext: mockSetupContext,
                meshDefinition: mockMeshDefinition,
                progressTracker: mockProgressTracker,
            };

            const meshConfig: MeshApiConfig = {
                meshId: 'existing-mesh-id',
                endpoint: 'https://existing-mesh.adobe.io/graphql',
                workspace: 'test-workspace',
            };

            await linkExistingMesh(context, meshConfig);

            expect(mockSetupContext.logger.info).toHaveBeenCalledWith(
                '[Project Creation] Phase 3: Linking existing API Mesh...',
            );
        });
    });
});

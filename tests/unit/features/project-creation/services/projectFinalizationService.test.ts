/**
 * Unit tests for projectFinalizationService
 *
 * Tests environment file generation and project finalization with ProjectSetupContext integration.
 */

import {
    generateEnvironmentFiles,
    finalizeProject,
    type FinalizationContext,
} from '@/features/project-creation/services/projectFinalizationService';
import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { Project } from '@/types';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';

// Mock dependencies
jest.mock('@/features/project-creation/helpers', () => ({
    generateComponentConfigFiles: jest.fn(),
}));

// Import mocked functions
import * as helpers from '@/features/project-creation/helpers';

describe('projectFinalizationService', () => {
    let mockSetupContext: ProjectSetupContext;
    let mockProject: Project;
    let mockComponentDefinitions: Map<string, ComponentDefinitionEntry>;
    let mockProgressTracker: jest.Mock;
    let mockSaveProject: jest.Mock;
    let mockSendMessage: jest.Mock;
    let mockHandlerContext: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockProject = {
            name: 'test-project',
            path: '/test/project',
            status: 'configuring',
            created: new Date(),
            lastModified: new Date(),
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    status: 'ready',
                    path: '/test/project/components/eds-storefront',
                    version: '1.0.0',
                },
                'eds-commerce-mesh': {
                    id: 'eds-commerce-mesh',
                    name: 'API Mesh',
                    status: 'ready',
                    path: '/test/project/components/eds-commerce-mesh',
                    version: '1.0.0-beta.2',
                },
            },
        };

        mockHandlerContext = {
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

        mockSetupContext = new ProjectSetupContext(
            mockHandlerContext,
            mockRegistry,
            mockProject,
            { projectName: 'test-project' }
        );

        mockComponentDefinitions = new Map<string, ComponentDefinitionEntry>();
        mockComponentDefinitions.set('eds-storefront', {
            definition: {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: [],
                },
            },
            type: 'frontend',
            installOptions: {},
        });
        mockComponentDefinitions.set('eds-commerce-mesh', {
            definition: {
                id: 'eds-commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh',
                configuration: {
                    requiredEnvVars: [],
                },
            },
            type: 'mesh',
            installOptions: {},
        });

        mockProgressTracker = jest.fn();
        mockSaveProject = jest.fn().mockResolvedValue(undefined);
        mockSendMessage = jest.fn().mockResolvedValue(undefined);
    });

    describe('generateEnvironmentFiles', () => {
        it('should call generateComponentConfigFiles with setupContext for each non-mesh component', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await generateEnvironmentFiles(context);

            // Should be called for eds-storefront but NOT for eds-commerce-mesh
            expect(helpers.generateComponentConfigFiles).toHaveBeenCalledTimes(1);
            expect(helpers.generateComponentConfigFiles).toHaveBeenCalledWith(
                '/test/project/components/eds-storefront',
                'eds-storefront',
                mockComponentDefinitions.get('eds-storefront')!.definition,
                mockSetupContext
            );
        });

        it('should skip mesh component', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await generateEnvironmentFiles(context);

            // Verify eds-commerce-mesh was NOT processed
            const calls = (helpers.generateComponentConfigFiles as jest.Mock).mock.calls;
            const meshCalls = calls.filter((call) => call[1] === 'eds-commerce-mesh');
            expect(meshCalls).toHaveLength(0);
        });

        it('should skip components without paths', async () => {
            const projectWithMissingPath = {
                ...mockProject,
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready' as const,
                        version: '1.0.0',
                        // path is missing
                    },
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        name: 'API Mesh',
                        status: 'ready' as const,
                        path: '/test/project/components/eds-commerce-mesh',
                        version: '1.0.0-beta.2',
                    },
                },
            };

            const setupContextWithMissingPath = new ProjectSetupContext(
                mockHandlerContext,
                mockSetupContext.registry,
                projectWithMissingPath,
                { projectName: 'test-project' }
            );

            const context: FinalizationContext = {
                setupContext: setupContextWithMissingPath,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await generateEnvironmentFiles(context);

            // Should not be called since eds-storefront has no path
            expect(helpers.generateComponentConfigFiles).not.toHaveBeenCalled();
        });

        it('should call progressTracker with correct message', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await generateEnvironmentFiles(context);

            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Configuring Environment',
                85,
                'Generating environment files...'
            );
        });

        it('should log debug messages', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await generateEnvironmentFiles(context);

            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Phase 4: Generating environment configuration...'
            );
            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Phase 4 complete: Environment configured'
            );
        });

        it('should handle multiple non-mesh components', async () => {
            const projectWithMultipleComponents = {
                ...mockProject,
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready' as const,
                        path: '/test/project/components/eds-storefront',
                        version: '1.0.0',
                    },
                    'nextjs-storefront': {
                        id: 'nextjs-storefront',
                        name: 'Next.js Storefront',
                        status: 'ready' as const,
                        path: '/test/project/components/nextjs-storefront',
                        version: '1.0.0',
                    },
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        name: 'API Mesh',
                        status: 'ready' as const,
                        path: '/test/project/components/eds-commerce-mesh',
                        version: '1.0.0-beta.2',
                    },
                },
            };

            const setupContextWithMultiple = new ProjectSetupContext(
                mockHandlerContext,
                mockSetupContext.registry,
                projectWithMultipleComponents,
                { projectName: 'test-project' }
            );

            const multipleComponentDefs = new Map<string, ComponentDefinitionEntry>(
                mockComponentDefinitions
            );
            multipleComponentDefs.set('nextjs-storefront', {
                definition: {
                    id: 'nextjs-storefront',
                    name: 'Next.js Storefront',
                    type: 'frontend',
                    configuration: {
                        requiredEnvVars: [],
                    },
                },
                type: 'frontend',
                installOptions: {},
            });

            const context: FinalizationContext = {
                setupContext: setupContextWithMultiple,
                projectPath: '/test/project',
                componentDefinitions: multipleComponentDefs,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await generateEnvironmentFiles(context);

            // Should be called for both eds-storefront and nextjs-storefront
            expect(helpers.generateComponentConfigFiles).toHaveBeenCalledTimes(2);
        });
    });

    describe('finalizeProject', () => {
        it('should call saveProject with setupContext.project', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await finalizeProject(context);

            expect(mockSaveProject).toHaveBeenCalled();
        });

        it('should set project status to ready', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await finalizeProject(context);

            expect(mockSetupContext.project.status).toBe('ready');
        });

        it('should initialize componentVersions from component instances', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await finalizeProject(context);

            expect(mockSetupContext.project.componentVersions).toBeDefined();
            expect(mockSetupContext.project.componentVersions?.['eds-storefront']).toEqual({
                version: '1.0.0',
                lastUpdated: expect.any(String),
            });
            expect(mockSetupContext.project.componentVersions?.['eds-commerce-mesh']).toEqual({
                version: '1.0.0-beta.2',
                lastUpdated: expect.any(String),
            });
        });

        it('should use "unknown" version when component version is missing', async () => {
            const projectWithoutVersion = {
                ...mockProject,
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready' as const,
                        path: '/test/project/components/eds-storefront',
                        // version is missing
                    },
                },
            };

            const setupContextWithoutVersion = new ProjectSetupContext(
                mockHandlerContext,
                mockSetupContext.registry,
                projectWithoutVersion,
                { projectName: 'test-project' }
            );

            const context: FinalizationContext = {
                setupContext: setupContextWithoutVersion,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await finalizeProject(context);

            expect(
                setupContextWithoutVersion.project.componentVersions?.['eds-storefront']
            ).toEqual({
                version: 'unknown',
                lastUpdated: expect.any(String),
            });
        });

        it('should call progressTracker with correct messages', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await finalizeProject(context);

            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Finalizing Project',
                95,
                'Saving project state...'
            );
            expect(mockProgressTracker).toHaveBeenCalledWith(
                'Project Created',
                100,
                'Project creation complete'
            );
        });

        it('should log debug messages', async () => {
            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await finalizeProject(context);

            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Saving project: test-project')
            );
            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Project state saved successfully'
            );
            expect(mockSetupContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Phase 5 complete: Project finalized'
            );
        });

        it('should throw error if saveProject fails', async () => {
            const saveError = new Error('Save failed');
            mockSaveProject.mockRejectedValue(saveError);

            const context: FinalizationContext = {
                setupContext: mockSetupContext,
                projectPath: '/test/project',
                componentDefinitions: mockComponentDefinitions,
                progressTracker: mockProgressTracker,
                saveProject: mockSaveProject,
                sendMessage: mockSendMessage,
            };

            await expect(finalizeProject(context)).rejects.toThrow('Save failed');
            expect(mockSetupContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Failed to save project',
                saveError
            );
        });
    });
});

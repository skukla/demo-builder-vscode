/**
 * Unit tests for ProjectSetupContext
 * 
 * Tests the composition of HandlerContext and delegation of properties,
 * as well as domain-specific accessor methods.
 */

import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { HandlerContext } from '@/types/handlers';
import type { ComponentRegistry } from '@/types/components';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

describe('ProjectSetupContext', () => {
    let mockHandlerContext: jest.Mocked<HandlerContext>;
    let mockLogger: Logger;
    let mockRegistry: ComponentRegistry;
    let mockProject: Project;
    let mockConfig: Record<string, unknown>;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        };

        mockHandlerContext = {
            logger: mockLogger as any,
            debugLogger: mockLogger as any,
            context: {
                extensionPath: '/test/extension/path',
                secrets: {} as any,
                globalState: {
                    get: jest.fn(),
                    update: jest.fn().mockResolvedValue(undefined),
                },
            } as any,
            panel: undefined,
            stateManager: {} as any,
            communicationManager: undefined,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sharedState: {
                isAuthenticating: false,
            },
            authManager: {} as any,
        } as jest.Mocked<HandlerContext>;

        mockRegistry = {
            envVars: {
                TEST_VAR: {
                    label: 'Test Var',
                    type: 'text',
                    description: 'Test variable',
                },
            },
            components: {
                frontends: [],
                backends: [],
                dependencies: [],
                mesh: [],
                integrations: [],
                appBuilder: [],
            },
            services: {},
        };

        mockProject = {
            name: 'test-project',
            path: '/test/path',
            status: 'ready',
            created: new Date().toISOString(),
            meshState: {
                endpoint: 'https://mesh.adobe.io/graphql',
                workspace: 'test-workspace',
            },
        } as Project;

        mockConfig = {
            components: {
                backend: 'adobe-commerce-paas',
            },
        };
    });

    describe('constructor', () => {
        it('should store HandlerContext reference', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            // Access logger to verify HandlerContext is being used
            expect(context.logger).toBe(mockLogger);
        });

        it('should store registry, project, and config', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            expect(context.registry).toBe(mockRegistry);
            expect(context.project).toBe(mockProject);
            expect(context.config).toBe(mockConfig);
        });
    });

    describe('HandlerContext delegation', () => {
        it('should delegate logger getter to HandlerContext', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            expect(context.logger).toBe(mockHandlerContext.logger);
            
            // Verify it's a getter, not a stored property
            context.logger.info('test');
            expect(mockLogger.info).toHaveBeenCalledWith('test');
        });

        it('should delegate extensionPath getter to HandlerContext', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            expect(context.extensionPath).toBe('/test/extension/path');
            expect(context.extensionPath).toBe(mockHandlerContext.context.extensionPath);
        });
    });

    describe('getEnvVarDefinitions()', () => {
        it('should return registry.envVars', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            const envVars = context.getEnvVarDefinitions();
            expect(envVars).toBe(mockRegistry.envVars);
            expect(envVars.TEST_VAR).toBeDefined();
        });

        it('should return empty object when registry.envVars is undefined', () => {
            const registryWithoutEnvVars = { ...mockRegistry, envVars: undefined } as any;
            const context = new ProjectSetupContext(
                mockHandlerContext,
                registryWithoutEnvVars,
                mockProject,
                mockConfig,
            );

            const envVars = context.getEnvVarDefinitions();
            expect(envVars).toEqual({});
        });
    });

    describe('getBackendId()', () => {
        it('should extract backend from config.components', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            const backendId = context.getBackendId();
            expect(backendId).toBe('adobe-commerce-paas');
        });

        it('should return undefined when config.components is missing', () => {
            const configWithoutComponents = {};
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                configWithoutComponents,
            );

            const backendId = context.getBackendId();
            expect(backendId).toBeUndefined();
        });

        it('should return undefined when backend is not specified', () => {
            const configWithoutBackend = { components: {} };
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                configWithoutBackend,
            );

            const backendId = context.getBackendId();
            expect(backendId).toBeUndefined();
        });
    });

    describe('getMeshEndpoint()', () => {
        it('should return meshState.endpoint when available', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            const endpoint = context.getMeshEndpoint();
            expect(endpoint).toBe('https://mesh.adobe.io/graphql');
        });

        it('should fall back to componentInstances mesh endpoint', () => {
            const projectWithInstance = {
                ...mockProject,
                meshState: undefined,
                componentInstances: {
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        name: 'EDS Commerce API Mesh',
                        subType: 'mesh',
                        endpoint: 'https://fallback-mesh.adobe.io/graphql',
                    },
                },
            } as Project;

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                projectWithInstance,
                mockConfig,
            );

            const endpoint = context.getMeshEndpoint();
            expect(endpoint).toBe('https://fallback-mesh.adobe.io/graphql');
        });

        it('should return undefined when no mesh endpoint exists', () => {
            const projectWithoutMesh = {
                ...mockProject,
                meshState: undefined,
                componentInstances: undefined,
            } as Project;

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                projectWithoutMesh,
                mockConfig,
            );

            const endpoint = context.getMeshEndpoint();
            expect(endpoint).toBeUndefined();
        });

        it('should prioritize meshState.endpoint over componentInstances', () => {
            const projectWithBoth = {
                ...mockProject,
                meshState: {
                    endpoint: 'https://priority-mesh.adobe.io/graphql',
                    workspace: 'test',
                },
                componentInstances: {
                    'eds-commerce-mesh': {
                        endpoint: 'https://fallback-mesh.adobe.io/graphql',
                    },
                },
            } as Project;

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                projectWithBoth,
                mockConfig,
            );

            const endpoint = context.getMeshEndpoint();
            expect(endpoint).toBe('https://priority-mesh.adobe.io/graphql');
        });
    });

    describe('withProject()', () => {
        it('should create new context with updated project', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            const newProject: Project = {
                ...mockProject,
                name: 'updated-project',
                meshState: {
                    endpoint: 'https://updated-mesh.adobe.io/graphql',
                    workspace: 'updated-workspace',
                },
            };

            const newContext = context.withProject(newProject);

            expect(newContext).not.toBe(context);
            expect(newContext.project).toBe(newProject);
            expect(newContext.project.name).toBe('updated-project');
            expect(newContext.getMeshEndpoint()).toBe('https://updated-mesh.adobe.io/graphql');
        });

        it('should preserve HandlerContext reference', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            const newProject: Project = {
                ...mockProject,
                name: 'updated-project',
            };

            const newContext = context.withProject(newProject);

            // Verify HandlerContext is preserved by checking logger delegation
            expect(newContext.logger).toBe(mockHandlerContext.logger);
            expect(newContext.extensionPath).toBe('/test/extension/path');
        });

        it('should preserve registry and config', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig,
            );

            const newProject: Project = {
                ...mockProject,
                name: 'updated-project',
            };

            const newContext = context.withProject(newProject);

            expect(newContext.registry).toBe(mockRegistry);
            expect(newContext.config).toBe(mockConfig);
            expect(newContext.getBackendId()).toBe('adobe-commerce-paas');
        });
    });

    describe('accessor error handling', () => {
        it('should handle null/undefined gracefully in getBackendId', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                { components: null } as any,
            );

            expect(() => context.getBackendId()).not.toThrow();
            expect(context.getBackendId()).toBeUndefined();
        });

        it('should handle null/undefined gracefully in getMeshEndpoint', () => {
            const projectWithNull = {
                ...mockProject,
                meshState: null,
                componentInstances: null,
            } as any;

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                projectWithNull,
                mockConfig,
            );

            expect(() => context.getMeshEndpoint()).not.toThrow();
            expect(context.getMeshEndpoint()).toBeUndefined();
        });
    });
});

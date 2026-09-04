/**
 * Unit tests for ProjectSetupContext
 *
 * Tests the composition of HandlerContext and delegation of properties,
 * as well as domain-specific accessor methods.
 */

import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import type { HandlerContext } from '@/types/handlers';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

describe('ProjectSetupContext', () => {
    let mockHandlerContext: jest.Mocked<HandlerContext>;
    let mockLogger: Logger;
    let mockRegistry: ComponentRegistry;
    let mockProject: Project;
    let mockConfig: ProjectCreationConfig;

    beforeEach(() => {
        mockLogger = createMockLogger();

        mockHandlerContext = createMockHandlerContext({
            logger: mockLogger,
            debugLogger: mockLogger,
            context: createMockExtensionContext({ extensionPath: '/test/extension/path' }),
            sendMessage: jest.fn().mockResolvedValue(undefined),
        });

        mockRegistry = {
            version: '1.0.0',
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
            },
            services: {},
        };

        mockProject = {
            name: 'test-project',
            path: '/test/path',
            status: 'ready',
            created: new Date(),
            lastModified: new Date(),
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                    endpoint: 'https://mesh.adobe.io/graphql',
                },
            },
        };

        mockConfig = {
            projectName: 'test-project',
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
                mockConfig
            );

            // Access logger to verify HandlerContext is being used
            expect(context.logger).toBe(mockLogger);
        });

        it('should store registry, project, and config', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig
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
                mockConfig
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
                mockConfig
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
                mockConfig
            );

            const envVars = context.getEnvVarDefinitions();
            expect(envVars).toBe(mockRegistry.envVars);
            expect(envVars.TEST_VAR).toBeDefined();
        });

        it('should return empty object when registry.envVars is undefined', () => {
            const registryWithoutEnvVars: ComponentRegistry = {
                ...mockRegistry,
                envVars: undefined,
            };
            const context = new ProjectSetupContext(
                mockHandlerContext,
                registryWithoutEnvVars,
                mockProject,
                mockConfig
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
                mockConfig
            );

            const backendId = context.getBackendId();
            expect(backendId).toBe('adobe-commerce-paas');
        });

        it('should return undefined when config.components is missing', () => {
            const configWithoutComponents: ProjectCreationConfig = { projectName: 'test-project' };
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                configWithoutComponents
            );

            const backendId = context.getBackendId();
            expect(backendId).toBeUndefined();
        });

        it('should return undefined when backend is not specified', () => {
            const configWithoutBackend = { projectName: 'test-project', components: {} };
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                configWithoutBackend
            );

            const backendId = context.getBackendId();
            expect(backendId).toBeUndefined();
        });
    });

    describe('getMeshEndpoint()', () => {
        it('should return the keyed mesh endpoint when available', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig
            );

            const endpoint = context.getMeshEndpoint();
            expect(endpoint).toBe('https://mesh.adobe.io/graphql');
        });

        it('should return undefined when no mesh endpoint exists', () => {
            const projectWithoutMesh = createMockProject({
                ...mockProject,
                componentInstances: undefined,
                appBuilderComponents: undefined,
            });

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                projectWithoutMesh,
                mockConfig
            );

            const endpoint = context.getMeshEndpoint();
            expect(endpoint).toBeUndefined();
        });

        // The keyed mesh entry is the only endpoint carrier (PL-1 phase 2
        // removed the legacy meshState from Project entirely).
        it('should return the endpoint from the keyed mesh entry (keyed-only)', () => {
            const keyedOnlyProject = createMockProject({
                ...mockProject,
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://keyed-mesh.adobe.io/graphql',
                    },
                },
            });

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                keyedOnlyProject,
                mockConfig
            );

            expect(context.getMeshEndpoint()).toBe('https://keyed-mesh.adobe.io/graphql');
        });
    });

    describe('getSelectedAddons()', () => {
        it('should return selectedAddons from config', () => {
            const configWithAddons = { ...mockConfig, selectedAddons: ['adobe-commerce-aco'] };
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                configWithAddons
            );

            expect(context.getSelectedAddons()).toEqual(['adobe-commerce-aco']);
        });

        it('should return undefined when selectedAddons is missing', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig
            );

            expect(context.getSelectedAddons()).toBeUndefined();
        });
    });

    describe('getSelectedPackage()', () => {
        it('should return selectedPackage from config', () => {
            const configWithPackage = { ...mockConfig, selectedPackage: 'custom' };
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                configWithPackage
            );

            expect(context.getSelectedPackage()).toBe('custom');
        });

        it('should return undefined when selectedPackage is missing', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig
            );

            expect(context.getSelectedPackage()).toBeUndefined();
        });
    });

    describe('withProject()', () => {
        it('should create new context with updated project', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig
            );

            const newProject: Project = {
                ...mockProject,
                name: 'updated-project',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: '2026-01-01T00:00:00.000Z',
                        endpoint: 'https://updated-mesh.adobe.io/graphql',
                    },
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
                mockConfig
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
                mockConfig
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

    describe('getComponentConfigs()', () => {
        it('should return componentConfigs from config', () => {
            const configs = { 'adobe-commerce': { ADOBE_COMMERCE_BASE_URL: 'https://x.test' } };
            const context = new ProjectSetupContext(mockHandlerContext, mockRegistry, mockProject, {
                ...mockConfig,
                componentConfigs: configs,
            });

            expect(context.getComponentConfigs()).toBe(configs);
        });

        it('should return undefined when componentConfigs is missing', () => {
            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                mockProject,
                mockConfig
            );

            expect(context.getComponentConfigs()).toBeUndefined();
        });
    });

    /**
     * getComponentDefinition searches FIVE registry categories at once. A category
     * dropped from that search reads as "no such component", and every caller
     * treats that as "nothing to install/configure" rather than as an error — so a
     * whole class of component would silently stop being set up. Each category is
     * asserted on its own; asserting one proves nothing about the other four.
     */
    describe('getComponentDefinition()', () => {
        const def = (id: string): TransformedComponentDefinition => ({
            id,
            name: `Component ${id}`,
        });

        /** A registry whose five searched categories each hold one component. */
        function populatedRegistry(): ComponentRegistry {
            return {
                ...mockRegistry,
                components: {
                    frontends: [def('eds-storefront')],
                    backends: [def('adobe-commerce-paas')],
                    dependencies: [def('eds-commerce-mesh')],
                    mesh: [def('mesh-only-entry')],
                    integrations: [def('adobe-commerce-aco')],
                },
            };
        }

        function contextWith(registry: ComponentRegistry): ProjectSetupContext {
            return new ProjectSetupContext(mockHandlerContext, registry, mockProject, mockConfig);
        }

        it.each([
            ['frontends', 'eds-storefront'],
            ['backends', 'adobe-commerce-paas'],
            ['dependencies', 'eds-commerce-mesh'],
            ['mesh', 'mesh-only-entry'],
            ['integrations', 'adobe-commerce-aco'],
        ])('should find a component registered under %s', (_category, id) => {
            expect(contextWith(populatedRegistry()).getComponentDefinition(id)).toEqual(def(id));
        });

        it('should return undefined for an id no category holds', () => {
            expect(
                contextWith(populatedRegistry()).getComponentDefinition('not-a-component')
            ).toBeUndefined();
        });

        it('should not throw when the optional categories are absent', () => {
            // mesh, integrations and appBuilder are optional on ComponentRegistry, and
            // a registry loaded from an older components.json omits them. Spreading an
            // absent category would throw before any lookup happened.
            const sparse: ComponentRegistry = {
                ...mockRegistry,
                components: {
                    frontends: undefined as unknown as TransformedComponentDefinition[],
                    backends: undefined as unknown as TransformedComponentDefinition[],
                    dependencies: undefined as unknown as TransformedComponentDefinition[],
                },
            };

            expect(contextWith(sparse).getComponentDefinition('eds-storefront')).toBeUndefined();
        });
    });

    describe('accessor error handling', () => {
        it('should handle null/undefined gracefully in getBackendId', () => {
            // Deliberately malformed: a null where the type says an object, to
            // prove the accessor does not throw on it.
            const context = new ProjectSetupContext(mockHandlerContext, mockRegistry, mockProject, {
                projectName: 'test-project',
                components: null as unknown as ProjectCreationConfig['components'],
            });

            expect(() => context.getBackendId()).not.toThrow();
            expect(context.getBackendId()).toBeUndefined();
        });

        it('should handle null/undefined gracefully in getMeshEndpoint', () => {
            // Deliberately malformed: nulls where the type says optional objects.
            const projectWithNull: Project = {
                ...mockProject,
                componentInstances: null as unknown as Project['componentInstances'],
                appBuilderComponents: null as unknown as Project['appBuilderComponents'],
            };

            const context = new ProjectSetupContext(
                mockHandlerContext,
                mockRegistry,
                projectWithNull,
                mockConfig
            );

            expect(() => context.getMeshEndpoint()).not.toThrow();
            expect(context.getMeshEndpoint()).toBeUndefined();
        });
    });
});

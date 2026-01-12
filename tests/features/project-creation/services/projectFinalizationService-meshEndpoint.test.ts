/**
 * Integration Tests: Mesh Endpoint Single Source of Truth
 *
 * Verifies that frontend component .env files receive MESH_ENDPOINT from
 * `componentInstances['commerce-mesh'].endpoint` (the single source of truth)
 * rather than from `componentConfigs`.
 *
 * This is the verification step for the mesh endpoint refactoring that
 * eliminates duplicate state storage.
 */

import { promises as fsPromises } from 'fs';
import { generateEnvironmentFiles, FinalizationContext } from '@/features/project-creation/services/projectFinalizationService';
import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import type { Project, EnvVarDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import type { HandlerContext } from '@/types/handlers';
import { TransformedComponentDefinition, ComponentRegistry } from '@/types/components';

// Mock fs promises
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockResolvedValue(''),
        mkdir: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock formatters
jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (group: string) => group.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' '),
}));

// Re-export ProjectSetupContext from the actual module (it's imported from services, not helpers)
// Let generateComponentConfigFiles run for real so it generates env files

describe('projectFinalizationService - Mesh Endpoint Single Source of Truth', () => {
    const createMockLogger = (): Logger => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    });

    const createSharedEnvVars = (): Record<string, Omit<EnvVarDefinition, 'key'>> => ({
        MESH_ENDPOINT: {
            label: 'Mesh Endpoint',
            type: 'url',
            description: 'API Mesh GraphQL endpoint URL',
            group: 'api-mesh',
        },
        COMMERCE_URL: {
            label: 'Commerce URL',
            type: 'url',
            description: 'Adobe Commerce instance URL',
            group: 'commerce',
        },
    });

    const createMockRegistry = (): ComponentRegistry => ({
        envVars: createSharedEnvVars(),
        components: {
            frontends: [],
            backends: [],
            dependencies: [],
            mesh: [],
            integrations: [],
            appBuilder: [],
        },
    });

    const createMockHandlerContext = (): Partial<HandlerContext> => ({
        context: { extensionPath: '/test/extension' } as any,
        logger: createMockLogger(),
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any,
        sharedState: {},
        sendMessage: jest.fn(),
        panel: { visible: false, dispose: jest.fn() } as any,
    });

    const createFrontendComponentDefinition = (): TransformedComponentDefinition => ({
        id: 'headless',
        name: 'Headless Frontend',
        type: 'frontend',
        configuration: {
            requiredEnvVars: ['MESH_ENDPOINT', 'COMMERCE_URL'],
            optionalEnvVars: [],
        },
    } as TransformedComponentDefinition);

    const createMinimalContext = (projectOverrides: Partial<Project> = {}): FinalizationContext => {
        const componentDefinitions = new Map<string, ComponentDefinitionEntry>();
        componentDefinitions.set('headless', {
            definition: createFrontendComponentDefinition(),
            selections: { frontend: 'headless' },
            skipClone: false,
            skipInstall: false,
        } as ComponentDefinitionEntry);

        const project: Project = {
            name: 'test-project',
            path: '/test/project',
            status: 'configuring',
            created: new Date(),
            lastModified: new Date(),
            componentInstances: {
                'headless': {
                    id: 'headless',
                    name: 'Headless Frontend',
                    status: 'ready',
                    path: '/test/project/headless',
                },
            },
            ...projectOverrides,
        };

        const setupContext = new ProjectSetupContext(
            createMockHandlerContext() as HandlerContext,
            createMockRegistry(),
            project,
            {},
        );

        return {
            setupContext,
            projectPath: '/test/project',
            componentDefinitions,
            progressTracker: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
            sendMessage: jest.fn().mockResolvedValue(undefined),
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('MESH_ENDPOINT comes from componentInstances (single source of truth)', () => {
        it('should pass mesh endpoint from componentInstances to envFileGenerator', async () => {
            // Given: Project with commerce-mesh endpoint in componentInstances
            const correctEndpoint = 'https://correct-endpoint.adobeioruntime.net/api/mesh/graphql';

            const context = createMinimalContext({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        subType: 'mesh',
                        status: 'deployed',
                        endpoint: correctEndpoint,
                    },
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                },
            });

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: The .env file should contain the endpoint from componentInstances
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(writeFileCalls.length).toBeGreaterThan(0);

            // Find the headless component .env write
            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );
            expect(headlessEnvCall).toBeDefined();

            const [, content] = headlessEnvCall;
            expect(content).toContain(`MESH_ENDPOINT=${correctEndpoint}`);
        });

        it('should use componentInstances endpoint even when componentConfigs has different value', async () => {
            // Given: componentInstances has correct endpoint, componentConfigs has stale endpoint
            const correctEndpoint = 'https://correct.adobeioruntime.net/api/mesh/graphql';
            const staleEndpoint = 'https://stale.adobeioruntime.net/api/mesh/graphql';

            const context = createMinimalContext({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        subType: 'mesh',
                        status: 'deployed',
                        endpoint: correctEndpoint,
                    },
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                },
                // componentConfigs has a stale/different endpoint
                componentConfigs: {
                    'commerce-mesh': {
                        MESH_ENDPOINT: staleEndpoint,
                    },
                },
            });

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: The .env should have the CORRECT endpoint from componentInstances, NOT the stale one
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;
            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );
            expect(headlessEnvCall).toBeDefined();

            const [, content] = headlessEnvCall;
            expect(content).toContain(`MESH_ENDPOINT=${correctEndpoint}`);
            expect(content).not.toContain(staleEndpoint);
        });
    });

    describe('edge cases for mesh endpoint', () => {
        it('should handle missing commerce-mesh component gracefully', async () => {
            // Given: Project without commerce-mesh in componentInstances
            const context = createMinimalContext({
                componentInstances: {
                    // No commerce-mesh component
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                },
            });

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: Should not throw and MESH_ENDPOINT should be empty
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;
            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );
            expect(headlessEnvCall).toBeDefined();

            const [, content] = headlessEnvCall;
            // MESH_ENDPOINT should be present but empty (no apiMesh.endpoint configured)
            expect(content).toContain('MESH_ENDPOINT=');
        });

        it('should handle commerce-mesh without endpoint property', async () => {
            // Given: commerce-mesh exists but has no endpoint
            const context = createMinimalContext({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        subType: 'mesh',
                        status: 'ready',
                        // No endpoint property - mesh not yet deployed
                    },
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                },
            });

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: Should not throw, MESH_ENDPOINT should be empty
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;
            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );
            expect(headlessEnvCall).toBeDefined();

            const [, content] = headlessEnvCall;
            expect(content).toContain('MESH_ENDPOINT=');
        });

        it('should handle empty endpoint string', async () => {
            // Given: commerce-mesh has empty endpoint string
            const context = createMinimalContext({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        subType: 'mesh',
                        status: 'ready',
                        endpoint: '', // Empty string
                    },
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                },
            });

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: Should not throw, MESH_ENDPOINT should be empty
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;
            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );
            expect(headlessEnvCall).toBeDefined();

            const [, content] = headlessEnvCall;
            expect(content).toContain('MESH_ENDPOINT=');
        });

        it('should handle undefined componentInstances gracefully', async () => {
            // Given: Project with undefined componentInstances
            const context = createMinimalContext({
                componentInstances: undefined,
            });

            // Adjust componentDefinitions so we don't try to generate for missing paths
            context.componentDefinitions.clear();

            // When: generateEnvironmentFiles is called
            // Then: Should not throw
            await expect(generateEnvironmentFiles(context)).resolves.not.toThrow();
        });
    });

    describe('mesh endpoint propagation to all frontend components', () => {
        it('should pass mesh endpoint to all components that need MESH_ENDPOINT', async () => {
            // Given: Project with multiple frontend components that need MESH_ENDPOINT
            const correctEndpoint = 'https://correct.adobeioruntime.net/api/mesh/graphql';

            const context = createMinimalContext({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        subType: 'mesh',
                        status: 'deployed',
                        endpoint: correctEndpoint,
                    },
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                    'nextjs-starter': {
                        id: 'nextjs-starter',
                        name: 'Next.js Starter',
                        status: 'ready',
                        path: '/test/project/nextjs-starter',
                    },
                },
            });

            // Add additional component definition
            context.componentDefinitions.set('nextjs-starter', {
                definition: {
                    id: 'nextjs-starter',
                    name: 'Next.js Starter',
                    type: 'frontend',
                    configuration: {
                        requiredEnvVars: ['MESH_ENDPOINT'],
                        optionalEnvVars: [],
                    },
                } as TransformedComponentDefinition,
                selections: { frontend: 'nextjs-starter' },
                skipClone: false,
                skipInstall: false,
            } as ComponentDefinitionEntry);

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: Both components should have the correct MESH_ENDPOINT
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;

            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );
            const nextjsEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('nextjs-starter')
            );

            expect(headlessEnvCall).toBeDefined();
            expect(nextjsEnvCall).toBeDefined();

            const [, headlessContent] = headlessEnvCall;
            const [, nextjsContent] = nextjsEnvCall;

            expect(headlessContent).toContain(`MESH_ENDPOINT=${correctEndpoint}`);
            expect(nextjsContent).toContain(`MESH_ENDPOINT=${correctEndpoint}`);
        });
    });

    describe('commerce-mesh component .env generation', () => {
        it('should generate minimal .env for commerce-mesh component (for mesh deployment)', async () => {
            // Given: Project with commerce-mesh component
            const context = createMinimalContext({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        subType: 'mesh',
                        status: 'deployed',
                        endpoint: 'https://endpoint.io/graphql',
                        path: '/test/project/commerce-mesh',
                    },
                    'headless': {
                        id: 'headless',
                        name: 'Headless Frontend',
                        status: 'ready',
                        path: '/test/project/headless',
                    },
                },
            });

            // Add commerce-mesh component definition
            context.componentDefinitions.set('commerce-mesh', {
                definition: {
                    id: 'commerce-mesh',
                    name: 'Commerce Mesh',
                    type: 'backend',
                    subType: 'mesh',
                    configuration: {
                        requiredEnvVars: [],
                        optionalEnvVars: [],
                    },
                } as TransformedComponentDefinition,
                selections: {},
                skipClone: false,
                skipInstall: false,
            } as ComponentDefinitionEntry);

            // When: generateEnvironmentFiles is called
            await generateEnvironmentFiles(context);

            // Then: both components should have .env generated
            const writeFileCalls = (fsPromises.writeFile as jest.Mock).mock.calls;

            const meshEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('commerce-mesh')
            );
            const headlessEnvCall = writeFileCalls.find(
                ([filePath]: [string]) => filePath.includes('headless')
            );

            // Mesh component gets minimal .env (for consistency), but env vars are managed by mesh deployment
            expect(meshEnvCall).toBeDefined();
            expect(headlessEnvCall).toBeDefined(); // headless .env generated
        });
    });
});

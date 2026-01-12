/**
 * Tests for mesh component loading in executor's loadComponentDefinitions
 *
 * Bug: Phase 3 (API Mesh Setup) is silently skipped because loadComponentDefinitions()
 * doesn't include mesh components from the registry's mesh section.
 *
 * Root Cause:
 * - commerce-mesh is stored in templates/components.json under "mesh" section
 * - loadComponentDefinitions() only loads: frontends, dependencies, appBuilder
 * - meshDefinition lookup returns undefined, causing Phase 3 to be skipped
 *
 * Expected Fix:
 * - Include mesh components in allComponents array in executor
 * - Add mesh type handling in the lookup logic
 */

import * as meshDeployment from '@/features/mesh/services/meshDeployment';
import * as stalenessDetector from '@/features/mesh/services/stalenessDetector';
import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Track getComponentById calls to verify fallback is being used
let getComponentByIdCalls: string[] = [];

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

// Mock ComponentManager
jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockResolvedValue({
            success: true,
            component: {
                id: 'headless',
                name: 'CitiSignal Next.js',
                type: 'frontend',
                status: 'installed',
                path: '/tmp/test-project/components/headless',
                lastUpdated: new Date(),
            },
        }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

// Mock ComponentRegistryManager with mesh in CORRECT location (mesh section, not dependencies)
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([{
            id: 'headless',
            name: 'CitiSignal Next.js',
            type: 'frontend',
            source: { type: 'git', url: 'https://github.com/test/headless' },
        }]),
        // IMPORTANT: commerce-mesh is NOT in dependencies (this is the bug scenario)
        getDependencies: jest.fn().mockResolvedValue([{
            id: 'demo-inspector',
            name: 'Demo Inspector',
            type: 'dependency',
            source: { type: 'git', url: 'https://github.com/test/demo-inspector' },
        }]),
        getAppBuilder: jest.fn().mockResolvedValue([]),
        // commerce-mesh IS in mesh section (correct location per components.json)
        getMesh: jest.fn().mockResolvedValue([{
            id: 'commerce-mesh',
            name: 'Adobe Commerce API Mesh',
            type: 'mesh',
            source: { type: 'git', url: 'https://github.com/skukla/headless-citisignal-mesh' },
            configuration: {
                nodeVersion: '20',
                requiresDeployment: true,
            },
        }]),
        // getComponentById searches ALL sections (frontends, backends, dependencies, mesh, etc.)
        // This is used as fallback when type-specific lookup doesn't find the component
        getComponentById: jest.fn().mockImplementation((id: string) => {
            getComponentByIdCalls.push(id);
            if (id === 'commerce-mesh') {
                return {
                    id: 'commerce-mesh',
                    name: 'Adobe Commerce API Mesh',
                    type: 'mesh',
                    source: { type: 'git', url: 'https://github.com/skukla/headless-citisignal-mesh' },
                };
            }
            return undefined;
        }),
    })),
}));

// Mock envFileGenerator
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
    generateComponentConfigFiles: jest.fn().mockResolvedValue(undefined),
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

// Cast mocked modules for type safety
const mockDeployMeshComponent = meshDeployment.deployMeshComponent as jest.Mock;
const mockUpdateMeshState = stalenessDetector.updateMeshState as jest.Mock;
const mockFetchDeployedMeshConfig = stalenessDetector.fetchDeployedMeshConfig as jest.Mock;
const mockReadMeshEnvVarsFromFile = stalenessDetector.readMeshEnvVarsFromFile as jest.Mock;

// Import executor AFTER mocks are set up (top-level import gets mocked modules)
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';

describe('Executor - Mesh Component Loading', () => {
    let mockContext: Partial<HandlerContext>;

    const createMockContext = (): Partial<HandlerContext> => {
        return {
            context: { extensionPath: '/test/extension' } as any,
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                trace: jest.fn(),
            } as any,
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockResolvedValue(undefined),
                addRecentProject: jest.fn().mockResolvedValue(undefined),
            } as any,
            sharedState: {},
            sendMessage: jest.fn(),
            panel: { visible: false, dispose: jest.fn() } as any,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getComponentByIdCalls = [];
        mockContext = createMockContext();

        // Default mock implementations for mesh services
        mockDeployMeshComponent.mockResolvedValue({ success: true });
        mockUpdateMeshState.mockResolvedValue(undefined);
        mockFetchDeployedMeshConfig.mockResolvedValue({
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
        });
        mockReadMeshEnvVarsFromFile.mockResolvedValue({
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
        });
    });

    describe('loadComponentDefinitions mesh handling', () => {
        it('should find mesh components via getComponentById fallback', async () => {
            const config = {
                projectName: 'test-project',
                projectPath: '/tmp/test-project',
                components: {
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh', 'demo-inspector'],
                },
                adobeConfig: {
                    organization: { id: 'org-123', name: 'Test Org' },
                    project: { id: 'proj-123', name: 'Test Project' },
                    workspace: { id: 'ws-123', name: 'Stage' },
                },
            };

            await executeProjectCreation(mockContext as HandlerContext, config);

            // FIX: commerce-mesh is not in dependencies section, so type-specific lookup fails.
            // The fallback to getComponentById() should find it in the mesh section.
            expect(getComponentByIdCalls).toContain('commerce-mesh');
        });

        it('should NOT log warning for commerce-mesh when mesh section is properly loaded', async () => {
            const config = {
                projectName: 'test-project',
                projectPath: '/tmp/test-project',
                components: {
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                },
                adobeConfig: {
                    organization: { id: 'org-123', name: 'Test Org' },
                    project: { id: 'proj-123', name: 'Test Project' },
                    workspace: { id: 'ws-123', name: 'Stage' },
                },
            };

            await executeProjectCreation(mockContext as HandlerContext, config);

            // BUG: This currently logs warning because commerce-mesh not found in registry
            // When mesh section is properly loaded, this warning should NOT appear
            expect(mockContext.logger?.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('commerce-mesh not found in registry')
            );
        });

        it('should include mesh definition in componentDefinitions map', async () => {
            // This test validates that Phase 3 can access meshDefinition
            // The bug is that meshDefinition is undefined, causing Phase 3 to skip

            const config = {
                projectName: 'test-project',
                projectPath: '/tmp/test-project',
                components: {
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                },
                adobeConfig: {
                    organization: { id: 'org-123', name: 'Test Org' },
                    project: { id: 'proj-123', name: 'Test Project' },
                    workspace: { id: 'ws-123', name: 'Stage' },
                },
            };

            await executeProjectCreation(mockContext as HandlerContext, config);

            // When mesh is properly loaded, Phase 3 should execute
            // This means meshSetupService should be called
            // For now, we verify no "not found" warning
            expect(mockContext.logger?.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('Component commerce-mesh not found')
            );
        });
    });
});

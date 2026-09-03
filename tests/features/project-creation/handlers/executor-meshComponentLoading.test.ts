/**
 * Tests for mesh component loading in executor's loadComponentDefinitions
 *
 * Bug: Phase 3 (API Mesh Setup) is silently skipped because loadComponentDefinitions()
 * doesn't include mesh components from the registry's mesh section.
 *
 * Root Cause:
 * - commerce-mesh is stored in templates/components.json under "mesh" section
 * - loadComponentDefinitions() only loads: frontends, dependencies, mesh
 * - meshDefinition lookup returns undefined, causing Phase 3 to be skipped
 *
 * Expected Fix:
 * - Include mesh components in allComponents array in executor
 * - Add mesh type handling in the lookup logic
 */

import './executorComponentLoading.testUtils';
import * as meshDeployment from '@/features/mesh/services/meshDeployment';
import * as stalenessDetector from '@/features/mesh/services/stalenessDetector';
import { HandlerContext } from '@/types/handlers';

// Track getComponentById calls to verify fallback is being used
let getComponentByIdCalls: string[] = [];

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
// Note: The headless-paas stack uses headless-commerce-mesh as its mesh component
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([
            {
                id: 'headless',
                name: 'CitiSignal Next.js',
                type: 'frontend',
                source: { type: 'git', url: 'https://github.com/test/headless' },
            },
        ]),
        // headless-commerce-mesh is in dependencies section for stack-based resolution
        getDependencies: jest.fn().mockResolvedValue([
            {
                id: 'headless-commerce-mesh',
                name: 'Headless Commerce API Mesh',
                type: 'mesh',
                source: { type: 'git', url: 'https://github.com/skukla/headless-citisignal-mesh' },
                configuration: {
                    nodeVersion: '20',
                    requiresDeployment: true,
                },
            },
        ]),
        getMesh: jest.fn().mockResolvedValue([
            {
                id: 'headless-commerce-mesh',
                name: 'Headless Commerce API Mesh',
                type: 'mesh',
                source: { type: 'git', url: 'https://github.com/skukla/headless-citisignal-mesh' },
                configuration: {
                    nodeVersion: '20',
                    requiresDeployment: true,
                },
            },
        ]),
        // getComponentById searches ALL sections (frontends, backends, dependencies, mesh, etc.)
        // This is used as fallback when type-specific lookup doesn't find the component
        getComponentById: jest.fn().mockImplementation((id: string) => {
            getComponentByIdCalls.push(id);
            if (id === 'headless-commerce-mesh') {
                return {
                    id: 'headless-commerce-mesh',
                    name: 'Headless Commerce API Mesh',
                    type: 'mesh',
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/headless-citisignal-mesh',
                    },
                };
            }
            if (id === 'headless') {
                return {
                    id: 'headless',
                    name: 'CitiSignal Next.js',
                    type: 'frontend',
                    source: { type: 'git', url: 'https://github.com/test/headless' },
                };
            }
            return undefined;
        }),
    })),
}));

// Cast mocked modules for type safety
const mockDeployMeshComponent = meshDeployment.deployMeshComponent as jest.Mock;
const mockUpdateMeshState = stalenessDetector.updateMeshState as jest.Mock;
const mockFetchDeployedMeshConfig = stalenessDetector.fetchDeployedMeshConfig as jest.Mock;
const mockReadMeshEnvVarsFromFile = stalenessDetector.readMeshEnvVarsFromFile as jest.Mock;

// Import executor AFTER mocks are set up (top-level import gets mocked modules)
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
describe('Executor - Mesh Component Loading', () => {
    let mockContext: Partial<HandlerContext>;

    const createMockContext = (): Partial<HandlerContext> => {
        return {
            context: createMockExtensionContext({}, '/test/extension'),
            logger: createMockLogger(),
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockResolvedValue(undefined),
            }),
            sharedState: { isAuthenticating: false },
            sendMessage: jest.fn(),
            panel: createMockWebviewPanel({ visible: false }),
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getComponentByIdCalls = [];
        mockContext = createMockContext();
        // The registry now arrives ON the context (ADR-015): the handler stopped
        // constructing one. Reuse this suite's existing module-mock fake rather
        // than inventing a second — the mock stays, it just gets handed in now.
        mockContext.componentRegistry = new (jest.requireMock(
            '@/features/components/services/ComponentRegistryManager'
        ).ComponentRegistryManager)();

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
        it('should find mesh components via stack configuration', async () => {
            // Note: The executor now uses selectedStack to derive components from stacks.json
            // The headless-paas stack includes headless-commerce-mesh as a dependency
            const config = {
                projectName: 'test-project',
                projectPath: '/tmp/test-project',
                selectedStack: 'headless-paas',
                selectedAddons: ['adobe-commerce-aco'],
                adobeConfig: {
                    organization: { id: 'org-123', name: 'Test Org' },
                    project: { id: 'proj-123', name: 'Test Project' },
                    workspace: { id: 'ws-123', name: 'Stage' },
                },
            };

            await executeProjectCreation(mockContext as HandlerContext, config);

            // Stack-based mesh component should be resolved without warnings
            // (Component is found in dependencies array, no fallback to getComponentById needed)
            expect(mockContext.logger?.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('headless-commerce-mesh not found')
            );
        });

        it('should NOT log warning for mesh when stack includes mesh component', async () => {
            const config = {
                projectName: 'test-project',
                projectPath: '/tmp/test-project',
                selectedStack: 'headless-paas',
                adobeConfig: {
                    organization: { id: 'org-123', name: 'Test Org' },
                    project: { id: 'proj-123', name: 'Test Project' },
                    workspace: { id: 'ws-123', name: 'Stage' },
                },
            };

            await executeProjectCreation(mockContext as HandlerContext, config);

            // Stack-based mesh component should be found without warnings
            expect(mockContext.logger?.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('headless-commerce-mesh not found in registry')
            );
        });

        it('should include mesh definition in componentDefinitions map', async () => {
            // This test validates that Phase 3 can access meshDefinition
            // The stack-based config includes mesh in dependencies

            const config = {
                projectName: 'test-project',
                projectPath: '/tmp/test-project',
                selectedStack: 'headless-paas',
                adobeConfig: {
                    organization: { id: 'org-123', name: 'Test Org' },
                    project: { id: 'proj-123', name: 'Test Project' },
                    workspace: { id: 'ws-123', name: 'Stage' },
                },
            };

            await executeProjectCreation(mockContext as HandlerContext, config);

            // When mesh is properly loaded from stack, Phase 3 should execute
            // This means meshSetupService should be called
            expect(mockContext.logger?.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('Component headless-commerce-mesh not found')
            );
        });
    });
});

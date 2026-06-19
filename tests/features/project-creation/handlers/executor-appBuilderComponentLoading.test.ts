/**
 * Tests for App Builder component loading in executor's loadComponentDefinitions.
 *
 * Step 4 (Batch 3): the install pipeline must read the REAL
 * `componentSelections.appBuilder` selection (an array of component ids) rather
 * than deriving app-builder components from `selectedAddons`.
 *
 * Behavior under test (observable via ComponentManager.installComponent, which
 * receives each resolved component definition produced by loadComponentDefinitions):
 *  - components.appBuilder = ['my-app'] -> an app-builder-typed definition is loaded
 *    and resolved from the appBuilder registry section with subType: 'app'.
 *  - selectedAddons populated but components.appBuilder empty -> NO app-builder
 *    component is produced from the addons (the regression being removed).
 */

import * as meshDeployment from '@/features/mesh/services/meshDeployment';
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
        getAuthenticationService: jest.fn().mockReturnValue({
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        }),
    },
}));

// Stub the App Builder permission gate so the mesh phase is a no-op.
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
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

// Capture every definition passed to installComponent so we can assert on the
// component list produced by loadComponentDefinitions.
const installedDefinitions: Array<{ id: string; type?: string; subType?: string }> = [];

jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockImplementation((_project: unknown, definition: { id: string; type?: string; subType?: string; name?: string }) => {
            installedDefinitions.push({ id: definition.id, type: definition.type, subType: definition.subType });
            return Promise.resolve({
                success: true,
                component: {
                    id: definition.id,
                    name: definition.name || definition.id,
                    type: definition.type || 'unknown',
                    status: 'installed',
                    path: `/tmp/test-project/components/${definition.id}`,
                    lastUpdated: new Date(),
                },
            });
        }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

// Track which registry getters resolved the app component.
let getAppBuilderCalled = false;

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([{
            id: 'headless',
            name: 'CitiSignal Next.js',
            type: 'frontend',
            source: { type: 'git', url: 'https://github.com/test/headless' },
        }]),
        getDependencies: jest.fn().mockResolvedValue([]),
        getMesh: jest.fn().mockResolvedValue([]),
        getAppBuilder: jest.fn().mockImplementation(() => {
            getAppBuilderCalled = true;
            return Promise.resolve([{
                id: 'my-app',
                name: 'My App Builder App',
                type: 'app-builder',
                source: { type: 'git', url: 'https://github.com/test/my-app' },
            }]);
        }),
        getComponentById: jest.fn().mockImplementation((id: string) => {
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

const mockDeployMeshComponent = meshDeployment.deployMeshComponent as jest.Mock;
const mockUpdateMeshState = stalenessDetector.updateMeshState as jest.Mock;
const mockFetchDeployedMeshConfig = stalenessDetector.fetchDeployedMeshConfig as jest.Mock;
const mockReadMeshEnvVarsFromFile = stalenessDetector.readMeshEnvVarsFromFile as jest.Mock;

// Import executor AFTER mocks are set up
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';

describe('Executor - App Builder Component Loading', () => {
    let mockContext: Partial<HandlerContext>;

    const createMockContext = (): Partial<HandlerContext> => ({
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
    });

    beforeEach(() => {
        jest.clearAllMocks();
        installedDefinitions.length = 0;
        getAppBuilderCalled = false;
        mockContext = createMockContext();

        mockDeployMeshComponent.mockResolvedValue({ success: true });
        mockUpdateMeshState.mockResolvedValue(undefined);
        mockFetchDeployedMeshConfig.mockResolvedValue({});
        mockReadMeshEnvVarsFromFile.mockResolvedValue({});
    });

    it('should load an app-builder component from components.appBuilder selection', async () => {
        const config = {
            projectName: 'test-project',
            projectPath: '/tmp/test-project',
            selectedStack: 'headless-paas',
            components: { appBuilder: ['my-app'] },
            selectedAddons: [],
            adobeConfig: {
                organization: { id: 'org-123', name: 'Test Org' },
                project: { id: 'proj-123', name: 'Test Project' },
                workspace: { id: 'ws-123', name: 'Stage' },
            },
        };

        await executeProjectCreation(mockContext as HandlerContext, config);

        const appDef = installedDefinitions.find(d => d.id === 'my-app');
        expect(appDef).toBeDefined();
        expect(appDef?.type).toBe('app-builder');
    });

    it('should resolve the app-builder component from the appBuilder registry section with subType "app"', async () => {
        const config = {
            projectName: 'test-project',
            projectPath: '/tmp/test-project',
            selectedStack: 'headless-paas',
            components: { appBuilder: ['my-app'] },
            selectedAddons: [],
            adobeConfig: {
                organization: { id: 'org-123', name: 'Test Org' },
                project: { id: 'proj-123', name: 'Test Project' },
                workspace: { id: 'ws-123', name: 'Stage' },
            },
        };

        await executeProjectCreation(mockContext as HandlerContext, config);

        expect(getAppBuilderCalled).toBe(true);
        const appDef = installedDefinitions.find(d => d.id === 'my-app');
        expect(appDef?.subType).toBe('app');
    });

    it('should NOT produce an app-builder component from selectedAddons when components.appBuilder is empty', async () => {
        const config = {
            projectName: 'test-project',
            projectPath: '/tmp/test-project',
            // headless-paas has NO optionalAddons, so the old derivation would have
            // turned this addon into an app-builder component. It must not anymore.
            selectedStack: 'headless-paas',
            components: { appBuilder: [] },
            selectedAddons: ['adobe-commerce-aco'],
            adobeConfig: {
                organization: { id: 'org-123', name: 'Test Org' },
                project: { id: 'proj-123', name: 'Test Project' },
                workspace: { id: 'ws-123', name: 'Stage' },
            },
        };

        await executeProjectCreation(mockContext as HandlerContext, config);

        const appBuilderDefs = installedDefinitions.filter(d => d.type === 'app-builder');
        expect(appBuilderDefs).toHaveLength(0);
        const addonDef = installedDefinitions.find(d => d.id === 'adobe-commerce-aco');
        expect(addonDef).toBeUndefined();
        // The old derivation would have produced an app-builder component for the
        // addon id and tried to resolve it (warning when unresolved). The addon id
        // must never enter the app-builder resolution path now.
        expect(mockContext.logger?.warn).not.toHaveBeenCalledWith(
            expect.stringContaining('adobe-commerce-aco'),
        );
    });
});

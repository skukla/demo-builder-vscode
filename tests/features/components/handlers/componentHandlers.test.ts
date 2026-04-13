/**
 * Tests for component handlers (Pattern B - request-response)
 *
 * Tests verify that handlers return data directly instead of using sendMessage,
 * establishing the request-response pattern for component operations.
 */

import {
    handleGetComponentsData,
    handleLoadDependencies,
    handleValidateSelection,
    handleUpdateComponentSelection,
    handleUpdateComponentsData,
    handleSyncComponentConfigs,
    handleLoadComponents,
    handleCheckCompatibility,
    handleLoadPreset,
} from '@/features/components/handlers/componentHandlers';
import { HandlerContext } from '@/types/handlers';
import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';

// Mock ComponentRegistryManager (DependencyResolver is re-exported from the same module)
jest.mock('@/features/components/services/ComponentRegistryManager');

describe('componentHandlers - Pattern B (request-response)', () => {
    let mockContext: HandlerContext;
    let mockRegistryManager: jest.Mocked<ComponentRegistryManager>;
    let mockDependencyResolver: jest.Mocked<DependencyResolver>;

    beforeEach(() => {
        // Create minimal mock context (use 'as any' to avoid over-mocking)
        mockContext = {
            context: {
                extensionPath: '/mock/extension/path',
            } as any,
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
            } as any,
            sharedState: {
                isAuthenticating: false,
            } as any,
            sendMessage: jest.fn(),
        } as any;

        // Create mock registry manager
        mockRegistryManager = {
            getFrontends: jest.fn(),
            getBackends: jest.fn(),
            getIntegrations: jest.fn(),
            getAppBuilder: jest.fn(),
            getDependencies: jest.fn(),
            getMesh: jest.fn(),
            loadRegistry: jest.fn(),
            getPresets: jest.fn(),
            checkCompatibility: jest.fn(),
        } as any;

        // Create mock dependency resolver
        mockDependencyResolver = {
            resolveDependencies: jest.fn(),
            validateDependencyChain: jest.fn(),
        } as any;

        // Mock the ComponentRegistryManager constructor
        (ComponentRegistryManager as jest.MockedClass<typeof ComponentRegistryManager>).mockImplementation(
            () => mockRegistryManager
        );

        // Mock the DependencyResolver constructor
        (DependencyResolver as jest.MockedClass<typeof DependencyResolver>).mockImplementation(
            () => mockDependencyResolver
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('handleGetComponentsData', () => {
        it('should return component data with success=true (Pattern B)', async () => {
            // Arrange: Mock registry data
            const mockFrontends = [
                {
                    id: 'headless',
                    name: 'CitiSignal Next.js',
                    description: 'Next.js storefront',
                    dependencies: { required: ['commerce-mesh'], optional: [] },
                    configuration: { port: 3000 },
                },
            ];
            const mockBackends = [
                {
                    id: 'adobe-commerce-paas',
                    name: 'Adobe Commerce PaaS',
                    description: 'Commerce cloud',
                    dependencies: { required: ['catalog-service'], optional: [] },
                    configuration: {},
                },
            ];
            const mockIntegrations = [
                {
                    id: 'target',
                    name: 'Adobe Target',
                    description: 'Personalization',
                    dependencies: { required: [], optional: [] },
                    configuration: {},
                },
            ];
            const mockAppBuilder = [
                {
                    id: 'integration-service',
                    name: 'Integration Service',
                    description: 'Custom integration',
                    dependencies: { required: [], optional: [] },
                    configuration: {},
                },
            ];
            const mockDependencies = [
                {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    description: 'GraphQL mesh',
                    dependencies: { required: [], optional: [] },
                    configuration: {},
                },
            ];
            const mockMesh = [
                {
                    id: 'eds-accs-mesh',
                    name: 'EDS ACCS API Mesh',
                    description: 'GraphQL mesh for ACCS',
                    dependencies: { required: [], optional: [] },
                    configuration: { nodeVersion: '20' },
                },
            ];
            const mockRegistry = {
                version: '1.0.0',
                components: {
                    frontends: [],
                    backends: [],
                    dependencies: [],
                },
                envVars: {
                    NEXT_PUBLIC_API_URL: {
                        label: 'API URL',
                        type: 'url' as const,
                        default: 'http://localhost:3000',
                    },
                },
            };

            mockRegistryManager.getFrontends.mockResolvedValue(mockFrontends);
            mockRegistryManager.getBackends.mockResolvedValue(mockBackends);
            mockRegistryManager.getIntegrations.mockResolvedValue(mockIntegrations);
            mockRegistryManager.getAppBuilder.mockResolvedValue(mockAppBuilder);
            mockRegistryManager.getDependencies.mockResolvedValue(mockDependencies);
            mockRegistryManager.getMesh.mockResolvedValue(mockMesh);
            mockRegistryManager.loadRegistry.mockResolvedValue(mockRegistry);

            // Act: Call handler
            const result = await handleGetComponentsData(mockContext);

            // Assert: Verify Pattern B response structure
            expect(result).toEqual({
                success: true,
                type: 'components-data',
                data: {
                    frontends: [
                        {
                            id: 'headless',
                            name: 'CitiSignal Next.js',
                            description: 'Next.js storefront',
                            dependencies: { required: ['commerce-mesh'], optional: [] },
                            configuration: { port: 3000 },
                        },
                    ],
                    backends: [
                        {
                            id: 'adobe-commerce-paas',
                            name: 'Adobe Commerce PaaS',
                            description: 'Commerce cloud',
                            dependencies: { required: ['catalog-service'], optional: [] },
                            configuration: {},
                        },
                    ],
                    integrations: [
                        {
                            id: 'target',
                            name: 'Adobe Target',
                            description: 'Personalization',
                            dependencies: { required: [], optional: [] },
                            configuration: {},
                        },
                    ],
                    appBuilder: [
                        {
                            id: 'integration-service',
                            name: 'Integration Service',
                            description: 'Custom integration',
                            dependencies: { required: [], optional: [] },
                            configuration: {},
                        },
                    ],
                    dependencies: [
                        {
                            id: 'commerce-mesh',
                            name: 'API Mesh',
                            description: 'GraphQL mesh',
                            dependencies: { required: [], optional: [] },
                            configuration: {},
                        },
                    ],
                    mesh: [
                        {
                            id: 'eds-accs-mesh',
                            name: 'EDS ACCS API Mesh',
                            description: 'GraphQL mesh for ACCS',
                            dependencies: { required: [], optional: [] },
                            configuration: { nodeVersion: '20' },
                        },
                    ],
                    envVars: {
                        NEXT_PUBLIC_API_URL: {
                            label: 'API URL',
                            type: 'url',
                            default: 'http://localhost:3000',
                        },
                    },
                    services: {},
                },
            });

            // Verify sendMessage was NOT called (anti-pattern)
            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should return error with success=false on registry failure', async () => {
            // Arrange: Mock registry failure
            const error = new Error('Failed to load registry');
            mockRegistryManager.getFrontends.mockRejectedValue(error);

            // Act: Call handler
            const result = await handleGetComponentsData(mockContext);

            // Assert: Verify error response (typed errors include code field)
            expect(result).toEqual({
                success: false,
                error: 'Failed to load registry',
                code: 'UNKNOWN', // Typed error includes error code
                message: 'Failed to load component configurations',
            });

            // Verify error was logged (handler wraps via toAppError, match by message)
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to load component configurations:',
                expect.objectContaining({ message: error.message })
            );

            // Verify sendMessage was NOT called
            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should return empty arrays when no components configured', async () => {
            // Arrange: Mock empty registry
            mockRegistryManager.getFrontends.mockResolvedValue([]);
            mockRegistryManager.getBackends.mockResolvedValue([]);
            mockRegistryManager.getIntegrations.mockResolvedValue([]);
            mockRegistryManager.getAppBuilder.mockResolvedValue([]);
            mockRegistryManager.getDependencies.mockResolvedValue([]);
            mockRegistryManager.getMesh.mockResolvedValue([]);
            mockRegistryManager.loadRegistry.mockResolvedValue({
                version: '1.0.0',
                components: {
                    frontends: [],
                    backends: [],
                    dependencies: [],
                },
                envVars: {},
            });

            // Act: Call handler
            const result = await handleGetComponentsData(mockContext);

            // Assert: Verify empty data structure
            expect(result).toEqual({
                success: true,
                type: 'components-data',
                data: {
                    frontends: [],
                    backends: [],
                    integrations: [],
                    appBuilder: [],
                    dependencies: [],
                    mesh: [],
                    envVars: {},
                    services: {},
                },
            });

            // Verify sendMessage was NOT called
            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should include all expected fields in data structure', async () => {
            // Arrange: Mock minimal valid data
            mockRegistryManager.getFrontends.mockResolvedValue([
                { id: 'f1', name: 'Frontend', description: 'desc', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getBackends.mockResolvedValue([
                { id: 'b1', name: 'Backend', description: 'desc', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getIntegrations.mockResolvedValue([
                { id: 'e1', name: 'External', description: 'desc', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getAppBuilder.mockResolvedValue([
                { id: 'a1', name: 'AppBuilder', description: 'desc', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getDependencies.mockResolvedValue([
                { id: 'd1', name: 'Dependency', description: 'desc', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getMesh.mockResolvedValue([
                { id: 'm1', name: 'Mesh', description: 'desc', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.loadRegistry.mockResolvedValue({
                version: '1.0.0',
                components: {
                    frontends: [],
                    backends: [],
                    dependencies: [],
                },
                envVars: {
                    KEY: {
                        label: 'Some Key',
                        type: 'text' as const,
                        default: 'value',
                    },
                },
            });

            // Act: Call handler
            const result = await handleGetComponentsData(mockContext);

            // Assert: Verify all required fields exist
            expect(result.success).toBe(true);
            expect(result).toHaveProperty('type', 'components-data');
            expect(result).toHaveProperty('data');

            const data = (result as any).data;
            expect(data).toHaveProperty('frontends');
            expect(data).toHaveProperty('backends');
            expect(data).toHaveProperty('integrations');
            expect(data).toHaveProperty('appBuilder');
            expect(data).toHaveProperty('dependencies');
            expect(data).toHaveProperty('mesh');
            expect(data).toHaveProperty('envVars');

            // Verify each array has expected structure
            expect(data.frontends[0]).toHaveProperty('id');
            expect(data.frontends[0]).toHaveProperty('name');
            expect(data.frontends[0]).toHaveProperty('description');
            expect(data.frontends[0]).toHaveProperty('dependencies');
            expect(data.frontends[0]).toHaveProperty('configuration');

            // Verify envVars is accessible
            expect(data.envVars).toHaveProperty('KEY');
            expect(data.envVars.KEY).toHaveProperty('label', 'Some Key');
        });
    });

    describe('handleLoadDependencies', () => {
        it('should return dependencies with success=true (Pattern B)', async () => {
            // Arrange: mock resolver returning required + optional
            const mockResolved = {
                required: [
                    { id: 'dep-a', name: 'Dep A', description: 'Required dep', configuration: { impact: 'Required for checkout' } },
                ],
                optional: [
                    { id: 'dep-b', name: 'Dep B', description: 'Optional dep', configuration: {} },
                ],
                selected: [],
                all: [],
            };
            mockDependencyResolver.resolveDependencies.mockResolvedValue(mockResolved as any);

            // Act
            const result = await handleLoadDependencies(mockContext, { frontend: 'headless', backend: 'adobe-commerce-paas' });

            // Assert
            expect(result).toEqual({
                success: true,
                type: 'dependenciesLoaded',
                data: {
                    dependencies: [
                        { id: 'dep-a', name: 'Dep A', description: 'Required dep', required: true, impact: 'Required for checkout' },
                        { id: 'dep-b', name: 'Dep B', description: 'Optional dep', required: false, impact: undefined },
                    ],
                },
            });

            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should return error with success=false for invalid payload', async () => {
            const result = await handleLoadDependencies(mockContext, null);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
            expect(mockDependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });

        it('should return error with success=false when resolver throws', async () => {
            mockDependencyResolver.resolveDependencies.mockRejectedValue(new Error('Invalid frontend or backend selection'));

            const result = await handleLoadDependencies(mockContext, { frontend: 'bad', backend: 'bad' });

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('error');
            expect(result).toHaveProperty('code');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to load dependencies:',
                expect.anything(),
            );
        });
    });

    describe('handleValidateSelection', () => {
        it('should return validation result with success=true (Pattern B)', async () => {
            // Arrange: mock resolver returning dependencies + validation result
            const mockResolved = {
                required: [],
                optional: [],
                selected: [],
                all: [{ id: 'dep-a', name: 'Dep A', description: 'A dep', configuration: {} }],
            };
            const mockValidation = { valid: true, errors: [], warnings: [] };
            mockDependencyResolver.resolveDependencies.mockResolvedValue(mockResolved as any);
            mockDependencyResolver.validateDependencyChain.mockResolvedValue(mockValidation);

            // Act
            const result = await handleValidateSelection(mockContext, {
                frontend: 'headless',
                backend: 'adobe-commerce-paas',
                dependencies: ['dep-a'],
            });

            // Assert
            expect(result).toEqual({
                success: true,
                type: 'validationResult',
                data: mockValidation,
            });

            // Verify resolver was called with the dependency list
            expect(mockDependencyResolver.resolveDependencies).toHaveBeenCalledWith(
                'headless',
                'adobe-commerce-paas',
                ['dep-a'],
            );
            // Verify validateDependencyChain received resolved.all
            expect(mockDependencyResolver.validateDependencyChain).toHaveBeenCalledWith(mockResolved.all);

            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should return error with success=false for invalid payload', async () => {
            const result = await handleValidateSelection(mockContext, undefined);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
            expect(mockDependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });

        it('should return error with success=false when resolver throws', async () => {
            mockDependencyResolver.resolveDependencies.mockRejectedValue(new Error('Invalid frontend or backend selection'));

            const result = await handleValidateSelection(mockContext, {
                frontend: 'bad',
                backend: 'bad',
                dependencies: [],
            });

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('error');
            expect(result).toHaveProperty('code');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to validate selection:',
                expect.anything(),
            );
        });
    });

    describe('handleUpdateComponentSelection', () => {
        it('should store selection in sharedState and return success:true', async () => {
            const selection = { frontend: 'headless', backend: 'adobe-commerce-paas', dependencies: ['dep-a'], services: [] };

            const result = await handleUpdateComponentSelection(mockContext, selection);

            expect(result).toEqual({ success: true });
            expect((mockContext.sharedState as any).currentComponentSelection).toEqual(selection);
        });

        it('should return error for invalid payload', async () => {
            const result = await handleUpdateComponentSelection(mockContext, null);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
        });
    });

    describe('handleUpdateComponentsData', () => {
        it('should store components data in sharedState and return success:true', async () => {
            const data = { frontends: [], backends: [], dependencies: [] };

            const result = await handleUpdateComponentsData(mockContext, data);

            expect(result).toEqual({ success: true });
            expect((mockContext.sharedState as any).componentsData).toEqual(data);
        });

        it('should return error for invalid payload', async () => {
            const result = await handleUpdateComponentsData(mockContext, undefined);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
        });
    });

    describe('handleSyncComponentConfigs', () => {
        it('should store component configs in sharedState and return success:true', async () => {
            const configs = { 'headless': { 'SOME_KEY': 'someValue' } };

            const result = await handleSyncComponentConfigs(mockContext, configs);

            expect(result).toEqual({ success: true });
            expect((mockContext.sharedState as any).currentComponentConfigs).toEqual(configs);
        });

        it('should silently succeed (not fail) for invalid payload', async () => {
            // Security note: sync-component-configs intentionally returns success:true
            // for invalid payloads to avoid exposing internal state to callers.
            const result = await handleSyncComponentConfigs(mockContext, null);

            expect(result).toEqual({ success: true });
        });
    });

    describe('handleLoadComponents', () => {
        it('should return componentsLoaded with success:true', async () => {
            mockRegistryManager.getFrontends.mockResolvedValue([
                { id: 'headless', name: 'CitiSignal Next.js', description: 'Storefront', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getBackends.mockResolvedValue([]);
            mockRegistryManager.getIntegrations.mockResolvedValue([]);
            mockRegistryManager.getAppBuilder.mockResolvedValue([]);
            mockRegistryManager.getDependencies.mockResolvedValue([]);
            mockRegistryManager.getPresets.mockResolvedValue([]);

            const result = await handleLoadComponents(mockContext);

            expect(result.success).toBe(true);
            expect(result).toHaveProperty('type', 'componentsLoaded');
            expect(result).toHaveProperty('data');
            const data = (result as any).data;
            expect(data).toHaveProperty('frontends');
            expect(data).toHaveProperty('backends');
            expect(data).toHaveProperty('integrations');
            expect(data).toHaveProperty('appBuilder');
            expect(data).toHaveProperty('dependencies');
            expect(data).toHaveProperty('presets');
            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should return error with success:false on registry failure', async () => {
            mockRegistryManager.getFrontends.mockRejectedValue(new Error('Registry load failed'));

            const result = await handleLoadComponents(mockContext);

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('error');
            expect(result).toHaveProperty('code');
        });
    });

    describe('handleCheckCompatibility', () => {
        it('should return compatible:true when checkCompatibility returns true', async () => {
            mockRegistryManager.checkCompatibility.mockResolvedValue(true);

            const result = await handleCheckCompatibility(mockContext, { frontend: 'headless', backend: 'adobe-commerce-paas' });

            expect(result).toEqual({
                success: true,
                type: 'compatibilityResult',
                data: { compatible: true },
            });
        });

        it('should return compatible:false when checkCompatibility returns false', async () => {
            mockRegistryManager.checkCompatibility.mockResolvedValue(false);

            const result = await handleCheckCompatibility(mockContext, { frontend: 'headless', backend: 'other' });

            expect(result).toEqual({
                success: true,
                type: 'compatibilityResult',
                data: { compatible: false },
            });
        });

        it('should return error for invalid payload', async () => {
            const result = await handleCheckCompatibility(mockContext, null);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
        });

        it('should return error with success:false on registry failure', async () => {
            mockRegistryManager.checkCompatibility.mockRejectedValue(new Error('Registry error'));

            const result = await handleCheckCompatibility(mockContext, { frontend: 'headless', backend: 'adobe-commerce-paas' });

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('code');
        });
    });

    describe('handleLoadPreset', () => {
        const mockPreset = {
            id: 'citisignal-headless',
            name: 'CitiSignal Headless',
            description: 'CitiSignal with Next.js',
            selections: {
                frontend: 'headless',
                backend: 'adobe-commerce-paas',
                dependencies: ['dep-a'],
            },
        };

        it('should return presetLoaded with preset selections', async () => {
            mockRegistryManager.getPresets.mockResolvedValue([mockPreset]);

            const result = await handleLoadPreset(mockContext, { presetId: 'citisignal-headless' });

            expect(result).toEqual({
                success: true,
                type: 'presetLoaded',
                data: {
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['dep-a'],
                },
            });
        });

        it('should return error when preset is not found', async () => {
            mockRegistryManager.getPresets.mockResolvedValue([mockPreset]);

            const result = await handleLoadPreset(mockContext, { presetId: 'nonexistent' });

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('error');
            expect(result).toHaveProperty('code');
        });

        it('should return error for invalid payload', async () => {
            const result = await handleLoadPreset(mockContext, undefined);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
        });
    });
});

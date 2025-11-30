/**
 * Tests for component handlers (Pattern B - request-response)
 *
 * Tests verify that handlers return data directly instead of using sendMessage,
 * establishing the request-response pattern for component operations.
 */

import { handleGetComponentsData } from '@/features/components/handlers/componentHandlers';
import { HandlerContext } from '@/types/handlers';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';

// Mock ComponentRegistryManager
jest.mock('@/features/components/services/ComponentRegistryManager');

describe('componentHandlers - Pattern B (request-response)', () => {
    let mockContext: HandlerContext;
    let mockRegistryManager: jest.Mocked<ComponentRegistryManager>;

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
            loadRegistry: jest.fn(),
        } as any;

        // Mock the ComponentRegistryManager constructor
        (ComponentRegistryManager as jest.MockedClass<typeof ComponentRegistryManager>).mockImplementation(
            () => mockRegistryManager
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
                    id: 'citisignal-nextjs',
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
                            id: 'citisignal-nextjs',
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
                    envVars: {
                        NEXT_PUBLIC_API_URL: {
                            label: 'API URL',
                            type: 'url',
                            default: 'http://localhost:3000',
                        },
                    },
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

            // Verify error was logged
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to load component configurations:',
                error
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
                    envVars: {},
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
});

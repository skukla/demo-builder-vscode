/**
 * Tests for component handlers (Pattern B - request-response)
 *
 * Tests verify that handlers return data directly instead of using sendMessage,
 * establishing the request-response pattern for component operations.
 */

import {
    handleLoadDependencies,
    handleValidateSelection,
    handleUpdateComponentSelection,
    handleUpdateComponentsData,
    handleLoadComponents,
    handleCheckCompatibility,
    handleLoadPreset,
} from '@/features/components/handlers/componentHandlers';
import { HandlerContext } from '@/types/handlers';
import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';
import {
    createMockHandlerContext,
    createMockRegistryManager,
    createMockDependencyResolver,
} from './componentHandlers.testUtils';

// Mock ComponentRegistryManager (DependencyResolver is re-exported from the same module)
jest.mock('@/features/components/services/ComponentRegistryManager');

describe('componentHandlers - Pattern B (request-response)', () => {
    let mockContext: HandlerContext;
    let mockRegistryManager: jest.Mocked<ComponentRegistryManager>;
    let mockDependencyResolver: jest.Mocked<DependencyResolver>;

    beforeEach(() => {
        mockContext = createMockHandlerContext();
        mockRegistryManager = createMockRegistryManager();
        mockDependencyResolver = createMockDependencyResolver();

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

    describe('handleLoadComponents', () => {
        it('should return componentsLoaded with success:true', async () => {
            mockRegistryManager.getFrontends.mockResolvedValue([
                { id: 'headless', name: 'CitiSignal Next.js', description: 'Storefront', dependencies: { required: [], optional: [] }, configuration: {} },
            ]);
            mockRegistryManager.getBackends.mockResolvedValue([]);
            mockRegistryManager.getIntegrations.mockResolvedValue([]);
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

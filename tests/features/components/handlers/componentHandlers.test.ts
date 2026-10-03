/**
 * Tests for component handlers (Pattern B - request-response)
 *
 * Tests verify that handlers return data directly instead of using sendMessage,
 * establishing the request-response pattern for component operations.
 */

import { ComponentRegistryManager, DependencyResolver, setupComponentHandlerSuite } from './componentHandlers.testUtils';
import {
    handleLoadDependencies,
    handleValidateSelection,
    handleCheckCompatibility,
} from '@/features/components/handlers/componentHandlers';
import { HandlerContext } from '@/types/handlers';

type ResolvedDependencies = Awaited<ReturnType<DependencyResolver['resolveDependencies']>>;

describe('componentHandlers - Pattern B (request-response)', () => {
    let mockContext: HandlerContext;
    let mockRegistryManager: jest.Mocked<ComponentRegistryManager>;
    let mockDependencyResolver: jest.Mocked<DependencyResolver>;

    beforeEach(() => {
        ({
            context: mockContext,
            registryManager: mockRegistryManager,
            dependencyResolver: mockDependencyResolver,
        } = setupComponentHandlerSuite());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('handleLoadDependencies', () => {
        it('should return dependencies with success=true (Pattern B)', async () => {
            // Arrange: mock resolver returning required + optional
            const mockResolved: ResolvedDependencies = {
                required: [
                    {
                        id: 'dep-a',
                        name: 'Dep A',
                        description: 'Required dep',
                        configuration: { impact: 'significant' },
                    },
                ],
                optional: [
                    { id: 'dep-b', name: 'Dep B', description: 'Optional dep', configuration: {} },
                ],
                selected: [],
                all: [],
            };
            mockDependencyResolver.resolveDependencies.mockResolvedValue(mockResolved);

            // Act
            const result = await handleLoadDependencies(mockContext, {
                frontend: 'headless',
                backend: 'adobe-commerce-paas',
            });

            // Assert
            expect(result).toEqual({
                success: true,
                type: 'dependenciesLoaded',
                data: {
                    dependencies: [
                        {
                            id: 'dep-a',
                            name: 'Dep A',
                            description: 'Required dep',
                            required: true,
                            impact: 'significant',
                        },
                        {
                            id: 'dep-b',
                            name: 'Dep B',
                            description: 'Optional dep',
                            required: false,
                            impact: undefined,
                        },
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
            mockDependencyResolver.resolveDependencies.mockRejectedValue(
                new Error('Invalid frontend or backend selection')
            );

            const result = await handleLoadDependencies(mockContext, {
                frontend: 'bad',
                backend: 'bad',
            });

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('error');
            expect(result).toHaveProperty('code');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to load dependencies:',
                expect.anything()
            );
        });
    });

    describe('handleValidateSelection', () => {
        it('should return validation result with success=true (Pattern B)', async () => {
            // Arrange: mock resolver returning dependencies + validation result
            const mockResolved: ResolvedDependencies = {
                required: [],
                optional: [],
                selected: [],
                all: [{ id: 'dep-a', name: 'Dep A', description: 'A dep', configuration: {} }],
            };
            const mockValidation = { valid: true, errors: [], warnings: [] };
            mockDependencyResolver.resolveDependencies.mockResolvedValue(mockResolved);
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
                ['dep-a']
            );
            // Verify validateDependencyChain received resolved.all
            expect(mockDependencyResolver.validateDependencyChain).toHaveBeenCalledWith(
                mockResolved.all
            );

            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('should return error with success=false for invalid payload', async () => {
            const result = await handleValidateSelection(mockContext, undefined);

            expect(result).toEqual({ success: false, error: 'Invalid payload' });
            expect(mockDependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });

        it('should return error with success=false when resolver throws', async () => {
            mockDependencyResolver.resolveDependencies.mockRejectedValue(
                new Error('Invalid frontend or backend selection')
            );

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
                expect.anything()
            );
        });
    });

    describe('handleCheckCompatibility', () => {
        it('should return compatible:true when checkCompatibility returns true', async () => {
            mockRegistryManager.checkCompatibility.mockResolvedValue(true);

            const result = await handleCheckCompatibility(mockContext, {
                frontend: 'headless',
                backend: 'adobe-commerce-paas',
            });

            expect(result).toEqual({
                success: true,
                type: 'compatibilityResult',
                data: { compatible: true },
            });
        });

        it('should return compatible:false when checkCompatibility returns false', async () => {
            mockRegistryManager.checkCompatibility.mockResolvedValue(false);

            const result = await handleCheckCompatibility(mockContext, {
                frontend: 'headless',
                backend: 'other',
            });

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

            const result = await handleCheckCompatibility(mockContext, {
                frontend: 'headless',
                backend: 'adobe-commerce-paas',
            });

            expect(result.success).toBe(false);
            expect(result).toHaveProperty('code');
        });
    });
});

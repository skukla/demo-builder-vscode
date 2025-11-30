/**
 * ComponentRegistryManager - Dependencies Tests
 *
 * Tests dependency resolution and validation using DependencyResolver.
 */

// Mock ConfigurationLoader - MUST be before imports
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

import { ComponentRegistryManager, DependencyResolver } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry } from './ComponentRegistryManager.testUtils';

describe('DependencyResolver', () => {
    let manager: ComponentRegistryManager;
    let resolver: DependencyResolver;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();

        manager = new ComponentRegistryManager('/fake/extension/path');
        resolver = new DependencyResolver(manager);

        // Get the mock loader instance (must be after manager creation)
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
        mockLoader.load.mockResolvedValue(mockRawRegistry);
    });

    describe('dependency resolution', () => {
        it('should resolve required dependencies', async () => {
            const result = await resolver.resolveDependencies('frontend1', 'backend1');

            expect(result.required).toHaveLength(1);
            expect(result.required[0].id).toBe('dep1');
        });

        it('should resolve optional dependencies when selected', async () => {
            const registryWithOptional = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        dependencies: {
                            required: ['dep1'],
                            optional: ['integration1'],
                        },
                    },
                },
            };
            mockLoader.load.mockResolvedValue(registryWithOptional);

            const result = await resolver.resolveDependencies('frontend1', 'backend1', ['integration1']);

            expect(result.optional).toHaveLength(1);
            expect(result.selected).toHaveLength(1);
            expect(result.selected[0].id).toBe('integration1');
        });

        it('should combine required and selected in all array', async () => {
            const result = await resolver.resolveDependencies('frontend1', 'backend1');

            expect(result.all).toHaveLength(1);
            expect(result.all[0].id).toBe('dep1');
        });

        it('should throw error for invalid frontend', async () => {
            await expect(
                resolver.resolveDependencies('nonexistent', 'backend1')
            ).rejects.toThrow('Invalid frontend or backend selection');
        });

        it('should throw error for invalid backend', async () => {
            await expect(
                resolver.resolveDependencies('frontend1', 'nonexistent')
            ).rejects.toThrow('Invalid frontend or backend selection');
        });
    });

    describe('dependency validation', () => {
        it('should validate dependency chain without errors', async () => {
            const deps = [
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '1.0.0' },
                },
            ];

            const result = await resolver.validateDependencyChain(deps);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect circular dependencies', async () => {
            const registryWithCircular = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    dep1: {
                        ...mockRawRegistry.components!.dep1,
                        dependencies: {
                            required: ['dep1'], // Self-reference
                            optional: [],
                        },
                    },
                },
            };
            mockLoader.load.mockResolvedValue(registryWithCircular);

            const deps = [
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '1.0.0' },
                    dependencies: {
                        required: ['dep1'],
                        optional: [],
                    },
                },
            ];

            const result = await resolver.validateDependencyChain(deps);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Circular dependency');
        });

        it('should warn about version conflicts', async () => {
            const deps = [
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '1.0.0' },
                },
                {
                    id: 'dep1',
                    name: 'Dependency 1',
                    type: 'dependency' as const,
                    source: { type: 'git' as const, url: 'url', version: '2.0.0' },
                },
            ];

            const result = await resolver.validateDependencyChain(deps);

            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('Multiple versions');
        });
    });
});

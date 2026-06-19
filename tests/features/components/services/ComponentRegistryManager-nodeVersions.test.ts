import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry, getMockLoader } from './ComponentRegistryManager.testUtils';

// Mock ConfigurationLoader (Jest hoisting requirement)
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

describe('Component Registry Manager - Node Version Resolution', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
        mockLoader.load.mockResolvedValue(mockRawRegistry);
    });

    describe('node version resolution', () => {
        it('should return empty set when frontend and backend have no Node requirements', async () => {
            // Given: EDS and PaaS don't require Node (they're remote services)
            // When: Getting required Node versions
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas');

            // Then: No Node versions are required
            expect(versions.size).toBe(0);
        });

        it('should resolve node version from headless frontend', async () => {
            // Given: Headless (Next.js) requires Node 24 for local development
            const versions = await manager.getRequiredNodeVersions('headless');

            expect(versions.size).toBe(1);
            expect(versions.has('24')).toBe(true);
        });

        it('should return empty for dependencies without nodeVersion', async () => {
            // Given: test-tool is a browser overlay without Node requirement
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas', ['test-tool']);

            // Then: No Node versions required
            expect(versions.size).toBe(0);
        });

        it('should include mesh node versions when passed as dependency', async () => {
            // Given: EDS + PaaS with commerce-mesh (Node 20)
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas', ['commerce-mesh']);

            // Then: commerce-mesh's Node 20 is required
            expect(versions.size).toBe(1);
            expect(versions.has('20')).toBe(true);
        });

        it('should return empty set when no components specified', async () => {
            const versions = await manager.getRequiredNodeVersions();

            expect(versions.size).toBe(0);
        });
    });

    describe('node version to component mapping', () => {
        it('should return empty mapping when no components have Node requirements', async () => {
            // Given: EDS and PaaS don't require Node
            const mapping = await manager.getNodeVersionToComponentMapping('eds', 'adobe-commerce-paas');

            // Then: No Node version mappings
            expect(Object.keys(mapping).length).toBe(0);
        });

        it('should aggregate component names when multiple components share same version', async () => {
            // Given: A registry where multiple dependencies use Node 20
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                dependencies: {
                    'test-tool': {
                        ...mockRawRegistry.dependencies!['test-tool'],
                        configuration: { nodeVersion: '20' },
                    },
                    'another-dep': {
                        id: 'another-dep',
                        name: 'Another Dependency',
                        description: 'Test dependency',
                        type: 'dependency',
                        configuration: { nodeVersion: '20' },
                    },
                },
                selectionGroups: {
                    ...mockRawRegistry.selectionGroups,
                    dependencies: ['test-tool', 'another-dep'],
                },
            });

            // When: Getting the version-to-component mapping
            const mapping = await manager.getNodeVersionToComponentMapping(
                undefined,
                undefined,
                ['test-tool', 'another-dep']
            );

            // Then: Both component names should be listed for Node 20
            expect(mapping['20']).toBe('Test Tool, Another Dependency');
        });

        it('should show single component name when only one component uses a version', async () => {
            // Given: Headless frontend uses Node 24 alone
            const mapping = await manager.getNodeVersionToComponentMapping('headless');

            // Then: Should show single component name without commas
            expect(mapping['24']).toBe('Headless Storefront');
        });

        it('should not duplicate component names when same component referenced multiple times', async () => {
            // Given: test-tool (Node 20) explicitly listed twice
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                dependencies: {
                    'test-tool': {
                        ...mockRawRegistry.dependencies!['test-tool'],
                        configuration: { nodeVersion: '20' },
                    },
                },
            });

            const mapping = await manager.getNodeVersionToComponentMapping(
                undefined,
                undefined,
                ['test-tool', 'test-tool'] // Duplicate in the array
            );

            // Then: Should not have duplicates
            expect(mapping['20']).toBe('Test Tool');
        });
    });

    describe('compatibility checking', () => {
        it('should return true for compatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('eds', 'adobe-commerce-paas');

            expect(isCompatible).toBe(true);
        });

        it('should return false for incompatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('eds', 'nonexistent');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend not found', async () => {
            const isCompatible = await manager.checkCompatibility('nonexistent', 'adobe-commerce-paas');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend has no compatibleBackends', async () => {
            const isCompatible = await manager.checkCompatibility('headless', 'adobe-commerce-paas');

            expect(isCompatible).toBe(false);
        });
    });
});

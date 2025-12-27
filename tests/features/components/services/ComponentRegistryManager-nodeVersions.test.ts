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
            // Given: demo-inspector is a browser overlay without Node requirement
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas', ['demo-inspector']);

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

        it('should include app builder node versions', async () => {
            // Given: EDS + PaaS with integration-service (Node 22)
            const versions = await manager.getRequiredNodeVersions(
                'eds',
                'adobe-commerce-paas',
                undefined,
                undefined,
                ['integration-service']
            );

            // Then: Only integration-service's Node 22 is required
            expect(versions.size).toBe(1);
            expect(versions.has('22')).toBe(true);
        });

        it('should combine versions from multiple components', async () => {
            // Given: Headless frontend (Node 24) + integration-service (Node 22)
            const versions = await manager.getRequiredNodeVersions(
                'headless',
                undefined,
                undefined,
                undefined,
                ['integration-service']
            );

            // Then: Both Node versions are required
            expect(versions.size).toBe(2);
            expect(versions.has('24')).toBe(true);
            expect(versions.has('22')).toBe(true);
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
                    'demo-inspector': {
                        ...mockRawRegistry.dependencies!['demo-inspector'],
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
                    dependencies: ['demo-inspector', 'another-dep'],
                },
            });

            // When: Getting the version-to-component mapping
            const mapping = await manager.getNodeVersionToComponentMapping(
                undefined,
                undefined,
                ['demo-inspector', 'another-dep']
            );

            // Then: Both component names should be listed for Node 20
            expect(mapping['20']).toBe('Demo Inspector, Another Dependency');
        });

        it('should keep separate versions distinct', async () => {
            // Given: Different components require different Node versions
            // headless (Node 24) + integration-service (Node 22)
            const mapping = await manager.getNodeVersionToComponentMapping(
                'headless',
                undefined,
                undefined,
                undefined,
                ['integration-service']
            );

            // Then: Each version should have its own component
            expect(mapping['24']).toBe('Headless Storefront');
            expect(mapping['22']).toBe('Kukla Integration Service');
        });

        it('should show single component name when only one component uses a version', async () => {
            // Given: Headless frontend uses Node 24 alone
            const mapping = await manager.getNodeVersionToComponentMapping('headless');

            // Then: Should show single component name without commas
            expect(mapping['24']).toBe('Headless Storefront');
        });

        it('should not duplicate component names when same component referenced multiple times', async () => {
            // Given: integration-service explicitly listed twice
            const mapping = await manager.getNodeVersionToComponentMapping(
                undefined,
                undefined,
                undefined,
                undefined,
                ['integration-service', 'integration-service'] // Duplicate in the array
            );

            // Then: Should not have duplicates
            expect(mapping['22']).toBe('Kukla Integration Service');
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
